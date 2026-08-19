/**
 * Frontend Universal Agent Schema & Frontmatter Validator
 */

export const UNIVERSAL_ROLES = [
  'orchestrator',
  'assistant',
  'researcher',
  'evaluator',
  'router',
  'coder',
  'tool'
];

export const UNIVERSAL_ROLE_DEFINITIONS = [
  { role: 'orchestrator', color: '#38bdf8', label: 'Orchestrator', desc: 'Master supervisor coordinating workflows, scheduling, and subagent delegation.' },
  { role: 'assistant', color: '#64748b', label: 'Assistant', desc: 'General conversational agent executing interactive queries and general tasks.' },
  { role: 'researcher', color: '#818cf8', label: 'Researcher', desc: 'Read-only explorer gathering codebase context, documentation, and web data.' },
  { role: 'evaluator', color: '#10b981', label: 'Evaluator', desc: 'Quality gatekeeper auditing test coverage, lint checks, and security guardrails.' },
  { role: 'router', color: '#f59e0b', label: 'Router', desc: 'Decision node evaluating conditions, branching paths, and retry transitions.' },
  { role: 'coder', color: '#a855f7', label: 'Coder', desc: 'Implementation engineer focused on writing, editing, and refactoring source code.' },
  { role: 'tool', color: '#71717a', label: 'Tool', desc: 'Specialized deterministic utility agent executing discrete bash scripts or tools.' }
];

export const STANDARD_TOOLS = [
  'file_reader',
  'file_writer',
  'grep_search',
  'find_files',
  'bash',
  'web_search',
  'browser_page',
  'sqlite_query',
  'call_subagent'
];

export const PLATFORMS = [
  { id: 'claude-code', name: 'Claude Code', ext: '.md', targetDir: '.claude/' },
  { id: 'opencode', name: 'OpenCode', ext: '.md', targetDir: '.opencode/' },
  { id: 'cursor', name: 'Cursor', ext: '.mdc', targetDir: '.cursor/rules/' },
  { id: 'antigravity', name: 'Antigravity', ext: '.md', targetDir: '.gemini/antigravity/' },
  { id: 'codex', name: 'Codex / OpenAI', ext: '.json', targetDir: 'instructions/' }
];

export const FIELD_DOCUMENTATION = {
  role: {
    label: 'role',
    type: 'string',
    description: "Defines the agent's primary execution role and hierarchy tier in the multi-agent system.",
    allowedValues: UNIVERSAL_ROLES,
    roleDefinitions: UNIVERSAL_ROLE_DEFINITIONS,
    example: 'role: assistant',
    harnesses: [
      { name: 'Claude Code', support: 'Full', note: 'Maps to subagent behavior & /commands definition' },
      { name: 'OpenCode', support: 'Full', note: 'Defines agent role & mode (primary vs subagent) in AGENTS.md' },
      { name: 'Cursor', support: 'Full', note: 'Used in .cursorrules agent hierarchy' },
      { name: 'Antigravity', support: 'Full', note: 'Defines subagent role in GEMINI.md' },
      { name: 'Codex', support: 'Full', note: 'Mapped to assistant role metadata' }
    ]
  },
  description: {
    label: 'description',
    type: 'string',
    description: "Human and AI readable summary of the agent's purpose, capabilities, and triggering conditions.",
    example: 'description: Audits code for security and compliance vulnerabilities',
    harnesses: [
      { name: 'Cursor', support: 'Full', note: 'Primary trigger for .mdc context rule matching' },
      { name: 'Antigravity', support: 'Full', note: 'Used in SKILL.md frontmatter for skill routing' },
      { name: 'Claude Code', support: 'Full', note: 'Shown in /commands list & CLAUDE.md index' },
      { name: 'Codex', support: 'Full', note: 'OpenAI Assistant description parameter' },
      { name: 'OpenCode', support: 'Full', note: 'Documented in AGENTS.md registry' }
    ]
  },
  tools: {
    label: 'tools',
    type: 'array',
    description: 'List of capability permissions and tools the agent is authorized to invoke.',
    example: 'tools: [file_reader, grep_search, bash]',
    harnesses: [
      { name: 'Claude Code', support: 'Full', note: 'Transpiled to allowed-tools in .claude/commands/' },
      { name: 'Codex', support: 'Full', note: 'Converted to OpenAI Assistant function schemas' },
      { name: 'Antigravity', support: 'Full', note: 'Listed as enabled tools in SKILL.md' },
      { name: 'OpenCode', support: 'Full', note: 'Configured in .opencode/agents/*.md' },
      { name: 'Cursor', support: 'Reference', note: 'Included as prompt tool guidelines' }
    ]
  },
  routes: {
    label: 'routes',
    type: 'array of objects',
    description: 'Conditional state transitions (pass, fail, default) linking to downstream agents with retry limits.',
    example: 'routes:\n  - on: pass\n    target: deployer.md\n  - on: fail\n    target: coder.md\n    max_retries: 3',
    harnesses: [
      { name: 'OpenCode', support: 'Full', note: 'Generates Mermaid decision graph in AGENTS.md' },
      { name: 'Claude Code', support: 'Full', note: 'Documents decision routing & delegation in CLAUDE.md' },
      { name: 'Antigravity', support: 'Full', note: 'Follow-up skill delegation triggers' },
      { name: 'Cursor', support: 'Full', note: 'Rule switching and handoff instructions' },
      { name: 'Codex', support: 'Full', note: 'Included in orchestration schema' }
    ]
  },
  globs: {
    label: 'globs',
    type: 'array | string',
    description: 'File path patterns that trigger automatic contextual rule activation in IDEs.',
    example: 'globs: ["src/**/*.js", "api/**"]',
    harnesses: [
      { name: 'Cursor', support: 'Full', note: 'Directly powers .cursor/rules/*.mdc file glob matching' },
      { name: 'Claude Code', support: 'Partial', note: 'Documented in CLAUDE.md context table' },
      { name: 'Antigravity', support: 'Reference', note: 'Included in skill file scope guidelines' },
      { name: 'OpenCode', support: 'Reference', note: 'Documented in agent file match rules' },
      { name: 'Codex', support: 'N/A', note: 'Not natively used in API schema' }
    ]
  },
  skills: {
    label: 'skills',
    type: 'array',
    description: 'Modular skill packages (SKILL.md, scripts, references) linked to this agent for on-demand execution.',
    example: 'skills: [git-workflow, security-audit]',
    harnesses: [
      { name: 'Antigravity', support: 'Full', note: 'Native .gemini/antigravity/skills/<skill>/ progressive disclosure' },
      { name: 'Claude Code', support: 'Full', note: 'Native .claude/skills/<skill>/ package execution' },
      { name: 'OpenCode', support: 'Full', note: 'Bundled into .opencode/skills/ with AGENTS.md registry' },
      { name: 'Cursor', support: 'Full', note: 'Bundled into .cursor/skills/ and contextual rule refs' },
      { name: 'Codex', support: 'Full', note: 'Scripts mapped to tools, references to file knowledge' }
    ]
  },
  model: {
    label: 'model',
    type: 'string',
    description: "Target LLM backend model alias for executing this agent's instructions.",
    example: 'model: claude-3-5-sonnet',
    harnesses: [
      { name: 'Claude Code', support: 'Full', note: 'Sets model in .claude/commands/ frontmatter' },
      { name: 'Codex', support: 'Full', note: 'Sets OpenAI model in codex.json (e.g. gpt-4o)' },
      { name: 'OpenCode', support: 'Full', note: 'Sets agent model in .opencode/agents/' },
      { name: 'Antigravity', support: 'Reference', note: 'Listed in GEMINI.md agent matrix' },
      { name: 'Cursor', support: 'Reference', note: 'Documented in rule suggestions' }
    ]
  },
  temperature: {
    label: 'temperature',
    type: 'number (0.0 - 1.0)',
    description: 'Sampling temperature controlling deterministic (0.0) vs creative (0.7+) behavior.',
    example: 'temperature: 0.2',
    harnesses: [
      { name: 'Codex', support: 'Full', note: 'Directly configures Assistant temperature parameter' },
      { name: 'OpenCode', support: 'Full', note: 'Configured in agent execution profile' },
      { name: 'Claude Code', support: 'Reference', note: 'Documented in command parameters' },
      { name: 'Antigravity', support: 'Reference', note: 'Documented in skill specification' },
      { name: 'Cursor', support: 'N/A', note: 'Managed by Cursor client settings' }
    ]
  }
};

export function parseAgentYaml(markdownText = '') {
  const match = markdownText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n([\s\S]*))?$/);
  if (!match) {
    return {
      hasFrontmatter: false,
      rawYml: '',
      frontmatter: {},
      body: markdownText,
      errors: [{ line: 1, message: 'Missing YAML frontmatter block (starts and ends with ---)' }]
    };
  }

  const rawYml = match[1];
  const body = match[2] || '';
  const frontmatter = {};
  const errors = [];
  const lines = rawYml.split('\n');
  const seenKeys = new Map();

  let inRoutes = false;
  let currentRoute = null;
  const routes = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 2; // offset for opening ---
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('routes:')) {
      if (seenKeys.has('routes')) {
        errors.push({
          line: lineNum,
          message: `Duplicate property 'routes' detected (already defined on line ${seenKeys.get('routes')})`
        });
      } else {
        seenKeys.set('routes', lineNum);
      }
      inRoutes = true;
      continue;
    }

    if (inRoutes) {
      if (trimmed.startsWith('- on:') || trimmed.startsWith('- target:')) {
        if (currentRoute) routes.push(currentRoute);
        currentRoute = {};
      }
      if (line.startsWith('  ') && currentRoute) {
        const itemStr = trimmed.replace(/^-\s*/, '');
        const colonIdx = itemStr.indexOf(':');
        if (colonIdx > 0) {
          const k = itemStr.slice(0, colonIdx).trim();
          let v = itemStr.slice(colonIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (k === 'max_retries') v = parseInt(v, 10) || 3;
          currentRoute[k] = v;
        }
        continue;
      }
      if (!line.startsWith('  ')) {
        inRoutes = false;
        if (currentRoute) { routes.push(currentRoute); currentRoute = null; }
      }
    }

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx > 0 && !inRoutes) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val = trimmed.slice(colonIdx + 1).trim();

      if (seenKeys.has(key)) {
        errors.push({
          line: lineNum,
          message: `Duplicate property '${key}' detected (already defined on line ${seenKeys.get(key)})`
        });
      } else {
        seenKeys.set(key, lineNum);
      }

      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      } else {
        val = val.replace(/^['"]|['"]$/g, '');
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (!isNaN(Number(val)) && val !== '') val = Number(val);
      }
      frontmatter[key] = val;
    }
  }

  if (currentRoute) routes.push(currentRoute);
  if (routes.length > 0) frontmatter.routes = routes;

  return {
    hasFrontmatter: true,
    rawYml,
    frontmatter,
    body,
    errors
  };
}

export function validateAgentSchema(markdownText = '') {
  const { hasFrontmatter, frontmatter, body, errors } = parseAgentYaml(markdownText);
  const warnings = [];
  const compatibility = {
    'claude-code': { ready: true, notes: [] },
    'opencode': { ready: true, notes: [] },
    'cursor': { ready: true, notes: [] },
    'antigravity': { ready: true, notes: [] },
    'codex': { ready: true, notes: [] }
  };

  if (!hasFrontmatter) {
    return {
      valid: false,
      errors: [{ line: 1, message: 'Frontmatter block (---) is required for universal agent export.' }],
      warnings: [],
      compatibility
    };
  }

  if (!frontmatter.role) {
    warnings.push({ field: 'role', message: `Missing 'role'. Recommended: ${UNIVERSAL_ROLES.join(', ')}` });
  } else if (!UNIVERSAL_ROLES.includes(String(frontmatter.role).toLowerCase())) {
    warnings.push({ field: 'role', message: `Unknown role '${frontmatter.role}'. Standard roles: ${UNIVERSAL_ROLES.join(', ')}` });
  }

  if (!frontmatter.description) {
    compatibility['cursor'].notes.push("Cursor .mdc rules benefit from a 'description' field for context matching.");
    compatibility['antigravity'].notes.push("Antigravity SKILL.md uses 'description' for agent routing.");
  }

  if (!frontmatter.tools || !Array.isArray(frontmatter.tools) || frontmatter.tools.length === 0) {
    compatibility['claude-code'].notes.push("No tools specified; Claude Code will execute with standard terminal/file permissions.");
  }

  if (!frontmatter.globs && (!frontmatter.routes || frontmatter.routes.length === 0)) {
    compatibility['cursor'].notes.push("No file 'globs' specified (will default to alwaysApply: false).");
  }

  if (!body.trim()) {
    warnings.push({ field: 'body', message: 'Agent instructions body is empty. Add markdown prompt context.' });
  }

  return {
    valid: errors.length === 0,
    frontmatter,
    errors,
    warnings,
    compatibility
  };
}

export function validateGraphTopology(nodes = [], edges = [], skills = []) {
  const issues = [];
  const nodeIssuesMap = {}; // nodeId -> { errors: [], warnings: [] }

  const addIssue = (nodeId, type, message, field = null) => {
    issues.push({ nodeId, type, message, field });
    if (nodeId) {
      if (!nodeIssuesMap[nodeId]) {
        nodeIssuesMap[nodeId] = { errors: [], warnings: [] };
      }
      if (type === 'error') {
        nodeIssuesMap[nodeId].errors.push(message);
      } else {
        nodeIssuesMap[nodeId].warnings.push(message);
      }
    }
  };

  if (!nodes || nodes.length === 0) {
    return {
      healthy: true,
      errorsCount: 0,
      warningsCount: 0,
      issues: [],
      nodeIssuesMap: {}
    };
  }

  // 1. Check duplicate filenames
  const seenFilenames = new Map();
  nodes.forEach(n => {
    const fn = (n.filename || n.title || '').trim().toLowerCase();
    if (seenFilenames.has(fn)) {
      addIssue(n.id, 'error', `Duplicate agent filename "${n.filename}". Filenames must be unique across the project.`);
    } else {
      seenFilenames.set(fn, n.id);
    }
  });

  // 2. Map incoming & outgoing edge degree
  const incoming = {};
  const outgoing = {};
  nodes.forEach(n => {
    incoming[n.id] = [];
    outgoing[n.id] = [];
  });
  (edges || []).forEach(e => {
    if (outgoing[e.source_id]) outgoing[e.source_id].push(e);
    if (incoming[e.target_id]) incoming[e.target_id].push(e);
  });

  // 3. Check individual node frontmatter & route / skill integrity
  const availableSkillNames = (skills || []).map(s => String(s.name || '').trim().toLowerCase());

  nodes.forEach(n => {
    const { hasFrontmatter, frontmatter, errors } = parseAgentYaml(n.content || '');
    if (!hasFrontmatter) {
      addIssue(n.id, 'error', `Missing YAML frontmatter in "${n.filename || n.title}".`);
    } else if (errors.length > 0) {
      errors.forEach(err => {
        addIssue(n.id, 'error', `Frontmatter syntax error in "${n.filename}": ${err.message}`);
      });
    }

    // Check referenced route targets
    if (frontmatter && frontmatter.routes && Array.isArray(frontmatter.routes)) {
      frontmatter.routes.forEach(r => {
        if (!r.target) {
          addIssue(n.id, 'warning', `Route in "${n.filename}" is missing a target agent.`, 'routes');
        } else {
          const targetName = String(r.target).trim().toLowerCase().replace(/\.md$/, '');
          const targetExists = nodes.some(other => {
            const otherFn = (other.filename || other.title || '').trim().toLowerCase().replace(/\.md$/, '');
            return otherFn === targetName;
          });
          if (!targetExists) {
            addIssue(n.id, 'error', `Route target "${r.target}" defined in "${n.filename}" does not exist on the canvas.`, 'routes');
          }
        }
      });
    }

    // Check referenced skills
    if (frontmatter && frontmatter.skills && Array.isArray(frontmatter.skills)) {
      frontmatter.skills.forEach(s => {
        const skillName = String(s).trim().toLowerCase();
        if (!availableSkillNames.includes(skillName)) {
          addIssue(n.id, 'warning', `Skill "${s}" linked in "${n.filename}" is not defined in the Project Skills Library.`, 'skills');
        }
      });
    }
  });

  // 4. Cycle detection & runaway loop verification
  const visited = new Set();
  const recStack = new Set();

  const detectCycles = (currId, pathEdges = []) => {
    visited.add(currId);
    recStack.add(currId);

    const out = outgoing[currId] || [];
    for (const e of out) {
      if (!visited.has(e.target_id)) {
        detectCycles(e.target_id, [...pathEdges, e]);
      } else if (recStack.has(e.target_id)) {
        // Cycle detected
        const cycle = [...pathEdges, e];
        const hasRetryLimit = cycle.some(edge => edge.max_retries && edge.max_retries > 0);
        const hasAlternativePass = cycle.some(edge => (outgoing[edge.source_id] || []).some(oe => oe.edge_type === 'pass'));
        
        if (!hasRetryLimit && !hasAlternativePass) {
          const srcNode = nodes.find(n => n.id === e.source_id);
          const tgtNode = nodes.find(n => n.id === e.target_id);
          addIssue(e.source_id, 'warning', `Potential runaway loop between "${srcNode?.filename}" and "${tgtNode?.filename}" without retry limit.`);
        }
      }
    }

    recStack.delete(currId);
  };

  nodes.forEach(n => {
    if (!visited.has(n.id)) {
      detectCycles(n.id);
    }
  });

  const errorsCount = issues.filter(i => i.type === 'error').length;
  const warningsCount = issues.filter(i => i.type === 'warning').length;

  return {
    healthy: errorsCount === 0 && warningsCount === 0,
    errorsCount,
    warningsCount,
    issues,
    nodeIssuesMap
  };
}
