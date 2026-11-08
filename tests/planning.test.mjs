import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  areaHa,
  polygonValid,
  pairedQA,
  rankRotations,
  rotationEvidence,
  capacity,
  nutrientProducts,
} from '../src/legacy/engine.js';
const data = JSON.parse(
  readFileSync(new URL('../public/data/earth-data.json', import.meta.url))
);
const history = JSON.parse(
  readFileSync(new URL('../public/data/history.json', import.meta.url))
);

test('geometry uses hectares, rejects crossing and duplicate corners', () => {
  const point = 25.54,
    m = 111195.08,
    h = 100 / m,
    w = 100 / (m * Math.cos((point * Math.PI) / 180));
  const p = [
    [point, 89.27],
    [point, 89.27 + w],
    [point + h, 89.27 + w],
    [point + h, 89.27],
  ];
  assert.ok(Math.abs(areaHa(p) - 1) < 0.001);
  assert.ok(polygonValid(p));
  assert.equal(polygonValid([p[0], p[2], p[1], p[3]]), false);
  assert.equal(polygonValid([...p, p[0]]), false);
});
test('missing rainfall stays missing, measured zero is retained, only matched days enter disagreement', () => {
  const result = pairedQA([
    { rainPower: 0, rainGpm: 0 },
    { rainPower: null, rainGpm: 8 },
    { rainPower: 5, rainGpm: 1 },
  ]);
  assert.equal(result.n, 2);
  assert.equal(result.meanDifference, 2);
  assert.equal(result.mae, 2);
  assert.equal(pairedQA([]).meanDifference, null);
});
test('all-zero priorities abstain and low-budget / flood constraints stay visible', () => {
  const list = rankRotations(
    { water: 0, soil: 0, cost: 0, risk: 0 },
    { budget: 'low', floodDays: 20 }
  );
  assert.ok(list.every((s) => s.score === null));
  assert.equal(list[0].id, 'baseline');
  assert.ok(list.find((s) => s.id === 'legume').issues.length >= 2);
});
test('rain and ETo alter the water comparison while other priorities remain intact', () => {
  const f = data.fields[0],
    weights = { water: 5, soil: 0, cost: 0, risk: 0 };
  const actual = rotationEvidence(f.monthly, weights, {}),
    wet = rotationEvidence(
      f.monthly.map((m) => ({ ...m, rainGpm: 5000 })),
      weights,
      {}
    );
  assert.ok(actual.every((s) => Number.isFinite(s.deficit) && s.deficit > 0));
  assert.ok(wet.every((s) => s.deficit === 0));
  assert.notEqual(actual[0].deficit, wet[0].deficit);
});
test('capacity distinguishes hills from broadcast seed, with BARC elemental conversion', () => {
  assert.equal(capacity(1, 80, 'rice', 0.2, 0.2).positions, 200000);
  assert.equal(capacity(1, 80, 'mustard', 0, 0).positions, null);
  assert.ok(Math.abs(capacity(1, 80, 'mustard', 0, 0).seedKg - 5.6) < 1e-8);
  assert.deepEqual(nutrientProducts(46, 20, 50), {
    urea: 100,
    tsp: 100,
    mop: 100,
  });
});
test('archive and optical QA carry real coverage, scope and missing values', () => {
  for (const field of data.fields) {
    assert.equal(field.daily.length, 366);
    assert.equal(field.monthly.length, 12);
    assert.equal(field.qa.pairedDays, 366);
    assert.equal(history.fields[field.id].monthly.length, 60);
    const july = field.opticalHistory.find((x) => x.date.startsWith('2024-07'));
    assert.equal(july.opticalQA.validPixels, 0);
    assert.equal(july.opticalQA.ndvi, null);
    assert.equal(july.opticalQA.cloudMaskLoss, 1);
    const jan = field.opticalHistory[0];
    assert.ok(
      jan.opticalQA.validPixels > 0 && Number.isFinite(jan.opticalQA.ndvi)
    );
    assert.ok(field.contextImage.date === '2024-03-09');
  }
});
