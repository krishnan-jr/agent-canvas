/**
 * Edge Routing — how a connection gets from one node to another.
 *
 * The canvas used to draw every edge as a bottom-to-top bezier with a fixed control-point
 * offset. That is fine for a straight pipeline and awful for anything with feedback loops:
 * an edge running *upward* still left the source's bottom port and entered the target's
 * top port, so it swept a huge S-curve back across the whole graph. Multiple edges between
 * the same pair drew on top of each other, and nothing avoided the node boxes.
 *
 * This module fixes that in three independent pieces, all of which apply to every mode:
 *
 *   1. `pickHandles` chooses ports from the actual geometry, so an upward edge exits the
 *      top and a leftward edge exits the left.
 *   2. `buildPath` supports three shapes — curved, orthogonal, straight.
 *   3. A `spread` offset lets callers fan apart edges that share the same node pair.
 *
 * Dependency-free and DOM-free so it can be unit-tested directly under Node.
 */

export const ROUTING_MODES = [
  { id: 'curved', label: 'Curved', hint: 'Flowing bezier curves' },
  { id: 'orthogonal', label: 'Structured', hint: 'Right-angle lines with rounded corners' },
  { id: 'straight', label: 'Straight', hint: 'Direct point-to-point lines' }
];

export const DEFAULT_ROUTING_MODE = 'orthogonal';

const HANDLES = ['top', 'bottom', 'left', 'right'];

export function isRoutingMode(id) {
  return ROUTING_MODES.some(m => m.id === id);
}

export function handleNormal(handle) {
  switch (handle) {
    case 'top': return { x: 0, y: -1 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
    default: return { x: 0, y: 1 };
  }
}

/**
 * Choose which side of each node an edge should attach to, from the boxes' relative
 * positions.
 *
 * The rule is "leave by the face that already points at the other node". When the boxes
 * overlap on an axis the gap on that axis is meaningless, so the other axis decides —
 * this is what stops a feedback loop from being routed as if it were a forward step.
 *
 * `srcBox`/`tgtBox` are `{x, y, width, height}` in world coordinates.
 */
export function pickHandles(srcBox, tgtBox) {
  const sMidX = srcBox.x + srcBox.width / 2;
  const sMidY = srcBox.y + srcBox.height / 2;
  const tMidX = tgtBox.x + tgtBox.width / 2;
  const tMidY = tgtBox.y + tgtBox.height / 2;

  const dx = tMidX - sMidX;
  const dy = tMidY - sMidY;

  // Clearance between the boxes on each axis. Negative means they overlap there.
  const gapX = Math.max(srcBox.x - (tgtBox.x + tgtBox.width), tgtBox.x - (srcBox.x + srcBox.width));
  const gapY = Math.max(srcBox.y - (tgtBox.y + tgtBox.height), tgtBox.y - (srcBox.y + srcBox.height));

  let horizontal;
  if (gapX >= 0 && gapY < 0) horizontal = true;        // only separated left/right
  else if (gapY >= 0 && gapX < 0) horizontal = false;  // only separated top/bottom
  else horizontal = Math.abs(dx) > Math.abs(dy);       // both or neither: follow the longer axis

  if (horizontal) {
    return dx >= 0
      ? { source: 'right', target: 'left' }
      : { source: 'left', target: 'right' };
  }
  return dy >= 0
    ? { source: 'bottom', target: 'top' }
    : { source: 'top', target: 'bottom' };
}

/**
 * Anchor point for a handle, optionally slid along the node's edge.
 *
 * `spread` slides the anchor sideways so N edges sharing a node pair leave from N
 * distinct points instead of stacking into one line. It is clamped to stay on the face.
 */
export function portPosition(box, handle, spread = 0) {
  const { x, y } = box;
  const w = box.width || 300;
  const h = box.height || 360;

  // Keep the anchor off the rounded corners.
  const limitX = Math.max(0, w / 2 - 26);
  const limitY = Math.max(0, h / 2 - 26);
  const sx = Math.max(-limitX, Math.min(limitX, spread));
  const sy = Math.max(-limitY, Math.min(limitY, spread));

  switch (handle) {
    case 'top': return { x: x + w / 2 + sx, y: y + 24 };
    case 'bottom': return { x: x + w / 2 + sx, y: y + h };
    case 'left': return { x, y: y + h / 2 + 12 + sy };
    case 'right': return { x: x + w, y: y + h / 2 + 12 + sy };
    default: return { x: x + w / 2 + sx, y: y + h };
  }
}

function bezierPath(p1, h1, p2, h2, spread) {
  const n1 = handleNormal(h1);
  const n2 = handleNormal(h2);
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  // Fanned edges get progressively deeper curves, which separates them along their
  // whole length rather than only at the endpoints.
  const curvature = Math.max(50, Math.min(250, dist * 0.45)) + Math.abs(spread) * 0.6;

  const cp1 = { x: p1.x + n1.x * curvature, y: p1.y + n1.y * curvature };
  const cp2 = { x: p2.x + n2.x * curvature, y: p2.y + n2.y * curvature };

  return {
    d: `M ${r(p1.x)} ${r(p1.y)} C ${r(cp1.x)} ${r(cp1.y)}, ${r(cp2.x)} ${r(cp2.y)}, ${r(p2.x)} ${r(p2.y)}`,
    // Cubic bezier at t = 0.5.
    mid: { x: (p1.x + 3 * cp1.x + 3 * cp2.x + p2.x) / 8, y: (p1.y + 3 * cp1.y + 3 * cp2.y + p2.y) / 8 }
  };
}

function straightPath(p1, h1, p2, h2, spread) {
  // Even a straight line needs to leave the port along its normal, or the arrowhead
  // lands at an angle across the node border. A short stub fixes that.
  const n1 = handleNormal(h1);
  const n2 = handleNormal(h2);
  const stub = 18;
  const a = { x: p1.x + n1.x * stub, y: p1.y + n1.y * stub };
  const b = { x: p2.x + n2.x * stub, y: p2.y + n2.y * stub };

  // Push the middle sideways so fanned edges stay distinguishable.
  const perp = { x: -(b.y - a.y), y: b.x - a.x };
  const len = Math.hypot(perp.x, perp.y) || 1;
  const midX = (a.x + b.x) / 2 + (perp.x / len) * spread;
  const midY = (a.y + b.y) / 2 + (perp.y / len) * spread;

  const d = spread === 0
    ? `M ${r(p1.x)} ${r(p1.y)} L ${r(a.x)} ${r(a.y)} L ${r(b.x)} ${r(b.y)} L ${r(p2.x)} ${r(p2.y)}`
    : `M ${r(p1.x)} ${r(p1.y)} L ${r(a.x)} ${r(a.y)} Q ${r(midX)} ${r(midY)}, ${r(b.x)} ${r(b.y)} L ${r(p2.x)} ${r(p2.y)}`;

  return { d, mid: { x: midX, y: midY } };
}

/**
 * Manhattan route: leave along the port normal, travel on one axis, turn once or twice,
 * arrive along the target normal. Corners are rounded with quadratic arcs.
 */
function orthogonalPath(p1, h1, p2, h2, spread) {
  const n1 = handleNormal(h1);
  const n2 = handleNormal(h2);
  // The stub is what separates fanned edges here: each gets a different standoff, so
  // their shared trunk sits at a different offset and the lines run parallel, not on top.
  const stub = 28 + Math.abs(spread) * 0.9;

  const a = { x: p1.x + n1.x * stub, y: p1.y + n1.y * stub };
  const b = { x: p2.x + n2.x * stub, y: p2.y + n2.y * stub };

  const pts = [p1, a];

  const srcVertical = n1.y !== 0;
  const tgtVertical = n2.y !== 0;

  if (srcVertical && tgtVertical) {
    // Both ports face up/down: run to a shared horizontal trunk, slide across, run in.
    const trunkY = (a.y + b.y) / 2 + spread;
    pts.push({ x: a.x, y: trunkY }, { x: b.x, y: trunkY });
  } else if (!srcVertical && !tgtVertical) {
    // Both face left/right: shared vertical trunk.
    const trunkX = (a.x + b.x) / 2 + spread;
    pts.push({ x: trunkX, y: a.y }, { x: trunkX, y: b.y });
  } else if (srcVertical) {
    // Leave vertically, arrive horizontally — a single corner does it.
    pts.push({ x: a.x, y: b.y });
  } else {
    pts.push({ x: b.x, y: a.y });
  }

  pts.push(b, p2);

  const clean = simplify(pts);
  return { d: roundedPolyline(clean, 14), mid: polylineMidpoint(clean) };
}

/**
 * Drop duplicate and collinear points.
 *
 * Both matter. Duplicates create zero-length corners; collinear runs create *rounded
 * corners on a straight line*, which wastes path commands and — where the rounding
 * radius exceeds the segment — visibly bows a line that should be dead straight.
 */
function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(p.x - last.x) <= 0.5 && Math.abs(p.y - last.y) <= 0.5) continue;
    out.push(p);
  }

  const result = [];
  for (let i = 0; i < out.length; i++) {
    const prev = result[result.length - 1];
    const next = out[i + 1];
    if (!prev || !next) { result.push(out[i]); continue; }
    // Cross product of the two segment vectors; ~0 means the middle point adds nothing.
    const cross = (out[i].x - prev.x) * (next.y - out[i].y) - (out[i].y - prev.y) * (next.x - out[i].x);
    if (Math.abs(cross) > 0.5) result.push(out[i]);
  }
  return result;
}

/**
 * Render a polyline with rounded corners. Each corner is cut back by up to `radius`
 * along both adjoining segments and bridged with a quadratic curve through the corner.
 * The cut is capped at half the shorter segment so short segments cannot invert.
 */
function roundedPolyline(points, radius) {
  if (points.length < 2) return '';
  if (points.length === 2) return `M ${r(points[0].x)} ${r(points[0].y)} L ${r(points[1].x)} ${r(points[1].y)}`;

  let d = `M ${r(points[0].x)} ${r(points[0].y)}`;
  let at = points[0];

  // Skip a line command when the pen is already there. Back-to-back corners on a short
  // segment consume it entirely between them, which would otherwise emit `L x y` from
  // (x,y) to (x,y).
  const lineTo = (p) => {
    if (Math.abs(p.x - at.x) > 0.05 || Math.abs(p.y - at.y) > 0.05) d += ` L ${r(p.x)} ${r(p.y)}`;
    at = p;
  };

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];

    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const cut = Math.min(radius, inLen / 2, outLen / 2);

    if (cut < 1) { lineTo(cur); continue; }

    const start = lerp(cur, prev, cut / inLen);
    const end = lerp(cur, next, cut / outLen);

    lineTo(start);
    d += ` Q ${r(cur.x)} ${r(cur.y)}, ${r(end.x)} ${r(end.y)}`;
    at = end;
  }

  lineTo(points[points.length - 1]);
  return d;
}

/** Point at `t` of the way from `from` toward `to`. */
function lerp(from, to, t) {
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/** Midpoint by arc length, so the label sits halfway along the route, not halfway between endpoints. */
function polylineMidpoint(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);

  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (walked + seg >= total / 2) {
      return lerp(points[i - 1], points[i], seg === 0 ? 0 : (total / 2 - walked) / seg);
    }
    walked += seg;
  }
  return points[points.length - 1];
}

function r(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Build the SVG path for one edge.
 *
 * @param {{x,y}} p1     source anchor
 * @param {string} h1    source handle
 * @param {{x,y}} p2     target anchor
 * @param {string} h2    target handle
 * @param {string} mode  one of ROUTING_MODES
 * @param {number} spread perpendicular offset for fanning parallel edges
 * @returns {{d: string, mid: {x, y}}}
 */
export function buildPath(p1, h1, p2, h2, mode = DEFAULT_ROUTING_MODE, spread = 0) {
  switch (mode) {
    case 'orthogonal': return orthogonalPath(p1, h1, p2, h2, spread);
    case 'straight': return straightPath(p1, h1, p2, h2, spread);
    default: return bezierPath(p1, h1, p2, h2, spread);
  }
}

/**
 * Spread offsets for `count` edges sharing a node pair: 0 for a lone edge, then
 * symmetric pairs (-s, +s, -2s, +2s, ...) so the bundle stays centred on the direct route.
 */
export function spreadOffsets(count, step = 26) {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
}

export { HANDLES };
