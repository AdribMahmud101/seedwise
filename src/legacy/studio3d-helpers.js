// Pure helpers for the 3D field studio. No three.js, no DOM — safe to unit test.

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

// Generate plant positions on a grid inside outlineM, inset by half the widest spacing
// so instances never sit outside the field. spacingYM lets callers model crop rows;
// maxEastX lets the cutaway chop the east side.
export function plantPositionsInPolygon(outlineM, spacingM, maxEastX = Infinity, spacingYM = spacingM) {
  if (!outlineM || outlineM.length < 3 || !(spacingM > 0) || !(spacingYM > 0)) return [];
  const b = outlineBounds(outlineM);
  const inset = Math.max(spacingM, spacingYM) / 2;
  const positions = [];
  for (let x = b.minX + spacingM / 2; x <= Math.min(b.maxX, maxEastX); x += spacingM) {
    for (let y = b.minY + spacingYM / 2; y <= b.maxY; y += spacingYM) {
      if (!pointInPolygon(x, y, outlineM)) continue;
      if (distToPolygonEdge(x, y, outlineM) < inset) continue;
      positions.push([x, y]);
    }
  }
  return positions;
}

// Slice a polygon at x = maxX, preserving the full outline (concave fields included).
// This is the same polygon-intersection used by the field model for the cutaway.
export function clipRing(ring, maxX = Infinity) {
  if (!ring || ring.length < 3) return [];
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a[0] <= maxX) out.push([a[0], a[1]]);
    if ((a[0] <= maxX) !== (b[0] <= maxX)) {
      const t = (maxX - a[0]) / (b[0] - a[0]);
      out.push([maxX, a[1] + t * (b[1] - a[1])]);
    }
  }
  return out.filter((p, i) => !i || Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1]) > 1e-8);
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

// Nearest observation to the 15th of the active month. Returns null if list is empty.
export function nearestObservation(observations, monthIdx, year = 2024) {
  if (!observations || observations.length === 0) return null;
  const target = Date.UTC(year, monthIdx, 15);
  let best = null, bestDiff = Infinity;
  for (let i = 0; i < observations.length; i++) {
    const o = observations[i];
    const t = Date.parse(o.date);
    if (!Number.isFinite(t)) continue;
    const diff = Math.abs(t - target);
    if (diff < bestDiff) { bestDiff = diff; best = { observation: o, index: i }; }
  }
  return best;
}

const MONTHS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_BN = ["জানু","ফেব","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগ","সেপ্ট","অক্টো","নভে","ডিসে"];
const STAGE_EN = { establish: "establishing", grow: "growing", mature: "maturing", harvest: "harvest", fallow: "fallow" };
const STAGE_BN = { establish: "অঙ্কুরোদ্গম", grow: "বৃদ্ধি", mature: "পরিণত", harvest: "ফসল কাটা", fallow: "পতিত" };

export function monthChipText(month, lang = "en") {
  if (!month) return "";
  const idx = Number((month.month || "").split("-")[1]) - 1;
  const months = lang === "bn" ? MONTHS_BN : MONTHS_EN;
  const stageMap = lang === "bn" ? STAGE_BN : STAGE_EN;
  const monthLabel = Number.isInteger(idx) && idx >= 0 && idx < 12 ? months[idx] : (month.month || "");
  const cropName = lang === "bn" ? (month.cropNameBn || month.cropName || "") : (month.cropName || "");
  const stageLabel = stageMap[month.stage] ?? month.stage ?? "";
  return cropName ? `${monthLabel} · ${cropName} · ${stageLabel}` : `${monthLabel} · ${stageLabel}`;
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
