/**
 * Tool vocabulary translation between the universal agent schema and each target harness.
 *
 * The universal schema uses short lowercase tool names (`read`, `websearch`, `question`).
 * Every harness spells them differently, and getting a name wrong is silent: Claude Code
 * ignores an unknown entry in `tools:` rather than erroring, so an agent quietly runs with
 * the wrong capability set. Keep these tables authoritative.
 */

/** Universal name -> Claude Code tool name(s). */
export const CLAUDE_TOOL_MAP = {
  read: ['Read'],
  file_reader: ['Read'],
  grep: ['Grep'],
  grep_search: ['Grep'],
  glob: ['Glob'],
  find_files: ['Glob'],
  edit: ['Edit'],
  patch: ['Edit'],
  file_writer: ['Write'],
  write: ['Write'],
  bash: ['Bash'],
  terminal: ['Bash'],
  task: ['Task'],
  call_subagent: ['Task'],
  todowrite: ['TodoWrite'],
  question: ['AskUserQuestion'],
  webfetch: ['WebFetch'],
  browser_page: ['WebFetch'],
  websearch: ['WebSearch'],
  web_search: ['WebSearch'],
  skill: ['Skill'],
  notebook: ['NotebookEdit']
};

/** Universal name -> OpenCode tool name. OpenCode's vocabulary is already lowercase. */
export const OPENCODE_TOOL_MAP = {
  read: 'read',
  file_reader: 'read',
  grep: 'grep',
  grep_search: 'grep',
  glob: 'glob',
  find_files: 'glob',
  edit: 'edit',
  patch: 'patch',
  file_writer: 'write',
  write: 'write',
  bash: 'bash',
  terminal: 'bash',
  task: 'task',
  call_subagent: 'task',
  todowrite: 'todowrite',
  question: 'question',
  webfetch: 'webfetch',
  browser_page: 'webfetch',
  websearch: 'websearch',
  web_search: 'websearch',
  skill: 'skill'
};

/**
 * Anything in an agent's `tools` list that is not a known builtin is treated as the name
 * of an MCP server (e.g. `cds-mcp`, `linear`, `sentry`). This is how an agent declares
 * "I need this server" at the agent level rather than burying it in a skill file.
 */
export function isMcpServerName(tool) {
  return !CLAUDE_TOOL_MAP[tool] && !OPENCODE_TOOL_MAP[tool];
}

/** Collect the distinct MCP servers referenced across all agents, with their consumers. */
export function collectMcpServers(nodes, parseAgentYaml) {
  const servers = new Map();
  for (const node of nodes) {
    const { frontmatter } = parseAgentYaml(node.content || '');
    const tools = Array.isArray(frontmatter.tools) ? frontmatter.tools : [];
    const baseName = (node.filename || node.title || 'agent').replace(/\.md$/, '');
    for (const tool of tools) {
      if (!isMcpServerName(tool)) continue;
      if (!servers.has(tool)) servers.set(tool, []);
      servers.get(tool).push(baseName);
    }
  }
  return servers;
}

/**
 * Build MCP server stanzas for the target's config file.
 *
 * We deliberately emit a placeholder command rather than guessing a package name — a
 * wrong `npx -y <guess>` fails at runtime in a confusing way, whereas an obvious
 * placeholder tells the user exactly what to fill in. Servers the user has already
 * configured are preserved by the caller, not overwritten.
 */
export function buildMcpPlaceholders(servers, shape = 'claude') {
  const out = {};
  for (const [name] of servers) {
    out[name] = shape === 'opencode'
      ? { type: 'local', command: ['npx', '-y', `<${name}-package>`], enabled: true }
      : { command: 'npx', args: ['-y', `<${name}-package>`] };
  }
  return out;
}

/** Translate a universal tools array into a Claude Code `tools:` comma-separated string. */
export function toClaudeTools(tools = []) {
  const out = [];
  for (const tool of tools) {
    if (CLAUDE_TOOL_MAP[tool]) {
      for (const mapped of CLAUDE_TOOL_MAP[tool]) {
        if (!out.includes(mapped)) out.push(mapped);
      }
    } else {
      // MCP server: Claude Code namespaces its tools as mcp__<server>__<tool>. Without
      // knowing the server's tool list we grant the whole server, which is what
      // declaring it at agent level is meant to express.
      out.push(`mcp__${tool}__*`);
    }
  }
  return out;
}
