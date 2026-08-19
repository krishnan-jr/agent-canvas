/**
 * Claude Code Exporter Transpiler
 * Produces CLAUDE.md guidelines, .claude/commands/<agent>.md slash commands, and .claude/skills/<skill>/ packages.
 */

import { parseAgentYaml } from '../validator.js';

export function transpileToClaudeCode(project, nodes = [], edges = [], linkedSkills = []) {
  const files = [];
  const projectName = project ? project.name : 'Agent Project';
  const projectDesc = project ? project.description : 'Multi-agent orchestration workflow';

  // 1. Generate CLAUDE.md
  let claudeMd = `# ${projectName}\n\n`;
  claudeMd += `> ${projectDesc}\n\n`;
  claudeMd += `## Project Overview & Autonomous Agent Architecture\n\n`;
  claudeMd += `This repository is orchestrated with a multi-agent system structured as modular markdown instructions.\n\n`;

  claudeMd += `### Available Agents & Commands\n\n`;
  claudeMd += `| Agent | Role | Model | Description |\n`;
  claudeMd += `| :--- | :--- | :--- | :--- |\n`;

  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    const name = node.filename || node.title || 'agent';
    const role = frontmatter.role || 'assistant';
    const model = frontmatter.model || 'claude-3-5-sonnet';
    const desc = frontmatter.description || node.title || 'Specialized agent block';
    const cmdName = name.replace(/\.md$/, '');
    claudeMd += `| \`/${cmdName}\` | \`${role}\` | \`${model}\` | ${desc} |\n`;
  }

  // Add Linked Skills section to CLAUDE.md
  if (linkedSkills.length > 0) {
    claudeMd += `\n### Project Skills Library\n\n`;
    claudeMd += `| Skill | Description | Location |\n`;
    claudeMd += `| :--- | :--- | :--- |\n`;
    for (const skill of linkedSkills) {
      claudeMd += `| \`${skill.name}\` | ${skill.description || 'Modular skill package'} | \`.claude/skills/${skill.name}/\` |\n`;
    }
  }

  // Add Decision loops section if edges exist
  if (edges.length > 0) {
    claudeMd += `\n### Decision Routing & Guardrail Loops\n\n`;
    for (const edge of edges) {
      const srcNode = nodes.find(n => n.id === edge.source_id);
      const tgtNode = nodes.find(n => n.id === edge.target_id);
      const srcName = srcNode ? srcNode.filename : edge.source_id;
      const tgtName = tgtNode ? tgtNode.filename : edge.target_id;
      const edgeType = edge.edge_type || 'default';
      const label = edge.label || (edgeType === 'pass' ? 'Approved' : (edgeType === 'fail' ? 'Reject & Refine' : 'Next'));
      const retries = edgeType === 'fail' && edge.max_retries ? ` (max retries: ${edge.max_retries})` : '';

      claudeMd += `- **${srcName}** $\\rightarrow$ **${tgtName}** [**${edgeType.toUpperCase()}**: ${label}]${retries}\n`;
    }
  }

  claudeMd += `\n## Development Guidelines & Execution Rules\n`;
  claudeMd += `- Maintain structured frontmatter and markdown documentation.\n`;
  claudeMd += `- When coordinating between agents, respect the routing contracts defined above.\n`;

  files.push({
    path: 'CLAUDE.md',
    content: claudeMd,
    language: 'markdown'
  });

  // 2. Generate .claude/agents/<agent>.md (Autonomous Subagents)
  for (const node of nodes) {
    const { frontmatter, body } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const agentPath = `.claude/agents/${baseName}.md`;

    let agentContent = `---
name: ${baseName}
role: ${frontmatter.role || 'assistant'}
description: ${frontmatter.description || `Specialized ${baseName} subagent`}
`;
    if (frontmatter.tools && Array.isArray(frontmatter.tools)) {
      agentContent += `allowed-tools: [${frontmatter.tools.join(', ')}]\n`;
    }
    if (frontmatter.model) {
      agentContent += `model: ${frontmatter.model}\n`;
    }
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      agentContent += `skills: [${frontmatter.skills.join(', ')}]\n`;
    }
    agentContent += `---\n\n`;

    agentContent += `# ${baseName.toUpperCase()} SUBAGENT SPECIFICATION\n\n`;
    agentContent += `${body.trim()}\n\n`;

    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      agentContent += `## Linked Skill Packages\n`;
      for (const s of frontmatter.skills) {
        agentContent += `- **${s}**: Refer to \`.claude/skills/${s}/SKILL.md\`\n`;
      }
      agentContent += `\n`;
    }

    if (frontmatter.routes && Array.isArray(frontmatter.routes)) {
      agentContent += `## Routing & Subagent Delegation\n`;
      for (const r of frontmatter.routes) {
        const targetBase = (r.target || '').replace(/\.md$/, '');
        agentContent += `- On **${(r.on || 'next').toUpperCase()}**: Delegate to \`@${targetBase}\` (${r.label || 'proceed'})\n`;
      }
    }

    files.push({
      path: agentPath,
      content: agentContent,
      language: 'markdown'
    });

    // Also generate .claude/commands/<agent>.md for direct slash invocation
    const cmdPath = `.claude/commands/${baseName}.md`;
    let cmdContent = `---
description: ${frontmatter.description || `Trigger ${baseName} agent`}
---

# /${baseName} Command

Execute ${baseName} subagent task:
\`\`\`
@${baseName}
\`\`\`
`;
    files.push({
      path: cmdPath,
      content: cmdContent,
      language: 'markdown'
    });
  }

  // 3. Bundle linked skills into .claude/skills/<skill-name>/...
  for (const skill of linkedSkills) {
    if (skill.files && Array.isArray(skill.files)) {
      for (const f of skill.files) {
        files.push({
          path: `.claude/skills/${skill.name}/${f.file_path}`,
          content: f.content || '',
          language: f.file_path.endsWith('.md') ? 'markdown' : (f.file_path.endsWith('.sh') ? 'bash' : 'text')
        });
      }
    }
  }

  return files;
}
