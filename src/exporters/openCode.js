/**
 * OpenCode Exporter Transpiler
 * Produces AGENTS.md coordination protocol, .opencode/agents/<agent>.md specs, and .opencode/skills/<skill>/ packages.
 */

import { parseAgentYaml } from '../validator.js';

export function transpileToOpenCode(project, nodes = [], edges = [], linkedSkills = []) {
  const files = [];
  const projectName = project ? project.name : 'OpenCode Agent Workflow';

  // 1. Generate AGENTS.md
  let agentsMd = `# ${projectName} - OpenCode Multi-Agent Protocol\n\n`;
  agentsMd += `This project defines an autonomous multi-agent system configured for OpenCode Interpreter.\n\n`;

  agentsMd += `## Registered Agents\n\n`;
  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    const name = node.filename || node.title || 'agent';
    const role = frontmatter.role || 'assistant';
    const tools = (frontmatter.tools || []).join(', ') || 'standard';

    agentsMd += `### \`${name}\`\n`;
    agentsMd += `- **Role**: \`${role}\`\n`;
    agentsMd += `- **Tools**: \`${tools}\`\n`;
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      agentsMd += `- **Skills**: ${frontmatter.skills.join(', ')}\n`;
    }
    agentsMd += `- **Description**: ${frontmatter.description || node.title || 'Specialized agent block'}\n\n`;
  }

  if (linkedSkills.length > 0) {
    agentsMd += `## Linked Skill Packages\n\n`;
    for (const s of linkedSkills) {
      agentsMd += `- **\`${s.name}\`**: ${s.description || 'Modular skill package'} (\`.opencode/skills/${s.name}/\`)\n`;
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
      const edgeType = edge.edge_type || 'default';
      const label = edge.label || (edgeType === 'pass' ? 'PASS' : (edgeType === 'fail' ? 'FAIL / RETRY' : 'NEXT'));

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

  // 2. Generate .opencode/agents/<agent>.md
  for (const node of nodes) {
    const { frontmatter, body } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const agentPath = `.opencode/agents/${baseName}.md`;

    let frontmatterYaml = `name: ${baseName}\nrole: ${frontmatter.role || 'assistant'}\nmodel: ${frontmatter.model || 'default'}\ntools: [${(frontmatter.tools || []).join(', ')}]`;
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      frontmatterYaml += `\nskills: [${frontmatter.skills.join(', ')}]`;
    }

    let content = `---\n${frontmatterYaml}\n---\n\n${body.trim()}\n`;

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

  return files;
}
