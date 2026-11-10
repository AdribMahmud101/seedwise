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

// Colour and area accounting share these classes; null never becomes a measurement.
export function surfaceClass(legend, value) {
  return legend.classes.find((c) => Number.isFinite(value) && !c.unknown &&
    value >= c.from && (value < c.to || (c.includeTo && value === c.to))) || legend.classes.at(-1);
}

export function cropSurfaceValue(month) {
  if (!month?.cropId || month.cropId === 'fallow' || month.stage === 'fallow') return 3;
  return month.stage === 'establish' ? 0 : ['mature', 'harvest'].includes(month.stage) ? 2 : 1;
}

export function cropStageColor(cropId, stage) {
  if (stage === 'fallow') return '#8f7352';
  if (stage === 'harvest') return cropId === 'potato' ? '#b89a66' : '#c8b273';
  if (stage === 'mature') {
    if (cropId === 'mustard') return '#e8c93a';
    if (cropId === 'potato') return '#4d6b30';
    return '#cfa44e';
  }
  if (stage === 'establish') return '#a8d47a';
  if (cropId === 'potato') return '#3f6e30'; // potato bushy dark green
  if (cropId === 'mustard') return '#b5c938'; // mustard yellow-green
  if (cropId === 'mungbean') return '#5fa044';
  return '#387c32'; // rice green
}

// Equal-area raster cells, counted only when their centres fall inside the field.
export function surfaceCells(outline, sampleAt, resolution = 128) {
  if (!outline?.length || !(resolution > 0)) return [];
  const b = outlineBounds(outline);
  if (!(b.width > 0 && b.height > 0)) return [];
  const cells = [];
  const area = b.width * b.height / resolution ** 2;
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const x = b.minX + (col + 0.5) / resolution * b.width;
      const y = b.maxY - (row + 0.5) / resolution * b.height;
      if (pointInPolygon(x, y, outline)) cells.push({ x, y, row, col, area, value: sampleAt(x, y) });
    }
  }
  return cells;
}

// D8 uses the steepest physical descent. A priority flood supplies spill routes across flats and pits.
export function fieldFlow(outline, heightAt, resolution = 48) {
  const bounds = outlineBounds(outline);
  const cells = surfaceCells(outline, heightAt, resolution).map((c) => ({ ...c, elevation: c.value }));
  const index = new Map(cells.map((c, i) => [`${c.row},${c.col}`, i]));
  const neighbors = cells.map((c) => {
    const result = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (dr || dc) {
        const next = index.get(`${c.row + dr},${c.col + dc}`);
        if (next !== undefined && pointInPolygon((c.x + cells[next].x) / 2, (c.y + cells[next].y) / 2, outline)) result.push(next);
      }
    }
    return result;
  });
  if (!cells.length || cells.some((c) => !Number.isFinite(c.elevation))) return null;
  const boundary = cells.map((_, i) => i).filter((i) => neighbors[i].length < 8);
  const outlet = boundary.reduce((a, b) => cells[b].elevation < cells[a].elevation ? b : a, boundary[0]);
  const filled = cells.map(() => Infinity), parent = cells.map(() => -1), order = [], pending = [outlet];
  filled[outlet] = cells[outlet].elevation;
  while (pending.length) {
    let best = 0;
    for (let j = 1; j < pending.length; j++) if (filled[pending[j]] < filled[pending[best]]) best = j;
    const i = pending.splice(best, 1)[0];
    order.push(i);
    for (const j of neighbors[i]) if (filled[j] === Infinity) {
      filled[j] = Math.max(filled[i], cells[j].elevation);
      parent[j] = i;
      pending.push(j);
    }
  }
  if (order.length !== cells.length) return null;
  const rank = new Map(order.map((i, r) => [i, r]));
  const spillDirection = cells.map((c, i) => {
    let next = parent[i], slope = 0;
    for (const j of neighbors[i]) {
      const descent = (filled[i] - filled[j]) / Math.hypot(c.x - cells[j].x, c.y - cells[j].y);
      if (descent > slope && rank.get(j) < rank.get(i)) { slope = descent; next = j; }
    }
    return next;
  });
  const direction = cells.map((c, i) => {
    let next = -1, slope = 0;
    for (const j of neighbors[i]) {
      const descent = (c.elevation - cells[j].elevation) / Math.hypot(c.x - cells[j].x, c.y - cells[j].y);
      if (descent > slope) { slope = descent; next = j; }
    }
    // Flat ties follow the spill tree; a true pit remains a D8 sink until it fills.
    if (next < 0 && parent[i] >= 0 && cells[parent[i]].elevation === c.elevation) next = parent[i];
    return next;
  });
  const accumulation = cells.map(() => 1);
  const downhill = cells.map((_, i) => i).sort((a, b) => cells[b].elevation - cells[a].elevation || rank.get(b) - rank.get(a));
  for (const i of downhill) if (direction[i] >= 0) accumulation[direction[i]] += accumulation[i];
  const at = (x, y) => index.get(`${Math.floor((bounds.maxY - y) / bounds.height * resolution)},${Math.floor((x - bounds.minX) / bounds.width * resolution)}`);
  return { cells, neighbors, direction, spillDirection, accumulation, filled, order, outlet, at, bounds, resolution, index };
}

// Rain is a retained-runoff scenario, without a drainage time step or inferred radar depths.
export function fillAndSpill(flow, rainMm, { areaM2, runoffCoefficient = 0.5, drainFraction = 0 } = {}) {
  if (!flow) return null;
  const { cells, filled, spillDirection: direction, order } = flow;
  const totalArea = areaM2 ?? cells.reduce((sum, c) => sum + c.area, 0);
  const cellArea = totalArea / cells.length;
  const inputM3 = Math.max(0, rainMm) / 1000 * totalArea * runoffCoefficient;
  const drainedM3 = inputM3 * drainFraction;
  const volume = cells.map(() => (inputM3 - drainedM3) / cells.length);
  const depths = cells.map(() => 0);
  if (inputM3 === drainedM3) return { depths, inputM3, storedM3: 0, drainedM3, runoffCoefficient, depthAt: () => 0 };
  // Adjacent pit cells sharing a spill level form one reservoir.
  const groups = [], groupAt = cells.map(() => -1);
  for (const i of order) if (filled[i] > cells[i].elevation && groupAt[i] < 0) {
    const group = [], stack = [i], id = groups.length;
    groupAt[i] = id;
    while (stack.length) {
      const j = stack.pop(); group.push(j);
      for (const k of flow.neighbors[j]) if (groupAt[k] < 0 && filled[k] > cells[k].elevation && filled[k] === filled[i]) {
        groupAt[k] = id; stack.push(k);
      }
    }
    groups.push(group);
  }
  const store = (indices, amount, ceiling) => {
    let low = Math.min(...indices.map((i) => cells[i].elevation)), high = ceiling;
    const capacity = (level) => indices.reduce((sum, i) => sum + Math.max(depths[i], level - cells[i].elevation, 0) * cellArea, 0);
    const previous = indices.reduce((sum, i) => sum + depths[i] * cellArea, 0);
    const target = Math.min(capacity(ceiling), previous + amount);
    for (let step = 0; step < 52; step++) {
      const middle = (low + high) / 2;
      if (capacity(middle) < target) low = middle; else high = middle;
    }
    for (const i of indices) depths[i] = Math.max(depths[i], (low + high) / 2 - cells[i].elevation, 0);
    return Math.max(0, previous + amount - target);
  };
  let cornerVolume = 0;
  for (const i of [...order].reverse()) {
    const id = groupAt[i];
    if (id >= 0) {
      const group = groups[id];
      // Process after every upstream member has delivered its runoff.
      if (i !== group[0]) continue;
      const incoming = group.reduce((sum, j) => sum + volume[j], 0);
      const excess = store(group, incoming, filled[i]);
      const exit = group.map((j) => direction[j]).find((j) => j < 0 || groupAt[j] !== id);
      if (exit >= 0) volume[exit] += excess; else cornerVolume += excess;
    } else if (direction[i] >= 0) volume[direction[i]] += volume[i];
    else cornerVolume += volume[i];
  }
  // The corner pool cannot reach a depression behind a saddle until it reaches that spill height.
  let low = cells[flow.outlet].elevation;
  let high = Math.max(...cells.map((c) => c.elevation)) + inputM3 / totalArea;
  const extraCapacity = (level) => cells.reduce((sum, c, i) => sum +
    (filled[i] <= level ? Math.max(0, level - c.elevation - depths[i]) * cellArea : 0), 0);
  for (let step = 0; step < 52; step++) {
    const middle = (low + high) / 2;
    if (extraCapacity(middle) < cornerVolume) low = middle; else high = middle;
  }
  const connected = cells.map((_, i) => i).filter((i) => filled[i] < high - 1e-9);
  if (connected.length) cornerVolume = store(connected, cornerVolume, high);
  const entering = cells.map((_, i) => i).filter((i) => filled[i] >= high - 1e-9 && filled[i] <= high + 1e-9);
  if (entering.length) store(entering, cornerVolume, high);
  const storedM3 = depths.reduce((sum, d) => sum + d * cellArea, 0);
  const depthAt = (x, y) => {
    const col = (x - flow.bounds.minX) / flow.bounds.width * flow.resolution - 0.5;
    const row = (flow.bounds.maxY - y) / flow.bounds.height * flow.resolution - 0.5;
    const c = Math.floor(col), r = Math.floor(row), fx = col - c, fy = row - r;
    let sum = 0, weight = 0;
    for (const [dr, dc, w] of [[0, 0, (1 - fx) * (1 - fy)], [0, 1, fx * (1 - fy)], [1, 0, (1 - fx) * fy], [1, 1, fx * fy]]) {
      const i = flow.index.get(`${r + dr},${c + dc}`);
      if (i !== undefined) { sum += depths[i] * w; weight += w; }
    }
    return weight > 0 ? sum / weight : 0;
  };
  return { depths, inputM3, storedM3, drainedM3, runoffCoefficient, depthAt };
}

export function interpolateSoil(grid, lon, lat, property) {
  if (!grid || !Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  const gx = (lon - grid.west) / grid.stepLon, gy = (grid.north - lat) / grid.stepLat;
  if (gx < -1e-8 || gy < -1e-8 || gx > 2 + 1e-8 || gy > 2 + 1e-8) return null;
  const x = Math.max(0, Math.min(2, gx)), y = Math.max(0, Math.min(2, gy));
  const col = Math.min(1, Math.floor(x)), row = Math.min(1, Math.floor(y));
  const fx = x - col, fy = y - row;
  const values = [grid[property]?.[row]?.[col], grid[property]?.[row]?.[col + 1], grid[property]?.[row + 1]?.[col], grid[property]?.[row + 1]?.[col + 1]];
  if (!values.every(Number.isFinite)) return null;
  return values[0] * (1 - fx) * (1 - fy) + values[1] * fx * (1 - fy) + values[2] * (1 - fx) * fy + values[3] * fx * fy;
}

export function productivityZones(grids, outline, coordinates) {
  if (grids.length !== 2) return { cells: [], at: () => null, dates: [] };
  const grid = grids[0], [dx, , west, , dy, north] = grid.transform;
  // Count every intersecting 20 m pixel, including partial rim pixels whose centres lie outside the field.
  const fieldPixels = new Map();
  for (const sample of surfaceCells(outline, () => null)) {
    const [x, y] = projectWgs84ToUtm45N(...coordinates(sample.x, sample.y));
    const col = Math.floor((x - west) / dx), row = Math.floor((y - north) / dy);
    const key = `${row},${col}`;
    if (!fieldPixels.has(key)) {
      const cx = west + (col + 0.5) * dx, cy = north + (row + 0.5) * dy;
      const values = grids.map((g) => {
        const r = Math.floor((cy - g.transform[5]) / g.transform[4]), c = Math.floor((cx - g.transform[2]) / g.transform[0]);
        const value = g.values[r]?.[c];
        return Number.isFinite(value) && value >= -1 && value <= 1 ? value : null;
      });
      fieldPixels.set(key, { row, col, values, area: 0 });
    }
    fieldPixels.get(key).area += sample.area;
  }
  const cells = [...fieldPixels.values()];
  const ranges = grids.map((_, i) => {
    const values = cells.map((c) => c.values[i]).filter(Number.isFinite);
    return [Math.min(...values), Math.max(...values)];
  });
  for (const c of cells) c.score = c.values.every(Number.isFinite) ? c.values.reduce((sum, v, i) => {
    const [min, max] = ranges[i]; return sum + (max > min ? (v - min) / (max - min) : 0.5) / 2;
  }, 0) : null;
  const scores = cells.map((c) => c.score).filter(Number.isFinite).sort((a, b) => a - b);
  const quantile = (fraction) => {
    const position = (scores.length - 1) * fraction, i = Math.floor(position);
    return scores[i] + (scores[Math.ceil(position)] - scores[i]) * (position - i);
  };
  const low = quantile(1 / 3), high = quantile(2 / 3);
  const index = new Map(cells.map((c) => [`${c.row},${c.col}`, c]));
  for (const c of cells) c.raw = c.score === null ? null : low === high ? 1 : c.score < low ? 0 : c.score >= high ? 2 : 1;
  for (const c of cells) {
    if (c.raw === null) { c.value = null; continue; }
    const counts = [0, 0, 0];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const value = index.get(`${c.row + dr},${c.col + dc}`)?.raw;
      if (Number.isFinite(value)) counts[value]++;
    }
    const majority = Math.max(...counts);
    c.value = majority > counts.reduce((sum, n) => sum + n, 0) / 2 ? counts.indexOf(majority) : c.raw;
  }
  return { cells, dates: grids.map((g) => g.date), at: (lon, lat) => {
    const [x, y] = projectWgs84ToUtm45N(lon, lat);
    return index.get(`${Math.floor((y - north) / dy)},${Math.floor((x - west) / dx)}`)?.value ?? null;
  } };
}

// Depth uses the same fill level as the clipped ponding mesh, without invented radar depths.
export function pondingDepthCm(height, min, {
  rainMm = 0, exaggeration = 1, lowGround = false, proposedDrain = false,
  outletBlocked = false, waterMask = null,
} = {}) {
  if (!(rainMm > 0)) return 0;
  const scale = Math.max(0.01, exaggeration);
  const factor = proposedDrain && !outletBlocked ? 0.45 : outletBlocked ? 1.3 : 1;
  const fill = min + rainMm / 1000 * factor * (lowGround ? 1.3 : 1) * scale;
  const level = fill + (waterMask === 1 ? 0.15 * Math.min(1, rainMm / 45) * scale * factor : 0);
  return Math.max(0, (level - height) / scale * 100);
}

export function surfaceLegend(mode, data = {}) {
  const bn = data.lang === 'bn';
  const text = (en, local) => bn ? local : en;
  mode = ({ hypso: 'elevation', ponding: 'water', ndmi: 'moisture' })[mode] || mode;
  const month = data.month || {};
  const makeClass = (label, color, from, to, includeTo = false) => ({ label, color, from, to, includeTo, pct: 0 });
  let title, unit = '', classes, note, truth, source, date;
  date = data.observation?.date || data.date || text('Date unavailable', 'তারিখ পাওয়া যায়নি');
  if (mode === 'photo') {
    title = text('Satellite photo', 'স্যাটেলাইট ছবি');
    classes = [makeClass(text('True colour · unclassified', 'আসল রঙ · শ্রেণিবিহীন'), '#8f9d75', -Infinity, Infinity)];
    note = text('Image colours show visible land cover, not index or soil classes.', 'ছবির রঙ দৃশ্যমান ভূমি দেখায়; সূচক বা মাটির শ্রেণি নয়।');
    truth = 'REMOTE_OBSERVED';
    source = text('Prepared Sentinel / satellite image', 'প্রস্তুত Sentinel / স্যাটেলাইট ছবি');
  } else if (mode === 'ndvi' || mode === 'moisture') {
    const ndvi = mode === 'ndvi';
    title = ndvi ? text('Greenness (NDVI)', 'সবুজভাব (NDVI)') : text('Moisture (NDMI)', 'আর্দ্রতা (NDMI)');
    unit = ndvi ? 'NDVI' : 'NDMI';
    const breaks = ndvi ? [-Infinity, 0.2, 0.4, 0.6, 0.75, Infinity] : [-Infinity, 0, 0.2, 0.4, 0.6, Infinity];
    const labels = ndvi
      ? [text('Bare <0.2', 'খালি <0.2'), text('Sparse 0.2–0.4', 'অল্প 0.2–0.4'), text('Moderate 0.4–0.6', 'মাঝারি 0.4–0.6'), text('Dense 0.6–0.75', 'ঘন 0.6–0.75'), text('Very dense >0.75', 'অতি ঘন >0.75')]
      : [text('Dry <0', 'শুষ্ক <0'), text('Slightly moist 0–0.2', 'সামান্য আর্দ্র 0–0.2'), text('Moist 0.2–0.4', 'আর্দ্র 0.2–0.4'), text('Wet 0.4–0.6', 'ভেজা 0.4–0.6'), text('Very wet ≥0.6', 'অতি ভেজা ≥0.6')];
    const colors = ndvi ? ['#b88955', '#d4ce77', '#91bc64', '#438b42', '#155c32'] : ['#b67a42', '#d5bc77', '#8cbdac', '#419fba', '#1764a0'];
    classes = labels.map((label, i) => makeClass(label, colors[i], breaks[i], breaks[i + 1], ndvi && i === 3));
    note = text('Field area from Sentinel-2 cells; masked or missing cells are No data.', 'Sentinel-2 কোষ থেকে জমির অংশ; মেঘ বা অনুপস্থিত কোষে তথ্য নেই।');
    truth = data.observation ? 'REMOTE_OBSERVED' : 'UNKNOWN';
    source = 'Copernicus Sentinel-2 L2A · 20 m';
  } else if (mode === 'water') {
    title = text('Water flow & ponding', 'পানির প্রবাহ ও জমা পানি');
    unit = 'cm';
    classes = [
      makeClass(text('None · 0 cm', 'নেই · 0 সেমি'), '#8f7352', 0, 0, true),
      makeClass(text('<5 cm', '<5 সেমি'), '#1d6fe0', 0, 5),
      makeClass(text('5–15 cm', '5–15 সেমি'), '#185dc4', 5, 15),
      makeClass(text('15–30 cm', '15–30 সেমি'), '#124caa', 15, 30, true),
      makeClass(text('>30 cm', '>30 সেমি'), '#0b3d91', 30, Infinity),
    ];
    const radar = data.radarObservation;
    const radarLine = Number.isFinite(radar?.floodedPct)
      ? text(`Satellite (Sentinel-1) saw: ${radar.floodedPct.toFixed(1)} % flooded on ${radar.date}`, `স্যাটেলাইট (Sentinel-1) দেখেছে: ${radar.date} তারিখে ${radar.floodedPct.toFixed(1)} % প্লাবিত`)
      : text('Satellite (Sentinel-1): no observation available', 'স্যাটেলাইট (Sentinel-1): পর্যবেক্ষণ নেই');
    note = `${text('Rain scenario', 'বৃষ্টির পরিকল্পনা')}: ${data.rainMm ?? 0} mm × ${text('field area × runoff coefficient 0.5', 'জমির ক্ষেত্রফল × প্রবাহ সহগ 0.5')}. ${text('D8 fill-and-spill; runoff retained in depressions / low corner, no drainage time step. Wetness: log(flow accumulation).', 'নিচু অংশ ভরে উপচে নিচু কোণে সাময়িক প্রবাহ জমে; নিষ্কাশনের সময় গণনা নেই। ভেজাভাব log(প্রবাহ সঞ্চয়) অনুসারে।')} ${text('Proposed drain exports 55% of runoff when unblocked.', 'প্রস্তাবিত নালা খোলা থাকলে 55% প্রবাহ বের হয়।')} ${data.terrainAvailable === false ? text('Terrain unavailable; simulation has no data.', 'ভূমির তথ্য নেই; সিমুলেশনের তথ্য নেই।') : ''}`;
    truth = 'SCENARIO';
    source = text('Scenario (simulation) · NASADEM 30 m · D8 flow + rain volume', 'পরিকল্পনা (সিমুলেশন) · NASADEM ৩০ মি · D8 প্রবাহ ও বৃষ্টির পরিমাণ');
    date = month.month || date;
    data = { ...data, remote: radarLine, flowRows: [
      { label: text('Wet flow path · log accumulation', 'ভেজা প্রবাহপথ · log সঞ্চয়'), color: '#344d4b' },
      { label: text('Runoff line · downslope', 'প্রবাহ রেখা · ঢাল বরাবর'), color: '#249aff' },
    ] };
  } else if (mode === 'productivity') {
    title = text('Productivity zones', 'উৎপাদনশীলতার অঞ্চল');
    classes = [makeClass(text('Low', 'কম'), '#bd8150', 0, 1),
      makeClass(text('Medium', 'মাঝারি'), '#d3c966', 1, 2),
      makeClass(text('High', 'বেশি'), '#43865e', 2, 3)];
    note = text('Estimated · Sentinel-2 NDVI 2 dates · proxy for soil/management zones, verify with soil tests. Each date normalised within field (min–max), then averaged; tertiles, equal scores stay together; 3×3 majority smoothing (retain class without a strict majority). Area weights include partial edge pixels. Masked cells remain No data.', 'আনুমানিক · Sentinel-2 NDVI ২ তারিখ · মাটি/ব্যবস্থাপনা অঞ্চলের বিকল্প সূচক; মাটি পরীক্ষা দিয়ে যাচাই করুন। প্রতি তারিখের মাঠের min–max স্বাভাবিকীকরণ, গড়, তিন ভাগ; সমান মান একসঙ্গে; ৩×৩ সংখ্যাগরিষ্ঠ মসৃণকরণ (সংখ্যাগরিষ্ঠ না হলে শ্রেণি বজায় থাকে)। প্রান্তের আংশিক কোষসহ ক্ষেত্রফল গণনা। অনুপস্থিত কোষে তথ্য নেই।');
    truth = data.zoneDates?.length === 2 ? 'MODELED' : 'UNKNOWN';
    source = text('Estimated · Sentinel-2 NDVI · 20 m', 'আনুমানিক · Sentinel-2 NDVI · ২০ মি');
    date = data.zoneDates?.join(' + ') || text('Two dates required', 'দুই তারিখ প্রয়োজন');
  } else if (mode === 'elevation') {
    title = text('Elevation & contours', 'উচ্চতা ও কনট্যুর');
    unit = 'm';
    const min = data.elevationMin, max = data.elevationMax;
    const valid = Number.isFinite(min) && Number.isFinite(max);
    const colors = ['#28758b', '#68a59a', '#aecf9e', '#d1c17d', '#c3995e'];
    classes = !valid ? [] : Array.from({ length: max > min ? 5 : 1 }, (_, i) => {
      const from = min + (max - min) * i / 5, to = min + (max - min) * (i + 1) / 5;
      return makeClass(`${from.toFixed(2)}–${to.toFixed(2)} m`, colors[i], from, to, i === 4 || max === min);
    });
    note = `${valid ? `${min.toFixed(2)}–${max.toFixed(2)} m · ` : ''}${text('contours every 0.25 m', 'প্রতি 0.25 মি কনট্যুর')} · ${text('relief exaggeration', 'উচ্চতা বাড়িয়ে দেখানো')} ${data.exaggeration ?? 1}×. ${text('Microrelief is illustrative.', 'সূক্ষ্ম ঢাল কাল্পনিক।')}`;
    truth = valid ? 'MODELED' : 'UNKNOWN';
    source = 'NASADEM · 30 m';
  } else if (mode === 'fertility') {
    title = text('Soil fertility (SoilGrids)', 'মাটির উর্বরতা (SoilGrids)');
    unit = 'pH';
    const breaks = [-Infinity, 4.5, 5.5, 6.5, 7.5, 8.5, Infinity];
    const labels = [text('Very low', 'অতি কম'), text('Low', 'কম'), text('Medium', 'মাঝারি'), text('Optimum', 'উপযুক্ত'), text('High', 'বেশি'), text('Very high', 'অতি বেশি')];
    const colors = ['#a64638', '#cd8849', '#d3bd59', '#548452', '#628eac', '#795f9a'];
    classes = labels.map((label, i) => makeClass(`${label} · ${i === 0 ? '<4.5' : i === 5 ? '≥8.5' : `${breaks[i]}–${breaks[i + 1]}`}`, colors[i], breaks[i], breaks[i + 1]));
    const ph = data.soilOverrides?.ph ?? data.soil?.layers?.[0]?.ph ?? data.nutrients?.ph?.value;
    const soc = data.soil?.layers?.[0]?.socGkg;
    const om = data.soilOverrides?.omPct ?? (Number.isFinite(soc) ? soc * 0.1724 :
      Number.isFinite(data.nutrients?.om?.value) ? data.nutrients.om.value / (data.nutrients.om.unit === 'g/kg' ? 10 : 1) : null);
    const index = Number.isFinite(ph) ? classes.findIndex((c) => ph >= c.from && ph < c.to) : -1;
    const description = index >= 0 ? `${labels[index]} (pH ${ph.toFixed(1)}, OM ${Number.isFinite(om) ? om.toFixed(2) : '—'} %)` : text('No soil data', 'মাটির তথ্য নেই');
    note = data.soilCellCount === 1
      ? text(`Whole field uses one 250 m soil cell → one class: ${description}`, `পুরো মাঠে একটি ২৫০ মি মাটির কোষ ব্যবহৃত → এক শ্রেণি: ${description}`)
      : text(`Field-wide estimate: ${description}`, `পুরো মাঠের আনুমানিক মান: ${description}`);
    if (data.soilRange?.ph.length && !Number.isFinite(data.soilOverrides?.ph)) {
      const range = (values, digits) => `${Math.min(...values).toFixed(digits)}–${Math.max(...values).toFixed(digits)}`;
      note = text(`Smooth blend of 250 m SoilGrids cells — not a soil test. pH ${range(data.soilRange.ph, 3)}; OM ${range(data.soilRange.om, 3)} %. Continuous pH/OM shading, contrast stretched to field range; donut uses absolute pH classes.`, `২৫০ মি SoilGrids কোষের মসৃণ মিশ্রণ — মাটি পরীক্ষা নয়। pH ${range(data.soilRange.ph, 3)}; জৈব পদার্থ ${range(data.soilRange.om, 3)} %। pH/জৈব পদার্থের ছায়া মাঠের মানের সীমায় বাড়িয়ে দেখানো; ডোনাটে প্রকৃত pH শ্রেণি।`);
    }
    note += `\n${text('P/K/Zn/B: add soil test. Subfield soil zones are not mapped.', 'P/K/Zn/B: মাটি পরীক্ষা যোগ করুন। মাঠের ভেতরের মাটির অঞ্চল মানচিত্রে নেই।')}`;
    const measuredPh = Number.isFinite(data.soilOverrides?.ph);
    truth = measuredPh ? 'FARMER_REPORTED' : Number.isFinite(ph) ? 'MODELED' : 'UNKNOWN';
    source = measuredPh ? text('Farmer soil test · BARC pH classes', 'কৃষকের মাটি পরীক্ষা · BARC pH শ্রেণি')
      : text('ISRIC SoilGrids 2.0 · 250 m · BARC pH classes', 'ISRIC SoilGrids 2.0 · ২৫০ মি · BARC pH শ্রেণি');
    if (measuredPh) date = data.soilOverrides.date || text('Soil test date unavailable', 'মাটি পরীক্ষার তারিখ পাওয়া যায়নি');
  } else {
    title = `${text('Crop canopy', 'ফসলের ক্যানোপি')}${month.cropName ? ` · ${text(month.cropName, month.cropNameBn || month.cropName)}` : ''}`;
    classes = [
      makeClass(text('Seedling / establishing', 'চারা / অঙ্কুরোদ্গম'), cropStageColor(month.cropId, 'establish'), 0, 1),
      makeClass(text('Growing / full canopy', 'বৃদ্ধি / পূর্ণ ক্যানোপি'), cropStageColor(month.cropId, 'grow'), 1, 2),
      makeClass(text('Ripening / harvest', 'পরিণত / ফসল কাটা'), cropStageColor(month.cropId, month.stage === 'harvest' ? 'harvest' : 'mature'), 2, 3),
      makeClass(text('Bare / fallow', 'খালি / পতিত'), cropStageColor(null, 'fallow'), 3, 4),
    ];
    note = text('Illustrative crop + growth stage from the rotation plan; not observed canopy cover.', 'ফসলচক্রের পরিকল্পনা থেকে কাল্পনিক ফসল ও বৃদ্ধির ধাপ; পর্যবেক্ষিত ক্যানোপি নয়।');
    truth = 'SCENARIO';
    source = data.rotation?.label || text('Rotation plan', 'ফসলচক্রের পরিকল্পনা');
    date = month.month || date;
  }
  classes.push({ label: text('No data', 'তথ্য নেই'), color: '#a5a9a5', from: null, to: null, pct: 0, unknown: true });
  const legend = { title, unit, classes, note, truth, source, date, remote: data.remote, flowRows: data.flowRows };
  let total = 0;
  for (const cell of data.cells || []) {
    if (!(cell.area > 0)) continue;
    surfaceClass(legend, cell.value).pct += cell.area;
    total += cell.area;
  }
  for (const c of classes) c.pct = total ? c.pct / total * 100 : c.unknown ? 100 : 0;
  return legend;
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

// Project block corners to NDC with the same math as THREE.PerspectiveCamera
// (camera up +Y, optional setViewOffset shift as fractions of the full size).
// Returns the NDC bounding box plus the canvas width/height fractions.
export function projectFramingBox(corners, { position, target, fovDeg = 38, aspect = 1.5,
  viewOffsetX = 0, viewOffsetY = 0 }) {
  const fwd = norm3([target[0] - position[0], target[1] - position[1], target[2] - position[2]]);
  const right = norm3(cross3(fwd, [0, 1, 0]));
  const up = cross3(right, fwd);
  const tanHalf = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of corners) {
    const vx = p[0] - position[0], vy = p[1] - position[1], vz = p[2] - position[2];
    const depth = vx * fwd[0] + vy * fwd[1] + vz * fwd[2];
    const hw = Math.max(1e-9, depth * tanHalf * aspect);
    const hh = Math.max(1e-9, depth * tanHalf);
    const nx = (vx * right[0] + vy * right[1] + vz * right[2]) / hw - 2 * viewOffsetX;
    const ny = (vx * up[0] + vy * up[1] + vz * up[2]) / hh + 2 * viewOffsetY;
    if (nx < minX) minX = nx; if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny; if (ny > maxY) maxY = ny;
  }
  return { minX, maxX, minY, maxY,
    widthFrac: (maxX - minX) / 2, heightFrac: (maxY - minY) / 2 };
}

function cross3(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

// STUDIO5P: solve the fit-distance multiplier so the field block fills targetFrac
// of the canvas width, backing off until every block corner is inside the frame.
// With centerX, a small bounded horizontal view shift centres the block (phone);
// otherwise viewOffsetX stays fixed (desktop keeps its free-region offset).
// Returns { multiplier, viewOffsetX, widthFrac, heightFrac, fits }.
export function solveFramingMultiplier({ outlineM, depthM = 1.5, fovDeg = 38, aspect = 1.5,
  elevationDeg = 14, yawDeg = 10, margin = 0.18, targetFrac = 0.72,
  viewOffsetX = 0, viewOffsetY = 0, centerX = false, maxCenterX = 0.1,
  minMult = 0.45, maxMult = 1.0, edgeMargin = 0.02,
  region = null, topM = 0, bottomM = -depthM, swayDeg = 0 }) {
  const fallback = { multiplier: 1, viewOffsetX, widthFrac: 0, heightFrac: 0, fits: true };
  if (!Array.isArray(outlineM) || outlineM.length < 3) return fallback;
  const fit = fitCameraToBlock({ outlineM, depthM, fovDeg, aspect, elevationDeg, yawDeg, margin });
  if (!Number.isFinite(fit.distance) || fit.distance <= 0) return fallback;
  const target = [fit.target[0], -depthM * 0.45, fit.target[2]];
  const el = (elevationDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const dir = [Math.cos(el) * Math.sin(yaw), Math.sin(el), Math.cos(el) * Math.cos(yaw)];
  const corners = [];
  for (const [x, y] of outlineM) {
    corners.push([x, topM, -y], [x, bottomM, -y]);
  }
  if (region) {
    // Fit the whole sway envelope, including canopy and relief, between overlays.
    const measureRegion = (mult) => {
      const boxes = [-swayDeg, 0, swayDeg].map((sway) => {
        const a = yaw + sway * Math.PI / 180;
        const d = fit.distance * mult * 0.99;
        const position = [target[0] + Math.cos(el) * Math.sin(a) * d,
          target[1] + Math.sin(el) * d, target[2] + Math.cos(el) * Math.cos(a) * d];
        return projectFramingBox(corners, { position, target, fovDeg, aspect });
      });
      const minX = Math.min(...boxes.map((b) => b.minX));
      const maxX = Math.max(...boxes.map((b) => b.maxX));
      const minY = Math.min(...boxes.map((b) => b.minY));
      const maxY = Math.max(...boxes.map((b) => b.maxY));
      const widthFrac = (maxX - minX) / 2;
      const heightFrac = (maxY - minY) / 2;
      return {
        multiplier: mult, widthFrac, heightFrac,
        viewOffsetX: (minX + maxX) / 4 - (region.left + region.right - 1) / 2,
        viewOffsetY: (1 - region.top - region.bottom) / 2 - (minY + maxY) / 4,
        fits: widthFrac <= Math.min(targetFrac, region.right - region.left) &&
          heightFrac <= region.bottom - region.top,
      };
    };
    let lo = minMult, hi = maxMult;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (measureRegion(mid).fits) hi = mid;
      else lo = mid;
    }
    return measureRegion(hi);
  }
  const measure = (mult, vox) => {
    const d = fit.distance * mult;
    const position = [target[0] + dir[0] * d, target[1] + dir[1] * d, target[2] + dir[2] * d];
    const box = projectFramingBox(corners, { position, target, fovDeg, aspect,
      viewOffsetX: vox, viewOffsetY });
    const overflow = Math.max(box.maxX - (1 - edgeMargin), (-1 + edgeMargin) - box.minX,
      box.maxY - (1 - edgeMargin), (-1 + edgeMargin) - box.minY, 0);
    return { ...box, fits: overflow <= 0, overflow };
  };
  const clamp = (v) => Math.min(maxMult, Math.max(minMult, v));
  const clampVox = (v) => Math.min(maxCenterX, Math.max(-maxCenterX, v));
  let mult = clamp(1);
  let vox = viewOffsetX;
  for (let i = 0; i < 5; i++) {
    const m = measure(mult, vox);
    if (!(m.widthFrac > 1e-6) || !Number.isFinite(m.widthFrac)) break;
    const next = clamp(mult * (m.widthFrac / targetFrac));
    const voxNext = centerX ? clampVox(vox + ((m.minX + m.maxX) / 2) / 2) : vox;
    if (Math.abs(next - mult) < 1e-4 && Math.abs(voxNext - vox) < 1e-4) {
      mult = next; vox = voxNext; break;
    }
    mult = next; vox = voxNext;
  }
  for (let i = 0; i < 12; i++) {
    const m = measure(mult, vox);
    if (m.fits) break;
    mult = clamp(mult * (1 + m.overflow * 0.9 + 0.02));
    if (mult >= maxMult) break;
  }
  if (centerX) {
    const m = measure(mult, vox);
    const tuned = clampVox(vox + ((m.minX + m.maxX) / 2) / 2);
    if (measure(mult, tuned).fits) vox = tuned;
  }
  const final = measure(mult, vox);
  return { multiplier: mult, viewOffsetX: vox,
    widthFrac: final.widthFrac, heightFrac: final.heightFrac, fits: final.fits };
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
// Slow horizontal idle motion: the camera yaws around the field centre while the
// block keeps only a residual vertical float. Pure (no three.js/DOM) — safe to unit test.
export const IDLE_SWAY_PERIOD_S = 14;
export const IDLE_SWAY_AMPLITUDE_DEG = 7; // studio ±7° (planner uses ±5°)
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

export function sampleSurfaceGrid(grid, lon, lat) {
  if (grid?.crs !== 'EPSG:32645' || !grid.transform) return null;
  const [x, y] = projectWgs84ToUtm45N(lon, lat);
  const [dx, , west, , dy, north] = grid.transform;
  const value = grid.values?.[Math.floor((y - north) / dy)]?.[Math.floor((x - west) / dx)];
  return Number.isFinite(value) && value >= -1 && value <= 1 ? value : null;
}

export function pondingWaterline(positions) {
  const edges = new Map();
  for (let i = 0; i < positions.length; i += 9) {
    const triangle = [0, 3, 6].map((j) => Array.from(positions.slice(i + j, i + j + 3)));
    triangle.forEach((a, j) => {
      const b = triangle[(j + 1) % 3];
      const key = [a, b].map((p) => p.map((v) => v.toFixed(4)).join(',')).sort().join('|');
      const edge = edges.get(key);
      if (edge) edge.count++;
      else edges.set(key, { count: 1, points: [...a, ...b] });
    });
  }
  return [...edges.values()].filter((e) => e.count === 1).flatMap((e) => e.points);
}

// Clip each terrain triangle at the scenario fill level, then drape wet cells
// just above that same triangle. Interpolated shoreline vertices cannot cross its edges.
export function pondingPositions(surface, {
  rainMm = 0, exaggeration = 1, lowGround = false,
  proposedDrain = false, outletBlocked = false, waterMaskAt = () => null, minHeight = null, depthAt = null,
} = {}) {
  if (!(rainMm > 0) || !surface.length) return [];
  let min = Infinity;
  for (let i = 1; i < surface.length; i += 3) min = Math.min(min, surface[i]);
  if (Number.isFinite(minHeight)) min = minHeight;
  const scale = Math.max(0.01, exaggeration);
  const positions = [];
  if (depthAt) {
    for (let i = 0; i < surface.length; i += 9) {
      const triangle = [0, 3, 6].map((j) => {
        const [x, h, z] = surface.slice(i + j, i + j + 3);
        return [x, h, z, depthAt(x, z)];
      });
      const clipped = [];
      triangle.forEach((a, j) => {
        const b = triangle[(j + 1) % 3];
        if (a[3] > 0.0001) clipped.push(a);
        if ((a[3] > 0.0001) !== (b[3] > 0.0001)) {
          const fraction = (0.0001 - a[3]) / (b[3] - a[3]);
          clipped.push(a.map((value, k) => value + (b[k] - value) * fraction));
        }
      });
      for (let j = 1; j < clipped.length - 1; j++) for (const [x, h, z, depth] of [clipped[0], clipped[j], clipped[j + 1]]) {
        positions.push(x, h + depth + 0.02, z);
      }
    }
    return positions;
  }
  for (let i = 0; i < surface.length; i += 9) {
    const triangle = [0, 3, 6].map((j) => Array.from(surface.slice(i + j, i + j + 3)));
    const x = triangle.reduce((sum, p) => sum + p[0], 0) / 3;
    const z = triangle.reduce((sum, p) => sum + p[2], 0) / 3;
    // Radar supplies water presence, not depth. Its contribution remains a rain scenario.
    const level = min + pondingDepthCm(min, min, {
      rainMm, exaggeration, lowGround, proposedDrain, outletBlocked, waterMask: waterMaskAt(x, z),
    }) * scale / 100;
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
  const textureBn = {
    sand: "বেলে", 'loamy sand': "দোআঁশ বেলে", 'sandy loam': "বেলে দোআঁশ",
    loam: "দোআঁশ", silt: "পলি", 'silt loam': "পলি দোআঁশ",
    'sandy clay loam': "বেলে এঁটেল দোআঁশ", 'clay loam': "এঁটেল দোআঁশ",
    'silty clay loam': "পলি এঁটেল দোআঁশ", 'sandy clay': "বেলে এঁটেল",
    'silty clay': "পলি এঁটেল", clay: "এঁটেল",
  };
  const textureTitle = t(texture.replace(/\b\w/g, (c) => c.toUpperCase()), textureBn[texture.toLowerCase()] || texture);
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
    if (omPct != null) topsoilValParts.push(`${t("OM", "জৈব পদার্থ")} ${omPct}%`);
  }
  const topsoilVal = topsoilValParts.join(" · ");
  const topsoilTruth = soilOverrides ? "FARMER_REPORTED" : "MODELED";
  const topsoilTruthLabel = soilOverrides
    ? t("Soil test, Measured", "মাটি পরীক্ষা, মাপা")
    : t("Estimated · SoilGrids 250 m", "আনুমানিক · SoilGrids 250 মি");

  // Band 2: 15-60 cm Root Zone
  // POWER GWETROOT for the selected month (fallback to month.rootWetness or month.wetness)
  const wetness = month.rootWetness ?? month.wetness;
  const fraction = wetness != null && wetness !== "" ? Number(wetness) : NaN;
  const hasWetness = Number.isFinite(fraction) && fraction >= 0 && fraction <= 1;
  const rootWetness = hasWetness ? fraction.toFixed(2) : null;
  const wetnessWord = fraction < 0.3 ? t("dry", "শুষ্ক")
    : fraction < 0.6 ? t("moist", "আর্দ্র")
      : fraction <= 0.85 ? t("wet", "ভেজা") : t("saturated", "সম্পৃক্ত");
  let cropName = t(month.cropName || "Crop", month.cropNameBn || "ফসল");
  const isFallow = month.stage === "fallow" || month.cropId === "fallow" || month.cropName === "Fallow";
  
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

  const rootDepthM = month.rootDepthM != null ? `${Number(month.rootDepthM).toFixed(1)} ${t("m", "মি")}` : null;
  const rotationName = t(data.rotation?.label || "", data.rotation?.bn || data.rotation?.label || "");

  const rootzoneEyebrow = `15–60 cm · ${t("ROOT ZONE", "শিকড় অঞ্চল")}`;
  const rootzoneVal = hasWetness
    ? t(`Root zone: ${wetnessWord} (${Math.round(fraction * 100)} % of saturation)`, `শিকড় অঞ্চল: ${wetnessWord} (সম্পৃক্ততার ${Math.round(fraction * 100)} %)`)
    : t("Root zone: unknown", "শিকড় অঞ্চল: অজানা");
  const cropVal = isFallow ? cropName : `${t("Planned", "পরিকল্পিত")}: ${cropName}${rotationName ? ` (${rotationName})` : ""}${rootDepthM ? ` · ${t("roots", "শিকড়")} ~${rootDepthM}` : ""}`;
  const rootzoneTruth = "MODELED";
  const rootzoneTruthLabel = t("Estimated · NASA POWER ~50 km, top ~1 m", "আনুমানিক · NASA POWER ~50 কিমি, উপরের ~1 মি");

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
      cropValue: cropVal,
      cropTruth: "SCENARIO",
      cropTruthLabel: t("Scenario", "কাল্পনিক পরিকল্পনা"),
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


