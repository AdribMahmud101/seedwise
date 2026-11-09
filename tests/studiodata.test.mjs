import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildStudioData, FAO56_CROP_LIMITS } from '../src/legacy/studiodata.js';
import { monthlyRotationWater, rotationEvidence, STRATEGIES } from '../src/legacy/engine.js';
import { projectWgs84ToUtm45N } from '../src/legacy/spatial.js';
import { basePolygon } from '../src/legacy/ui.js';
import { getCachedPower, setCachedPower } from '../src/legacy/powerlive.js';

const read = (name) => {
  const bytes = readFileSync(new URL(`../public/data/${name}.json`, import.meta.url));
  return JSON.parse(bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes);
};
const earth = read('earth-data');
const packs = { agronomy: read('agronomy'), ndviGrid: read('ndvi-grid'), moistureGrid: read('moisture-grid'),
  lowGround: read('low-ground'), soilProfile: read('soil-profile') };
const inputFor = (field, rotationId = 'baseline') => ({ ...packs, field, polygon: basePolygon(field), rotationId });
const keys = (object, names) => assert.deepEqual(Object.keys(object).sort(), names.split(' ').sort());
const nullableNumber = (value) => assert.ok(value === null || Number.isFinite(value), `Invalid numeric value: ${value}`);
const areaM2 = (ring) => Math.abs(ring.reduce((sum, [x, y], i) => {
  const [u, v] = ring[(i + 1) % ring.length];
  return sum + x * v - u * y;
}, 0)) / 2;

for (const field of earth.fields) for (const rotation of STRATEGIES) {
  test(`${field.id} / ${rotation.id}: complete studio contract, engine parity, litres and metre outline`, () => {
    const data = buildStudioData(inputFor(field, rotation.id));
    keys(data, 'field rotation months vegetation moisture ground soil sources truth');
    keys(data.field, 'id name nameBn areaHa centroid bboxLatLon outlineM boundary');
    assert.equal(data.field.id, field.id);
    assert.equal(data.field.name, field.name);
    assert.match(data.field.nameBn, /[\u0980-\u09ff]/);
    assert.ok(data.field.areaHa > 0);
    assert.equal(data.field.centroid.length, 2);
    assert.equal(data.field.bboxLatLon.length, 4);
    assert.ok(data.field.centroid.every(Number.isFinite));
    const [lat, lon] = data.field.centroid, [w, s, e, n] = data.field.bboxLatLon;
    assert.ok(w <= lon && lon <= e && s <= lat && lat <= n);
    assert.equal(data.field.boundary, 'traced');
    assert.equal(data.field.outlineM.length, basePolygon(field).length);
    assert.notDeepEqual(data.field.outlineM[0], data.field.outlineM.at(-1));
    assert.ok(Math.abs(areaM2(data.field.outlineM) / (data.field.areaHa * 10000) - 1) <= 0.02);
    assert.deepEqual(data.rotation, { id: rotation.id, label: rotation.label, bn: rotation.bn });
    const engineMonths = monthlyRotationWater(field.monthly, rotation.id);
    assert.equal(data.months.length, 12);
    data.months.forEach((m, i) => {
      keys(m, 'month cropId cropName cropNameBn stage stageFraction canopyHeightM rootDepthM rainMm et0Mm tmeanC wetness needMm shortfallMm shortfallLitres');
      assert.equal(m.month, `2024-${String(i + 1).padStart(2, '0')}`);
      const cropId = rotation.months[i] === 'fallow' ? null : rotation.months[i] === 'pulse' ? 'mungbean' : rotation.months[i];
      assert.equal(m.cropId, cropId);
      assert.ok(['fallow', 'establish', 'grow', 'mature', 'harvest'].includes(m.stage));
      assert.ok(m.stageFraction >= 0 && m.stageFraction <= 1);
      assert.ok(m.cropName.length && m.cropNameBn.length);
      if (cropId) {
        const crop = packs.agronomy.crops.find((c) => c.id === cropId);
        assert.equal(m.cropName, crop.label);
        assert.equal(m.cropNameBn, crop.bn);
        assert.ok(m.canopyHeightM > 0 && m.canopyHeightM <= FAO56_CROP_LIMITS[cropId].heightM);
        assert.ok(m.rootDepthM > 0 && m.rootDepthM <= FAO56_CROP_LIMITS[cropId].rootM);
      } else {
        assert.equal(m.stage, 'fallow');
        assert.equal(m.stageFraction, 0);
        assert.equal(m.canopyHeightM, null);
        assert.equal(m.rootDepthM, null);
      }
      assert.equal(m.rainMm, field.monthly[i].rainGpm);
      assert.equal(m.et0Mm, field.monthly[i].et0);
      assert.equal(m.tmeanC, field.monthly[i].tmean);
      assert.equal(m.wetness, field.monthly[i].wetness);
      assert.equal(m.shortfallMm, engineMonths[i].shortfallMm);
      assert.equal(m.needMm, engineMonths[i].needMm);
      // Independent pre-extraction formula guards against changing both callers together.
      const kc = { aman: 1.1, boro: 1.1, mustard: 0.85, potato: 0.95, pulse: 0.85, fallow: 0 }[rotation.months[i]];
      assert.equal(m.shortfallMm, Math.max(0, field.monthly[i].et0 * kc - field.monthly[i].rainGpm * 0.65));
      assert.equal(m.shortfallLitres, m.shortfallMm * data.field.areaHa * 10000);
    });
    const annual = rotationEvidence(field.monthly, { water: 1 }, {}).find((s) => s.id === rotation.id);
    assert.equal(data.months.reduce((sum, m) => sum + m.shortfallMm, 0), annual.deficit);
    assert.ok(data.vegetation.some((o) => o.source === 'Landsat'));
    assert.ok(data.vegetation.some((o) => o.source === 'Sentinel-2'));
    for (const [i, o] of data.vegetation.entries()) {
      keys(o, 'date ndvi source cellM validFraction');
      assert.ok(['Landsat', 'Sentinel-2'].includes(o.source));
      assert.equal(o.cellM, o.source === 'Landsat' ? 30 : 20);
      nullableNumber(o.ndvi);
      assert.ok(o.validFraction === null || o.validFraction >= 0 && o.validFraction <= 1);
      if (i) assert.ok(data.vegetation[i - 1].date <= o.date);
    }
    const landsat = data.vegetation.filter((o) => o.source === 'Landsat');
    assert.deepEqual(landsat.map((o) => o.ndvi), field.opticalHistory.map((o) => o.opticalQA.ndvi));
    assert.ok(data.moisture.length > 0);
    for (const [i, o] of data.moisture.entries()) {
      keys(o, 'date ndmi');
      nullableNumber(o.ndmi);
      if (i) assert.ok(data.moisture[i - 1].date <= o.date);
    }
    keys(data.ground, 'class source note');
    assert.ok(['low', 'level', 'high', null].includes(data.ground.class));
    assert.match(data.ground.note, /flat at 30 m/);
    assert.equal(data.ground.source, packs.lowGround.source);
    assert.deepEqual(data.soil?.layers ?? null, packs.soilProfile.sites[field.id]?.layers ?? null);
    for (const source of data.sources) {
      keys(source, 'id name url');
      assert.ok(source.id && source.name && /^https:\/\//.test(source.url));
    }
    assert.deepEqual(data.truth, { plants: 'SCENARIO', roots: 'SCENARIO', soil: 'MODELED', vegetation: 'REMOTE_OBSERVED', weather: 'MODELED', water: 'MODELED' });
  });
}

test('SoilGrids JSON is <=20 KB, attributed and dated; three keyed profiles permit site-level nulls', () => {
  assert.ok(readFileSync(new URL('../public/data/soil-profile.json', import.meta.url)).length <= 20000);
  assert.match(packs.soilProfile.source, /ISRIC SoilGrids 2.0/);
  assert.equal(packs.soilProfile.schemaVersion, 1);
  assert.equal(packs.soilProfile.statistic, 'mean');
  assert.equal(packs.soilProfile.license, 'CC BY 4.0');
  assert.ok(Number.isFinite(Date.parse(packs.soilProfile.retrievedAt)));
  assert.deepEqual(Object.keys(packs.soilProfile.sites).sort(), earth.fields.map((f) => f.id).sort());
  const textures = ['sand', 'loamy sand', 'sandy loam', 'loam', 'silt', 'silt loam', 'sandy clay loam', 'clay loam', 'silty clay loam', 'sandy clay', 'silty clay', 'clay'];
  for (const field of earth.fields) {
    const soil = packs.soilProfile.sites[field.id];
    if (soil === null) continue;
    assert.equal(soil.cellM, 250);
    assert.match(soil.source, /SoilGrids/);
    assert.equal(soil.lat, field.lat);
    assert.equal(soil.lon, field.lon);
    assert.deepEqual(soil.layers.map((l) => [l.topCm, l.bottomCm]), [[0, 5], [5, 15], [15, 30], [30, 60], [60, 100]]);
    for (const layer of soil.layers) {
      keys(layer, 'topCm bottomCm clayPct sandPct siltPct socGkg ph bulkDensity textureClass');
      for (const key of ['clayPct', 'sandPct', 'siltPct', 'socGkg', 'ph', 'bulkDensity']) assert.ok(Number.isFinite(layer[key]) && layer[key] >= 0);
      for (const key of ['clayPct', 'sandPct', 'siltPct']) assert.ok(layer[key] <= 100);
      assert.ok(Math.abs(layer.clayPct + layer.sandPct + layer.siltPct - 100) < 5);
      assert.ok(layer.ph <= 14 && layer.bulkDensity <= 3);
      assert.ok(textures.includes(layer.textureClass));
    }
  }
  const input = inputFor(earth.fields[0]);
  input.soilProfile = { ...packs.soilProfile, sites: { [input.field.id]: null } };
  assert.equal(buildStudioData(input).soil, null);
});

test('custom fields use only their explicitly supplied getCachedPower snapshot, including when a prepared ID is reused', () => {
  const input = inputFor({ ...earth.fields[0], custom: true, name: 'My field', name_bn: 'আমার জমি' });
  const noCache = buildStudioData(input);
  assert.equal(noCache.field.boundary, 'custom');
  assert.deepEqual(noCache.vegetation, []);
  assert.deepEqual(noCache.moisture, []);
  assert.equal(noCache.ground, null);
  assert.equal(noCache.soil, null);
  assert.ok(noCache.months.every((m) => m.rainMm === null && m.et0Mm === null && m.tmeanC === null && m.wetness === null && m.needMm === null && m.shortfallMm === null && m.shortfallLitres === null));
  const previousStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
  try {
    const monthly = [{ month: '2025-01', et0: 100, rainGpm: 0, rainPower: 999, tmean: 0, wetness: 0 }];
    setCachedPower(input.field.id, { monthly });
    const cached = buildStudioData({ ...input, cachedPower: getCachedPower(input.field.id) });
    assert.equal(cached.months[0].month, '2025-01');
    assert.equal(cached.months[0].rainMm, 0);
    assert.equal(cached.months[0].tmeanC, 0);
    assert.equal(cached.months[0].wetness, 0);
    assert.equal(cached.months[0].shortfallMm, monthlyRotationWater(monthly, 'baseline')[0].shortfallMm);
    assert.equal(cached.months[1].shortfallMm, null);
    assert.deepEqual(cached.vegetation, []);
    assert.deepEqual(cached.moisture, []);
    assert.equal(cached.ground, null);
    assert.equal(cached.soil, null);
    const unknown = buildStudioData({ ...input, field: { ...input.field, id: 'custom-new', custom: false } });
    assert.equal(unknown.soil, null);
    assert.ok(unknown.months.every((m) => m.rainMm === null));
  } finally {
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});

test('Sentinel-2 averages only in-boundary cell centers; masks, zero, negative and empty coverage stay honest', () => {
  const field = earth.fields[0], [x, y] = projectWgs84ToUtm45N(field.lon, field.lat);
  const polygon = [[-30, -10], [10, -10], [10, 30], [-30, 30]].map(([east, north]) =>
    [field.lat + north / 111195.08, field.lon + east / (111195.08 * Math.cos(field.lat * Math.PI / 180))]);
  const grid = { siteId: field.id, date: '2024-03-09', crs: 'EPSG:32645', transform: [20, 0, x - 30, 0, -20, y + 30],
    width: 3, height: 3, cellSizeMetres: 20, values: [[0, -0.2, 0.9], [0.8, null, 0.9], [0.9, 0.9, 0.9]] };
  const input = { ...inputFor(field), polygon, ndviGrid: { grids: [grid, { ...grid, siteId: 'other' }] }, moistureGrid: { grids: [grid] } };
  const before = JSON.stringify(input);
  const data = buildStudioData(input);
  const sentinel = data.vegetation.filter((o) => o.source === 'Sentinel-2');
  assert.equal(sentinel.length, 1);
  assert.ok(Math.abs(sentinel[0].ndvi - 0.2) < 1e-12);
  assert.equal(sentinel[0].validFraction, 0.75);
  assert.equal(data.moisture[0].ndmi, sentinel[0].ndvi);
  assert.equal(JSON.stringify(input), before, 'pure adapter must not mutate inputs');
  data.sources[0].name = 'Changed by renderer';
  assert.notEqual(buildStudioData(input).sources[0].name, data.sources[0].name);
  const missingGrid = { ...grid, values: Array.from({ length: 3 }, () => [null, null, null]) };
  const missing = buildStudioData({ ...input, ndviGrid: { grids: [missingGrid] } });
  assert.equal(missing.vegetation.find((o) => o.source === 'Sentinel-2').ndvi, null);
  assert.equal(missing.vegetation.find((o) => o.source === 'Sentinel-2').validFraction, 0);
  const outside = buildStudioData({ ...input, polygon: polygon.map(([lat, lon]) => [lat + 1, lon]) });
  assert.equal(outside.vegetation.find((o) => o.source === 'Sentinel-2').ndvi, null);
  assert.equal(outside.moisture[0].ndmi, null);
  assert.equal(outside.ground.class, null);
});

test('ground classification uses the polygon centroid, with null for missing site coverage', () => {
  const input = inputFor(earth.fields[0]);
  const [[lat, lon]] = input.polygon;
  const lowGround = { source: 'NASADEM test grid', sites: [{ id: input.field.id,
    bounds: [lon - 0.01, lat - 0.01, lon + 0.01, lat + 0.01], width: 1, height: 1, grid: ['h'] }] };
  assert.equal(buildStudioData({ ...input, lowGround }).ground.class, 'high');
  assert.equal(buildStudioData({ ...input, lowGround: { ...lowGround, sites: [] } }).ground.class, null);
  // Move only the field anchor: the unchanged polygon must still determine the lookup.
  const movedAnchor = buildStudioData({ ...input, field: { ...input.field, lat: 0, lon: 0 }, lowGround });
  assert.equal(movedAnchor.ground.class, 'high');
});

test('growth uses elapsed days and agronomy duration across New Year; FAO constants remain cited scenario limits', () => {
  const input = inputFor(earth.fields[0], 'potato');
  const data = buildStudioData(input);
  const expectedDay = (Date.UTC(2024, 0, 15) - Date.UTC(2023, 10, 1)) / 86400000;
  assert.equal(data.months[0].stageFraction, expectedDay / 92.5);
  assert.equal(data.months[1].stageFraction, 1);
  assert.equal(data.months[1].stage, 'harvest');
  assert.ok(data.months[0].stageFraction > data.months[11].stageFraction);
  const changedAgronomy = { ...packs.agronomy, crops: packs.agronomy.crops.map((c) => c.id === 'potato' ? { ...c, durationDays: [100, 100] } : c) };
  assert.equal(buildStudioData({ ...input, agronomy: changedAgronomy }).months[0].stageFraction, expectedDay / 100);
  assert.deepEqual(FAO56_CROP_LIMITS, { aman: { heightM: 1, rootM: 1 }, boro: { heightM: 1, rootM: 1 },
    mustard: { heightM: 0.6, rootM: 1.5 }, potato: { heightM: 0.6, rootM: 0.6 }, mungbean: { heightM: 0.4, rootM: 1 } });
});

test('farmer outlines accept closed rings, retain their area, and reject invalid polygons and rotations', () => {
  const input = inputFor(earth.fields[0]);
  const normal = buildStudioData(input);
  const closed = buildStudioData({ ...input, polygon: [...input.polygon, input.polygon[0]], boundary: 'farmer' });
  assert.equal(closed.field.boundary, 'farmer');
  assert.deepEqual(closed.field.outlineM, normal.field.outlineM);
  assert.equal(closed.field.areaHa, normal.field.areaHa);
  const reversed = buildStudioData({ ...input, polygon: [...input.polygon].reverse() });
  assert.ok(Math.abs(reversed.field.areaHa - normal.field.areaHa) < 1e-12);
  assert.ok(reversed.field.centroid.every((v, i) => Math.abs(v - normal.field.centroid[i]) < 1e-12));
  assert.throws(() => buildStudioData({ ...input, polygon: [] }), /valid.*polygon/);
  assert.throws(() => buildStudioData({ ...input, polygon: [[91, 0], [91, 1], [92, 1]] }), /valid.*polygon/);
  assert.throws(() => buildStudioData({ ...input, rotationId: 'missing' }), /Unknown rotation/);
  const absent = buildStudioData({ ...input, field: { ...input.field, monthly: input.field.monthly.map((m, i) => i === 0 ? { ...m, rainGpm: null } : m) } });
  assert.equal(absent.months[0].rainMm, null);
  assert.equal(absent.months[0].shortfallMm, null);
  assert.equal(absent.months[0].shortfallLitres, null);
  assert.ok(Number.isFinite(absent.months[0].needMm));
});
