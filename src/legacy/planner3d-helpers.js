// Pure helpers for the Planner 3D (forked from planner-3d-base). No three.js, no DOM — safe to unit test.

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
export function plannerRowLayout(outlineM, rowCm, plantCm, usable = 100) {
  const empty = { positions: [], rowCount: 0, spacingX: 0, spacingY: 0 };
  if (!Array.isArray(outlineM) || outlineM.length < 3 ||
      outlineM.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)) ||
      ![rowCm, plantCm, usable].every(Number.isFinite) ||
      rowCm < 2 || plantCm < 2 || usable <= 0 || usable > 100) return empty;
  const b = outlineBounds(outlineM);
  if (!(b.width > 0 && b.height > 0)) return empty;
  const span = Math.max(b.width, b.height);
  const readable = (cm) => span / 70 + (cm / 100) * Math.max(1, span / 12);
  const row = readable(rowCm), plant = readable(plantCm);
  const rowsAlongX = b.width >= b.height;
  const spacingX = rowsAlongX ? plant : row;
  const spacingY = rowsAlongX ? row : plant;
  const reserve = (1 - Math.sqrt(usable / 100)) * Math.min(b.width, b.height) / 2;
  const positions = plantPositionsInPolygon(outlineM, spacingX, spacingY)
    .filter(([x, y]) => distToPolygonEdge(x, y, outlineM) >= reserve);
  const rowCount = new Set(positions.map((p) => p[rowsAlongX ? 1 : 0])).size;
  return { positions, rowCount, spacingX, spacingY };
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
