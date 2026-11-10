import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fieldFlow, fillAndSpill, interpolateSoil, productivityZones, surfaceLegend, pondingPositions, pointInPolygon } from '../src/legacy/studio3d-helpers.js';
import { basePolygon } from '../src/legacy/ui.js';
import { projectWgs84ToUtm45N } from '../src/legacy/spatial.js';

const square = [[0, 0], [100, 0], [100, 100], [0, 100]];

test('D8 slope sends every cell to the low corner, with no cycles or polygon leaks', () => {
  const flow = fieldFlow(square, (x, y) => (x + y) / 50, 20);
  assert.equal(flow.accumulation[flow.outlet], flow.cells.length);
  assert.equal(flow.cells[flow.outlet].x, 2.5);
  assert.equal(flow.cells[flow.outlet].y, 2.5);
  for (let i = 0; i < flow.cells.length; i++) {
    let next = i, hops = 0;
    while (flow.direction[next] >= 0) {
      const target = flow.direction[next];
      assert.ok(flow.cells[target].elevation <= flow.cells[next].elevation);
      assert.ok(++hops < flow.cells.length);
      next = target;
    }
    assert.equal(next, flow.outlet);
    assert.ok(pointInPolygon(flow.cells[i].x, flow.cells[i].y, square));
  }
  assert.equal(fieldFlow([], () => 0), null);
  assert.equal(fieldFlow(square, () => null), null);
});

test('fill-and-spill conserves volume across slopes, flats, depressions, and drainage', () => {
  for (const height of [(x, y) => (x + y) / 50, () => 30,
    (x, y) => Math.min(Math.hypot(x - 25, y - 25) / 20, 1.5) + x / 100,
    (x, y) => Math.sin(x / 13) * Math.cos(y / 15) + x / 60]) {
    const flow = fieldFlow(square, height, 20);
    assert.equal(flow.direction.reduce((sum, next, i) => sum + (next < 0 ? flow.accumulation[i] : 0), 0), flow.cells.length);
    for (let i = 0; i < flow.cells.length; i++) if (flow.direction[i] >= 0) {
      assert.ok(flow.cells[flow.direction[i]].elevation <= flow.cells[i].elevation, 'D8 runoff must never climb a pit wall');
    }
    let previous = null;
    for (const rain of [0, 1, 45, 240, 5000]) {
      for (const drainFraction of [0, 0.55, 1]) {
        const pond = fillAndSpill(flow, rain, { areaM2: 10000, drainFraction });
        assert.equal(pond.inputM3, rain / 1000 * 10000 * 0.5);
        assert.ok(Math.abs(pond.storedM3 + pond.drainedM3 - pond.inputM3) < 1e-7,
          `rain ${rain}: ${pond.storedM3} + ${pond.drainedM3} != ${pond.inputM3}`);
        assert.ok(pond.depths.every((d) => Number.isFinite(d) && d >= 0));
        if (rain === 0 || drainFraction === 1) assert.ok(pond.depths.every((d) => d === 0));
        if (!drainFraction) {
          if (previous) assert.ok(pond.depths.every((d, i) => d >= previous[i] - 1e-8));
          previous = pond.depths;
        }
      }
    }
  }
});

test('routed ponding mesh grows above terrain and stays in its source triangles', () => {
  const surface = [0, 0, 0, 10, 1, 0, 0, 0, 10];
  const water = pondingPositions(surface, { rainMm: 240, depthAt: (x) => Math.max(0, .24 - x / 10) });
  assert.ok(water.length > 0);
  for (let i = 0; i < water.length; i += 3) {
    const [x, y, z] = water.slice(i, i + 3);
    assert.ok(x >= 0 && z >= 0 && x + z <= 10 + 1e-6);
    assert.ok(y > x / 10);
  }
});

test('SoilGrids bilinear interpolation remains inside real neighbours and rejects missing data', () => {
  const pack = JSON.parse(readFileSync(new URL('../public/data/soil-profile.json', import.meta.url)));
  for (const site of Object.values(pack.sites)) {
    const grid = site.neighborhood;
    assert.equal(grid.ph.length, 3);
    assert.equal(grid.requestUrls.length, 2);
    for (const key of ['ph', 'omPct']) for (let row = 0; row <= 20; row++) for (let col = 0; col <= 20; col++) {
      const value = interpolateSoil(grid, grid.west + col / 10 * grid.stepLon, grid.north - row / 10 * grid.stepLat, key);
      assert.ok(value >= Math.min(...grid[key].flat()) - 1e-8);
      assert.ok(value <= Math.max(...grid[key].flat()) + 1e-8);
    }
    assert.equal(interpolateSoil(grid, 0, 0, 'ph'), null);
    const missing = { ...grid, ph: [[null, 6, 6], [6, 6, 6], [6, 6, 6]] };
    assert.equal(interpolateSoil(missing, grid.west, grid.north, 'ph'), null);
  }
  assert.equal(interpolateSoil(null, 89, 25, 'ph'), null);
});

test('productivity uses two real NDVI dates, handles masks, and percentages sum to 100 after smoothing', () => {
  const grids = JSON.parse(readFileSync(new URL('../public/data/ndvi-grid.json', import.meta.url))).grids;
  for (const id of ['mithapukur', 'pirganj', 'gangachara']) {
    const source = grids.filter((g) => g.siteId === id);
    const [west, south, east, north] = source[0].bounds;
    const coordinates = (x, y) => [west + (east - west) * x / 100, south + (north - south) * y / 100];
    const zones = productivityZones(source, square, coordinates);
    assert.equal(zones.dates.length, 2);
    assert.ok(zones.cells.some((c) => c.value === 0));
    assert.ok(zones.cells.some((c) => c.value === 2));
    assert.ok(zones.cells.filter((c) => c.values.some((v) => v === null)).every((c) => c.value === null));
    const legend = surfaceLegend('productivity', { cells: zones.cells, zoneDates: zones.dates });
    assert.ok(Math.abs(legend.classes.reduce((sum, c) => sum + c.pct, 0) - 100) < 1e-8);
    assert.equal(legend.truth, 'MODELED');
    assert.match(legend.note, /tertiles.*3×3 majority/);
  }
  const [x, y] = projectWgs84ToUtm45N(89.27, 25.54);
  const tiny = { crs: 'EPSG:32645', transform: [20, 0, x - 10, 0, -20, y + 10], values: [[.6]], date: '2024-03-09' };
  const zones = productivityZones([tiny, { ...tiny, date: '2024-11-09' }], [[-5, -5], [5, -5], [5, 5], [-5, 5]],
    (east, north) => [89.27 + east / (111195.08 * Math.cos(25.54 * Math.PI / 180)), 25.54 + north / 111195.08]);
  assert.equal(zones.cells.length, 1);
  assert.equal(zones.cells[0].value, 1);
  assert.equal(productivityZones([], square, () => [89, 25]).at(89, 25), null);
});

test('small pilot fields include partial rim pixels and retain real productivity variation', () => {
  const fields = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url))).fields;
  const grids = JSON.parse(readFileSync(new URL('../public/data/ndvi-grid.json', import.meta.url))).grids;
  for (const field of fields) {
    const scaleX = 111195.08 * Math.cos(field.lat * Math.PI / 180);
    const outline = basePolygon(field).map(([lat, lon]) => [(lon - field.lon) * scaleX, (lat - field.lat) * 111195.08]);
    const coordinates = (x, y) => [field.lon + x / scaleX, field.lat + y / 111195.08];
    const zones = productivityZones(grids.filter((g) => g.siteId === field.id), outline, coordinates);
    assert.ok(zones.cells.length >= 6, `${field.id}: partial pixels must be included`);
    assert.ok(zones.cells.some((c) => c.value === 0));
    assert.ok(zones.cells.some((c) => c.value === 2));
    const legend = surfaceLegend('productivity', { cells: zones.cells, zoneDates: zones.dates });
    assert.equal(legend.classes.at(-1).pct, 0, 'valid edge pixels must not become No data');
    assert.ok(Math.abs(legend.classes.reduce((sum, c) => sum + c.pct, 0) - 100) < 1e-8);
  }
});
