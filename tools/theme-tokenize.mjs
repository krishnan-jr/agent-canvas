/**
 * theme-tokenize.mjs — one-shot migration that converts the hard-coded dark
 * palette in public/style.css into a semantic token layer with a generated
 * light theme.
 *
 * Every colour literal is classified by the property it appears in (surface /
 * border / text / shadow) and by hue family, then collapsed onto a token. The
 * dark value of each token is the original literal, so dark mode is unchanged.
 * The light value is derived so the perceptual hierarchy carries over:
 *
 *   - surfaces  -> inverted lightness ramp (deep panels become near-white)
 *   - text      -> solved so contrast against the light canvas matches the
 *                  contrast the original had against the dark canvas
 *   - borders   -> same contrast-preservation, capped so accents stay usable
 *   - shadows   -> slate-tinted and softened via --shadow-k
 *
 * Run:  node tools/theme-tokenize.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CSS_PATH = path.join(ROOT, 'public', 'style.css');

/* ---------------------------------------------------------------- colour ---- */

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  const p = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${p(r)}${p(g)}${p(b)}`;
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  let s = 0;
  let h = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s * 100, l * 100];
}

function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgb;
  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return rgb.map((v) => (v + m) * 255);
}

const hslToHex = (hsl) => rgbToHex(hslToRgb(hsl));

function luminance([r, g, b]) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Lowest-L colour of hue/sat whose contrast against `bg` reaches `target`. */
function solveLightnessForContrast(h, s, bg, target) {
  // Walk down from white and stop at the first (i.e. lightest) lightness that
  // clears the target, so colours stay as vivid as the ratio allows.
  for (let l = 100; l >= 0; l -= 0.5) {
    if (contrast(hslToRgb([h, s, l]), bg) >= target) return l;
  }
  return 0;
}

/** Piecewise-linear interpolation over [x, y] anchor pairs. */
function curve(anchors, x) {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

/* ------------------------------------------------------------- constants ---- */

const DARK_CANVAS = hexToRgb('#141418');
const LIGHT_CANVAS = hexToRgb('#f7f7fa');
const WHITE = [255, 255, 255];

/**
 * Hand-tuned light values, applied after derivation.
 *
 * The solver treats every literal independently, so it cannot see that two
 * tokens are a base/hover pair — it lands both on the same contrast ratio and
 * the hover stops reading as a state change. Pin those by hand.
 */
const LIGHT_OVERRIDES = {
  '--sf-emerald-30': '#04855d', // .btn-accent
  '--sf-emerald-24': '#036e4d', // .btn-accent:hover — a visible step darker
};

/** Dark lightness -> light lightness for background surfaces (inverted ramp). */
const SURFACE_CURVE = [
  [0, 100], [4, 100], [6, 99], [8, 98], [10, 97], [12, 96], [14, 95],
  [16, 93.5], [18, 92], [20, 91], [24, 89], [28, 87], [32, 85], [35, 83],
  [46, 76], [55, 66], [65, 55], [75, 42], [84, 33], [90, 27], [96, 20], [100, 14],
];

const HUE_FAMILIES = [
  [345, 361, 'red'], [0, 15, 'red'], [15, 34, 'orange'], [34, 50, 'amber'],
  [50, 70, 'yellow'], [70, 130, 'lime'], [130, 152, 'green'], [152, 175, 'emerald'],
  [175, 205, 'sky'], [205, 230, 'blue'], [230, 250, 'indigo'], [250, 285, 'violet'],
  [285, 320, 'fuchsia'], [320, 345, 'rose'],
];

function familyOf(h, s, l) {
  // Untinted / faintly tinted greys. The dark palette tints its greys toward
  // violet (hue 240) at up to ~24% saturation, so the threshold has to be
  // generous or every panel background reads as "indigo".
  if (s <= 24) return h >= 195 && h <= 235 ? 'slate' : 'zinc';
  // The Tailwind slate ramp reads as a neutral, not as a blue accent.
  if (s <= 45 && h >= 205 && h <= 230) return 'slate';
  for (const [lo, hi, name] of HUE_FAMILIES) if (h >= lo && h < hi) return name;
  return 'zinc';
}

const isNeutral = (fam) => fam === 'zinc' || fam === 'slate';

/** Light-mode hue/sat for a neutral, so greys keep their family tint. */
function neutralTint(fam, s) {
  return fam === 'slate' ? [215, clamp(s, 8, 30)] : [240, clamp(s, 5, 16)];
}

/* --------------------------------------------------------------- mapping ---- */

const ROLE_SHADOW = 'shadow';
const ROLE_BORDER = 'border';
const ROLE_TEXT = 'text';
const ROLE_SURFACE = 'surface';

function roleForProperty(prop) {
  const p = prop.toLowerCase();
  if (p.includes('shadow') || p === 'filter' || p === 'backdrop-filter') return ROLE_SHADOW;
  if (p.includes('border') || p.includes('outline') || p === 'column-rule'
    || p === 'stroke') return ROLE_BORDER;
  if (p === 'color' || p === 'fill' || p === 'caret-color'
    || p === 'text-decoration-color' || p === '-webkit-text-fill-color') return ROLE_TEXT;
  return ROLE_SURFACE;
}

/**
 * `fill` paints both icon glyphs and SVG shape backgrounds. In this palette a
 * dark fill is always a shape behind something, a light fill is always the
 * mark itself — so let the colour decide.
 */
function refineRole(prop, hex, role) {
  if (prop.toLowerCase() !== 'fill') return role;
  const [, , l] = rgbToHsl(hexToRgb(hex));
  return l < 40 ? ROLE_SURFACE : ROLE_TEXT;
}

const ROLE_ABBR = { surface: 'sf', border: 'bd', text: 'tx', shadow: 'gl' };

/**
 * @param {string} hex          original literal
 * @param {string} role         surface | border | text | shadow
 * @param {object} ctx          { onAccent, accentTextIsLight }
 */
function lightValueFor(hex, role, ctx) {
  const rgb = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(rgb);
  const fam = familyOf(h, s, l);

  if (isNeutral(fam)) {
    const [lh, ls] = neutralTint(fam, s);

    if (role === ROLE_SURFACE) return hslToHex([lh, ls, curve(SURFACE_CURVE, l)]);

    if (role === ROLE_TEXT) {
      // Near-black text only ever sits on a solid accent chip.
      if (ctx.onAccent) return ctx.accentTextIsLight ? '#ffffff' : hex;
      if (l <= 16) return hex;
      // Dim-but-dark text (placeholders) has no light-mode analogue below the
      // canvas, so lift it into the muted range instead of inverting.
      if (l < 44) return hslToHex([lh, ls, 58]);
      const target = clamp(contrast(rgb, DARK_CANVAS), 1.6, 15.5);
      return hslToHex([lh, ls, solveLightnessForContrast(lh, ls, LIGHT_CANVAS, target)]);
    }

    // Borders and neutral glows.
    const target = clamp(contrast(rgb, DARK_CANVAS), 1.12, 6);
    return hslToHex([lh, ls, solveLightnessForContrast(lh, ls, LIGHT_CANVAS, target)]);
  }

  // Chromatic.
  if (role === ROLE_SURFACE) {
    if (ctx.onAccent && !ctx.accentTextIsLight) return hslToHex([h, s, clamp(l, 55, 72)]);
    // A surface that carries a white label has to stay a solid accent even when
    // it is dark enough to look like a chip tint (e.g. emerald-30 on .btn-accent),
    // so the on-accent check comes before the tint branch.
    if (ctx.onAccent) return hslToHex([h, s, solveLightnessForContrast(h, s, WHITE, 4.5)]);
    // Tinted chip backgrounds stay tints; solid accents stay solid.
    if (l <= 35) return hslToHex([h, clamp(s * 0.55, 20, 70), 92]);
    return hslToHex([h, s, solveLightnessForContrast(h, s, WHITE, 4)]);
  }

  if (role === ROLE_TEXT) {
    if (ctx.onAccent) return ctx.accentTextIsLight ? '#ffffff' : hex;
    // Pastel accents (indigo/violet text) go neon if their saturation is kept
    // while the lightness drops, so damp it a little.
    const ls = clamp(s * 0.85, 0, 76);
    const target = clamp(contrast(rgb, DARK_CANVAS), 3.2, 6);
    return hslToHex([h, ls, solveLightnessForContrast(h, ls, LIGHT_CANVAS, target)]);
  }

  if (role === ROLE_BORDER) {
    if (l <= 35) return hslToHex([h, clamp(s * 0.6, 20, 70), 84]);
    const target = clamp(contrast(rgb, DARK_CANVAS), 1.6, 4);
    return hslToHex([h, s, solveLightnessForContrast(h, s, LIGHT_CANVAS, target)]);
  }

  // Chromatic glow.
  return hslToHex([h, s, solveLightnessForContrast(h, s, LIGHT_CANVAS, 3)]);
}

function tokenNameFor(hex, role, ctx) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const fam = familyOf(h, s, l);
  if (ctx.onAccent && role === ROLE_TEXT) {
    return ctx.accentTextIsLight ? '--on-accent' : '--on-accent-ink';
  }
  const famKey = isNeutral(fam) ? (fam === 'slate' ? 's' : 'z') : fam;
  // A solid accent that carries dark text keeps its lightness in light mode,
  // so it must not share a token with the same accent used elsewhere.
  const variant = ctx.onAccent && !ctx.accentTextIsLight && role === ROLE_SURFACE ? '-on-ink' : '';
  return `--${ROLE_ABBR[role]}-${famKey}-${Math.round(l)}${variant}`;
}

/* ------------------------------------------------------- rgba() channels ---- */

/** Shared channel tokens for alpha-composited colours. */
const CHANNEL_LIGHT = {
  // family -> light-mode core colour used as the rgba() base
  sky: '#0284c7',
  blue: '#2563eb',
  indigo: '#4f52d8',
  violet: '#7c3aed',
  fuchsia: '#a21caf',
  emerald: '#059669',
  green: '#059669',
  amber: '#b45309',
  orange: '#c2410c',
  yellow: '#a16207',
  red: '#dc2626',
  rose: '#e11d48',
  lime: '#4d7c0f',
  slate: '#475569',
  zinc: '#52525b',
};

function channelToken(rgb, role) {
  const key = rgb.join(',');
  if (key === '255,255,255') return { name: '--rgb-tint', dark: '255, 255, 255', light: '15, 23, 42' };
  if (key === '0,0,0') {
    return role === ROLE_SHADOW
      ? { name: '--rgb-shadow', dark: '0, 0, 0', light: '15, 23, 42' }
      : { name: '--rgb-scrim', dark: '0, 0, 0', light: '30, 41, 59' };
  }
  const [h, s, l] = rgbToHsl(rgb);
  const fam = familyOf(h, s, l);
  if (isNeutral(fam) && l < 40) {
    // Translucent panel backgrounds — follow the surface ramp.
    const lightHex = lightValueFor(rgbToHex(rgb), ROLE_SURFACE, {});
    const famKey = fam === 'slate' ? 's' : 'z';
    return {
      name: `--rgb-sf-${famKey}-${Math.round(l)}`,
      dark: rgb.join(', '),
      light: hexToRgb(lightHex).join(', '),
    };
  }
  const lightHex = CHANNEL_LIGHT[fam] || rgbToHex(rgb);
  return { name: `--rgb-${fam}`, dark: rgb.join(', '), light: hexToRgb(lightHex).join(', ') };
}

/* ----------------------------------------------------------------- parse ---- */

const src = fs.readFileSync(CSS_PATH, 'utf8');

/** Registry: token name -> { dark, light } */
const tokens = new Map();
const collapses = [];

/** True when two colours differ by at most `d` per channel (imperceptible). */
function nearlyEqual(a, b, d = 4) {
  if (a === b) return true;
  const isHex = a.startsWith('#');
  const pa = isHex ? hexToRgb(a) : a.split(',').map(Number);
  const pb = isHex ? hexToRgb(b) : b.split(',').map(Number);
  return pa.every((v, i) => Math.abs(v - pb[i]) <= d);
}

/**
 * Reuse a token only when both its dark and light values are visually
 * identical to the incoming pair; otherwise mint a suffixed sibling. This
 * guarantees the dark theme renders exactly as it did before the migration.
 */
function register(name, dark, light) {
  let candidate = name;
  let i = 0;
  while (tokens.has(candidate)) {
    const e = tokens.get(candidate);
    if (nearlyEqual(e.dark, dark) && nearlyEqual(e.light, light)) {
      if (e.dark !== dark) collapses.push(`${candidate}: ${e.dark} <- ${dark}`);
      return candidate;
    }
    i += 1;
    candidate = `${name}-${String.fromCharCode(97 + i)}`;
  }
  tokens.set(candidate, { dark, light });
  return candidate;
}

const HEX_RE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
const RGBA_RE = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/g;

/**
 * Split the stylesheet into blocks so a declaration can see its siblings
 * (needed to tell "white text on an accent button" from "white body text").
 */
function blockRanges(text) {
  const ranges = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      depth++;
      if (depth === 1) start = i + 1;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        ranges.push([start, i]);
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  return ranges;
}

const DECL_RE = /(^|[;{\s])(-{0,2}[a-zA-Z][a-zA-Z0-9-]*)\s*:\s*([^;{}]*)/g;

/** Does this block paint a solid accent background? */
function blockAccentContext(body) {
  let solidBg = null;
  let textLightness = null;
  let d;
  DECL_RE.lastIndex = 0;
  while ((d = DECL_RE.exec(body))) {
    const prop = d[2].toLowerCase();
    const value = d[3];
    if (prop === 'background' || prop === 'background-color') {
      const m = value.match(/#[0-9a-fA-F]{6}\b/);
      if (m) {
        const [h, s, l] = rgbToHsl(hexToRgb(m[0]));
        if (!isNeutral(familyOf(h, s, l)) && l >= 30 && l <= 78) solidBg = m[0];
      }
    } else if (prop === 'color') {
      const m = value.match(/#[0-9a-fA-F]{6}\b/);
      if (m) textLightness = rgbToHsl(hexToRgb(m[0]))[2];
    }
  }
  if (!solidBg) return { onAccent: false, accentTextIsLight: false };
  return {
    onAccent: true,
    accentTextIsLight: textLightness === null ? true : textLightness >= 60,
  };
}

/* --------------------------------------------------------------- rewrite ---- */

// The original :root block is regenerated wholesale; skip it during rewriting.
const rootStart = src.indexOf(':root {');
const rootEnd = src.indexOf('}', rootStart);
const preamble = src.slice(0, rootStart);
const rootBody = src.slice(rootStart + ':root {'.length, rootEnd);
const rest = src.slice(rootEnd + 1);

let out = '';
let cursor = 0;
const ranges = blockRanges(rest);

for (const [bs, be] of ranges) {
  out += rest.slice(cursor, bs);
  const body = rest.slice(bs, be);
  out += rewriteBlock(body);
  cursor = be;
}
out += rest.slice(cursor);

function rewriteBlock(body) {
  const ctx = blockAccentContext(body);
  let result = '';
  let last = 0;
  let d;
  DECL_RE.lastIndex = 0;
  while ((d = DECL_RE.exec(body))) {
    const prop = d[2];
    const value = d[3];
    const valueStart = d.index + d[0].length - value.length;
    result += body.slice(last, valueStart);
    result += rewriteValue(prop, value, ctx);
    last = valueStart + value.length;
  }
  result += body.slice(last);
  return result;
}

function rewriteValue(prop, value, ctx) {
  if (prop.startsWith('--')) return value;
  const role = roleForProperty(prop);

  let v = value.replace(RGBA_RE, (full, r, g, b, a) => {
    const rgb = [+r, +g, +b];
    const alpha = a === undefined ? '1' : a;
    const ch = channelToken(rgb, role);
    const name = register(ch.name, ch.dark, ch.light);
    if (name === '--rgb-shadow') {
      return `rgba(var(--rgb-shadow), calc(${alpha} * var(--shadow-k)))`;
    }
    return `rgba(var(${name}), ${alpha})`;
  });

  v = v.replace(HEX_RE, (hex) => {
    const norm = hex.length === 4
      ? `#${hex.slice(1).split('').map((c) => c + c).join('')}`.toLowerCase()
      : hex.toLowerCase();
    const r = refineRole(prop, norm, role);
    const name = register(
      tokenNameFor(norm, r, ctx),
      norm,
      lightValueFor(norm, r, ctx),
    );
    return `var(${name})`;
  });

  return v;
}

/* ----------------------------------------------------------------- emit ----- */

// Non-colour custom properties from the original :root survive verbatim.
const keptRootLines = rootBody
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !/#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(line));

const groups = [
  ['Surfaces', (n) => n.startsWith('--sf-')],
  ['Borders', (n) => n.startsWith('--bd-')],
  ['Text', (n) => n.startsWith('--tx-')],
  ['Glows', (n) => n.startsWith('--gl-')],
  ['Alpha channels', (n) => n.startsWith('--rgb-')],
  ['On-accent', (n) => n.startsWith('--on-accent')],
];

function sortKey(name) {
  const m = name.match(/-(\d+)$/);
  return m ? +m[1] : 0;
}

function emitGroup(pick, which) {
  const names = [...tokens.keys()].filter(pick).sort((a, b) => {
    const fa = a.replace(/-\d+$/, '');
    const fb = b.replace(/-\d+$/, '');
    return fa === fb ? sortKey(a) - sortKey(b) : fa.localeCompare(fb);
  });
  return names
    .map((n) => {
      const value = which === 'light' && LIGHT_OVERRIDES[n]
        ? LIGHT_OVERRIDES[n]
        : tokens.get(n)[which];
      return `  ${n}: ${value};`;
    })
    .join('\n');
}

function emitAll(which) {
  return groups
    .map(([label, pick]) => {
      const body = emitGroup(pick, which);
      return body ? `  /* ${label} */\n${body}` : '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The semantic vars the stylesheet already referenced. `--text-main`,
 * `--border-color` and `--shadow-elevated` were used but never defined; they
 * are given real values here.
 */
const ALIASES = [
  ['--bg-canvas', '#141416', ROLE_SURFACE],
  ['--bg-grid-dot', '#2a2a30', ROLE_BORDER],
  ['--bg-surface', '#1e1e24', ROLE_SURFACE],
  ['--bg-surface-elevated', '#26262e', ROLE_SURFACE],
  ['--bg-card', '#1c1c22', ROLE_SURFACE],
  ['--bg-code', '#121215', ROLE_SURFACE],
  ['--border-subtle', '#2d2d35', ROLE_BORDER],
  ['--border-color', '#2d2d35', ROLE_BORDER],
  ['--border-focus', '#3b82f6', ROLE_BORDER],
  ['--border-active', '#52525e', ROLE_BORDER],
  ['--text-primary', '#f4f4f5', ROLE_TEXT],
  ['--text-main', '#f4f4f5', ROLE_TEXT],
  ['--text-secondary', '#a1a1aa', ROLE_TEXT],
  ['--text-muted', '#71717a', ROLE_TEXT],
  ['--text-link', '#818cf8', ROLE_TEXT],
  ['--accent-blue', '#3b82f6', ROLE_SURFACE],
  ['--accent-purple', '#a855f7', ROLE_SURFACE],
  ['--accent-green', '#10b981', ROLE_SURFACE],
  ['--accent-amber', '#f59e0b', ROLE_SURFACE],
  ['--accent-red', '#ef4444', ROLE_SURFACE],
];

const SHADOW_ELEVATED =
  '  --shadow-elevated: 0 16px 36px -4px rgba(var(--rgb-shadow), calc(0.75 * var(--shadow-k)));';

function emitAliases(which) {
  const lines = ALIASES.map(([name, hex, role]) => {
    const value = which === 'dark' ? hex : lightValueFor(hex, role, {});
    return `  ${name}: ${value};`;
  });
  return ['  /* Semantic aliases */', ...lines, SHADOW_ELEVATED].join('\n');
}

// Role colours consumed by JS (minimap, validator legend).
const ROLE_CORES = {
  sky: '#38bdf8', emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
  indigo: '#818cf8', violet: '#a855f7', slate: '#64748b', zinc: '#71717a',
  blue: '#3b82f6',
};

const coreDark = Object.entries(ROLE_CORES)
  .map(([k, v]) => `  --${k}-core: ${v};`).join('\n');
const coreLight = Object.entries(ROLE_CORES)
  .map(([k, v]) => {
    const [h, s] = rgbToHsl(hexToRgb(v));
    return `  --${k}-core: ${hslToHex([h, s, solveLightnessForContrast(h, s, LIGHT_CANVAS, 3.6)])};`;
  }).join('\n');

const header = `:root {
  color-scheme: dark;

${keptRootLines.map((l) => `  ${l}`).join('\n')}

  /* Shadow strength multiplier — light mode needs far softer shadows. */
  --shadow-k: 1;

  /* Accent cores (also read from JS for canvas/minimap rendering) */
${coreDark}

${emitAll('dark')}

${emitAliases('dark')}
}

:root[data-theme="light"] {
  color-scheme: light;

  --shadow-k: 0.34;

${coreLight}

${emitAll('light')}

${emitAliases('light')}
}
`;

fs.writeFileSync(CSS_PATH, preamble + header + out, 'utf8');

console.log(`tokens: ${tokens.size}`);
if (collapses.length) {
  console.log(`\ncollapsed literals (${collapses.length}):`);
  for (const c of collapses.slice(0, 400)) console.log('  ' + c);
}
