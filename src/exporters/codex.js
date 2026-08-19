/**
 * Codex / OpenAI Assistant Exporter Transpiler
 * Produces codex.json configuration schema, instructions/<agent>.md files, and skills/<skill>/ bundles.
 */

import { parseAgentYaml } from '../validator.js';

export function transpileToCodex(project, nodes = [], edges = [], linkedSkills = []) {
  const files = [];
  const projectName = project ? project.name : 'Codex Agents';

  const assistants = [];

  for (const node of nodes) {
    const { frontmatter, body } = parseAgentYaml(node.content || '');
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    const instructionsPath = `instructions/${baseName}.md`;

    assistants.push({
      name: baseName,
      role: frontmatter.role || 'assistant',
      model: frontmatter.model || 'gpt-4o',
      temperature: frontmatter.temperature !== undefined ? frontmatter.temperature : 0.2,
      description: frontmatter.description || `Codex instruction module for ${baseName}`,
      tools: (frontmatter.tools || []).map(t => ({
        type: 'function',
        function: { name: t, description: `Execute ${t} capability` }
      })),
      skills: frontmatter.skills || [],
      instructions_file: instructionsPath,
      routes: frontmatter.routes || []
    });

    files.push({
      path: instructionsPath,
      content: `# ${baseName.toUpperCase()}\n\n${body.trim()}`,
      language: 'markdown'
    });
  }

  // Bundle linked skills into skills/<skill-name>/...
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

  const codexConfig = {
    version: '1.0.0',
    project: projectName,
    schema: 'openai-assistants-v2',
    assistants,
    skills: linkedSkills.map(s => ({
      name: s.name,
      description: s.description || '',
      path: `skills/${s.name}/SKILL.md`
    })),
    orchestration: {
      routes: edges.map(e => ({
        from: nodes.find(n => n.id === e.source_id)?.filename || e.source_id,
        to: nodes.find(n => n.id === e.target_id)?.filename || e.target_id,
        type: e.edge_type || 'default',
        label: e.label || 'Next',
        max_retries: e.max_retries || 3
      }))
    }
  };

  files.push({
    path: 'codex.json',
    content: JSON.stringify(codexConfig, null, 2),
    language: 'json'
  });

  return files;
}
