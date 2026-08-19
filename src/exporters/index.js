/**
 * Multi-Target Exporter Hub
 * Dispatches transpilation to Claude Code, OpenCode, Cursor, Antigravity, Codex, or Universal bundle.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseAgentYaml } from '../validator.js';
import { transpileToClaudeCode } from './claudeCode.js';
import { transpileToOpenCode } from './openCode.js';
import { transpileToCursor } from './cursor.js';
import { transpileToAntigravity } from './antigravity.js';
import { transpileToCodex } from './codex.js';
import { createZipBuffer } from './zipBuilder.js';

export const SUPPORTED_TARGETS = [
  { id: 'claude-code', name: 'Claude Code', description: 'CLAUDE.md, .claude/commands/ & .claude/skills/' },
  { id: 'opencode', name: 'OpenCode', description: 'AGENTS.md, .opencode/agents/ & .opencode/skills/' },
  { id: 'cursor', name: 'Cursor', description: '.cursor/rules/*.mdc, .cursor/skills/ & .cursorrules' },
  { id: 'antigravity', name: 'Antigravity', description: 'GEMINI.md & .gemini/antigravity/skills/' },
  { id: 'codex', name: 'Codex / OpenAI', description: 'codex.json, instructions/*.md & skills/' },
  { id: 'universal', name: 'Universal Raw .md', description: 'Pure markdown vault with frontmatter, skills/ & workflow.js' }
];

export function getLinkedSkillsForNodes(nodes = [], allSkills = []) {
  const linkedSkillNames = new Set();
  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    if (frontmatter.skills && Array.isArray(frontmatter.skills)) {
      frontmatter.skills.forEach(s => {
        if (typeof s === 'string' && s.trim()) linkedSkillNames.add(s.trim().toLowerCase());
      });
    }
  }

  // Return only skills that are linked in active canvas nodes
  return allSkills.filter(s => linkedSkillNames.has(s.name.toLowerCase()));
}

export function transpileProject(target = 'claude-code', project, nodes = [], edges = [], allSkills = []) {
  const linkedSkills = getLinkedSkillsForNodes(nodes, allSkills);

  switch (target) {
    case 'claude-code':
      return transpileToClaudeCode(project, nodes, edges, linkedSkills);
    case 'opencode':
      return transpileToOpenCode(project, nodes, edges, linkedSkills);
    case 'cursor':
      return transpileToCursor(project, nodes, edges, linkedSkills);
    case 'antigravity':
      return transpileToAntigravity(project, nodes, edges, linkedSkills);
    case 'codex':
      return transpileToCodex(project, nodes, edges, linkedSkills);
    case 'universal':
    default: {
      const files = nodes.map(n => ({
        path: n.filename || `${n.id}.md`,
        content: n.content || '',
        language: 'markdown'
      }));

      // Bundle linked skills under skills/<skill-name>/...
      for (const skill of linkedSkills) {
        if (skill.files && Array.isArray(skill.files)) {
          for (const f of skill.files) {
            files.push({
              path: `skills/${skill.name}/${f.file_path}`,
              content: f.content || '',
              language: f.file_path.endsWith('.md') ? 'markdown' : (f.file_path.endsWith('.sh') ? 'bash' : 'text')
            });
          }
        }
      }

      return files;
    }
  }
}

export function exportToDisk(target = 'claude-code', project, nodes = [], edges = [], baseWorkspaceDir, allSkills = [], customPath = null) {
  const files = transpileProject(target, project, nodes, edges, allSkills);
  const projSlug = project ? (project.slug || project.id) : 'default';
  const targetDirName = `export_${target.replace(/-/g, '_')}`;

  let outDir;
  if (customPath && typeof customPath === 'string' && customPath.trim()) {
    const trimmed = customPath.trim();
    outDir = path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
  } else {
    outDir = path.join(baseWorkspaceDir, projSlug, targetDirName);
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const writtenFiles = [];
  for (const file of files) {
    const fullPath = path.join(outDir, file.path);
    const parentDir = path.dirname(fullPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, file.content, 'utf-8');
    writtenFiles.push(file.path);
  }

  return {
    success: true,
    target,
    outDir,
    filesCount: writtenFiles.length,
    files: writtenFiles
  };
}

export function exportToZip(target = 'claude-code', project, nodes = [], edges = [], allSkills = []) {
  const files = transpileProject(target, project, nodes, edges, allSkills);
  return createZipBuffer(files);
}
