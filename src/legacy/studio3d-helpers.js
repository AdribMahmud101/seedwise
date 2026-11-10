// Pure helpers for the 3D field studio. No three.js, no DOM — safe to unit test.
import { projectWgs84ToUtm45N } from "./spatial.js";

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
    // Include the rim, allowing for Float32 mesh coordinates.
    if (distToSegment(x, y, xi, yi, xj, yj) <= 1e-5) return true;
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

export { MONTHS_EN, MONTHS_BN };

/**
 * Find the nearest month with an active crop in the given rotation.
 * If the starting month already has a crop, returns that month index (0-11).
 * Otherwise searches radially (+1/-1, +2/-2, etc.) for the nearest crop month.
 */
export function nearestCropMonth(rotation, month = 0) {
  const months = Array.isArray(rotation) ? rotation : (rotation?.months || []);
  if (!months.length) return ((Number(month) % 12) + 12) % 12;
  const startM = ((Number(month) % 12) + 12) % 12;
  const hasCrop = (idx) => {
    const val = months[idx];
    if (!val || val === "fallow") return false;
    if (typeof val === "object") {
      return val.cropId ? val.cropId !== "fallow" : (val.stage ? val.stage !== "fallow" : true);
    }
    return true;
  };
  if (hasCrop(startM)) return startM;
  for (let dist = 1; dist <= 6; dist++) {
    const fwd = (startM + dist) % 12;
    if (hasCrop(fwd)) return fwd;
    const bwd = (startM - dist + 12) % 12;
    if (hasCrop(bwd)) return bwd;
  }
  return startM;
}

/**
 * Determine crop stage and metadata for a given rotation at a specific month index.
 */
export function cropStageAt(rotation, month = 0, agronomyData = null) {
  const months = Array.isArray(rotation) ? rotation : (rotation?.months || []);
  const mIdx = ((Number(month) % 12) + 12) % 12;
  const raw = months[mIdx];
  const plannedCrop = typeof raw === "object" ? (raw?.cropId || raw?.stage || "fallow") : raw;
  const cropId = (!plannedCrop || plannedCrop === "fallow") ? null : (plannedCrop === "pulse" ? "mungbean" : plannedCrop);

  if (!cropId) {
    return {
      cropId: null,
      stage: "fallow",
      stageFraction: 0,
      canopyHeightM: null,
      rootDepthM: null,
      cropName: "Fallow",
      cropNameBn: "পতিত",
    };
  }

  const crop = agronomyData?.crops?.find((c) => c.id === cropId);
  const year = 2024;
  let start = mIdx;
  while (start > mIdx - 11) {
    const prevIdx = ((start - 1) % 12 + 12) % 12;
    const prevRaw = months[prevIdx];
    const prevCrop = typeof prevRaw === "object" ? (prevRaw?.cropId || prevRaw?.stage || "fallow") : prevRaw;
    if (prevCrop === plannedCrop) start--;
    else break;
  }

  const day = (Date.UTC(year, mIdx, 15) - Date.UTC(year, start, 1)) / 86400000;
  const durList = crop?.durationDays;
  const duration = (Array.isArray(durList) && durList.length > 0)
    ? durList.reduce((a, b) => a + b, 0) / durList.length
    : 90;
  const stageFraction = Math.min(1, Math.max(0, day / duration));
  const stage = stageFraction < 0.15 ? "establish" : stageFraction < 0.65 ? "grow" : stageFraction < 0.9 ? "mature" : "harvest";

  return {
    cropId,
    stage: (typeof raw === "object" && raw?.stage) ? raw.stage : stage,
    stageFraction,
    cropName: (typeof raw === "object" && raw?.cropName) ? raw.cropName : (crop?.label ?? cropId),
    cropNameBn: (typeof raw === "object" && raw?.cropNameBn) ? raw.cropNameBn : (crop?.bn ?? cropId),
  };
}

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



// Subdivide the triangulated outline once; terrain and water use these same cells.
export function surfaceGridPositions(ring, triangles, heightAt, subdivisions = 28) {
  const positions = [];
  for (const ids of triangles) {
    const [a, b, c] = ids.map((i) => ring[i]);
    const point = (i, j) => {
      const x = a[0] + ((b[0] - a[0]) * i + (c[0] - a[0]) * j) / subdivisions;
      const y = a[1] + ((b[1] - a[1]) * i + (c[1] - a[1]) * j) / subdivisions;
      return [x, heightAt(x, -y), -y];
    };
    for (let i = 0; i < subdivisions; i++) {
      for (let j = 0; j < subdivisions - i; j++) {
        positions.push(...point(i, j), ...point(i + 1, j), ...point(i, j + 1));
        if (i + j < subdivisions - 1) {
          positions.push(...point(i + 1, j), ...point(i + 1, j + 1), ...point(i, j + 1));
        }
      }
    }
  }
  return positions;
}

// Sample the actual UTM radar grid, never the field bounding box or field_mask.
export function sampleS1Water(site, observation, lon, lat) {
  if (!site?.transform || site.epsg !== 32645 || !observation?.water) return null;
  const [x, y] = projectWgs84ToUtm45N(lon, lat);
  const [dx, , west, , dy, north] = site.transform;
  const value = observation.water[Math.floor((y - north) / dy)]?.[Math.floor((x - west) / dx)];
  return value === 0 || value === 1 ? value : null;
}

// Clip each terrain triangle at the scenario fill level, then drape wet cells
// just above that same triangle. Interpolated shoreline vertices cannot cross its edges.
export function pondingPositions(surface, {
  rainMm = 0, exaggeration = 1, lowGround = false,
  proposedDrain = false, outletBlocked = false, waterMaskAt = () => null,
} = {}) {
  if (!(rainMm > 0) || !surface.length) return [];
  let min = Infinity;
  for (let i = 1; i < surface.length; i += 3) min = Math.min(min, surface[i]);
  const scale = Math.max(0.01, exaggeration);
  const factor = proposedDrain && !outletBlocked ? 0.45 : outletBlocked ? 1.3 : 1;
  const fill = min + rainMm / 1000 * factor * (lowGround ? 1.3 : 1) * scale;
  const positions = [];
  for (let i = 0; i < surface.length; i += 9) {
    const triangle = [0, 3, 6].map((j) => Array.from(surface.slice(i + j, i + j + 3)));
    const x = triangle.reduce((sum, p) => sum + p[0], 0) / 3;
    const z = triangle.reduce((sum, p) => sum + p[2], 0) / 3;
    // Radar supplies water presence, not depth. Its contribution remains a rain scenario.
    const level = fill + (waterMaskAt(x, z) === 1 ? 0.15 * Math.min(1, rainMm / 45) * scale * factor : 0);
    const clipped = [];
    triangle.forEach((a, j) => {
      const b = triangle[(j + 1) % 3];
      if (a[1] < level) clipped.push(a);
      if ((a[1] < level) !== (b[1] < level)) {
        const t = (level - a[1]) / (b[1] - a[1]);
        clipped.push(a.map((v, k) => v + (b[k] - v) * t));
      }
    });
    for (let j = 1; j < clipped.length - 1; j++) {
      for (const [px, h, pz] of [clipped[0], clipped[j], clipped[j + 1]]) {
        positions.push(px, h + 0.02, pz);
      }
    }
  }
  return positions;
}

// Keep the longest continuous section of the transect inside the visible field.
export function transectEndpoints(ring, bounds = outlineBounds(ring)) {
  if (ring.length < 3) return [];
  const a = [bounds.minX + 0.12 * bounds.width, bounds.minY + 0.26 * bounds.height];
  const d = [0.80 * bounds.width, 0.48 * bounds.height];
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  const ts = [0, 1];
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length];
    const edge = [q[0] - p[0], q[1] - p[1]];
    const delta = [p[0] - a[0], p[1] - a[1]];
    const den = cross(d, edge);
    if (Math.abs(den) < 1e-10) return;
    const t = cross(delta, edge) / den, u = cross(delta, d) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  });
  ts.sort((a, b) => a - b);
  const point = (t) => [a[0] + d[0] * t, a[1] + d[1] * t];
  let best = [];
  let length = 0;
  for (let i = 1; i < ts.length; i++) {
    const span = ts[i] - ts[i - 1];
    if (span > length && pointInPolygon(...point((ts[i] + ts[i - 1]) / 2), ring)) {
      length = span;
      best = [point(ts[i - 1]), point(ts[i])];
    }
  }
  return best;
}

// A horizontal table inherits the exact terrain footprint, including the cutaway.
export function waterTablePositions(surface, level, bottomY, topMin) {
  if (!(level > bottomY && level < topMin)) return [];
  return Array.from(surface, (value, i) => i % 3 === 1 ? level : value);
}

// ------------------------------------------------------------------ STUDIO5K helpers

/**
 * Determine USDA soil texture class from sand, silt, and clay percentages.
 */
export function usdaTextureClass(clay, sand, silt) {
  const sum = clay + sand + silt;
  if (!Number.isFinite(sum) || sum <= 0) return 'loam';
  const c = (clay * 100) / sum;
  const sa = (sand * 100) / sum;
  const si = (silt * 100) / sum;

  if (si + 1.5 * c < 15) return 'sand';
  if (si + 2 * c < 30) return 'loamy sand';
  if ((c < 20 && sa > 52) || (c < 7 && si < 50)) return 'sandy loam';
  if (c < 27 && 28 <= si && si < 50 && sa <= 52) return 'loam';
  if (si >= 80 && c < 12) return 'silt';
  if (si >= 50 && c < 27) return 'silt loam';
  if (20 <= c && c < 35 && si < 28 && sa > 45) return 'sandy clay loam';
  if (27 <= c && c < 40 && 20 < sa && sa <= 45) return 'clay loam';
  if (27 <= c && c < 40 && sa <= 20) return 'silty clay loam';
  if (c >= 35 && sa > 45) return 'sandy clay';
  if (c >= 40 && si >= 40) return 'silty clay';
  return 'clay';
}

/**
 * Calculate auto vertical exaggeration targeting ~0.25 * block width of relief.
 */
export function computeAutoExaggeration(reliefM, blockWidthM, minExag = 1.0, maxExag = 4.5) {
  if (!Number.isFinite(reliefM) || reliefM <= 0.05 || !Number.isFinite(blockWidthM) || blockWidthM <= 0) {
    return 1.0;
  }
  const targetExag = (0.25 * blockWidthM) / reliefM;
  // Snap to nearest 0.25 step within [minExag, maxExag]
  const stepped = Math.round(targetExag * 4) / 4;
  return Math.max(minExag, Math.min(maxExag, stepped));
}

/**
 * Format callout data for the 3 stratigraphic bands:
 * Band 1: 0–15 cm · TOPSOIL
 * Band 2: 15–60 cm · ROOT ZONE
 * Band 3: >120 cm · SUBSOIL & WATER TABLE
 */
export function buildCalloutData({ data, monthIdx = 0, soilOverrides = null, t = (en) => en }) {
  if (!data) return null;
  const month = data.months?.[monthIdx] || data.months?.[0] || {};
  const layers = data.soil?.layers || [];

  // Band 1: 0-15 cm Topsoil
  const topLayer = layers[0] || {};
  const texture = (topLayer.clayPct != null && topLayer.sandPct != null && topLayer.siltPct != null)
    ? usdaTextureClass(topLayer.clayPct, topLayer.sandPct, topLayer.siltPct)
    : (topLayer.textureClass || 'clay loam');
  
  // Format texture nicely (capitalize words)
  const textureTitle = texture.replace(/\b\w/g, (c) => c.toUpperCase());
  const ph = topLayer.ph != null ? Number(topLayer.ph).toFixed(1) : (soilOverrides?.ph != null ? Number(soilOverrides.ph).toFixed(1) : null);
  // Organic Matter (OM %) = SOC (g/kg) / 10 * 1.724 (van Bemmelen factor) or socGkg * 0.1724
  let omPct = null;
  if (topLayer.socGkg != null) {
    omPct = (topLayer.socGkg * 0.1724).toFixed(2);
  } else if (soilOverrides?.omPct != null) {
    omPct = Number(soilOverrides.omPct).toFixed(2);
  }

  const topsoilEyebrow = `0–15 cm · ${t("TOPSOIL", "উপরের মাটি")}`;
  const topsoilValParts = [];
  if (soilOverrides) {
    topsoilValParts.push(t("Measured · by farmer", "মাপা · কৃষক কর্তৃক"));
  } else {
    topsoilValParts.push(textureTitle);
    if (ph != null) topsoilValParts.push(`pH ${ph}`);
    if (omPct != null) topsoilValParts.push(`OM ${omPct}%`);
  }
  const topsoilVal = topsoilValParts.join(" · ");
  const topsoilTruth = soilOverrides ? "FARMER_REPORTED" : "MODELED";
  const topsoilTruthLabel = soilOverrides ? "Soil test, Measured" : "SoilGrids, Estimated";

  // Band 2: 15-60 cm Root Zone
  // POWER GWETROOT for the selected month (fallback to month.rootWetness or month.wetness)
  const rootWetness = month.rootWetness != null ? Number(month.rootWetness).toFixed(2) : (month.wetness != null ? Number(month.wetness).toFixed(2) : "0.50");
  const isFallow = month.stage === "fallow" || month.cropId === "fallow" || month.cropName === "Fallow" || (!month.cropId && !month.cropName);
  let cropName = t(month.cropName || "Crop", month.cropNameBn || "ফসল");

  if (isFallow) {
    let prevCrop = null;
    const months = data.months || [];
    for (let step = 1; step <= 12; step++) {
      const idx = ((monthIdx - step) % 12 + 12) % 12;
      const m = months[idx];
      if (m && m.cropId && m.stage !== "fallow" && m.cropName !== "Fallow") {
        prevCrop = m;
        break;
      }
    }
    const prevName = prevCrop ? t(prevCrop.cropName || prevCrop.cropId, prevCrop.cropNameBn || prevCrop.cropName || prevCrop.cropId) : null;
    cropName = prevName
      ? t(`Fallow · residue of ${prevName}`, `পতিত · ${prevName}-এর অবশেষ`)
      : t("Fallow", "পতিত");
  }

  const rootDepthM = month.rootDepthM != null ? `${Number(month.rootDepthM).toFixed(1)} m` : null;

  const rootzoneEyebrow = `15–60 cm · ${t("ROOT ZONE", "শিকড় অঞ্চল")}`;
  const rootzoneVal = isFallow
    ? `GWETROOT ${rootWetness} · ${cropName}`
    : `GWETROOT ${rootWetness} · ${cropName}${rootDepthM ? ` (${rootDepthM})` : ""}`;
  const rootzoneTruth = "MODELED";
  const rootzoneTruthLabel = "NASA POWER · Agronomy, Estimated";

  // Band 3: >120 cm Subsoil & Water Table
  const aquiferEyebrow = `>120 cm · ${t("SUBSOIL & WATER TABLE", "গভীর স্তর ও পানির স্তর")}`;
  const hasLocalGw = soilOverrides?.gwDepthM != null && Number(soilOverrides.gwDepthM) > 0;
  const aquiferVal = hasLocalGw
    ? `${Number(soilOverrides.gwDepthM).toFixed(1)} m (${t("Measured", "মাপা")})`
    : t("Well depth unknown (add local reading)", "কূপের গভীরতা অজানা (স্থানীয় তথ্য দিন)");
  const aquiferTruth = hasLocalGw ? "FARMER_REPORTED" : "UNKNOWN";
  const aquiferTruthLabel = hasLocalGw ? "Tubewell depth, Measured" : "Unknown — add local reading";

  return {
    topsoil: {
      eyebrow: topsoilEyebrow,
      value: topsoilVal,
      truth: topsoilTruth,
      truthLabel: topsoilTruthLabel,
      texture,
      ph,
      omPct,
    },
    rootzone: {
      eyebrow: rootzoneEyebrow,
      value: rootzoneVal,
      truth: rootzoneTruth,
      truthLabel: rootzoneTruthLabel,
      gwetroot: rootWetness,
      cropName,
      rootDepthM,
    },
    aquifer: {
      eyebrow: aquiferEyebrow,
      value: aquiferVal,
      truth: aquiferTruth,
      truthLabel: aquiferTruthLabel,
      isButton: !hasLocalGw,
      gwDepthM: hasLocalGw ? soilOverrides.gwDepthM : null,
    },
  };
}

/**
 * Layout callout labels in a vertical column without overlapping,
 * sorted by depth order and separated by minGap.
 * Clamped within [topPadding, containerHeight - bottomPadding].
 */
export function deoverlapLabels(items, containerHeight, minGap = 8, topPadding = 16, bottomPadding = 16) {
  if (!items || items.length === 0) return [];
  const res = items
    .map((it) => ({
      ...it,
      height: it.height || 36,
      y: (it.anchorY != null ? it.anchorY : 0) - (it.height || 36) / 2,
    }))
    .sort((a, b) => (a.order ?? a.anchorY ?? 0) - (b.order ?? b.anchorY ?? 0));

  for (let i = 0; i < res.length; i++) {
    if (i === 0) {
      res[i].y = Math.max(topPadding, res[i].y);
    } else {
      const prevBottom = res[i - 1].y + res[i - 1].height;
      if (res[i].y < prevBottom + minGap) {
        res[i].y = prevBottom + minGap;
      }
    }
  }

  const maxAllowedBottom = containerHeight - bottomPadding;
  const last = res[res.length - 1];
  if (last.y + last.height > maxAllowedBottom) {
    last.y = maxAllowedBottom - last.height;
    for (let i = res.length - 2; i >= 0; i--) {
      const nextTop = res[i + 1].y;
      if (res[i].y + res[i].height > nextTop - minGap) {
        res[i].y = nextTop - minGap - res[i].height;
      }
    }
    if (res[0].y < topPadding) {
      res[0].y = topPadding;
      for (let i = 1; i < res.length; i++) {
        const prevBottom = res[i - 1].y + res[i - 1].height;
        if (res[i].y < prevBottom + minGap) {
          res[i].y = prevBottom + minGap;
        }
      }
    }
  }
  return res;
}

// ------------------------------------------------------------- STUDIO5M intro animation helpers

export function easeOutCubic(t) {
  const p = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
  return 1 - Math.pow(1 - p, 3);
}

export function introCameraParams({
  progress,
  finalDistance,
  finalTarget,
  finalElevationDeg = 14,
  finalYawDeg = 10,
  swingDeg = 80,
  heightMult = 1.6,
  distMult = 1.35,
}) {
  const p = easeOutCubic(progress);
  const startEl = finalElevationDeg * heightMult;
  const startYaw = finalYawDeg + swingDeg;
  const startDist = finalDistance * distMult;

  const currentElevationDeg = startEl + (finalElevationDeg - startEl) * p;
  const currentYawDeg = startYaw + (finalYawDeg - startYaw) * p;
  const currentDistance = startDist + (finalDistance - startDist) * p;

  const elRad = (currentElevationDeg * Math.PI) / 180;
  const yawRad = (currentYawDeg * Math.PI) / 180;

  const target = [finalTarget[0], finalTarget[1], finalTarget[2]];
  const position = [
    target[0] + Math.cos(elRad) * Math.sin(yawRad) * currentDistance,
    target[1] + Math.sin(elRad) * currentDistance,
    target[2] + Math.cos(elRad) * Math.cos(yawRad) * currentDistance,
  ];

  return {
    position,
    target,
    distance: currentDistance,
    elevationDeg: currentElevationDeg,
    yawDeg: currentYawDeg,
  };
}

export function shouldSkipIntro({ prefersReducedMotion = false, isHidden = false, hasPlayed = false } = {}) {
  return Boolean(prefersReducedMotion || isHidden || hasPlayed);
}

export function sampleRowCropScale(t, rowProgress = 0, startT = 0.6, endT = 2.2) {
  if (t <= startT) return 0;
  if (t >= endT) return 1;
  const duration = endT - startT;
  // Stagger start by row progress across first ~40% of duration
  const rowStart = startT + rowProgress * (duration * 0.4);
  const rowEnd = rowStart + (duration * 0.6);
  if (t <= rowStart) return 0;
  if (t >= rowEnd) return 1;
  return easeOutCubic((t - rowStart) / (rowEnd - rowStart));
}


