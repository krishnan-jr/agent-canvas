/**
 * Antigravity (AGY) Exporter Transpiler
 * Produces GEMINI.md project guidelines and .gemini/antigravity/skills/<skill>/ skill bundles.
 */

import { parseAgentYaml } from '../validator.js';

export function transpileToAntigravity(project, nodes = [], edges = [], linkedSkills = []) {
  const files = [];
  const projectName = project ? project.name : 'Antigravity Workspace';
  const projectDesc = project ? project.description : 'Google Antigravity multi-agent system';

  const nodeMap = new Map();
  nodes.forEach(n => {
    const name = (n.filename || n.title || 'agent').replace(/\.md$/, '');
    nodeMap.set(n.id, name);
  });

  // 1. Generate GEMINI.md (Workspace Rules & Global Decision Protocol)
  let geminiMd = `# ${projectName} - Antigravity Multi-Agent Guidelines\n\n`;
  geminiMd += `> ${projectDesc}\n\n`;
  geminiMd += `## Multi-Agent Subagent Network\n\n`;
  geminiMd += `The following skills and subagents are configured for Google Antigravity:\n\n`;

  const allRoutes = [];

  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    const name = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const role = frontmatter.role || 'assistant';
    const desc = frontmatter.description || node.title || 'Specialized skill capability';

    geminiMd += `### Agent: \`${name}\`\n`;
    geminiMd += `- **Role**: \`${role}\`\n`;
    geminiMd += `- **Description**: ${desc}\n`;
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      geminiMd += `- **Linked Skills**: ${frontmatter.skills.map(s => `\`${s}\``).join(', ')}\n`;
    }
    geminiMd += `\n`;

    if (frontmatter.routes && Array.isArray(frontmatter.routes)) {
      for (const r of frontmatter.routes) {
        allRoutes.push({
          source: name,
          on: (r.on || 'default').toUpperCase(),
          target: (r.target || '').replace(/\.md$/, ''),
          label: r.label || r.on || 'Next',
          maxRetries: r.max_retries || (r.on === 'fail' ? 3 : null)
        });
      }
    }
  }

  // Add Linked Skills section to GEMINI.md
  if (linkedSkills.length > 0) {
    geminiMd += `## Linked Skill Packages\n\n`;
    geminiMd += `The following reusable skill packages are available in this project:\n\n`;
    geminiMd += `| Skill | Description | Location |\n`;
    geminiMd += `| :--- | :--- | :--- |\n`;
    for (const skill of linkedSkills) {
      geminiMd += `| \`${skill.name}\` | ${skill.description || 'Modular skill capability'} | \`.gemini/antigravity/skills/${skill.name}/\` |\n`;
    }
    geminiMd += `\n`;
  }

  // Also collect routes from visual canvas edges if not already present
  for (const edge of edges) {
    const sId = edge.source_id || edge.source;
    const tId = edge.target_id || edge.target;
    const sourceName = nodeMap.get(sId);
    const targetName = nodeMap.get(tId);
    if (sourceName && targetName) {
      const cond = (edge.condition || edge.label || edge.edge_type || 'next').trim().toUpperCase();
      const exists = allRoutes.some(r => r.source === sourceName && r.target === targetName && r.on === cond);
      if (!exists) {
        allRoutes.push({
          source: sourceName,
          on: cond,
          target: targetName,
          label: edge.label || cond,
          maxRetries: edge.max_retries || (cond === 'FAIL' ? 3 : null)
        });
      }
    }
  }

  // Multi-Agent Decision Routing Table & Protocol in GEMINI.md
  if (allRoutes.length > 0) {
    geminiMd += `## Decision & Orchestration Routing Matrix\n\n`;
    geminiMd += `When coordinating multi-agent workflows, Antigravity agents MUST follow these decision transitions:\n\n`;
    geminiMd += `| Source Agent | Decision Condition | Target Agent | Execution Policy |\n`;
    geminiMd += `| :--- | :--- | :--- | :--- |\n`;

    for (const r of allRoutes) {
      const retryNote = r.maxRetries ? `Max ${r.maxRetries} retry attempts before escalation` : `Direct transition`;
      const conditionBadge = r.on === 'PASS' ? `**PASS (Success)**` : (r.on === 'FAIL' ? `**FAIL (Rejection)**` : `**${r.on}**`);
      geminiMd += `| \`${r.source}\` | ${conditionBadge} | \`${r.target}\` | ${retryNote} |\n`;
    }

    geminiMd += `\n### Decision Flow Diagram\n\n`;
    geminiMd += `\`\`\`mermaid\ngraph TD\n`;
    for (const r of allRoutes) {
      const edgeLabel = r.maxRetries ? `${r.on} (max ${r.maxRetries})` : r.on;
      geminiMd += `  ${r.source} -->|${edgeLabel}| ${r.target}\n`;
    }
    geminiMd += `\`\`\`\n\n`;
  }

  geminiMd += `## Subagent Execution Protocol\n\n`;
  geminiMd += `1. **Progressive Disclosure**: When invoking a skill or subagent, read its specification from \`.gemini/antigravity/skills/<skill-name>/SKILL.md\`.\n`;
  geminiMd += `2. **Subagent Spawning**: For isolated or multi-agent tasks, spawn subagents using \`invoke_subagent\` specifying the target agent role and task prompt.\n`;
  geminiMd += `3. **Pass / Fail Feedback Loops**: If a reviewer or evaluator flags a failure (**FAIL**), provide concrete diagnostic feedback and route back to the authoring agent within the allowed retry limit.\n`;

  files.push({
    path: 'GEMINI.md',
    content: geminiMd,
    language: 'markdown'
  });

  // 2. Generate .gemini/antigravity/skills/<agent>/SKILL.md for each agent node
  for (const node of nodes) {
    const { frontmatter, body } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const skillPath = `.gemini/antigravity/skills/${baseName}/SKILL.md`;

    let skillContent = `---
name: ${baseName}
description: ${frontmatter.description || `Specialized ${baseName} agent for ${frontmatter.role || 'task execution'}`}
---

# ${baseName.toUpperCase()} AGENT INSTRUCTIONS

${body.trim()}
`;

    if (frontmatter.tools && Array.isArray(frontmatter.tools) && frontmatter.tools.length > 0) {
      skillContent += `\n## Enabled Tools\n`;
      for (const t of frontmatter.tools) {
        skillContent += `- \`${t}\`\n`;
      }
    }

    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      skillContent += `\n## Linked Skills (Progressive Disclosure)\n`;
      skillContent += `This agent has access to the following project skills. Read instructions as needed:\n`;
      for (const s of frontmatter.skills) {
        skillContent += `- **${s}**: Read \`.gemini/antigravity/skills/${s}/SKILL.md\`\n`;
      }
    }

    // Merge frontmatter routes and outgoing canvas edges
    const nodeRoutes = [];
    if (frontmatter.routes && Array.isArray(frontmatter.routes)) {
      for (const r of frontmatter.routes) {
        nodeRoutes.push({
          on: (r.on || 'default').toUpperCase(),
          target: (r.target || '').replace(/\.md$/, ''),
          maxRetries: r.max_retries || (r.on === 'fail' ? 3 : null)
        });
      }
    }

    for (const edge of edges) {
      const sId = edge.source_id || edge.source;
      const tId = edge.target_id || edge.target;
      if (sId === node.id) {
        const targetName = nodeMap.get(tId);
        if (targetName) {
          const cond = (edge.condition || edge.label || edge.edge_type || 'next').trim().toUpperCase();
          const exists = nodeRoutes.some(r => r.target === targetName && r.on === cond);
          if (!exists) {
            nodeRoutes.push({
              on: cond,
              target: targetName,
              maxRetries: edge.max_retries || (cond === 'FAIL' ? 3 : null)
            });
          }
        }
      }
    }

    if (nodeRoutes.length > 0) {
      skillContent += `\n## Decision & Delegation Routing\n\n`;
      skillContent += `Upon completing execution, evaluate task output and follow these decision branches:\n\n`;

      for (const r of nodeRoutes) {
        const cond = r.on;
        const targetSkill = r.target;
        const retries = r.maxRetries ? ` (max retries: ${r.maxRetries})` : '';

        if (cond === 'PASS') {
          skillContent += `- **On PASS (Success / Approved)**: Output verified. Delegate to agent \`${targetSkill}\` via \`invoke_subagent\` or read \`.gemini/antigravity/skills/${targetSkill}/SKILL.md\`.\n`;
        } else if (cond === 'FAIL') {
          skillContent += `- **On FAIL (Failure / Rejected)**: Output rejected or errors detected${retries}. Attach detailed error diagnostics and return task to agent \`${targetSkill}\` for revision.\n`;
        } else {
          skillContent += `- **On ${cond}**: Hand off output to agent \`${targetSkill}\`.\n`;
        }
      }
    }

    files.push({
      path: skillPath,
      content: skillContent,
      language: 'markdown'
    });
  }

  // 3. Bundle all linked skill packages into .gemini/antigravity/skills/<skill-name>/...
  for (const skill of linkedSkills) {
    if (skill.files && Array.isArray(skill.files)) {
      for (const f of skill.files) {
        const fullPath = `.gemini/antigravity/skills/${skill.name}/${f.file_path}`;
        // Avoid overwriting agent SKILL.md if agent has same name as skill
        const alreadyExists = files.some(existing => existing.path === fullPath);
        if (!alreadyExists) {
          files.push({
            path: fullPath,
            content: f.content || '',
            language: f.file_path.endsWith('.md') ? 'markdown' : (f.file_path.endsWith('.sh') ? 'bash' : 'text')
          });
        }
      }
    }
  }

  // 4. Generate .gemini/config/mcp_config.json for Antigravity MCP integration
  const agyMcpConfig = {
    "mcpServers": {
      "agent-canvas": {
        "command": "node",
        "args": ["src/mcpServer.js"]
      },
      "agent-canvas-remote": {
        "serverUrl": "http://localhost:3000/api/mcp/sse"
      }
    }
  };

  files.push({
    path: '.gemini/config/mcp_config.json',
    content: JSON.stringify(agyMcpConfig, null, 2),
    language: 'json'
  });

  return files;
}
