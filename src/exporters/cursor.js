/**
 * Cursor Exporter Transpiler
 * Produces .cursor/rules/<agent>.mdc modern rule files, .cursor/skills/<skill>/ packages, and .cursorrules workspace root rules.
 */

import { parseAgentYaml } from '../validator.js';

export function transpileToCursor(project, nodes = [], edges = [], linkedSkills = []) {
  const files = [];
  const projectName = project ? project.name : 'Cursor Project';

  // 1. Generate .cursorrules (Legacy / Root Fallback)
  let cursorrules = `# ${projectName} - Cursor Agent Rules\n\n`;
  cursorrules += `You are an expert AI paired with this repository.\n`;
  cursorrules += `Follow these modular agent behaviors and routing instructions:\n\n`;

  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    const name = node.filename || node.title || 'agent';
    const desc = frontmatter.description || node.title || 'Specialized agent instructions';
    cursorrules += `- **${name}**: ${desc}\n`;
  }

  if (linkedSkills.length > 0) {
    cursorrules += `\n## Project Skills Library\n\n`;
    for (const s of linkedSkills) {
      cursorrules += `- **${s.name}**: ${s.description || 'Modular skill package'} (\`.cursor/skills/${s.name}/\`)\n`;
    }
  }

  files.push({
    path: '.cursorrules',
    content: cursorrules,
    language: 'markdown'
  });

  // 2. Generate .cursor/rules/<agent>.mdc
  for (const node of nodes) {
    const { frontmatter, body } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const mdcPath = `.cursor/rules/${baseName}.mdc`;

    const globs = frontmatter.globs && Array.isArray(frontmatter.globs)
      ? frontmatter.globs.join(', ')
      : (frontmatter.globs || '*');

    let mdcContent = `---
description: ${frontmatter.description || `Guidelines for ${baseName} agent`}
globs: ${globs}
alwaysApply: false
`;
    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      mdcContent += `skills: [${frontmatter.skills.join(', ')}]\n`;
    }
    mdcContent += `---\n\n`;

    mdcContent += `# ${baseName.toUpperCase()} RULES & INSTRUCTIONS\n\n`;
    mdcContent += `${body.trim()}\n`;

    if (frontmatter.skills && Array.isArray(frontmatter.skills) && frontmatter.skills.length > 0) {
      mdcContent += `\n## Linked Skills & Runbooks\n`;
      for (const s of frontmatter.skills) {
        mdcContent += `- Refer to \`.cursor/skills/${s}/SKILL.md\`\n`;
      }
    }

    if (frontmatter.routes && Array.isArray(frontmatter.routes)) {
      mdcContent += `\n## Follow-up Agent Transitions\n`;
      for (const r of frontmatter.routes) {
        mdcContent += `- When condition is **${(r.on || 'next').toUpperCase()}**: Switch context to \`.cursor/rules/${(r.target || '').replace(/\.md$/, '')}.mdc\`\n`;
      }
    }

    files.push({
      path: mdcPath,
      content: mdcContent,
      language: 'markdown'
    });
  }

  // 3. Bundle linked skills into .cursor/skills/<skill-name>/...
  for (const skill of linkedSkills) {
    if (skill.files && Array.isArray(skill.files)) {
      for (const f of skill.files) {
        files.push({
          path: `.cursor/skills/${skill.name}/${f.file_path}`,
          content: f.content || '',
          language: f.file_path.endsWith('.md') ? 'markdown' : (f.file_path.endsWith('.sh') ? 'bash' : 'text')
        });
      }
    }
  }

  return files;
}
