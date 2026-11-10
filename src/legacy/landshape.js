/**
 * landshape.js - Pure geometry and relief algorithms for realistic 3D land parcels.
 *
 * Implements:
 * 1. Outline corner softening (Chaikin / quadratic Catmull-Rom pass with <= 1.5 m deviation).
 * 2. Deterministic micro-relief generator seeded by field ID (<= 10 cm noise, bund ridge, drain swale).
 * 3. Irregular eroded rim noise and wavy strata calculation.
 * 4. Organic tapering "floating island" underside mesh generation seeded by field ID.
 * 5. Ray-distance to polygon boundary and vertex hashing for stability & variety verification.
 *
 * Independent pure module: NO Three.js or DOM imports so it can run anywhere.
 */

/**
 * 32-bit FNV-1a hash of a field string ID.
 * @param {string} fieldId
 * @returns {number} unsigned 32-bit integer
 */
export function fieldIdSeed(fieldId) {
  let hash = 2166136261;
  const str = String(fieldId || "default");
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Deterministic pseudo-random float in [0, 1) based on a seed and step index.
 * @param {number} seed
 * @param {number} index
 * @returns {number}
 */
export function seededRandom(seed, index) {
  const s = Math.sin((seed + index) * 12.9898 + (seed ^ index) * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Softens sharp polygon corners with a quadratic rounding pass while keeping
 * maximum deviation from the real boundary strictly within maxDeviationM (<= 1.5 m).
 * Preserves the true farmer-drawn or traced boundary outline.
 *
 * @param {Array<[number, number]>} ringM - 2D points in metres [[x, y], ...]
 * @param {number} [maxDeviationM=1.5] - maximum allowable corner cut in metres
 * @returns {Array<[number, number]>} smoothed polygon ring
 */
export function smoothOutline(ringM, maxDeviationM = 1.5) {
  if (!Array.isArray(ringM) || ringM.length < 3) {
    return Array.isArray(ringM) ? ringM.map(([x, y]) => [x, y]) : [];
  }
  const n = ringM.length;
  const result = [];
  const maxDev = Math.max(0.1, Math.min(1.5, maxDeviationM));

  for (let i = 0; i < n; i++) {
    const prev = ringM[(i - 1 + n) % n];
    const curr = ringM[i];
    const next = ringM[(i + 1) % n];

    const d0x = prev[0] - curr[0];
    const d0y = prev[1] - curr[1];
    const d1x = next[0] - curr[0];
    const d1y = next[1] - curr[1];
    const len0 = Math.hypot(d0x, d0y);
    const len1 = Math.hypot(d1x, d1y);

    if (len0 < 1e-4 || len1 < 1e-4) {
      result.push([curr[0], curr[1]]);
      continue;
    }

    const u0x = d0x / len0;
    const u0y = d0y / len0;
    const u1x = d1x / len1;
    const u1y = d1y / len1;
    const dot = Math.max(-1, Math.min(1, u0x * u1x + u0y * u1y));
    const angle = Math.acos(dot); // interior corner angle

    // If nearly colinear or a degenerate spike, keep original vertex
    if (angle > 3.05 || angle < 0.1) {
      result.push([curr[0], curr[1]]);
      continue;
    }

    const cosHalf = Math.cos(angle / 2);
    const maxCutLen = Math.min(len0, len1) * 0.25;
    const cut = cosHalf > 1e-3
      ? Math.min(maxDev / cosHalf, maxCutLen, 2.5)
      : Math.min(maxCutLen, 1.0);

    const pA = [curr[0] + u0x * cut, curr[1] + u0y * cut];
    const pB = [curr[0] + u1x * cut, curr[1] + u1y * cut];

    // Quadratic bezier curve from pA to pB with control point curr
    const steps = 3;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const omt = 1 - t;
      const x = omt * omt * pA[0] + 2 * omt * t * curr[0] + t * t * pB[0];
      const y = omt * omt * pA[1] + 2 * omt * t * curr[1] + t * t * pB[1];
      result.push([x, y]);
    }
  }

  // Deduplicate adjacent points that are extremely close
  const deduplicated = [];
  for (let i = 0; i < result.length; i++) {
    const pt = result[i];
    const last = deduplicated[deduplicated.length - 1];
    if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 0.05) {
      deduplicated.push(pt);
    }
  }
  return deduplicated.length >= 3 ? deduplicated : ringM.map(([x, y]) => [x, y]);
}

/**
 * Computes deterministic micro-relief elevation offset (in metres) for point (x, z).
 * Includes:
 * - Subtle noise seeded by fieldId (<= 10 cm, i.e. <= 0.10 m).
 * - Bund ridge along field boundary (~20-30 cm high at edge, fading within 1.5 m).
 * - Field drain swale where water collects (low-ground).
 *
 * @param {Object} params
 * @param {number} params.x - local X in metres
 * @param {number} params.z - local Z in metres (where world z = -local y)
 * @param {string} params.fieldId - field identifier
 * @param {Array<[number, number]>} params.outlineM - polygon ring in metres [[x, y], ...]
 * @param {boolean} [params.isLowGround=false] - whether site is classified low ground
 * @param {number} [params.maxNoiseM=0.08] - maximum deterministic noise amplitude (<= 0.10m)
 * @returns {number} elevation delta in metres
 */
export function computeMicroRelief({
  x,
  z,
  fieldId = "pilot",
  outlineM = [],
  isLowGround = false,
  maxNoiseM = 0.08,
}) {
  const seed = fieldIdSeed(fieldId);
  const localY = -z;
  const dist = outlineM.length >= 3 ? distToPolygonEdge(x, localY, outlineM) : Infinity;

  // 1. Subtle smooth deterministic continuous noise (amplitude <= maxNoiseM, default 0.08 m <= 0.10 m)
  const freq1 = 0.07;
  const freq2 = 0.15;
  const phase1 = (seed % 100) * 0.1;
  const phase2 = ((seed >> 4) % 100) * 0.1;
  const noise = (
    Math.sin(x * freq1 + phase1) * Math.cos(localY * freq1 + phase2) * 0.65 +
    Math.sin(x * freq2 - localY * freq2 + phase1 * 0.5) * 0.35
  ) * maxNoiseM;

  // 2. Bund ridge (~20-30 cm = 0.20-0.30 m) along boundary within 1.5 m
  let bund = 0;
  if (dist < 1.6) {
    // Peak at ~0.35m inside the boundary, fading to 0 at edge and interior
    const bundWidth = 1.4;
    const bundPeak = 0.35;
    if (dist <= bundWidth) {
      const peakRel = dist < bundPeak ? dist / bundPeak : (bundWidth - dist) / (bundWidth - bundPeak);
      bund = Math.max(0, Math.sin(peakRel * (Math.PI / 2))) * 0.24; // 24 cm ridge
    }
  }

  // 3. Field drain swale where water collects in low-ground: slight dip (-10 cm to -15 cm)
  let drain = 0;
  if (isLowGround && dist > 1.8) {
    // Low-ground fields collect water toward the lowest natural swale
    const swale = Math.sin((x * 0.08) + phase1) * Math.cos((localY * 0.08) + phase2);
    drain = -0.12 * Math.max(0, 0.4 + 0.6 * swale);
  }

  return noise + bund + drain;
}

/**
 * Irregular eroded rim noise (horizontal & vertical displacement) for wall top.
 * Deterministic per field ID and edge position.
 *
 * @param {string} fieldId
 * @param {number} edgeIndex
 * @param {number} stepFraction - 0 to 1 along edge
 * @returns {{ dh: number, crumble: number }} dh: height delta, crumble: slight overhang/inward shift
 */
export function rimErosionNoise(fieldId, edgeIndex, stepFraction) {
  const seed = fieldIdSeed(fieldId);
  const u = edgeIndex + stepFraction;
  const dh = (
    Math.sin(u * 5.2 + (seed % 31)) * 0.04 +
    Math.sin(u * 12.1 + (seed % 17)) * 0.025
  );
  const crumble = (
    Math.sin(u * 3.8 + (seed % 13)) * 0.08 +
    Math.cos(u * 8.4 + (seed % 29)) * 0.04
  );
  return { dh, crumble };
}

/**
 * Calculates shortest distance from point (x, y) to polygon edge.
 * @param {number} x
 * @param {number} y
 * @param {Array<[number, number]>} poly
 * @returns {number}
 */
export function distToPolygonEdge(x, y, poly) {
  if (!poly || poly.length < 2) return Infinity;
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let d;
    if (lenSq === 0) {
      d = Math.hypot(x - ax, y - ay);
    } else {
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq));
      const px = ax + t * dx;
      const py = ay + t * dy;
      d = Math.hypot(x - px, y - py);
    }
    if (d < min) min = d;
  }
  return min;
}

/**
 * Computes ray intersection distance from interior centre (cx, cy) along angle.
 * @param {number} cx
 * @param {number} cy
 * @param {number} angle
 * @param {Array<[number, number]>} poly
 * @returns {number}
 */
export function rayBoundaryDistance(cx, cy, angle, poly) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  let minDist = Infinity;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % n];
    const v1x = cx - x1;
    const v1y = cy - y1;
    const v2x = x2 - x1;
    const v2y = y2 - y1;
    const denom = v2y * dx - v2x * dy;
    if (Math.abs(denom) < 1e-6) continue;
    const t1 = (v2x * v1y - v2y * v1x) / denom;
    const t2 = (dx * v1y - dy * v1x) / denom;
    if (t1 >= 1e-5 && t2 >= -1e-5 && t2 <= 1 + 1e-5) {
      if (t1 < minDist) minDist = t1;
    }
  }
  return Number.isFinite(minDist) ? minDist : 10;
}

/**
 * Generates an organic tapering "floating island" underside base mesh.
 * Lobed, uneven, rocky/root-textured keel tapering to a natural apex,
 * seeded by fieldId so each field silhouette differs stably.
 *
 * @param {Object} params
 * @param {Array<[number, number]>} params.ringM - wall bottom ring
 * @param {number} params.bottomY - Y level of wall bottom
 * @param {number} params.depthM - depth scale of parcel
 * @param {string} [params.fieldId="pilot"] - field ID
 * @param {number} [params.numAngles=36] - angular radial sectors
 * @param {number} [params.numRings=8] - concentric rings from apex to rim
 * @returns {{ positions: number[], uvs: number[], indices: number[] }}
 */
export function generateUndersideGeometry({
  ringM,
  bottomY,
  depthM,
  fieldId = "pilot",
  numAngles = 36,
  numRings = 8,
}) {
  if (!ringM || ringM.length < 3) {
    return { positions: [], uvs: [], indices: [] };
  }

  let cx = 0;
  let cy = 0;
  for (const [x, y] of ringM) {
    cx += x;
    cy += y;
  }
  cx /= ringM.length;
  cy /= ringM.length;

  const seed = fieldIdSeed(fieldId);
  const taperDepth = depthM * (0.75 + seededRandom(seed, 1) * 0.5);
  const apexY = bottomY - taperDepth;

  // Lobing parameters unique to fieldId
  const lobeCount = 3 + (seed % 4); // 3 to 6 lobes
  const lobeAmp = 0.12 + seededRandom(seed, 2) * 0.15;
  const lobePhase = seededRandom(seed, 3) * Math.PI * 2;
  const subLobeCount = lobeCount * 2 + 1;
  const subLobeAmp = 0.04 + seededRandom(seed, 4) * 0.05;

  const positions = [];
  const uvs = [];
  const indices = [];

  // Apex vertex (index 0)
  const apexRough = (seededRandom(seed, 5) - 0.5) * 0.08 * depthM;
  positions.push(cx, apexY + apexRough, -cy);
  uvs.push(0.5, 0.5);

  for (let r = 1; r <= numRings; r++) {
    const frac = r / numRings; // 0 near apex, 1 at wall bottom
    const curY = apexY + (bottomY - apexY) * frac;
    // Curved bowl/keel profile: easing from apex to wall
    const profileRad = Math.sin((frac * Math.PI) / 2);

    for (let a = 0; a < numAngles; a++) {
      const angle = (a / numAngles) * Math.PI * 2;
      const baseDist = rayBoundaryDistance(cx, cy, angle, ringM);

      // Lobing modulation: fades to 0 at wall rim (frac = 1) so it attaches seamlessly
      const fade = 1 - frac;
      const lobeMod = 1 + (
        Math.sin(angle * lobeCount + lobePhase) * lobeAmp +
        Math.sin(angle * subLobeCount) * subLobeAmp
      ) * fade;

      // Rocky texture noise (fades at wall rim)
      const rockNoise = (seededRandom(seed + a * 13, r * 17) - 0.5) * 0.07 * depthM * fade;

      const rad = baseDist * profileRad * Math.max(0.05, lobeMod);
      const px = cx + Math.cos(angle) * rad;
      const py = cy + Math.sin(angle) * rad;
      const pz = -py;
      const vy = (r === numRings) ? bottomY : (curY + rockNoise);

      positions.push(px, vy, pz);
      uvs.push((px - cx) / Math.max(1, depthM * 3) + 0.5, (pz + cy) / Math.max(1, depthM * 3) + 0.5);
    }
  }

  // Connect apex to ring 1
  for (let a = 0; a < numAngles; a++) {
    const nextA = (a + 1) % numAngles;
    indices.push(0, 1 + a, 1 + nextA);
  }

  // Connect intermediate rings (downward facing normals)
  for (let r = 1; r < numRings; r++) {
    const r0 = 1 + (r - 1) * numAngles;
    const r1 = 1 + r * numAngles;
    for (let a = 0; a < numAngles; a++) {
      const nextA = (a + 1) % numAngles;
      const a0 = r0 + a;
      const a1 = r0 + nextA;
      const b0 = r1 + a;
      const b1 = r1 + nextA;
      indices.push(a0, b0, a1);
      indices.push(a1, b0, b1);
    }
  }

  return { positions, uvs, indices };
}

/**
 * Hashes an array of 3D vertex positions to a 32-bit integer for stability tests.
 * @param {Array<number>} positions
 * @returns {number}
 */
export function hashVertexPositions(positions) {
  let h = 0;
  for (let i = 0; i < positions.length; i++) {
    const v = Math.round(positions[i] * 1000);
    h = (h * 31 + v) | 0;
  }
  return h;
}
