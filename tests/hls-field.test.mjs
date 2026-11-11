import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basePolygon, nasaBadge, nasaSources, state } from '../src/legacy/ui.js';

test('HLS field receipt covers every site and target with measured values or documented gaps', () => {
  const pack = JSON.parse(readFileSync(new URL('../public/data/hls-field.json', import.meta.url)));
  const soil = JSON.parse(readFileSync(new URL('../public/data/soil-nutrients.json', import.meta.url)));
  const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
  assert.equal(pack.schemaVersion, 1);
  assert.equal(pack.resolutionMetres, 30);
  assert.match(pack.source, /NASA HLS.*v2/);
  assert.match(pack.url, /^https:\/\//);
  assert.ok(Number.isFinite(Date.parse(pack.retrievedAt)));
  assert.match(pack.method, /Fmask/);
  assert.deepEqual(Object.keys(pack.sites).sort(), Object.keys(soil.sites).sort());
  for (const [id, site] of Object.entries(pack.sites)) {
    assert.ok(site.polygon.length >= 4);
    assert.deepEqual(site.polygon, basePolygon(earth.fields.find(f => f.id === id)));
    assert.deepEqual(site.observations.map(o => o.targetDate), ['2024-03-09', '2024-11-09']);
    for (const o of site.observations) {
      assert.ok(Array.isArray(o.attemptedItemIds));
      assert.ok(Array.isArray(o.attempts));
      assert.deepEqual(o.attemptedItemIds, o.attempts.map(a => a.itemId));
      assert.ok(o.attempts.every(a => /^HLS\.(L30|S30)\./.test(a.itemId)));
      assert.ok(Number.isInteger(o.cellCount) && o.cellCount >= 0);
      for (const attempt of o.attempts) {
        assert.match(attempt.url, /^https:\/\//);
        if (attempt.cellCount === 0 || attempt.cellCount === undefined) assert.ok(attempt.reason);
      }
      for (const key of ['ndvi', 'ndmi']) {
        assert.ok(o[key] === null || (Number.isFinite(o[key]) && o[key] >= -1 && o[key] <= 1));
        if (o[key] === null) assert.ok(o.reason);
      }
      if (o.cellCount) {
        assert.ok(o.attemptedItemIds.includes(o.itemId));
        assert.ok(pack.itemIds.includes(o.itemId));
        assert.ok(Math.abs(Date.parse(o.date) - Date.parse(o.targetDate)) <= 10 * 86400000);
        assert.match(o.sensor, /^(Landsat-[89]|Sentinel-2[AB])$/i);
        assert.equal(o.reason, null);
        assert.ok(Number.isFinite(o.ndvi) && Number.isFinite(o.ndmi));
        assert.ok(o.eligibleCellCount >= o.cellCount);
        assert.equal(o.assets.length, 4);
        for (const asset of o.assets) {
          assert.match(asset.url, /^https:\/\//);
          assert.ok(!new URL(asset.url).search, 'no signed tokens in shipped receipts');
          assert.match(asset.windowSha256, /^[a-f0-9]{64}$/);
        }
      } else {
        assert.equal(o.ndvi, null);
        assert.equal(o.ndmi, null);
        assert.ok(o.reason);
      }
    }
  }
});

test('HLS fetcher self-check rejects cloud/shadow, fill and invalid reflectance', () => {
  const result = spawnSync('python', ['scripts/fetch-hls-field.py', '--self-check'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /self-check passed/);
});

test('HLS and Sentinel badges keep bilingual sources and distinct agency attribution', () => {
  for (const key of ['hls', 'sentinel2']) {
    const entry = nasaSources[key];
    assert.ok(entry, key);
    assert.match(entry.url, /^https:\/\//);
    for (const prop of ['name', 'line', 'label', 'res']) {
      assert.equal(entry[prop].length, 2);
      assert.match(entry[prop][1], /[\u0980-\u09ff]/);
    }
  }
  try {
    state.lang = 'en';
    assert.match(nasaBadge('hls'), />NASA HLS<\/button>/);
    const partner = nasaBadge('sentinel2');
    assert.match(partner, /partner-chip/);
    assert.match(partner, />ESA · Space Apps partner<\/button>/);
    assert.match(partner, /aria-label="ESA data source"/);
    assert.doesNotMatch(partner, />NASA[^<]*<\/button>/);
    assert.equal(nasaBadge('esri'), '');
    assert.equal(nasaBadge('soilgrids'), '');
  } finally { state.lang = 'en'; }
});
