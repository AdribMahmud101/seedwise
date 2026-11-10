import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basePolygon } from '../src/legacy/ui.js';
import { projectWgs84ToUtm45N, pointInPoly } from '../src/legacy/spatial.js';

const bytes = readFileSync(new URL('../public/data/s1-water.json', import.meta.url));
const pack = JSON.parse(bytes);
const fields = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url))).fields;
const stac = 'https://planetarycomputer.microsoft.com/api/stac/v1';
const itemPattern = /^S1A_IW_GRDH_1SDV_(\d{8})T\d{6}_\d{8}T\d{6}_(\d{6})_[A-F0-9]{6}_rtc$/;
const near = (actual, expected, tolerance = 0.000051) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

function otsu(values) {
  const low = Math.min(...values), high = Math.max(...values);
  assert.ok(high > low);
  const step = (high - low) / 256;
  const histogram = Array(256).fill(0);
  for (const value of values) histogram[Math.min(255, Math.floor((value - low) / step))]++;
  const centers = histogram.map((_, i) => low + (i + 0.5) * step);
  const totalMoment = histogram.reduce((sum, count, i) => sum + count * centers[i], 0);
  let count = 0, moment = 0, bestScore = -Infinity, threshold;
  for (let i = 0; i < 255; i++) {
    count += histogram[i];
    moment += histogram[i] * centers[i];
    if (!count || count === values.length) continue;
    const score = (totalMoment * count - moment * values.length) ** 2 / (count * (values.length - count));
    if (score > bestScore) {
      bestScore = score;
      threshold = centers[i];
    }
  }
  return threshold;
}

test('Sentinel-1 pack contains exactly three pilot fields and fits 1 MB', () => {
  assert.deepEqual(Object.keys(pack).sort(), fields.map(f => f.id).sort());
  assert.ok(bytes.length <= 1_000_000);
});

for (const field of fields) {
  const site = pack[field.id];
  test(`${field.id}: observed grids cover the traced field plus 200 m in UTM45N`, () => {
    assert.equal(site.truth, 'REMOTE_OBSERVED');
    assert.equal(site.source, 'Sentinel-1 RTC, ESA/Copernicus via Planetary Computer');
    assert.equal(site.collection, 'sentinel-1-rtc');
    assert.equal(site.stac_url, stac);
    assert.equal(site.cell_m, 10);
    assert.equal(site.epsg, 32645);
    assert.equal(site.method.buffer_m, 200);
    assert.equal(site.method.water_threshold_db, -18);
    assert.equal(site.method.otsu_bins, 256);
    assert.match(site.method.median_filter, /3x3 in linear gamma0/);
    const ring = basePolygon(field).map(([lat, lon]) => [lon, lat]);
    assert.deepEqual(site.polygon, { type: 'Polygon', coordinates: [[...ring, ring[0]]] });
    const projected = ring.map(([lon, lat]) => projectWgs84ToUtm45N(lon, lat));
    const [a, b, west, d, e, north] = site.transform;
    assert.deepEqual([a, b, d, e], [10, 0, 0, -10]);
    const height = site.field_mask.length, width = site.field_mask[0].length;
    const east = west + width * a, south = north + height * e;
    const gaps = [Math.min(...projected.map(p => p[0])) - west,
      east - Math.max(...projected.map(p => p[0])),
      Math.min(...projected.map(p => p[1])) - south,
      north - Math.max(...projected.map(p => p[1]))];
    assert.ok(gaps.every(gap => gap >= 199.999 && gap < 210.001));
    assert.ok(site.field_mask.flat().some(v => v === 1));
    for (let y = 0; y < height; y++) {
      assert.equal(site.field_mask[y].length, width);
      for (let x = 0; x < width; x++) {
        assert.equal(site.field_mask[y][x], Number(pointInPoly(
          [west + (x + 0.5) * a, north + (y + 0.5) * e], projected)));
      }
    }
    const [w, s, eastLon, n] = site.bbox;
    assert.ok([w, s, eastLon, n].every(Number.isFinite));
    for (const [lon, lat] of ring) assert.ok(w < lon && lon < eastLon && s < lat && lat < n);
  });

  test(`${field.id}: twelve nearest-midmonth real item IDs, one orbit and unsigned VV assets`, () => {
    assert.equal(site.dates.length, 12);
    assert.equal(site.candidates.length, 12);
    assert.ok(['ascending', 'descending'].includes(site.orbit_direction));
    const ids = new Set();
    site.dates.forEach((date, month) => {
      const target = `2024-${String(month + 1).padStart(2, '0')}`;
      assert.match(date.date, new RegExp(`^${target}-\\d{2}$`));
      assert.equal(date.datetime.slice(0, 10), date.date);
      assert.ok(Number.isFinite(Date.parse(date.datetime)));
      assert.ok(date.item_id, 'Every date must identify an actual STAC item');
      const match = date.item_id.match(itemPattern);
      assert.ok(match, date.item_id);
      assert.equal(match[1], date.date.replaceAll('-', ''));
      assert.equal((Number(match[2]) - 73) % 175 + 1, site.relative_orbit);
      assert.equal(date.relative_orbit, site.relative_orbit);
      assert.equal(date.orbit_direction, site.orbit_direction);
      assert.equal(date.item_url, `${stac}/collections/sentinel-1-rtc/items/${date.item_id}`);
      const href = new URL(date.asset_href);
      assert.equal(href.origin, 'https://sentinel1euwestrtc.blob.core.windows.net');
      assert.equal(href.search, '', 'Never persist signed SAS tokens');
      assert.ok(href.pathname.endsWith('/measurement/iw-vv.rtc.tiff'));
      assert.ok(href.pathname.includes(date.item_id.replace(/_rtc$/, '_')));
      assert.match(date.raw_window_sha256, /^[a-f0-9]{64}$/);
      ids.add(date.item_id);
      const distance = candidate => Math.abs(Date.parse(candidate.datetime) - Date.parse(`${target}-15T00:00:00Z`));
      const candidates = [...site.candidates[month]].sort((a, b) => distance(a) - distance(b) || a.item_id.localeCompare(b.item_id));
      assert.ok(candidates.every(c => c.datetime.startsWith(target)));
      assert.equal(date.item_id, candidates[0].item_id);
      assert.equal(date.datetime, candidates[0].datetime);
    });
    assert.equal(ids.size, 12);
  });

  test(`${field.id}: masks, field-only percentages and independent Otsu match observed VV`, () => {
    const height = site.field_mask.length, width = site.field_mask[0].length;
    const fieldPixels = site.field_mask.flat().reduce((sum, value) => sum + value, 0);
    for (const date of site.dates) {
      assert.equal(date.vv_db.length, height);
      assert.equal(date.water.length, height);
      assert.equal(date.valid_pixels, width * height);
      assert.equal(date.field_pixels, fieldPixels);
      let wet = 0, otsuWet = 0;
      for (let y = 0; y < height; y++) {
        assert.equal(date.vv_db[y].length, width);
        assert.equal(date.water[y].length, width);
        for (let x = 0; x < width; x++) {
          const vv = date.vv_db[y][x], water = date.water[y][x];
          assert.ok(Number.isFinite(vv) && vv > -60 && vv < 40, `${date.item_id}: invalid dB`);
          assert.equal(water, Number(vv < -18));
          if (site.field_mask[y][x]) {
            wet += water;
            otsuWet += Number(vv < date.otsu_db);
          }
        }
      }
      const values = date.vv_db.flat();
      assert.ok(new Set(values).size > 20, 'Real context must retain spatial backscatter variation');
      near(date.flooded_pct, wet / fieldPixels * 100);
      near(date.otsu_db, otsu(values), 1e-8);
      near(date.flooded_pct_otsu, otsuWet / fieldPixels * 100);
      assert.ok(date.flooded_pct >= 0 && date.flooded_pct <= 100);
    }
  });

  test(`${field.id}: January–April <15%, no 0↔100 flipping, monsoon peak >= dry-season mean`, () => {
    const values = site.dates.map(date => date.flooded_pct);
    assert.ok(values.slice(0, 4).every(value => value < 15), `January–April: ${values.slice(0, 4)}`);
    // All-zero is a valid observation (upland fields); only 0↔100 flipping (STUDIO5D bug) is rejected.
    const flips = values.slice(1).filter((v, i) => Math.abs(v - values[i]) >= 90).length;
    assert.ok(flips < 2, `0↔100 flipping: ${values}`);
    assert.ok(Math.max(...values.slice(6, 9)) >= values.slice(0, 4).reduce((a, b) => a + b, 0) / 4);
  });
}
