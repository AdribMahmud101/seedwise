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

// ------------------------------------------------------------- STUDIO5A helpers

/**
 * Compute water ponding depth (in cm) at a relative elevation point.
 * Options:
 *  - elev: current elevation in metres
 *  - elevMin: minimum plot elevation in metres
 *  - elevMax: maximum plot elevation in metres
 *  - rainMm: scenario rainfall in mm (0..240)
 *  - proposedDrain: boolean
 *  - outletBlocked: boolean
 *  - s1WaterMask: boolean | number (optional Sentinel-1 detected water flag at cell)
 */
export function computePonding({
  elev,
  elevMin = 0,
  elevMax = 1,
  rainMm = 0,
  proposedDrain = false,
  outletBlocked = false,
  s1WaterMask = null,
} = {}) {
  // If Sentinel-1 water mask is explicitly present (STUDIO5D data)
  if (s1WaterMask !== null && s1WaterMask !== undefined) {
    if (s1WaterMask === 1 || s1WaterMask === true) {
      // Confirmed water from radar
      const baseCm = 15;
      const extra = Math.max(0, Math.round((rainMm / 20) * (proposedDrain && !outletBlocked ? 0.5 : 1.0)));
      return { pondCm: baseCm + extra, isPonded: true, truth: "REMOTE_OBSERVED", source: "Sentinel-1 Water Mask" };
    }
  }

  // Fallback: Low ground + rainfall scenario (SCENARIO / Estimated)
  const span = Math.max(0.2, (elevMax || 0) - (elevMin || 0));
  const normE = Math.max(0, Math.min(1, ((elev ?? elevMin) - (elevMin || 0)) / span));
  const drainFactor = proposedDrain && !outletBlocked ? 0.45 : outletBlocked ? 1.3 : 1.0;
  const pond = Math.max(0, Math.round((1 - normE) * (Math.max(0, rainMm) / 12) * drainFactor));
  return {
    pondCm: pond,
    isPonded: pond > 0,
    truth: "SCENARIO",
    source: "Estimated · Terrain & Rain Scenario",
  };
}

/**
 * Sample cross-field elevation profile across N steps along transect A (u0, v0) -> A' (u1, v1).
 * Returns { pts: [{ t, u, v, elev, pondCm }], minE, maxE, reliefM, svgPath }
 */
export function sampleTransectProfile({
  u0 = 0.12,
  v0 = 0.26,
  u1 = 0.92,
  v1 = 0.74,
  steps = 36,
  sampleElevationFn,
  elevMean = 30,
  rainMm = 0,
  proposedDrain = false,
  outletBlocked = false,
  width = 290,
  height = 64,
  padX = 12,
  padY = 10,
} = {}) {
  const pts = [];
  let minE = Infinity;
  let maxE = -Infinity;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = u0 + (u1 - u0) * t;
    const v = v0 + (v1 - v0) * t;
    const elev = typeof sampleElevationFn === "function" ? sampleElevationFn(u, v) : elevMean;
    if (elev < minE) minE = elev;
    if (elev > maxE) maxE = elev;
    pts.push({ t, u, v, elev });
  }

  if (!Number.isFinite(minE)) {
    minE = elevMean;
    maxE = elevMean + 1;
  }
  const span = Math.max(0.5, maxE - minE);

  const X = (t) => padX + t * (width - padX * 2);
  const Y = (e) => height - padY - ((e - minE) / span) * (height - padY * 2);

  const lineD = pts.map((p) => `${X(p.t).toFixed(1)},${Y(p.elev).toFixed(1)}`).join(" L ");
  const areaD = `M ${X(0).toFixed(1)},${(height - 4).toFixed(1)} L ${lineD} L ${X(1).toFixed(1)},${(height - 4).toFixed(1)} Z`;

  // Compute ponding per point
  for (const p of pts) {
    p.pond = computePonding({
      elev: p.elev,
      elevMin: minE,
      elevMax: maxE,
      rainMm,
      proposedDrain,
      outletBlocked,
    });
  }

  return {
    pts,
    minE,
    maxE,
    reliefM: maxE - minE,
    lineD: `M ${lineD}`,
    areaD,
    X,
    Y,
  };
}

/**
 * Sample real values (lat/lon, elevation, NDVI, NDMI, low-ground, ponding) at normalized (u, v)
 * for the clicked/tapped probe card.
 */
export function lookupProbePoint({
  u,
  v,
  field = {},
  sampleElevationFn = null,
  ndviObservation = null,
  moistureObservation = null,
  groundClass = null,
  rainMm = 0,
  proposedDrain = false,
  outletBlocked = false,
  s1WaterMask = null,
} = {}) {
  const normU = Math.max(0, Math.min(1, u ?? 0.5));
  const normV = Math.max(0, Math.min(1, v ?? 0.5));

  const [cLat, cLon] = field.centroid || [25.83, 89.24];
  const bbox = field.bboxLatLon; // [w, s, e, n]
  let lat = cLat;
  let lon = cLon;
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [w, s, e, n] = bbox;
    lon = w + normU * (e - w);
    lat = n - normV * (n - s);
  } else {
    lat = cLat + (0.5 - normV) * 0.0012;
    lon = cLon + (normU - 0.5) * 0.0012;
  }

  const elev = typeof sampleElevationFn === "function" ? sampleElevationFn(normU, normV) : 30.0;
  const elevMin = field.elevMin ?? (elev - 1.2);
  const elevMax = field.elevMax ?? (elev + 1.2);

  const pondResult = computePonding({
    elev,
    elevMin,
    elevMax,
    rainMm,
    proposedDrain,
    outletBlocked,
    s1WaterMask,
  });

  const ndviVal = ndviObservation?.ndvi ?? null;
  const ndmiVal = moistureObservation?.ndmi ?? null;

  return {
    u: normU,
    v: normV,
    lat,
    lon,
    elevationM: elev,
    pondingCm: pondResult.pondCm,
    pondTruth: pondResult.truth,
    pondSource: pondResult.source,
    ndvi: ndviVal,
    ndmi: ndmiVal,
    groundClass: groundClass?.class ?? (elev - elevMin < (elevMax - elevMin) * 0.35 ? "low" : "level"),
  };
}


