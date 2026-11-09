import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FILE_PATH = resolve(ROOT, 'public/data/s1-water.json');

test('Sentinel-1 water data exists, satisfies schema, and stays within budget <= 1 MB', () => {
  const stat = statSync(FILE_PATH);
  assert.ok(stat.size > 0, 's1-water.json should not be empty');
  assert.ok(stat.size <= 1_000_000, `s1-water.json (${stat.size} bytes) must be <= 1 MB`);

  const data = JSON.parse(readFileSync(FILE_PATH, 'utf8'));

  assert.equal(data.schemaVersion, 1);
  assert.equal(data.truth, 'REMOTE_OBSERVED');
  assert.equal(data.source, 'Sentinel-1 RTC, ESA/Copernicus via Planetary Computer');
  assert.ok(typeof data.retrievedAt === 'string');

  const expectedSites = ['mithapukur', 'pirganj', 'gangachara'];
  assert.deepEqual(Object.keys(data.sites).sort(), expectedSites.sort());

  for (const siteId of expectedSites) {
    const site = data.sites[siteId];
    assert.equal(site.siteId, siteId);
    assert.ok(Array.isArray(site.bbox) && site.bbox.length === 4);
    assert.ok(site.bbox[0] < site.bbox[2], 'west < east');
    assert.ok(site.bbox[1] < site.bbox[3], 'south < north');
    assert.equal(site.cell_m, 20);
    assert.ok(site.width >= 20 && site.height >= 20);

    assert.ok(Array.isArray(site.dates) && site.dates.length >= 10, 'Expected at least 10 observation dates across 2024');

    const seasonsSeen = new Set();
    for (const d of site.dates) {
      assert.match(d.date, /^2024-\d{2}-\d{2}$/);
      assert.ok(typeof d.sceneId === 'string' && d.sceneId.length > 0);
      assert.ok(typeof d.season === 'string');
      seasonsSeen.add(d.season);

      // vv_db grid checks
      assert.ok(Array.isArray(d.vv_db) && d.vv_db.length === site.height);
      for (const row of d.vv_db) {
        assert.equal(row.length, site.width);
        for (const val of row) {
          assert.ok(typeof val === 'number' && Number.isFinite(val));
          assert.ok(val >= -50 && val <= 20, `VV dB value ${val} out of plausible SAR backscatter range`);
        }
      }

      // water mask checks (0 or 1)
      assert.ok(Array.isArray(d.water) && d.water.length === site.height);
      for (const row of d.water) {
        assert.equal(row.length, site.width);
        for (const val of row) {
          assert.ok(val === 0 || val === 1, `Water pixel must be 0 or 1, got ${val}`);
        }
      }

      // flooded percentage
      assert.ok(typeof d.flooded_pct === 'number' && Number.isFinite(d.flooded_pct));
      assert.ok(d.flooded_pct >= 0 && d.flooded_pct <= 100, `flooded_pct ${d.flooded_pct} out of range [0, 100]`);
    }

    assert.ok(seasonsSeen.has('pre_monsoon'), 'Must cover pre-monsoon');
    assert.ok(seasonsSeen.has('peak_monsoon'), 'Must cover peak monsoon');
    assert.ok(seasonsSeen.has('aman'), 'Must cover aman');
    assert.ok(seasonsSeen.has('post_flood'), 'Must cover post flood');
  }
});
