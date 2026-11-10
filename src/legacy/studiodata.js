import { areaHa, finite, mean, monthlyRotationWater, polygonValid, STRATEGIES } from './engine.js';
import { pointInPoly, projectWgs84ToUtm45N } from './spatial.js';
import { cropStageForFraction } from './studio3d-helpers.js';

// FAO-56 Table 12: maximum height; Table 22: upper end of effective rooting depth.
// Mustard uses rapeseed/canola; mungbean uses green gram/cowpeas. These are scenario limits, not measurements.
// https://www.fao.org/4/X0490E/x0490e0b.htm#table12
// https://www.fao.org/4/X0490E/x0490e0e.htm#table22
export const FAO56_CROP_LIMITS = Object.freeze({
  aman: Object.freeze({ heightM: 1, rootM: 1 }),
  boro: Object.freeze({ heightM: 1, rootM: 1 }),
  mustard: Object.freeze({ heightM: 0.6, rootM: 1.5 }),
  potato: Object.freeze({ heightM: 0.6, rootM: 0.6 }),
  mungbean: Object.freeze({ heightM: 0.4, rootM: 1 }),
});

const SITE_NAMES = { mithapukur: 'মিঠাপুকুর', pirganj: 'পীরগঞ্জ', gangachara: 'গঙ্গাচড়া' };
const DAY_MS = 86400000;
const GROUND_NOTE = 'Plot is flat at 30 m resolution. NASADEM gives relative surface context, including trees and buildings; no within-plot relief is resolved.';
const SOURCES = [
  { id: 'power', name: 'NASA POWER / MERRA-2 weather', url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/' },
  { id: 'gpm', name: 'NASA GPM IMERG rainfall via POWER', url: 'https://gpm.nasa.gov/data/imerg' },
  { id: 'fao56-height', name: 'FAO-56 Table 12: maximum crop heights (scenario)', url: 'https://www.fao.org/4/X0490E/x0490e0b.htm' },
  { id: 'fao56-root', name: 'FAO-56 Table 22: effective rooting depths (scenario)', url: 'https://www.fao.org/4/X0490E/x0490e0e.htm' },
];

function geometry(points) {
  const ring = points.map((p) => [...p]);
  if (ring.length > 1 && ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1]) ring.pop();
  if (!polygonValid(ring) || ring.some(([lat, lon]) => Math.abs(lat) >= 90 || Math.abs(lon) > 180)) {
    throw new RangeError('Studio requires a valid latitude/longitude polygon');
  }
  const latitude = mean(ring.map(([lat]) => lat));
  const scaleX = 111195.08 * Math.cos(latitude * Math.PI / 180);
  const [originLat, originLon] = ring[0];
  const local = ring.map(([lat, lon]) => [(lon - originLon) * scaleX, (lat - originLat) * 111195.08]);
  let crossSum = 0, cx = 0, cy = 0;
  local.forEach(([x, y], i) => {
    const [u, v] = local[(i + 1) % local.length];
    const cross = x * v - u * y;
    crossSum += cross;
    cx += (x + u) * cross;
    cy += (y + v) * cross;
  });
  cx /= 3 * crossSum;
  cy /= 3 * crossSum;
  return {
    ring,
    areaHa: areaHa(ring),
    centroid: [originLat + cy / 111195.08, originLon + cx / scaleX],
    bboxLatLon: [Math.min(...ring.map((p) => p[1])), Math.min(...ring.map((p) => p[0])),
      Math.max(...ring.map((p) => p[1])), Math.max(...ring.map((p) => p[0]))],
    outlineM: local.map(([x, y]) => [x - cx, y - cy]),
  };
}

function plotMean(grid, ring) {
  if (grid.crs !== 'EPSG:32645') throw new RangeError(`Unsupported studio grid CRS: ${grid.crs}`);
  const projected = ring.map(([lat, lon]) => {
    const [x, y] = projectWgs84ToUtm45N(lon, lat);
    return [y, x];
  });
  const [dx, , west, , dy, north] = grid.transform;
  const cols = projected.map(([, x]) => (x - west) / dx);
  const rows = projected.map(([y]) => (y - north) / dy);
  const samples = [];
  for (let row = Math.max(0, Math.floor(Math.min(...rows))); row <= Math.min(grid.height - 1, Math.floor(Math.max(...rows))); row++) {
    for (let col = Math.max(0, Math.floor(Math.min(...cols))); col <= Math.min(grid.width - 1, Math.floor(Math.max(...cols))); col++) {
      const center = [north + (row + 0.5) * dy, west + (col + 0.5) * dx];
      if (pointInPoly(center, projected)) samples.push(grid.values[row]?.[col]);
    }
  }
  const valid = samples.filter((v) => finite(v) && v >= -1 && v <= 1);
  return { value: mean(valid), validFraction: samples.length ? valid.length / samples.length : 0 };
}

function groundAt(pack, id, [lat, lon]) {
  const site = pack?.sites?.find((s) => s.id === id);
  let code;
  if (site) {
    const [w, s, e, n] = site.bounds;
    if (lon >= w && lon <= e && lat >= s && lat <= n) {
      const col = Math.min(site.width - 1, Math.floor((lon - w) / (e - w) * site.width));
      const row = Math.min(site.height - 1, Math.floor((n - lat) / (n - s) * site.height));
      code = site.grid[row]?.[col];
    }
  }
  return { class: { l: 'low', e: 'level', h: 'high' }[code] ?? null,
    source: pack?.source ?? null, note: GROUND_NOTE };
}

function growth(strategy, index, year, crop) {
  if (!crop) return { stage: 'fallow', stageFraction: 0, canopyHeightM: null, rootDepthM: null };
  // Track a contiguous crop run across New Year, including winter crops planted in November.
  let start = index;
  while (start > index - 11 && strategy.months[((start - 1) % 12 + 12) % 12] === strategy.months[index]) start--;
  const day = (Date.UTC(year, index, 15) - Date.UTC(year, start, 1)) / DAY_MS;
  const duration = mean(crop.durationDays ?? []);
  if (!(duration > 0)) throw new RangeError(`Missing crop duration: ${crop.id}`);
  const stageFraction = Math.min(1, Math.max(0, day / duration));
  const stage = cropStageForFraction(crop.id, stageFraction);
  // Scenario interpolation reaches the cited maximum at maturity; no growth observations are implied.
  const size = Math.min(1, stageFraction / 0.65);
  const limits = FAO56_CROP_LIMITS[crop.id];
  return { stage, stageFraction, canopyHeightM: limits.heightM * size, rootDepthM: limits.rootM * size };
}

/**
 * Pure adapter for STUDIO2. Pass decoded JSON packs, never URLs or gzip bytes.
 * input: { field, polygon: [[lat,lon],...], rotationId, agronomy,
 *          ndviGrid?, moistureGrid?, lowGround?, soilProfile?, cachedPower?, boundary?, year? }
 * Use the current polygon() (or basePolygon(field)) and boundary='farmer' for saved prepared-site edits.
 * At the call site pass cachedPower: getCachedPower(field.id) for custom fields. No storage or fetch happens here.
 * Custom field.monthly is deliberately ignored. An absent cache produces twelve months with null weather.
 * Landsat retains its prepared 900 m window; Sentinel-2 means use cell centers inside the current polygon.
 * Durations use agronomy's midpoint; stages sample the 15th, from the crop run's first day, clamped at harvest.
 */
export function buildStudioData({ field, polygon, rotationId = 'baseline', agronomy,
  ndviGrid, moistureGrid, lowGround, soilProfile, cachedPower = null, boundary, year }) {
  const strategy = STRATEGIES.find((s) => s.id === rotationId);
  if (!strategy) throw new RangeError(`Unknown rotation: ${rotationId}`);
  const custom = field.custom === true || !Object.hasOwn(SITE_NAMES, field.id);
  const shape = geometry(polygon);
  const weather = (custom ? cachedPower?.monthly : field.monthly) ?? [];
  year ??= Number((custom ? weather[0]?.month : field.period?.start ?? weather[0]?.month)?.slice(0, 4) ?? 2024);
  if (!Number.isInteger(year) || year < 1 || year > 9999) throw new RangeError('Invalid studio weather year');
  const monthly = Array.from({ length: 12 }, (_, i) => weather.find((m) => m.month === `${year}-${String(i + 1).padStart(2, '0')}`));
  const water = monthlyRotationWater(monthly, rotationId);
  const usedCrops = new Set();
  const months = water.map(({ crop: plannedCrop, needMm, shortfallMm }, i) => {
    const cropId = plannedCrop === 'fallow' ? null : plannedCrop === 'pulse' ? 'mungbean' : plannedCrop;
    const crop = cropId ? agronomy.crops.find((c) => c.id === cropId) : null;
    if (cropId && !crop) throw new RangeError(`Missing agronomy crop: ${cropId}`);
    if (crop) usedCrops.add(crop);
    const m = monthly[i];
    return { month: `${year}-${String(i + 1).padStart(2, '0')}`, cropId,
      cropName: crop?.label ?? 'Fallow', cropNameBn: crop?.bn ?? 'পতিত',
      ...growth(strategy, i, year, crop), rainMm: finite(m?.rainGpm) ? m.rainGpm : null,
      et0Mm: finite(m?.et0) ? m.et0 : null, tmeanC: finite(m?.tmean) ? m.tmean : null,
      wetness: finite(m?.wetness) ? m.wetness : null, needMm, shortfallMm,
      shortfallLitres: finite(shortfallMm) ? shortfallMm * shape.areaHa * 10000 : null };
  });
  const vegetation = custom ? [] : (field.opticalHistory ?? []).map((o) => ({ date: o.date,
    ndvi: finite(o.opticalQA?.ndvi) ? o.opticalQA.ndvi : null, source: 'Landsat', cellM: 30,
    validFraction: finite(o.opticalQA?.validFraction) ? o.opticalQA.validFraction : null }));
  if (!custom) for (const grid of ndviGrid?.grids ?? []) {
    if (grid.siteId !== field.id) continue;
    const plot = plotMean(grid, shape.ring);
    vegetation.push({ date: grid.date, ndvi: plot.value, source: 'Sentinel-2',
      cellM: grid.cellSizeMetres, validFraction: plot.validFraction });
  }
  vegetation.sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source));
  const moisture = custom ? [] : (moistureGrid?.grids ?? []).filter((g) => g.siteId === field.id)
    .map((g) => ({ date: g.date, ndmi: plotMean(g, shape.ring).value })).sort((a, b) => a.date.localeCompare(b.date));
  const soil = custom ? null : soilProfile?.sites?.[field.id];
  const sourceIds = new Set([...usedCrops].flatMap((c) => c.sourceIds ?? []));
  const sources = [...SOURCES.map((s) => ({ ...s })), ...(agronomy.sources ?? []).filter((s) => sourceIds.has(s.id))
    .map((s) => ({ id: s.id, name: s.title ?? s.name, url: s.url }))];
  if (!custom) sources.push(
    { id: 'landsat', name: 'Landsat Collection 2 surface reflectance; prepared 900 m window', url: 'https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance' },
    { id: 'sentinel2', name: 'Copernicus Sentinel-2 L2A; plot means at 20 m', url: 'https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a' },
    { id: 'nasadem', name: 'NASADEM 30 m relative surface context', url: 'https://planetarycomputer.microsoft.com/dataset/nasadem' },
    { id: 'soilgrids', name: 'ISRIC SoilGrids 2.0, CC BY 4.0, modeled at 250 m', url: 'https://soilgrids.org/' },
  );
  return {
    field: { id: field.id, name: field.name, nameBn: field.nameBn ?? field.name_bn ?? SITE_NAMES[field.id] ?? field.name,
      areaHa: shape.areaHa, centroid: shape.centroid, bboxLatLon: shape.bboxLatLon, outlineM: shape.outlineM,
      boundary: custom ? 'custom' : boundary === 'farmer' ? 'farmer' : 'traced' },
    rotation: { id: strategy.id, label: strategy.label, bn: strategy.bn }, months, vegetation, moisture,
    ground: custom ? null : groundAt(lowGround, field.id, shape.centroid),
    soil: soil ? { source: soil.source, cellM: 250, layers: soil.layers.map((l) => ({ ...l })) } : null,
    sources,
    truth: { plants: 'SCENARIO', roots: 'SCENARIO', soil: 'MODELED', vegetation: 'REMOTE_OBSERVED', weather: 'MODELED', water: 'MODELED' },
  };
}
