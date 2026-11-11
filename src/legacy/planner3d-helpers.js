// Pure helpers for the Planner 3D (forked from planner-3d-base). No three.js, no DOM — safe to unit test.
import { capacity } from './engine.js';
import { M2_PER_DECIMAL } from './netarea.js';
import { infrastructureDisplayWidth } from './studio3d-helpers.js';

export function outlineBounds(outlineM) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outlineM) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  const width = maxX - minX, height = maxY - minY;
  return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    width, height, radius: Math.max(width, height, 10) / 2 };
}

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Point-to-segment distance for inset check.
function distToSegment(x, y, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(x - ax, y - ay);
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq));
  const px = ax + t * dx, py = ay + t * dy;
  return Math.hypot(x - px, y - py);
}

export function distToPolygonEdge(x, y, poly) {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const d = distToSegment(x, y, ax, ay, bx, by);
    if (d < min) min = d;
  }
  return min;
}

// Edge lengths in metres for a local-metre outline ring.
export function edgeLengths(outlineM) {
  if (!Array.isArray(outlineM) || outlineM.length < 2) return [];
  return outlineM.map((a, i) => {
    const b = outlineM[(i + 1) % outlineM.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
}

export function outlinePerimeterM(outlineM) {
  return edgeLengths(outlineM).reduce((sum, len) => sum + len, 0);
}

export function longestEdgeIndex(outlineM) {
  const lengths = edgeLengths(outlineM);
  if (!lengths.length) return -1;
  let best = 0;
  for (let i = 1; i < lengths.length; i++) {
    if (lengths[i] > lengths[best]) best = i;
  }
  return best;
}

// Drain edge: the lowest edge by elevation, falling back to the longest edge.
// elevationAt is per-vertex readings, a function (x, y) -> metres, or null.
export function pickDrainEdge(outlineM, elevationAt = null) {
  const fallback = longestEdgeIndex(outlineM);
  const lengths = edgeLengths(outlineM);
  if (!outlineM || outlineM.length < 3 || fallback < 0) return { index: -1, lengthM: 0, fallback: true };
  let heights = null;
  try {
    if (typeof elevationAt === 'function') {
      heights = outlineM.map(([x, y]) => elevationAt(x, y));
    } else if (Array.isArray(elevationAt)) {
      heights = outlineM.map((_, i) => elevationAt[i]);
    }
  } catch {
    heights = null;
  }
  if (!heights || heights.some((h) => !Number.isFinite(h))) {
    return { index: fallback, lengthM: lengths[fallback], fallback: true };
  }
  let best = 0;
  let bestAvg = Infinity;
  for (let i = 0; i < outlineM.length; i++) {
    const avg = (heights[i] + heights[(i + 1) % outlineM.length]) / 2;
    if (avg < bestAvg - 1e-9) {
      bestAvg = avg;
      best = i;
    }
  }
  return { index: best, lengthM: lengths[best], fallback: false };
}

// Path centre-line: through the centroid along the long axis, clipped to the polygon.
export function pathAxisThroughCentroid(outlineM) {
  const empty = { ax: 0, ay: 0, bx: 0, by: 0, lengthM: 0, alongX: true };
  if (!Array.isArray(outlineM) || outlineM.length < 3) return empty;
  let dx = 1, dy = 0, bestArea = Infinity;
  for (let i = 0; i < outlineM.length; i++) {
    const a = outlineM[i], b = outlineM[(i + 1) % outlineM.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!len) continue;
    const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
    const u = outlineM.map(([x, y]) => x * ux + y * uy);
    const v = outlineM.map(([x, y]) => -x * uy + y * ux);
    const width = Math.max(...u) - Math.min(...u), height = Math.max(...v) - Math.min(...v);
    if (width * height < bestArea - 1e-8) {
      bestArea = width * height;
      [dx, dy] = width >= height ? [ux, uy] : [-uy, ux];
    }
  }
  // Area centroid stays independent of vertex density around the boundary.
  let cx = 0, cy = 0;
  const area = ringSignedArea(outlineM);
  if (Math.abs(area) < 1e-9) return empty;
  outlineM.forEach((a, i) => {
    const b = outlineM[(i + 1) % outlineM.length];
    const cross = a[0] * b[1] - b[0] * a[1];
    cx += (a[0] + b[0]) * cross / (6 * area);
    cy += (a[1] + b[1]) * cross / (6 * area);
  });
  const alongX = Math.abs(dx) >= Math.abs(dy);
  // Intersect the axis ray with every edge; keep the extreme inside parameters.
  const projections = outlineM.map(([x, y]) => (x - cx) * dx + (y - cy) * dy);
  const tMin = Math.min(...projections), tMax = Math.max(...projections);
  const hits = [];
  for (let i = 0; i < outlineM.length; i++) {
    const [ax, ay] = outlineM[i];
    const [bx, by] = outlineM[(i + 1) % outlineM.length];
    const ex = bx - ax, ey = by - ay;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((ax - cx) * ey - (ay - cy) * ex) / denom;
    const u = ((ax - cx) * dy - (ay - cy) * dx) / denom;
    if (u >= -1e-9 && u <= 1 + 1e-9) hits.push(t);
  }
  hits.sort((p, q) => p - q);
  // Walk the sorted crossings: inside spans sit between pairs starting inside.
  const inside = (t) => pointInPolygon(cx + dx * t, cy + dy * t, outlineM);
  let best0 = 0, best1 = 0;
  let centered = false;
  const consider = (s0, s1) => {
    const containsCenter = s0 <= 0 && s1 >= 0;
    if ((containsCenter && !centered) || (containsCenter === centered && s1 - s0 > best1 - best0)) {
      best0 = s0; best1 = s1; centered = containsCenter;
    }
  };
  let spanStart = null;
  const bounds = [tMin - 1, ...hits, tMax + 1];
  for (let i = 0; i < bounds.length - 1; i++) {
    const mid = (bounds[i] + bounds[i + 1]) / 2;
    if (inside(mid)) {
      if (spanStart === null) spanStart = bounds[i];
    } else if (spanStart !== null) {
      const s0 = Math.max(spanStart, tMin), s1 = Math.min(bounds[i], tMax);
      consider(s0, s1);
      spanStart = null;
    }
  }
  if (spanStart !== null) {
    const s0 = Math.max(spanStart, tMin), s1 = tMax;
    consider(s0, s1);
  }
  if (!(best1 > best0)) return empty;
  return { ax: cx + dx * best0, ay: cy + dy * best0, bx: cx + dx * best1, by: cy + dy * best1,
    lengthM: best1 - best0, alongX };
}

// Clip a corner patch to the entered area, including on rotated and concave fields.
export function otherPatchRect(outlineM, sideM) {
  if (!Array.isArray(outlineM) || outlineM.length < 3 || !(sideM > 0)) return null;
  const b = outlineBounds(outlineM);
  const targetArea = Math.min(sideM ** 2, Math.abs(ringSignedArea(outlineM)));
  const [cornerX, cornerY] = outlineM.reduce((corner, p) =>
    Math.hypot(p[0] - b.cx, p[1] - b.cy) > Math.hypot(corner[0] - b.cx, corner[1] - b.cy) ? p : corner);
  const dx = cornerX - b.cx, dy = cornerY - b.cy;
  const projection = ([x, y]) => x * dx + y * dy;
  const dots = outlineM.map(projection);
  let low = Math.min(...dots), high = Math.max(...dots);
  let polygon = outlineM;
  for (let i = 0; i < 48; i++) {
    const cut = (low + high) / 2;
    polygon = clipHalfPlane(outlineM, p => projection(p) - cut);
    if (Math.abs(ringSignedArea(polygon)) > targetArea) low = cut;
    else high = cut;
  }
  return { ...outlineBounds(polygon), polygon, clamped: targetArea < sideM ** 2 };
}

// Display enlargement: a 0.4 m feature is sub-pixel on a wide field, so widen
// the drawn ribbon while keeping the true width for maths and labels.
export function zoneDisplayWidth(widthM, fieldSpanM) {
  const span = Number.isFinite(fieldSpanM) && fieldSpanM > 0 ? fieldSpanM : 30;
  const minReadable = span * 0.01;
  if (!(widthM > 0)) return { displayWidthM: 0, enlarged: false };
  if (widthM >= minReadable) return { displayWidthM: widthM, enlarged: false };
  return { displayWidthM: minReadable, enlarged: true };
}

// NETAREA1C: on-screen pixels per metre at the default zoom, ported from the
// studio estimator (the fitted field covers ~55% of the constraining stage
// dimension in a 3/4 perspective view). Hidden stages and degenerate outlines
// fall back to the studio defaults instead of NaN.
export function zonePixelsPerMetre(stageMinPx, fieldSpanM) {
  const stage = Number.isFinite(stageMinPx) && stageMinPx > 0 ? stageMinPx : 600;
  const span = Number.isFinite(fieldSpanM) && fieldSpanM > 0 ? fieldSpanM : 30;
  return Math.max(1, stage * 0.55) / span;
}

// NETAREA1C: bund/drain display width from on-screen pixels — at least ~6 px
// at the default zoom, capped at six times the real width (studio NETAREA2B
// maths, reused so both views enlarge identically).
export function zoneDisplayWidthPx(widthM, pixelsPerMetre) {
  const displayWidthM = infrastructureDisplayWidth(widthM, pixelsPerMetre);
  return { displayWidthM, enlarged: displayWidthM > widthM };
}

// NETAREA1C: popover placement, ported from the studio clamp — opens beside
// the anchor, flips to the other side near the stage edge, and clamps fully
// inside the visible bounds (shrinking to fit a cramped stage).
export function clampZonePopover({ anchorX, anchorY, width, height, bounds }) {
  const w = Math.min(width, Math.max(0, bounds.right - bounds.left));
  const h = Math.min(height, Math.max(0, bounds.bottom - bounds.top));
  const x = anchorX + 30 + w <= bounds.right ? anchorX + 30 : anchorX - w - 30;
  return {
    left: Math.max(bounds.left, Math.min(bounds.right - w, x)),
    top: Math.max(bounds.top, Math.min(bounds.bottom - h, anchorY - h / 2)),
    width: w, height: h,
  };
}

// Pure zone descriptors for the planner 3D: lengths, areas and shares from the
// field's entered widths. opts: { drainEdgeIndex, elevationAt, grossM2, pixelsPerMetre }.
// pixelsPerMetre (NETAREA1C) switches bund/drain to on-screen enlargement —
// >= ~6 px at the default zoom, capped at x6 — like the studio; the path
// keeps the span rule and all maths/labels keep the real widths.
export function computeFieldZones(outlineM, inputs = {}, opts = {}) {
  const none = { grossM2: 0, perimeterM: 0, bund: null, drain: null, path: null, other: null, enlarged: false };
  if (!Array.isArray(outlineM) || outlineM.length < 3) return none;
  const bundWidthM = Math.max(0, Number(inputs.bundWidthM) || 0);
  const drainWidthM = Math.max(0, Number(inputs.drainWidthM) || 0);
  const pathWidthM = Math.max(0, Number(inputs.pathWidthM) || 0);
  const otherDecimals = Math.max(0, Number(inputs.otherDecimals) || 0);
  const b = outlineBounds(outlineM);
  const span = Math.max(b.width, b.height, 1);
  const perimeterM = outlinePerimeterM(outlineM);
  const grossM2 = Number.isFinite(opts.grossM2) && opts.grossM2 > 0
    ? opts.grossM2 : Math.abs(ringSignedArea(outlineM));
  const ppm = Number.isFinite(opts.pixelsPerMetre) && opts.pixelsPerMetre > 0 ? opts.pixelsPerMetre : 0;
  const share = (areaM2) => (grossM2 > 0 ? (areaM2 / grossM2) * 100 : 0);
  const describe = (kind, name, widthM, lengthM, areaM2, extra = {}) => {
    if (!(widthM > 0) && kind !== 'other') return null;
    if (kind === 'other' && !(areaM2 > 0)) return null;
    const { displayWidthM, enlarged } = kind === 'other'
      ? { displayWidthM: widthM, enlarged: false }
      : ppm > 0 && (kind === 'bund' || kind === 'drain')
        ? zoneDisplayWidthPx(widthM, ppm) : zoneDisplayWidth(widthM, span);
    return { kind, name, widthM, lengthM, areaM2, decimals: areaM2 / M2_PER_DECIMAL,
      sharePct: share(areaM2), displayWidthM, enlarged, ...extra };
  };
  let enlarged = false;
  const bund = describe('bund', 'Bund', bundWidthM, perimeterM,
    Math.max(0, bundWidthM * perimeterM - 4 * bundWidthM * bundWidthM));
  if (bund?.enlarged) enlarged = true;
  let drain = null;
  if (drainWidthM > 0) {
    const pick = Number.isInteger(opts.drainEdgeIndex) && opts.drainEdgeIndex >= 0
      ? { index: opts.drainEdgeIndex, lengthM: edgeLengths(outlineM)[opts.drainEdgeIndex] ?? 0, fallback: false }
      : pickDrainEdge(outlineM, opts.elevationAt ?? null);
    drain = describe('drain', 'Drain', drainWidthM, pick.lengthM, drainWidthM * pick.lengthM,
      { edgeIndex: pick.index, edgeFallback: pick.fallback });
    if (drain?.enlarged) enlarged = true;
  }
  let path = null;
  if (pathWidthM > 0) {
    const axis = pathAxisThroughCentroid(outlineM);
    path = describe('path', 'Path', pathWidthM, axis.lengthM, pathWidthM * axis.lengthM, { axis });
    if (path?.enlarged) enlarged = true;
  }
  const other = otherDecimals > 0
    ? describe('other', 'Other', Math.sqrt(otherDecimals * M2_PER_DECIMAL),
        Math.sqrt(otherDecimals * M2_PER_DECIMAL), otherDecimals * M2_PER_DECIMAL)
    : null;
  return { grossM2, perimeterM, bund, drain, path, other, enlarged };
}

// Geometry used both to draw the zones and to keep plants out of them.
// opts.display widens the drawn ribbons; opts.pixelsPerMetre (NETAREA1C)
// uses the on-screen bund/drain rule so geometry matches the descriptors.
export function buildZoneGeometry(outlineM, inputs = {}, opts = {}) {
  if (!Array.isArray(outlineM) || outlineM.length < 3) return null;
  const b = outlineBounds(outlineM);
  const ppm = Number.isFinite(opts.pixelsPerMetre) && opts.pixelsPerMetre > 0 ? opts.pixelsPerMetre : 0;
  const width = (value, px = false) => {
    if (!opts.display) return value;
    if (px && ppm > 0) return zoneDisplayWidthPx(value, ppm).displayWidthM;
    return zoneDisplayWidth(value, Math.max(b.width, b.height)).displayWidthM;
  };
  const bundWidthM = width(Math.max(0, Number(inputs.bundWidthM) || 0), true);
  const drainWidthM = width(Math.max(0, Number(inputs.drainWidthM) || 0), true);
  const pathWidthM = width(Math.max(0, Number(inputs.pathWidthM) || 0));
  const otherDecimals = Math.max(0, Number(inputs.otherDecimals) || 0);
  if (!(bundWidthM > 0 || drainWidthM > 0 || pathWidthM > 0 || otherDecimals > 0)) return null;
  const geom = { bundWidthM, drain: null, path: null, other: null };
  if (drainWidthM > 0) {
    const pick = Number.isInteger(opts.drainEdgeIndex) && opts.drainEdgeIndex >= 0
      ? { index: opts.drainEdgeIndex } : pickDrainEdge(outlineM, opts.elevationAt ?? null);
    const a = outlineM[pick.index];
    const c = outlineM[(pick.index + 1) % outlineM.length];
    if (a && c) {
      // Drain centre-line inset just inside the bund.
      const dx = c[0] - a[0], dy = c[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const area = ringSignedArea(outlineM);
      const nx = (area >= 0 ? -dy : dy) / len;
      const ny = (area >= 0 ? dx : -dx) / len;
      const off = bundWidthM + drainWidthM / 2;
      geom.drain = { ax: a[0] + nx * off, ay: a[1] + ny * off,
        bx: c[0] + nx * off, by: c[1] + ny * off, widthM: drainWidthM, edgeIndex: pick.index };
    }
  }
  if (pathWidthM > 0) {
    const axis = pathAxisThroughCentroid(outlineM);
    if (axis.lengthM > 0) geom.path = { ...axis, widthM: pathWidthM };
  }
  if (otherDecimals > 0) {
    const rect = otherPatchRect(outlineM, Math.sqrt(otherDecimals * M2_PER_DECIMAL), bundWidthM);
    if (rect) geom.other = { ...rect, decimals: otherDecimals };
  }
  return geom;
}

// Subtract a finite drain ribbon from each terrain triangle before tessellation.
export function drainSurfacePolygons(triangle, drain) {
  if (!drain) return [triangle];
  const dx = drain.bx - drain.ax, dy = drain.by - drain.ay;
  const length = Math.hypot(dx, dy);
  if (!length) return [triangle];
  const ux = dx / length, uy = dy / length;
  const along = ([x, y]) => (x - drain.ax) * ux + (y - drain.ay) * uy;
  const across = ([x, y]) => -(x - drain.ax) * uy + (y - drain.ay) * ux;
  const planes = [p => along(p), p => length - along(p),
    p => drain.widthM / 2 - across(p), p => drain.widthM / 2 + across(p)];
  const pieces = [];
  let remaining = triangle;
  for (const plane of planes) {
    const outside = clipHalfPlane(remaining, p => -plane(p));
    if (outside.length >= 3) pieces.push(outside);
    remaining = clipHalfPlane(remaining, plane);
    if (remaining.length < 3) break;
  }
  return pieces;
}

function clipHalfPlane(poly, distance) {
  const result = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const da = distance(a), db = distance(b);
    if (da >= 0) result.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  });
  return result;
}

// Bound an enlarged clump's footprint by its nearest non-cultivable zone.
export function fieldZoneClearance(x, y, geom, outlineM) {
  let clearance = distToPolygonEdge(x, y, outlineM) - (geom?.bundWidthM || 0);
  if (pointInFieldZones(x, y, geom, outlineM)) return 0;
  for (const line of [geom?.path, geom?.drain]) {
    if (line) clearance = Math.min(clearance,
      distToSegment(x, y, line.ax, line.ay, line.bx, line.by) - line.widthM / 2);
  }
  if (geom?.other?.polygon) clearance = Math.min(clearance, distToPolygonEdge(x, y, geom.other.polygon));
  return Math.max(0, clearance);
}

// Which zone (if any) contains the point. Returns 'bund' | 'drain' | 'path' | 'other' | null.
export function pointInFieldZones(x, y, zoneGeom, outlineM = null) {
  if (!zoneGeom) return null;
  if (zoneGeom.other && (zoneGeom.other.polygon
    ? pointInPolygon(x, y, zoneGeom.other.polygon)
    : x >= zoneGeom.other.minX && x <= zoneGeom.other.maxX &&
      y >= zoneGeom.other.minY && y <= zoneGeom.other.maxY)) return 'other';
  if (zoneGeom.path) {
    const p = zoneGeom.path;
    if (distToSegment(x, y, p.ax, p.ay, p.bx, p.by) < p.widthM / 2) return 'path';
  }
  if (zoneGeom.drain) {
    const d = zoneGeom.drain;
    if (distToSegment(x, y, d.ax, d.ay, d.bx, d.by) < d.widthM / 2) return 'drain';
  }
  if (zoneGeom.bundWidthM > 0 && outlineM &&
      distToPolygonEdge(x, y, outlineM) < zoneGeom.bundWidthM) return 'bund';
  return null;
}

// Popover rows for a tapped zone: parameters plus the truth label.
export function zonePopoverData(kind, zones, edited) {
  const zone = zones?.[kind];
  if (!zone) return null;
  return {
    kind, name: zone.name, widthM: zone.widthM, lengthM: zone.lengthM,
    areaM2: zone.areaM2, decimals: zone.decimals, sharePct: zone.sharePct,
    source: edited ? 'Entered by farmer' : 'Scenario default',
    editHref: '#field',
  };
}

// Generate plant positions on a grid inside outlineM, inset by half the widest spacing
// so instances never sit outside the field. spacingYM lets callers model crop rows.
export function plantPositionsInPolygon(outlineM, spacingM, spacingYM = spacingM) {
  if (!outlineM || outlineM.length < 3 || !(spacingM > 0) || !(spacingYM > 0)) return [];
  const b = outlineBounds(outlineM);
  const inset = Math.max(spacingM, spacingYM) / 2;
  const positions = [];
  for (let x = b.minX + spacingM / 2; x <= b.maxX; x += spacingM) {
    for (let y = b.minY + spacingYM / 2; y <= b.maxY; y += spacingYM) {
      if (!pointInPolygon(x, y, outlineM)) continue;
      if (distToPolygonEdge(x, y, outlineM) < inset) continue;
      positions.push([x, y]);
    }
  }
  return positions;
}

// Expand each spacing independently for a readable, bounded illustration.
// A fixed field-relative gap keeps the 2 cm minimum below 70 × 70 clumps.
// zoneGeom (from buildZoneGeometry) keeps drawn rows out of bunds, drains,
// paths and other patches so the illustration matches the reduced count.
export function plannerRowLayout(outlineM, rowCm, plantCm, usable = 100, zoneGeom = null) {
  const empty = { positions: [], rowCount: 0, spacingX: 0, spacingY: 0 };
  if (!Array.isArray(outlineM) || outlineM.length < 3 ||
      outlineM.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
      ![rowCm, plantCm, usable].every(Number.isFinite) ||
      rowCm < 2 || plantCm < 2 || usable <= 0 || usable > 100) return empty;
  const b = outlineBounds(outlineM);
  if (!(b.width > 0 && b.height > 0)) return empty;
  const span = Math.max(b.width, b.height);
  const displayScale = Math.max(1, Math.ceil(span / 10));
  const rowStep = Math.max(1, Math.ceil(span / 18 / (rowCm / 100) + Math.max(1, span / 12)));
  const plantStep = Math.max(1, Math.ceil(span / 18 / (plantCm / 100) + Math.max(1, span / 12)));
  const row = rowCm / 100 * rowStep, plant = plantCm / 100 * plantStep;
  const rowsAlongX = b.width >= b.height;
  const spacingX = rowsAlongX ? plant : row;
  const spacingY = rowsAlongX ? row : plant;
  const reserve = zoneGeom ? 0 : (1 - Math.sqrt(usable / 100)) * Math.min(b.width, b.height) / 2;
  const trueX = (rowsAlongX ? plantCm : rowCm) / 100;
  const trueY = (rowsAlongX ? rowCm : plantCm) / 100;
  const inset = Math.max(reserve, Math.min(spacingX, spacingY, b.width, b.height) * 0.3,
    zoneGeom?.bundWidthM || 0);
  const positions = [];
  let availableSamples = 0;
  const startX = trueX / 2 + Math.max(0, Math.floor((Math.min(spacingX, b.width) - trueX) / (2 * trueX))) * trueX;
  const startY = trueY / 2 + Math.max(0, Math.floor((Math.min(spacingY, b.height) - trueY) / (2 * trueY))) * trueY;
  for (let x = b.minX + startX; x < b.maxX; x += spacingX) {
    for (let y = b.minY + startY; y < b.maxY; y += spacingY) {
      if (!pointInPolygon(x, y, outlineM) || distToPolygonEdge(x, y, outlineM) < inset) continue;
      availableSamples++;
      if (zoneGeom && pointInFieldZones(x, y, zoneGeom, outlineM) !== null) continue;
      positions.push([x, y]);
    }
  }
  if (zoneGeom && usable < 100) {
    const count = Math.min(positions.length, Math.max(1, Math.round(availableSamples * usable / 100)));
    const sampled = Array.from({ length: count }, (_, i) => positions[Math.floor(i * positions.length / count)]);
    positions.splice(0, positions.length, ...sampled);
  }
  const rowCount = new Set(positions.map((p) => p[rowsAlongX ? 1 : 0])).size;
  const totalPositions = capacity(Math.abs(ringSignedArea(outlineM)) / 10000, usable, 'rice', rowCm / 100, plantCm / 100).positions;
  const sampleWeights = positions.map((_, i) => Math.floor(totalPositions / positions.length) + (i < totalPositions % positions.length ? 1 : 0));
  return { positions, rowCount, spacingX, spacingY, displayScale, rowStep, plantStep, totalPositions, sampleWeights };
}

export function ringSignedArea(ring) {
  if (!ring || ring.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

// Visible clump height for the 3D plants. Data heights (canopyHeightM × stageFraction)
// are honoured whenever they are tall enough to read against the field width, but a
// floor proportional to the field span keeps establishing crops and short cover visible
// from the fitted overview camera instead of reading as a flat mat.
export function canopyVisualHeight(month, fieldSpanM) {
  if (!month || month.stage === "fallow" || !month.cropId) return 0;
  const span = Number.isFinite(fieldSpanM) && fieldSpanM > 0 ? fieldSpanM : 30;
  const dataHeight = Math.max(0, (month.canopyHeightM || 0) * (month.stageFraction || 0));
  const floor = span * 0.012;
  let h = Math.max(floor, dataHeight);
  if (month.stage === "harvest") {
    // Stubble reads as a shorter canopy but still above the ground.
    h = Math.min(h, Math.max(floor * 0.55, 0.18));
  }
  return h;
}

export const MAX_PLANTS_PER_FIELD = 3200;

// Cap instance count with honest note if real count exceeds it
export function capPlantPositions(positions, maxPlants = MAX_PLANTS_PER_FIELD) {
  if (!Array.isArray(positions)) return { positions: [], totalCount: 0, sampleStep: 1, sampleRatioNote: null };
  const totalCount = positions.length;
  if (totalCount <= maxPlants) {
    return { positions, totalCount, sampleStep: 1, sampleRatioNote: null };
  }
  const sampleStep = Math.ceil(totalCount / maxPlants);
  const sampled = [];
  for (let i = 0; i < totalCount; i += sampleStep) {
    sampled.push(positions[i]);
  }
  const sampleRatioNote = `showing every ${sampleStep}th plant (${sampled.length} of ${totalCount})`;
  return { positions: sampled, totalCount, sampleStep, sampleRatioNote };
}

// Ease functions
export function easeOutCubic(t) {
  const p = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return 1 - Math.pow(1 - p, 3);
}

export function easeInOutCubic(t) {
  const p = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}

// Map 2D point [x, y] to grid row index along the primary axis
export function getRowIndex(point, bounds, rowsAlongX = false, rowSpacing = 1) {
  if (!point || !bounds) return 0;
  const coord = rowsAlongX ? point[1] : point[0];
  const minCoord = rowsAlongX ? bounds.minY : bounds.minX;
  const spacing = rowSpacing > 0 ? rowSpacing : 1;
  return Math.max(0, Math.floor((coord - minCoord) / spacing));
}

// Calculate row-staggered transition progress [0..1]
export function rowStaggerProgress(globalProgress, rowIndex, maxRows = 20, staggerFraction = 0.3) {
  const p = Math.max(0, Math.min(1, Number.isFinite(globalProgress) ? globalProgress : 0));
  const safeMax = Math.max(1, maxRows);
  const rowRatio = Math.max(0, Math.min(1, rowIndex / safeMax));
  const rowDelay = rowRatio * staggerFraction;
  const rowDuration = 1 - staggerFraction;
  if (p <= rowDelay) return 0;
  if (p >= rowDelay + rowDuration) return 1;
  return (p - rowDelay) / rowDuration;
}

// Match plant positions between old and new sets using nearest neighbor
export function matchPlantPositions(oldPositions, newPositions) {
  const oldList = Array.isArray(oldPositions) ? oldPositions : [];
  const newList = Array.isArray(newPositions) ? newPositions : [];
  const matched = [];
  const usedOld = new Set();

  for (let i = 0; i < newList.length; i++) {
    const [nx, ny] = newList[i];
    let bestOldIdx = -1;
    let bestDist = Infinity;
    for (let j = 0; j < oldList.length; j++) {
      if (usedOld.has(j)) continue;
      const [ox, oy] = oldList[j];
      const dist = Math.hypot(nx - ox, ny - oy);
      if (dist < bestDist) {
        bestDist = dist;
        bestOldIdx = j;
      }
    }
    // Only glide if reasonably close (within 15m), else grow in place
    if (bestOldIdx >= 0 && bestDist <= 15) {
      usedOld.add(bestOldIdx);
      matched.push({
        type: 'glide',
        from: oldList[bestOldIdx],
        to: newList[i],
        newIndex: i,
        oldIndex: bestOldIdx,
      });
    } else {
      matched.push({
        type: 'grow',
        from: null,
        to: newList[i],
        newIndex: i,
      });
    }
  }

  const removed = [];
  for (let j = 0; j < oldList.length; j++) {
    if (!usedOld.has(j)) {
      removed.push({
        type: 'shrink',
        from: oldList[j],
        oldIndex: j,
      });
    }
  }

  return { matched, removed };
}

// Camera framing for ~85% width fill
export function computeFieldFraming({ bounds, aspect = 1.5, fovDeg = 38, targetWidthRatio = 0.86,
  elevationDeg = 36, yawDeg = 24, depthM = 0, topM = 0 }) {
  const b = bounds || { width: 30, height: 30, cx: 0, cy: 0 };
  const width = Math.max(1, b.width), height = Math.max(1, b.height);
  const target = [b.cx, (topM - depthM) / 2, -b.cy];
  const tanV = Math.tan(fovDeg * Math.PI / 360) * targetWidthRatio;
  const tanH = tanV * Math.max(0.1, aspect);
  const el = elevationDeg * Math.PI / 180;
  let distance = 5;
  // Solve all eight projected corners, including the full ±5° idle yaw and 1% dolly.
  for (const offset of [-5, 0, 5]) {
    const yaw = (yawDeg + offset) * Math.PI / 180;
    for (const x of [-width / 2, width / 2]) {
      for (const y of [-depthM - target[1], topM - target[1]]) {
        for (const z of [-height / 2, height / 2]) {
          const right = x * Math.cos(yaw) - z * Math.sin(yaw);
          const up = -x * Math.sin(el) * Math.sin(yaw) + y * Math.cos(el) - z * Math.sin(el) * Math.cos(yaw);
          const toward = x * Math.cos(el) * Math.sin(yaw) + y * Math.sin(el) + z * Math.cos(el) * Math.cos(yaw);
          distance = Math.max(distance, toward + Math.max(Math.abs(right) / tanH, Math.abs(up) / tanV));
        }
      }
    }
  }
  distance /= 0.99;
  const yaw = yawDeg * Math.PI / 180;
  const position = [target[0] + Math.cos(el) * Math.sin(yaw) * distance,
    target[1] + Math.sin(el) * distance, target[2] + Math.cos(el) * Math.cos(yaw) * distance];
  return { target, position, distance, elevationDeg, yawDeg };
}


// Camera framing: place a perspective camera so the block's bounding sphere fits with a margin.
// Returns { position: [x,y,z], target: [x,y,z], distance, radius } in world coords.
export function fitCameraToBlock({ outlineM, depthM = 1.5, fovDeg = 40, aspect = 1.5,
  elevationDeg = 35, yawDeg = 18, margin = 0.12 }) {
  const b = outlineBounds(outlineM || []);
  const target = [b.cx, -depthM / 2, -b.cy];
  const halfX = b.width / 2, halfY = depthM / 2, halfZ = b.height / 2;
  const radius = Math.sqrt(halfX * halfX + halfY * halfY + halfZ * halfZ);
  const vFov = (fovDeg * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
  const fov = Math.min(vFov, hFov);
  const distance = (radius / Math.sin(fov / 2)) * (1 + margin);
  const el = (elevationDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const dir = [Math.cos(el) * Math.sin(yaw), Math.sin(el), Math.cos(el) * Math.cos(yaw)];
  return { position: [target[0] + dir[0] * distance, target[1] + dir[1] * distance, target[2] + dir[2] * distance],
    target, distance, radius };
}

// Ortho top-view sizing: returns {halfWidth, halfHeight, y, target} so the plot fits with margin.
export function fitTopView({ outlineM, aspect = 1.5, margin = 0.12, altitude = 60 }) {
  const b = outlineBounds(outlineM || []);
  const halfHeight = Math.max(b.height / 2, (b.width / 2) / Math.max(aspect, 1e-3)) * (1 + margin);
  const halfWidth = halfHeight * aspect;
  return { halfWidth, halfHeight, y: altitude, target: [b.cx, 0, -b.cy] };
}

// Idle hovering / slow drift for floating field block.
// Zero when dragging or prefersReducedMotion is on.
export function idleFloatOffset(timeS, fieldSpanM = 30, isDragging = false, prefersReducedMotion = false) {
  if (isDragging || prefersReducedMotion || !Number.isFinite(timeS)) {
    return { dy: 0, yaw: 0 };
  }
  const span = Number.isFinite(fieldSpanM) && fieldSpanM > 0 ? fieldSpanM : 30;
  // Subtle vertical bobbing (approx ±0.15 m - scaled to plot span)
  const dyAmplitude = Math.max(0.06, Math.min(0.28, span * 0.005));
  const dy = Math.sin(timeS * 0.9) * dyAmplitude;
  // Slow gentle drift yaw (approx ±0.012 radians ~ 0.7 degrees)
  const yaw = Math.sin(timeS * 0.45) * 0.012;
  return { dy, yaw };
}

// ------------------------------------------------- STUDIO5P idle sway helpers
// Same slow horizontal idle motion as the studio, at the planner's ±5 amplitude.
// Pure (no three.js/DOM) — safe to unit test.
export const IDLE_SWAY_PERIOD_S = 14;
export const IDLE_SWAY_AMPLITUDE_DEG = 5;
export const IDLE_DOLLY_AMPLITUDE = 0.01; // ±1 % distance breathing
export const IDLE_RESUME_DELAY_S = 6; // still seconds after input before motion resumes
export const IDLE_EASE_IN_S = 1.5; // resume ramp duration
export const IDLE_VERTICAL_SCALE = 0.2; // residual bob, ≤25 % of idleFloatOffset

// Sinusoidal yaw/dolly/vertical offsets at wall-clock timeS. No gating here —
// the caller scales by idleResumeGain() so pause/resume stays testable.
export function idleSwayOffset(timeS, {
  amplitudeDeg = IDLE_SWAY_AMPLITUDE_DEG,
  periodS = IDLE_SWAY_PERIOD_S,
  dollyAmp = IDLE_DOLLY_AMPLITUDE,
  fieldSpanM = 30,
  verticalScale = IDLE_VERTICAL_SCALE,
} = {}) {
  const zero = { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0 };
  if (!Number.isFinite(timeS)) return zero;
  const period = Number.isFinite(periodS) && periodS > 0 ? periodS : IDLE_SWAY_PERIOD_S;
  const amp = Number.isFinite(amplitudeDeg) ? amplitudeDeg : IDLE_SWAY_AMPLITUDE_DEG;
  const wave = Math.sin((timeS * 2 * Math.PI) / period);
  const yawDeg = wave * amp;
  const span = Number.isFinite(fieldSpanM) && fieldSpanM > 0 ? fieldSpanM : 30;
  const scale = Number.isFinite(verticalScale) ? verticalScale : IDLE_VERTICAL_SCALE;
  const dyAmplitude = Math.max(0.06, Math.min(0.28, span * 0.005)) * scale;
  return {
    yawDeg,
    yawRad: (yawDeg * Math.PI) / 180,
    dolly: wave * (Number.isFinite(dollyAmp) ? dollyAmp : IDLE_DOLLY_AMPLITUDE),
    dy: Math.sin(timeS * 0.9) * dyAmplitude,
  };
}

// Pause/resume envelope: 0 until delayS after the last input, then a smooth
// 0→1 ramp over easeS. Instant pause, gentle return.
export function idleResumeGain(timeSinceInputS, {
  delayS = IDLE_RESUME_DELAY_S,
  easeS = IDLE_EASE_IN_S,
} = {}) {
  if (!Number.isFinite(timeSinceInputS) || timeSinceInputS < 0) return 0;
  const delay = Number.isFinite(delayS) && delayS >= 0 ? delayS : IDLE_RESUME_DELAY_S;
  const ease = Number.isFinite(easeS) && easeS > 0 ? easeS : IDLE_EASE_IN_S;
  if (timeSinceInputS < delay) return 0;
  if (timeSinceInputS >= delay + ease) return 1;
  const x = (timeSinceInputS - delay) / ease;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

// Dimension label for a drawn zone. The marker line spans the drawn (possibly
// enlarged) width so it matches the visible ribbon, but the label always
// states the real entered width — never rounded, never zero.
export function measurementWidthLabel(widthM) {
  return `${widthM} m`;
}

// Overall field-edge marker: one decimal, trailing zeros trimmed.
export function measurementEdgeLabel(lengthM) {
  return `${Number((Number.isFinite(lengthM) ? lengthM : 0).toFixed(1))} m`;
}

// Spacing markers on a planted patch: row spacing vs within-row spacing.
export function spacingMeasurementLabel(kind, cm) {
  return `${kind === 'row' ? '↔' : '↕'} ${cm} cm`;
}

// Dimension anchors across each drawn zone (bund / drain / path) plus one
// overall marker along the longest field edge. Each marker spans the DISPLAY
// width (zoneGeom must be the display geometry) while its label states the
// REAL width. A marker is omitted when no complete cross-section fits inside
// its zone (tight concave corners); the edge marker is always present.
export function plannerMeasurementAnchors(outlineM, zones, zoneGeom) {
  if (!Array.isArray(outlineM) || outlineM.length < 3) return [];
  const winding = Math.sign(ringSignedArea(outlineM)) || 1;
  const edges = outlineM.map((a, i) => {
    const b = outlineM[(i + 1) % outlineM.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(length > 1e-6)) return null;
    return { a, b, i, length,
      normal: [-(b[1] - a[1]) / length * winding, (b[0] - a[0]) / length * winding] };
  }).filter(Boolean).sort((p, q) => q.length - p.length);
  const markers = [];
  const inside = (id, x, y) => pointInFieldZones(x, y, zoneGeom, outlineM) === id;
  const fits = (id, center, normal, width) =>
    [-0.49, -0.25, 0, 0.25, 0.49].every((tt) =>
      inside(id, center[0] + normal[0] * width * tt, center[1] + normal[1] * width * tt));
  const spanAcross = (center, normal, width) => [
    center.map((v, i) => v - normal[i] * width / 2),
    center.map((v, i) => v + normal[i] * width / 2)];
  const bund = zones?.bund;
  if (bund && bund.displayWidthM > 0) {
    const width = bund.displayWidthM;
    const candidates = [];
    for (const edge of edges) {
      for (const fraction of [0.3, 0.7, 0.5]) {
        candidates.push({
          center: edge.a.map((v, i) => v + (edge.b[i] - v) * fraction + edge.normal[i] * width / 2),
          normal: edge.normal,
        });
      }
    }
    const hit = candidates.find((c) => fits('bund', c.center, c.normal, width));
    if (hit) {
      const [a, b] = spanAcross(hit.center, hit.normal, width);
      markers.push({ id: 'bund', label: measurementWidthLabel(bund.widthM), a, b });
    }
  }
  const drain = zones?.drain;
  const dline = zoneGeom?.drain;
  if (drain && dline && drain.displayWidthM > 0) {
    const width = drain.displayWidthM;
    const len = Math.hypot(dline.bx - dline.ax, dline.by - dline.ay);
    if (len > 1e-6) {
      const normal = [-(dline.by - dline.ay) / len, (dline.bx - dline.ax) / len];
      const hit = [0.7, 0.3, 0.5]
        .map((f) => ({ center: [dline.ax + (dline.bx - dline.ax) * f, dline.ay + (dline.by - dline.ay) * f], normal }))
        .find((c) => fits('drain', c.center, c.normal, width));
      if (hit) {
        const [a, b] = spanAcross(hit.center, hit.normal, width);
        markers.push({ id: 'drain', label: measurementWidthLabel(drain.widthM), a, b });
      }
    }
  }
  const path = zones?.path;
  const pline = zoneGeom?.path;
  if (path && pline && path.displayWidthM > 0) {
    const width = path.displayWidthM;
    const len = Math.hypot(pline.bx - pline.ax, pline.by - pline.ay);
    if (len > 1e-6) {
      const ux = (pline.bx - pline.ax) / len, uy = (pline.by - pline.ay) / len;
      const normal = [-uy, ux];
      const center = [(pline.ax + pline.bx) / 2, (pline.ay + pline.by) / 2];
      const hit = [0, 0.2, -0.2, 0.35, -0.35]
        .map((off) => ({ center: [center[0] + ux * len * off, center[1] + uy * len * off], normal }))
        .find((c) => fits('path', c.center, c.normal, width));
      if (hit) {
        const [a, b] = spanAcross(hit.center, hit.normal, width);
        markers.push({ id: 'path', label: measurementWidthLabel(path.widthM), a, b });
      }
    }
  }
  if (edges[0]) markers.push({ id: 'edge', label: measurementEdgeLabel(edges[0].length), a: edges[0].a, b: edges[0].b });
  return markers;
}

// Row-spacing and within-row spacing markers on a small patch of the planted
// area, starting at the drawn plant nearest the centroid. Anchors span the
// drawn (display) spacing so they connect visible plants; labels state the
// real slider values. Recompute on every slider move.
export function plannerSpacingAnchors(outlineM, rowCm, plantCm, zoneGeom = null, usable = 100) {
  if (!Array.isArray(outlineM) || outlineM.length < 3) return [];
  if (![rowCm, plantCm].every(Number.isFinite) || rowCm < 2 || plantCm < 2) return [];
  const layout = plannerRowLayout(outlineM, rowCm, plantCm, usable, zoneGeom);
  if (!layout.positions.length || !(layout.spacingX > 0) || !(layout.spacingY > 0)) return [];
  const b = outlineBounds(outlineM);
  const rowsAlongX = b.width >= b.height;
  const rowStep = rowsAlongX ? [0, layout.spacingY] : [layout.spacingX, 0];
  const plantStep = rowsAlongX ? [layout.spacingX, 0] : [0, layout.spacingY];
  const clear = ([x, y]) => pointInPolygon(x, y, outlineM) &&
    pointInFieldZones(x, y, zoneGeom, outlineM) === null;
  const clearSpan = (a, b) => clear(a) && clear(b) &&
    clear([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  const ordered = [...layout.positions].sort((p, q) =>
    Math.hypot(p[0] - b.cx, p[1] - b.cy) - Math.hypot(q[0] - b.cx, q[1] - b.cy));
  for (const base of ordered.slice(0, 24)) {
    for (const sign of [1, -1]) {
      const rowEnd = [base[0] + rowStep[0] * sign, base[1] + rowStep[1] * sign];
      const plantEnd = [base[0] + plantStep[0] * sign, base[1] + plantStep[1] * sign];
      if (clearSpan(base, rowEnd) && clearSpan(base, plantEnd)) {
        return [
          { id: 'row-spacing', label: spacingMeasurementLabel('row', rowCm), a: base, b: rowEnd },
          { id: 'plant-spacing', label: spacingMeasurementLabel('plant', plantCm), a: base, b: plantEnd },
        ];
      }
    }
  }
  return [];
}

// Combined idle state: gated sinusoid plus the envelope gain. Dragging,
// reduced motion, or a hidden tab parks everything at zero.
export function idleCameraSway(timeS, timeSinceInputS, opts = {}) {
  const {
    isDragging = false,
    prefersReducedMotion = false,
    hidden = false,
  } = opts;
  const gain = isDragging || prefersReducedMotion || hidden
    ? 0
    : idleResumeGain(timeSinceInputS, opts);
  if (gain <= 0) return { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0, gain: 0 };
  const { yawDeg, yawRad, dolly, dy } = idleSwayOffset(timeS, opts);
  return { yawDeg: yawDeg * gain, yawRad: yawRad * gain, dolly: dolly * gain, dy: dy * gain, gain };
}
