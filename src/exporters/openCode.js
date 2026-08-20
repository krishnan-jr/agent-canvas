/**
 * OpenCode Exporter Transpiler
 * Produces AGENTS.md coordination protocol, .opencode/agents/<agent>.md specs,
 * .opencode/skills/<skill>/ packages, and opencode.json config with MCP & instruction bindings.
 */

import { parseAgentYaml } from '../validator.js';

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
    const tools = (frontmatter.tools || []).join(', ') || 'standard';

    agentsMd += `### \`${baseName}\` (@.opencode/agents/${baseName}.md)\n`;
    agentsMd += `- **Mode**: \`${mode}\`\n`;
    agentsMd += `- **Role**: \`${role}\`\n`;
    agentsMd += `- **Tools / Perms**: \`${tools}\`\n`;
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      agentsMd += `- **Skills**: ${frontmatter.skills.map(s => `@.opencode/skills/${s}/SKILL.md`).join(', ')}\n`;
    }
    agentsMd += `- **Description**: ${frontmatter.description || node.title || 'Specialized agent block'}\n\n`;
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

    Object.entries(roleGroups).forEach(([role, rNodes]) => {
      const subTitle = role.charAt(0).toUpperCase() + role.slice(1) + 's';
      agentsMd += `  subgraph ${subTitle}\n`;
      rNodes.forEach(rn => {
        const base = (rn.filename || rn.title || 'agent').replace(/\.md$/, '');
        agentsMd += `    ${base}["${rn.title || base}"]:::${role}\n`;
      });
      agentsMd += `  end\n\n`;
    });

    for (const edge of edges) {
      const srcNode = nodes.find(n => n.id === edge.source_id);
      const tgtNode = nodes.find(n => n.id === edge.target_id);
      const srcName = (srcNode ? srcNode.filename : edge.source_id).replace(/\.md$/, '');
      const tgtName = (tgtNode ? tgtNode.filename : edge.target_id).replace(/\.md$/, '');
      const cond = (edge.condition || edge.edge_type || '').toLowerCase();
      const label = edge.label || (cond === 'pass' ? 'PASS' : ((cond === 'fail' || cond === 'reject') ? 'REJECT / RETRY' : 'NEXT'));

      agentsMd += `  ${srcName} -- "${label}" --> ${tgtName}\n`;
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

    // Find outgoing target agents for permission.task gating
    const outgoingEdges = edges.filter(e => e.source_id === node.id);
    const targetAgents = outgoingEdges.map(e => {
      const tNode = nodes.find(n => n.id === e.target_id);
      return tNode ? (tNode.filename || tNode.title || '').replace(/\.md$/, '') : '';
    }).filter(Boolean);

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

    // Task invocation permissions based on DAG routing edges
    if (targetAgents.length > 0) {
      permissions.task = {
        '*': 'deny'
      };
      for (const t of targetAgents) {
        permissions.task[t] = 'allow';
      }
    }

    // Build frontmatter lines
    const fmLines = [
      `description: ${frontmatter.description || `${node.title || baseName} (${role})`}`,
      `mode: ${mode}`,
      `model: ${frontmatter.model || 'anthropic/claude-3-7-sonnet'}`,
      `color: "${roleColors[role] || '#38bdf8'}"`
    ];

    if (frontmatter.temperature !== undefined) {
      fmLines.push(`temperature: ${frontmatter.temperature}`);
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

  // 4. Generate opencode.json with OpenCode native MCP server configuration and instruction binding
  const opencodeConfig = {
    "$schema": "https://opencode.ai/config.json",
    "instructions": [
      "AGENTS.md"
    ],
    "mcp": {
      "agent-canvas": {
        "type": "local",
        "command": ["node", "src/mcpServer.js"],
        "enabled": true
      }
    }
  };

  files.push({
    path: 'opencode.json',
    content: JSON.stringify(opencodeConfig, null, 2),
    language: 'json'
  });

  return files;
}
