/**
 * Edge Semantics — the single source of truth for how an edge is classified
 * (pass / fail / default) and how its label is worded.
 *
 * Lives under public/js/ because the browser needs it, but it is dependency-free
 * ESM with no DOM access, so the Node side (src/mcpServer.js, src/validator.js,
 * exporters) imports the very same file. Do not fork this logic — a renderer that
 * classifies differently from the MCP writer is exactly how edges end up grey on
 * the canvas while claiming to be a pass/fail branch.
 */

// Recognised vocabulary. Kept deliberately wide: agents writing edges through MCP
// phrase conditions in whatever words the pipeline uses ("APPROVED", "STATUS: REJECTED",
// "needs-changes"), and every one of those must still light up green or red.
const PASS_WORDS = [
  'pass', 'passed', 'passes', 'passing',
  'accept', 'accepted', 'approve', 'approved', 'approval',
  'ok', 'okay', 'success', 'succeed', 'succeeded',
  'yes', 'true', 'green', 'valid', 'satisfied',
  'continue', 'proceed', 'next', 'complete', 'completed', 'done'
];

const FAIL_WORDS = [
  'fail', 'failed', 'fails', 'failing', 'failure',
  'reject', 'rejected', 'rejects', 'rejection',
  'deny', 'denied', 'decline', 'declined',
  'error', 'invalid', 'blocked', 'no', 'false', 'red',
  'retry', 'loopback', 'feedback', 'refine',
  'changes', 'issue', 'issues', 'violation', 'violations'
];

// `next`/`continue`/`done` mean "carry on", not "a gate said yes". They keep an edge
// out of the fail bucket but must not paint it green, or every sequential step in a
// pipeline renders as a passed gate.
const NEUTRAL_WORDS = new Set(['next', 'continue', 'proceed', 'complete', 'completed', 'done', 'step', 'start']);

const PASS_SET = new Set(PASS_WORDS);
const FAIL_SET = new Set(FAIL_WORDS);

/**
 * Legacy and alias `edge_type` values.
 *
 * Two families end up in this column in the wild. Some are verdicts under another name
 * (`feedback_loop`, `reject`) and map straight onto a colour. The rest describe the
 * *shape* of the hop — `sequential`, `parallel`, `join` — which is real information but
 * says nothing about pass/fail. Those map to 'default' so classification falls through to
 * the condition/label, where the actual verdict lives. Mapping them to a colour directly
 * would paint every fan-out green regardless of what the gate decided.
 */
const EDGE_TYPE_ALIASES = {
  // Verdict synonyms
  feedback_loop: 'fail',
  loopback: 'fail',
  reject: 'fail',
  retry: 'fail',
  accept: 'pass',
  approved: 'pass',
  // Flow shapes — defer to the condition/label for the verdict
  conditional: 'default',
  sequential: 'default',
  parallel: 'default',
  join: 'default',
  fanout: 'default',
  'fan-out': 'default'
};

export const EDGE_TYPES = ['pass', 'fail', 'default'];
export const EDGE_CONDITIONS = ['pass', 'fail', 'next'];

/**
 * True if `edge_type` holds vocabulary this module understands — either a canonical
 * tone or a known alias/flow shape. Lint uses this to tell a deliberate `parallel`
 * apart from an empty field or a typo, and only complain about the latter.
 */
export function isKnownEdgeType(value) {
  const raw = String(value ?? '').toLowerCase().trim();
  return EDGE_TYPES.includes(raw) || Object.prototype.hasOwnProperty.call(EDGE_TYPE_ALIASES, raw);
}

/**
 * Find the first pass/fail signal in a free-text string.
 * Order matters: "APPROVED — retry budget untouched" is a pass, and "REJECTED (retry)"
 * is a fail. Scanning left to right and stopping at the first hit gets both right,
 * where a naive "contains any fail word" check would call them both failures.
 */
function scanTone(text) {
  if (!text) return null;
  // Split on underscores as well as spaces: pipelines write SCREAMING_SNAKE statuses
  // like "CODING_ISSUE" or "NEEDS_CHANGES", and the verdict word is the second half.
  const tokens = String(text).toLowerCase().match(/[a-z]+/g) || [];
  for (const token of tokens) {
    if (FAIL_SET.has(token)) return 'fail';
    if (PASS_SET.has(token)) return NEUTRAL_WORDS.has(token) ? 'default' : 'pass';
  }
  return null;
}

/**
 * Classify an edge into the tone that drives its colour: 'pass' (green),
 * 'fail' (red) or 'default' (grey).
 *
 * Explicit `edge_type` wins over inferred `condition`, which wins over the label.
 * Reading the label last is what rescues the common MCP mistake of writing a
 * descriptive label but leaving condition and edgeType unset.
 */
export function classifyEdge(edge = {}) {
  const rawType = String(edge.edge_type ?? edge.edgeType ?? '').toLowerCase().trim();
  const resolvedType = EDGE_TYPE_ALIASES[rawType] || rawType;
  if (EDGE_TYPES.includes(resolvedType) && resolvedType !== 'default') return resolvedType;

  const fromCondition = scanTone(edge.condition);
  if (fromCondition && fromCondition !== 'default') return fromCondition;

  const fromLabel = scanTone(edge.label);
  if (fromLabel && fromLabel !== 'default') return fromLabel;

  return 'default';
}

/**
 * Canonicalise whatever an agent supplied into the stored `condition` / `edge_type`
 * pair, so the DB never holds a branch the renderer cannot colour.
 */
export function normalizeEdge(edge = {}) {
  const tone = classifyEdge(edge);
  const rawCondition = String(edge.condition ?? '').trim();

  let condition = rawCondition;
  if (!condition) {
    condition = tone === 'default' ? 'next' : tone;
  } else if (tone !== 'default' && !EDGE_CONDITIONS.includes(rawCondition.toLowerCase())) {
    // Preserve the agent's own wording — it is meaningful documentation
    // ("STATUS: REJECTED @ PHASE PLAN") — but the tone is now pinned separately.
    condition = rawCondition;
  }

  return { condition, edge_type: tone, tone };
}

/**
 * Build the pill text shown on the edge.
 *
 * Always names both endpoints. Agents routinely create edges with no label at all,
 * which used to render as a bare "NEXT" pill — unreadable the moment two edges
 * cross. The verdict prefix (PASS/REJECT) is added by `decorateLabel`.
 */
export function deriveEdgeLabel(sourceName, targetName, tone = 'default', maxRetries) {
  const src = stripExt(sourceName) || 'source';
  const tgt = stripExt(targetName) || 'target';
  const arrow = `${src} → ${tgt}`;
  if (tone === 'pass') return `PASS: ${arrow}`;
  if (tone === 'fail') return `REJECT: ${arrow}${maxRetries ? ` (max ${maxRetries})` : ''}`;
  return arrow;
}

/**
 * Ensure an existing label carries its verdict prefix, without double-prefixing
 * one the author already wrote.
 */
export function decorateLabel(label, tone, maxRetries) {
  const text = String(label || '').trim();
  if (!text) return '';
  const upper = text.toUpperCase();
  if (tone === 'pass' && !/^(PASS|APPROVED|ACCEPT|START)/.test(upper)) return `PASS: ${text}`;
  if (tone === 'fail' && !/^(REJECT|FAIL|RETRY|DENIED)/.test(upper)) {
    return `REJECT: ${text}${maxRetries ? ` (max ${maxRetries})` : ''}`;
  }
  return text;
}

function stripExt(name) {
  return String(name || '').replace(/\.md$/i, '').trim();
}
