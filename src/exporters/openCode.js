/**
 * OpenCode Exporter Transpiler
 * Produces AGENTS.md coordination protocol, .opencode/agents/<agent>.md specs,
 * .opencode/skills/<skill>/ packages, and opencode.json config with MCP & instruction bindings.
 */

import { parseAgentYaml } from '../validator.js';
import { classifyEdge } from '../../public/js/edgeSemantics.js';
import { isMcpServerName, collectMcpServers, buildMcpPlaceholders } from './toolMapping.js';
import { resolveModel } from '../../public/js/modelMapping.js';

export function transpileToOpenCode(project, nodes = [], edges = [], linkedSkills = []) {
  const files = [];
  const projectName = project ? project.name : 'OpenCode Agent Workflow';

  // Role to color mapping for OpenCode UI
  const roleColors = {
    orchestrator: '#38bdf8',
    evaluator: '#10b981',
    researcher: '#818cf8',
    coder: '#a855f7',
    router: '#f59e0b',
    tool: '#71717a',
    assistant: '#64748b'
  };

  /**
   * Determine OpenCode mode (primary | subagent | all) using:
   * 1. Explicit user frontmatter override (`mode: primary | subagent | all`)
   * 2. Role classification (`orchestrator` -> `primary`, workers -> `subagent`)
   * 3. Graph topology (Root entry nodes with in-degree 0 -> `primary`, downstream -> `subagent`)
   */
  function resolveAgentMode(frontmatter, node) {
    if (frontmatter.mode && ['primary', 'subagent', 'all'].includes(frontmatter.mode)) {
      return frontmatter.mode;
    }
    const role = (frontmatter.role || 'assistant').toLowerCase();
    if (role === 'orchestrator') return 'primary';
    if (['evaluator', 'researcher', 'coder', 'router', 'tool'].includes(role)) return 'subagent';

    const hasIncoming = edges.some(e => e.target_id === node.id);
    if (!hasIncoming && edges.length > 0) return 'primary';
    return 'subagent';
  }

  // 1. Generate AGENTS.md with OpenCode lazy-loading @references and Mermaid DAG
  let agentsMd = `# ${projectName} - OpenCode Multi-Agent Protocol\n\n`;
  agentsMd += `This project defines an autonomous multi-agent system configured for OpenCode Interpreter.\n\n`;

  agentsMd += `## External Agent References & Lazy Loading\n`;
  agentsMd += `CRITICAL: When delegating tasks to specialized agents or referencing skills, use the Read or Task tool on demand.\n\n`;

  agentsMd += `## Registered Agents\n\n`;
  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const role = (frontmatter.role || 'assistant').toLowerCase();
    const mode = resolveAgentMode(frontmatter, node);
    const toolsArr = Array.isArray(frontmatter.tools) 
      ? frontmatter.tools 
      : (typeof frontmatter.tools === 'string' ? frontmatter.tools.split(',').map(s => s.trim()).filter(Boolean) : []);
    const tools = toolsArr.join(', ') || 'standard';

    agentsMd += `### \`${baseName}\` (@.opencode/agents/${baseName}.md)\n`;
    agentsMd += `- **Mode**: \`${mode}\`\n`;
    agentsMd += `- **Role**: \`${role}\`\n`;
    agentsMd += `- **Tools / Perms**: \`${tools}\`\n`;
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      agentsMd += `- **Skills**: ${frontmatter.skills.map(s => `@.opencode/skills/${s}/SKILL.md`).join(', ')}\n`;
    }
    agentsMd += `- **Description**: ${frontmatter.description || node.title || 'Specialized agent block'}\n\n`;
  }

  const declaredMcp = collectMcpServers(nodes, parseAgentYaml);
  if (declaredMcp.size > 0) {
    agentsMd += `## MCP Servers\n\n`;
    agentsMd += `Declared as tools by the agents below and stubbed into \`opencode.json\`. Each is disabled\n`;
    agentsMd += `globally and re-enabled per-agent, so only the agents listed here can reach it.\n`;
    agentsMd += `**Replace each \`<...-package>\` placeholder with the server's real launch command before use.**\n\n`;
    agentsMd += `| Server | Required by |\n| :--- | :--- |\n`;
    for (const [server, consumers] of declaredMcp) {
      agentsMd += `| \`${server}\` | ${consumers.map(c => `\`${c}\``).join(', ')} |\n`;
    }
    agentsMd += `\n`;
  }

  if (linkedSkills.length > 0) {
    agentsMd += `## Linked Skill Packages\n\n`;
    for (const s of linkedSkills) {
      agentsMd += `- **\`${s.name}\`**: ${s.description || 'Modular skill package'} (@.opencode/skills/${s.name}/SKILL.md)\n`;
    }
    agentsMd += `\n`;
  }

  if (edges.length > 0) {
    agentsMd += `## Multi-Agent Decision Graph & Feedback Loops\n\n`;
    agentsMd += `\`\`\`mermaid\ngraph TD\n`;

    // Group nodes by role subgraphs
    const roleGroups = {};
    nodes.forEach(n => {
      const { frontmatter } = parseAgentYaml(n.content || '');
      const role = (frontmatter.role || 'assistant').toLowerCase();
      if (!roleGroups[role]) roleGroups[role] = [];
      roleGroups[role].push(n);
    });

    // Mermaid node IDs are unquoted tokens in the middle of link syntax that is itself
    // built from hyphens (`-->`, `-.->`). An agent called `security-auditor` therefore
    // risks being mis-lexed. Underscore the ID and keep the real name in the display
    // label, where it is quoted and safe.
    const mermaidId = (name) => String(name || 'agent').replace(/\.md$/, '').replace(/[^A-Za-z0-9_]/g, '_');

    Object.entries(roleGroups).forEach(([role, rNodes]) => {
      const subTitle = role.charAt(0).toUpperCase() + role.slice(1) + 's';
      agentsMd += `  subgraph ${subTitle}\n`;
      rNodes.forEach(rn => {
        const base = (rn.filename || rn.title || 'agent').replace(/\.md$/, '');
        agentsMd += `    ${mermaidId(base)}["${rn.title || base}"]:::${role}\n`;
      });
      agentsMd += `  end\n\n`;
    });

    for (const edge of edges) {
      const srcNode = nodes.find(n => n.id === edge.source_id);
      const tgtNode = nodes.find(n => n.id === edge.target_id);
      const srcName = mermaidId(srcNode ? srcNode.filename : edge.source_id);
      const tgtName = mermaidId(tgtNode ? tgtNode.filename : edge.target_id);
      const tone = classifyEdge(edge);
      const label = (edge.label || (tone === 'pass' ? 'PASS' : (tone === 'fail' ? 'REJECT / RETRY' : 'NEXT')))
        .replace(/"/g, "'");
      // Dotted link for feedback loops, mirroring the red edge on canvas. Mermaid spells
      // a labelled dotted link `A -. text .-> B`, not `A -- text -.-> B`.
      const link = tone === 'fail' ? `-. "${label}" .->` : `-- "${label}" -->`;

      agentsMd += `  ${srcName} ${link} ${tgtName}\n`;
    }

    // Mermaid class styles
    agentsMd += `\n  classDef orchestrator fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;\n`;
    agentsMd += `  classDef evaluator fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#f8fafc;\n`;
    agentsMd += `  classDef researcher fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#f8fafc;\n`;
    agentsMd += `  classDef coder fill:#1e1b4b,stroke:#a855f7,stroke-width:2px,color:#f8fafc;\n`;
    agentsMd += `  classDef router fill:#3f2c06,stroke:#f59e0b,stroke-width:2px,color:#f8fafc;\n`;
    agentsMd += `  classDef tool fill:#18181b,stroke:#71717a,stroke-width:2px,color:#f8fafc;\n`;
    agentsMd += `  classDef assistant fill:#1f2937,stroke:#64748b,stroke-width:1.5px,color:#f8fafc;\n`;
    agentsMd += `\`\`\`\n\n`;
  }

  files.push({
    path: 'AGENTS.md',
    content: agentsMd,
    language: 'markdown'
  });

  // 2. Generate .opencode/agents/<agent>.md with native OpenCode agent schema
  for (const node of nodes) {
    const { frontmatter, body } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const agentPath = `.opencode/agents/${baseName}.md`;
    const role = (frontmatter.role || 'assistant').toLowerCase();
    const mode = resolveAgentMode(frontmatter, node);
    const tools = Array.isArray(frontmatter.tools) ? frontmatter.tools : [];

    // Build OpenCode permission block
    const permissions = {};
    if (tools.includes('bash') || tools.includes('terminal')) {
      permissions.bash = 'allow';
    } else if (mode === 'subagent') {
      permissions.bash = 'deny';
    }

    if (tools.includes('file_writer') || tools.includes('edit') || tools.includes('patch')) {
      permissions.edit = 'allow';
    } else if (role === 'evaluator' || role === 'researcher') {
      permissions.edit = 'deny';
    }

    if (tools.includes('web_search') || tools.includes('websearch')) {
      permissions.websearch = 'allow';
    }

    if (tools.includes('browser_page') || tools.includes('webfetch')) {
      permissions.webfetch = 'allow';
    }

    // Task (subagent delegation) permissions.
    //
    // Two rules here, both learned the hard way:
    //
    // 1. Only a `primary` agent may delegate. Outgoing edges on a worker are RETURN paths
    //    back to its orchestrator, not delegations — granting the worker task rights lets
    //    a quality gate re-dispatch the coder itself, bypassing the orchestrator's state
    //    machine and its retry counters.
    // 2. The wildcard must be `ask`, never `deny`. OpenCode hides the `task` tool from the
    //    model entirely when the wildcard denies, regardless of the specific allows beside
    //    it — so a `"*": "deny"` orchestrator cannot delegate at all and the pipeline dies
    //    on its first hop.
    //
    // The allowlist is every other agent in the graph, not just this node's direct edge
    // targets: an orchestrator dispatches the whole roster, and anything unlisted falls
    // through to `ask` and stalls an unattended run on a permission prompt.
    if (mode === 'primary') {
      const delegable = nodes
        .filter(n => n.id !== node.id)
        .map(n => (n.filename || n.title || '').replace(/\.md$/, ''))
        .filter(Boolean);

      if (delegable.length > 0) {
        permissions.task = { '*': 'ask' };
        for (const t of delegable) {
          permissions.task[t] = 'allow';
        }
      }
    }

    // Build frontmatter lines
    // No `model:` means the agent uses OpenCode's configured default. Better than guessing a
    // provider/model id that may not exist in this install's registry.
    const agentModel = resolveModel(frontmatter.model, 'opencode');

    const fmLines = [
      `description: ${frontmatter.description || `${node.title || baseName} (${role})`}`,
      `mode: ${mode}`,
      ...(agentModel ? [`model: ${agentModel}`] : []),
      `color: "${roleColors[role] || '#38bdf8'}"`
    ];

    if (frontmatter.temperature !== undefined) {
      fmLines.push(`temperature: ${frontmatter.temperature}`);
    }

    // opencode.json disables every MCP server globally so it stays out of agents that have
    // no business calling it. That means each agent declaring an MCP server in its `tools`
    // must opt back in here, or the server is unreachable for the whole roster.
    const agentMcpServers = tools.filter(isMcpServerName);
    if (agentMcpServers.length > 0) {
      fmLines.push('tools:');
      for (const server of agentMcpServers) {
        fmLines.push(`  "${server}*": true`);
      }
    }

    if (Object.keys(permissions).length > 0) {
      fmLines.push('permission:');
      for (const [permKey, permVal] of Object.entries(permissions)) {
        if (typeof permVal === 'object') {
          fmLines.push(`  ${permKey}:`);
          for (const [subKey, subVal] of Object.entries(permVal)) {
            fmLines.push(`    "${subKey}": ${subVal}`);
          }
        } else {
          fmLines.push(`  ${permKey}: ${permVal}`);
        }
      }
    }

    let content = `---\n${fmLines.join('\n')}\n---\n\n${body.trim()}\n`;

    files.push({
      path: agentPath,
      content,
      language: 'markdown'
    });
  }

  // 3. Bundle linked skills into .opencode/skills/<skill-name>/...
  for (const skill of linkedSkills) {
    if (skill.files && Array.isArray(skill.files)) {
      for (const f of skill.files) {
        files.push({
          path: `.opencode/skills/${skill.name}/${f.file_path}`,
          content: f.content || '',
          language: f.file_path.endsWith('.md') ? 'markdown' : (f.file_path.endsWith('.sh') ? 'bash' : 'text')
        });
      }
    }
  }

  // 4. Generate opencode.json.
  //
  // The MCP block used to hardcode the agent-canvas server itself, clobbering whatever the
  // target project actually depended on. agent-canvas is the design tool; exported agents
  // have no runtime need for it. Servers now come from the non-builtin entries in each
  // agent's `tools` list, and are disabled globally so only the declaring agents see them
  // (each re-enables its own via agent-level `tools:`).
  const mcpServers = collectMcpServers(nodes, parseAgentYaml);
  const opencodeConfig = {
    "$schema": "https://opencode.ai/config.json",
    "instructions": [
      "AGENTS.md"
    ]
  };

  if (mcpServers.size > 0) {
    opencodeConfig.mcp = buildMcpPlaceholders(mcpServers, 'opencode');
    opencodeConfig.tools = {};
    for (const [name] of mcpServers) {
      opencodeConfig.tools[`${name}*`] = false;
    }
  }

  files.push({
    path: 'opencode.json',
    content: JSON.stringify(opencodeConfig, null, 2),
    language: 'json'
  });

  return files;
}
