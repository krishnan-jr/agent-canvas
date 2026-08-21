/**
 * Model vocabulary translation between the universal agent schema and each target harness.
 *
 * There is no model string that is valid everywhere. Claude Code wants a bare alias
 * (`sonnet`) or a full Anthropic id; OpenCode wants `provider/model` resolved against its
 * registry; Codex wants an OpenAI id. Writing a literal into the universal `model:` field
 * therefore breaks every harness except the one it was written for.
 *
 * So the universal layer stores an intent — a capability tier — and each exporter spells it
 * in its own dialect, exactly like `toolMapping.js` does for tool names.
 *
 * The default is `inherit`, which emits no `model:` field at all. Every harness then falls
 * back to whatever model the user has configured, which is the only behaviour that is
 * guaranteed correct on a machine we know nothing about. Tiers are opt-in.
 */

/** Tier -> per-target model identifier. `null` means "emit no model field". */
export const MODEL_TIERS = {
  inherit: { claude: null, opencode: null, codex: null },
  fast: {
    claude: 'haiku',
    opencode: 'anthropic/claude-haiku-4-5',
    codex: 'gpt-4o-mini'
  },
  balanced: {
    claude: 'sonnet',
    opencode: 'anthropic/claude-sonnet-4-5',
    codex: 'gpt-4o'
  },
  strong: {
    claude: 'opus',
    opencode: 'anthropic/claude-opus-4-1',
    codex: 'o3'
  }
};

export const MODEL_TIER_NAMES = Object.keys(MODEL_TIERS);

/** Values that mean "say nothing and let the harness decide". */
const INHERIT_ALIASES = new Set(['', 'inherit', 'default', 'auto']);

/**
 * True if `value` still contains an unsubstituted template token such as `{{MODEL_CODER}}`.
 * These are the single worst thing to ship: no harness errors on an unknown model string
 * at parse time, so the agent either silently runs on a fallback model or dies at first
 * invocation, far from the file that caused it.
 */
export function isUnresolvedModel(value) {
  return /\{\{.*?\}\}|\$\{.*?\}|<[a-z-]+>/i.test(String(value ?? ''));
}

/**
 * Resolve an agent's universal `model` value for one target.
 *
 * @param {string|undefined} value  Universal `model:` value — a tier, or a literal model id.
 * @param {'claude'|'opencode'|'codex'} target
 * @returns {string|null} The model string to emit, or null to omit the field entirely.
 */
export function resolveModel(value, target) {
  const raw = String(value ?? '').trim();

  // An unresolved placeholder is not a model. Treat it as unset rather than propagating a
  // string that will fail at runtime — the validator surfaces it as an error separately.
  if (isUnresolvedModel(raw)) return null;

  const key = raw.toLowerCase();
  if (INHERIT_ALIASES.has(key)) return null;

  const tier = MODEL_TIERS[key];
  if (tier) return tier[target] ?? null;

  // Not a tier: the author asked for a specific model by id. Pass it through untouched —
  // pinning an exact model is legitimate, it just stops being portable across harnesses.
  return raw;
}
