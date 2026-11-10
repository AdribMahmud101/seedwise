import test from 'node:test';
import assert from 'node:assert/strict';
import { surfaceLegend, surfaceClass, surfaceCells, cropSurfaceValue, pondingDepthCm, pondingWaterline, sampleSurfaceGrid } from '../src/legacy/studio3d-helpers.js';
import { projectWgs84ToUtm45N } from '../src/legacy/spatial.js';
import { surfaceLegendHtml, studio3dHtml } from '../src/legacy/studio3d.js';
import { state } from '../src/legacy/ui.js';
import { readFile } from 'node:fs/promises';

const square = [[0, 0], [10, 0], [10, 10], [0, 10]];
const legendFor = (mode, values, extra = {}) => surfaceLegend(mode, {
  cells: values.map((value) => ({ value, area: 1 })), ...extra,
});

test('texture classifier uses the legend breaks, including exact boundaries', () => {
  for (const [mode, values, expected] of [
    ['ndvi', [-0.1, 0.1999, 0.2, 0.4, 0.6, 0.75, 0.7501], [0, 0, 1, 2, 3, 3, 4]],
    ['moisture', [-0.5, 0, 0.2, 0.4, 0.6, 1], [0, 1, 2, 3, 4, 4]],
    ['water', [0, 0.01, 4.99, 5, 15, 30, 30.01], [0, 1, 1, 2, 3, 3, 4]],
    ['fertility', [4, 4.5, 5.5, 6.1, 6.5, 7.5, 8.5], [0, 1, 2, 2, 3, 4, 5]],
  ]) {
    const legend = legendFor(mode, values);
    assert.deepEqual(values.map((v) => legend.classes.indexOf(surfaceClass(legend, v))), expected);
    assert.ok(Math.abs(legend.classes.reduce((sum, c) => sum + c.pct, 0) - 100) <= 0.5);
    assert.ok(legend.classes.every((c) => /^#[0-9a-f]{6}$/i.test(c.color)));
  }
  assert.equal(legendFor('water', [1]).classes[1].color, '#1d6fe0');
  assert.equal(legendFor('water', [31]).classes[4].color, '#0b3d91');
});

test('area percentages weight only polygon cells, including concave outlines', () => {
  const ring = [[0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]];
  const cells = surfaceCells(ring, (x) => x < 5 ? 0.1 : 0.8, 100);
  assert.equal(cells.length, 7500);
  const legend = surfaceLegend('ndvi', { cells });
  assert.ok(Math.abs(legend.classes[0].pct - 200 / 3) < 0.05);
  assert.ok(Math.abs(legend.classes[4].pct - 100 / 3) < 0.05);
  const weighted = surfaceLegend('ndvi', { cells: [{ value: 0.1, area: 1 }, { value: 0.8, area: 3 }] });
  assert.equal(weighted.classes[0].pct, 25);
  assert.equal(weighted.classes[4].pct, 75);
});

test('all surface modes account for unknown coverage without inventing measurements', () => {
  for (const mode of ['crops', 'ndvi', 'moisture', 'water', 'elevation', 'fertility', 'productivity']) {
    const legend = legendFor(mode, [null, undefined, NaN, Infinity], { elevationMin: 30, elevationMax: 32 });
    assert.equal(legend.classes.at(-1).pct, 100);
    assert.match(legend.classes.at(-1).label, /No data/);
    assert.equal(surfaceClass(legend, null), legend.classes.at(-1));
    assert.ok(legend.title && legend.truth && legend.source && legend.date);
  }
  assert.equal(surfaceCells([], () => 1).length, 0);
});

test('canopy classes use the rotation crop and growth stage', () => {
  const month = { cropId: 'mustard', cropName: 'Mustard', stage: 'grow', month: '2024-01' };
  for (const [stage, value] of [['establish', 0], ['grow', 1], ['mature', 2], ['harvest', 2], ['fallow', 3]]) {
    assert.equal(cropSurfaceValue({ ...month, stage }), value);
  }
  const legend = legendFor('crops', [1], { month });
  assert.match(legend.title, /Mustard/);
  assert.match(legend.note, /Illustrative.*rotation plan/);
  assert.equal(legend.truth, 'SCENARIO');
  assert.equal(legend.classes[1].pct, 100);
});

test('fertility explains the single sampled cell, measured pH/OM and missing nutrient tests', () => {
  const legend = legendFor('fertility', [6.1], {
    soil: { cellM: 250, layers: [{ ph: 6.1, socGkg: 17.3 }] },
    soilCellCount: 1,
  });
  assert.match(legend.note, /Whole field.*one 250 m soil cell.*one class: Medium.*pH 6.1, OM 2.98 %/);
  assert.match(legend.note, /P\/K\/Zn\/B: add soil test/);
  assert.equal(legend.truth, 'MODELED');
  assert.equal(legend.classes[2].pct, 100);
  const bn = legendFor('fertility', [6.1], { lang: 'bn', soil: { cellM: 250, layers: [{ ph: 6.1, socGkg: 17.3 }] }, soilCellCount: 1 });
  assert.match(bn.note, /২৫০ মি.*মাটি পরীক্ষা যোগ করুন/s);
  const modeled = legendFor('fertility', [6.1], { soil: { layers: [{ ph: 6.1 }] }, soilOverrides: { gwDepthM: 2 } });
  assert.equal(modeled.truth, 'MODELED');
  const measured = legendFor('fertility', [6.1], { soilOverrides: { ph: 6.1 } });
  assert.equal(measured.truth, 'FARMER_REPORTED');
  assert.match(measured.source, /Farmer soil test/);
  assert.match(measured.date, /Soil test date unavailable/);
});

test('satellite dates, real elevation bounds, contours and scenario provenance are explicit', () => {
  for (const mode of ['ndvi', 'moisture']) {
    const legend = legendFor(mode, [0.5], { observation: { date: '2024-03-09' } });
    assert.equal(legend.date, '2024-03-09');
    assert.match(legend.source, /Sentinel-2/);
    assert.equal(legend.truth, 'REMOTE_OBSERVED');
  }
  const elevation = legendFor('elevation', [31, 33], { elevationMin: 31, elevationMax: 33, exaggeration: 4.5 });
  assert.equal(elevation.classes[0].from, 31);
  assert.equal(elevation.classes[4].to, 33);
  assert.match(elevation.note, /31.00.*33.00 m.*contours every 0.25 m.*4.5×/);
  const water = legendFor('water', [0, 3], { rainMm: 120, radarObservation: { date: '2024-03-15', floodedPct: 25 } });
  assert.match(water.note, /120 mm/);
  assert.match(water.remote, /Sentinel-1.*25.0 %.*2024-03-15/);
  assert.match(water.note, /runoff coefficient 0.5/);
  assert.equal(water.flowRows.length, 2);
  assert.equal(water.truth, 'SCENARIO');
  assert.equal(pondingDepthCm(0, 0, { rainMm: 120 }), 12);
  assert.equal(pondingDepthCm(1, 0, { rainMm: 120 }), 0);
  assert.equal(pondingDepthCm(0, 0, { rainMm: 0, waterMask: 1 }), 0);
  assert.ok(pondingDepthCm(0, 0, { rainMm: 120, proposedDrain: true }) < 12);
  assert.ok(pondingDepthCm(0, 0, { rainMm: 120, outletBlocked: true }) > 12);
});

test('empty fields and flat elevations keep finite percentages and readable classes', () => {
  const flat = legendFor('elevation', [30, 30], { elevationMin: 30, elevationMax: 30 });
  assert.equal(surfaceClass(flat, 30).pct, 100);
  assert.equal(flat.classes.reduce((sum, c) => sum + c.pct, 0), 100);
  assert.ok(surfaceLegend('ndvi', { cells: [] }).classes.every((c) => Number.isFinite(c.pct)));
  assert.equal(surfaceCells(square, () => null, 10).length, 100);
});

test('optical texture samples the actual projected grid and preserves masked cells', () => {
  const [x, y] = projectWgs84ToUtm45N(89.27, 25.54);
  const grid = { crs: 'EPSG:32645', transform: [20, 0, x - 10, 0, -20, y + 10], values: [[0.72]] };
  assert.equal(sampleSurfaceGrid(grid, 89.27, 25.54), 0.72);
  assert.equal(sampleSurfaceGrid(grid, 0, 0), null);
  for (const value of [null, undefined, NaN, Infinity, -2, 2]) {
    assert.equal(sampleSurfaceGrid({ ...grid, values: [[value]] }, 89.27, 25.54), null);
  }
  assert.equal(sampleSurfaceGrid(null, 89.27, 25.54), null);
});

test('white waterline contains the wet perimeter without the shared diagonal', () => {
  const line = pondingWaterline([0, 0.02, 0, 10, 0.02, 0, 10, 0.02, 10,
    0, 0.02, 0, 10, 0.02, 10, 0, 0.02, 10]);
  assert.equal(line.length, 4 * 6);
  for (let i = 0; i < line.length; i += 6) {
    assert.ok(line[i] === line[i + 3] || line[i + 2] === line[i + 5]);
  }
  assert.deepEqual(pondingWaterline([]), []);
});

test('RELVAR: moisture shows field-relative tertile classes with the absolute headline', () => {
  // Real-ish NDMI sample (mithapukur March cells): all inside absolute 0.2–0.4 "Moist".
  const values = [0.264, 0.305, 0.323, 0.324, 0.331, 0.331, 0.342, 0.344, 0.355];
  const absolute = legendFor('moisture', values, { observation: { date: '2024-03-09' } });
  assert.equal(absolute.scale, 'absolute');
  assert.equal(absolute.classes[2].pct, 100);
  const legend = legendFor('moisture', values, { observation: { date: '2024-03-09' }, relative: true });
  assert.equal(legend.scale, 'relative');
  assert.equal(legend.classes.length, 4); // three relative classes + No data
  assert.match(legend.classes[0].label, /Drier than field/);
  assert.match(legend.classes[1].label, /Typical/);
  assert.match(legend.classes[2].label, /Wetter than field/);
  assert.match(legend.classes[0].label, /<0\.324/); // tertile cuts are stated
  assert.match(legend.classes[1].label, /0\.324–0\.335/);
  assert.match(legend.classes[2].label, /≥0\.335/);
  for (const c of legend.classes.slice(0, 3)) assert.ok(Math.abs(c.pct - 100 / 3) < 0.01);
  assert.match(legend.headline, /Overall: Moist · NDMI 0\.26–0\.35, 2024-03-09/);
  assert.match(legend.note, /tertiles/);
  assert.equal(legend.truth, 'REMOTE_OBSERVED');
  assert.match(legend.source, /Sentinel-2 L2A/);
  assert.equal(surfaceClass(legend, 0.264), legend.classes[0]); // colouring follows relative classes
  assert.equal(surfaceClass(legend, 0.331), legend.classes[1]);
  assert.equal(surfaceClass(legend, 0.355), legend.classes[2]);
  assert.equal(surfaceClass(legend, null), legend.classes.at(-1));
});

test('RELVAR: a narrow NDMI range shows uniform instead of forced classes', () => {
  const legend = legendFor('moisture', [0.3, 0.305, 0.31, 0.312], {
    observation: { date: '2024-11-09' }, relative: true,
  });
  assert.equal(legend.scale, 'uniform');
  assert.equal(legend.classes.length, 2); // uniform + No data
  assert.match(legend.classes[0].label, /no meaningful difference/i);
  assert.equal(legend.classes[0].pct, 100);
  assert.match(legend.headline, /Overall: Moist/);
  const edge = legendFor('moisture', [0.3, 0.32], { observation: { date: '2024-11-09' }, relative: true });
  assert.equal(edge.scale, 'relative'); // range exactly 0.02 still splits
});

test('RELVAR: NDVI defaults to within-field at ≥95 % one class, with an absolute toggle', () => {
  const concentrated = [0.62, 0.64, 0.66, 0.68, 0.7, 0.72]; // 100 % Dense 0.6–0.75
  const within = legendFor('ndvi', concentrated, { observation: { date: '2024-03-09' }, relative: 'auto' });
  assert.equal(within.scale, 'relative');
  assert.match(within.classes[0].label, /Less green than field/);
  assert.match(within.classes[2].label, /Greener than field/);
  assert.match(within.headline, /Overall: Dense · NDVI 0\.62–0\.72, 2024-03-09/);
  const mixed = [0.1, 0.3, 0.5, 0.7, 0.8];
  assert.equal(legendFor('ndvi', mixed, { observation: { date: '2024-03-09' }, relative: 'auto' }).scale, 'absolute');
  assert.equal(legendFor('ndvi', concentrated, { observation: { date: '2024-03-09' }, relative: false }).scale, 'absolute');
  assert.equal(legendFor('ndvi', mixed, { observation: { date: '2024-03-09' }, relative: true }).scale, 'relative');
  const html = surfaceLegendHtml(within);
  assert.match(html, /data-relative-toggle="absolute"/);
  assert.match(html, /data-relative-toggle="relative"/);
  assert.match(html, /Within this field/);
});

test('RELVAR: fertility shows one honest class with coarse-map callout actions', () => {
  const legend = legendFor('fertility', [5.86, 5.87, 5.88], {
    soil: { layers: [{ ph: 5.87, socGkg: 12 }] },
    soilRange: { ph: [5.86, 5.88], om: [2.1, 2.2] },
  });
  assert.equal(legend.classes[2].pct, 100); // one absolute pH class, no invented zones
  assert.match(legend.note, /one class/);
  assert.match(legend.note, /5\.86.*5\.88/);
  assert.match(legend.note, /below test resolution/);
  assert.doesNotMatch(legend.note, /contrast stretched/);
  const html = surfaceLegendHtml(legend);
  assert.match(html, /too coarse to show differences inside this field/);
  assert.match(html, /data-surface-goto="productivity"/);
  assert.match(html, /Productivity zones/);
  assert.match(html, /data-soil-test/);
  const measured = legendFor('fertility', [6.1], { soilOverrides: { ph: 6.1 } });
  assert.ok(!surfaceLegendHtml(measured).includes('data-surface-goto')); // farmer test needs no coarse-map callout
});

test('one bilingual legend includes an accessible 72 px donut, percentages and provenance in every mode', async () => {
  const fixture = JSON.parse(await readFile(new URL('fixtures/studio-data.json', import.meta.url)));
  try {
    for (const lang of ['en', 'bn']) {
      state.lang = lang;
      assert.equal((studio3dHtml(fixture).match(/<details class="studio-surface-legend"/g) || []).length, 1);
      assert.match(studio3dHtml(fixture), /option value="moisture"/);
      assert.match(studio3dHtml(fixture), /option value="productivity"/);
      for (const mode of ['crops', 'ndvi', 'moisture', 'water', 'elevation', 'fertility', 'productivity']) {
        const legend = legendFor(mode, [0.5], { lang, month: fixture.months[0], elevationMin: 0, elevationMax: 1 });
        const html = surfaceLegendHtml(legend);
        assert.match(html, /width="72" height="72"/);
        assert.match(html, /role="img" aria-label=/);
        assert.match(html, /100.0 %/);
        assert.ok(html.includes(legend.source));
        assert.ok(html.includes(legend.date));
        assert.match(html, lang === 'bn' ? /রঙের নির্দেশিকা/ : /Colour key/);
      }
    }
  } finally { state.lang = 'en'; }
});
