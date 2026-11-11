import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCalloutData } from '../src/legacy/studio3d-helpers.js';
import { nasaBadge } from '../src/legacy/ui.js';

const readPack = name => JSON.parse(readFileSync(new URL(`../public/data/${name}.json`, import.meta.url)));
const smap = readPack('smap');
const grace = readPack('grace-groundwater');
const waterTable = readPack('water-table');
const data = { field: { id: 'mithapukur' }, months: [{ month: '2024-04' }, { month: '2024-01' }] };

test('topsoil averages finite SMAP daily surface moisture for the selected calendar month', () => {
  const days = smap.sites.mithapukur.daily.filter(day => day.date.startsWith('2024-04') && Number.isFinite(day.SFMC));
  const expected = days.reduce((sum, day) => sum + day.SFMC, 0) / days.length;
  const { topsoil } = buildCalloutData({ data, smap });
  assert.equal(topsoil.sfmc, expected);
  assert.match(topsoil.nasaValue, new RegExp(`Surface moisture ${expected.toFixed(2)} m³/m³ \\(top 5 cm\\) · Apr 2024 average`));
  assert.equal(topsoil.nasaKey, 'smap');
  assert.equal(topsoil.truthLabel, 'Estimated · SoilGrids 250 m');
  assert.doesNotMatch(topsoil.value + topsoil.truthLabel, /NASA/);
  const bn = buildCalloutData({ data, smap, t: (en, bn) => bn }).topsoil;
  assert.match(bn.nasaValue, /এপ্রিল 2024 গড়/);
  const measured = buildCalloutData({ data, smap, soilOverrides: { ph: 6.5 } }).topsoil;
  assert.equal(measured.truth, 'FARMER_REPORTED');
  assert.equal(measured.sfmc, expected);
});

test('SMAP rejects missing months and invalid samples without substituting January or zero', () => {
  const pack = { sites: { mithapukur: { daily: [
    { date: '2024-01-01', SFMC: 0.9 },
    ...[null, undefined, NaN, Infinity, -999, -0.1, 1.1, '0.2'].map(SFMC => ({ date: '2024-04-01', SFMC })),
    { date: '2024-04-02', SFMC: 0 }, { date: '2024-04-03', SFMC: 0.2 },
  ] } } };
  assert.equal(buildCalloutData({ data, smap: pack }).topsoil.sfmc, 0.1);
  for (const months of [[{ month: '2025-04' }], [{ month: '2024-02' }], [{}]]) {
    const topsoil = buildCalloutData({ data: { ...data, months }, smap: pack }).topsoil;
    assert.equal(topsoil.sfmc, null);
    assert.equal(topsoil.nasaKey, null);
    assert.equal(topsoil.nasaValue, null);
  }
});

test('GRACE pack records real monthly values or explicit missing reasons, native IDs and provenance', () => {
  const sites = readPack('soil-nutrients').sites;
  assert.deepEqual(Object.keys(grace.sites).sort(), Object.keys(sites).sort());
  assert.match(grace.source, /NASA JPL.*RL06\.3Mv04/);
  assert.match(grace.url, /^https:\/\/grace\.jpl\.nasa\.gov\//);
  assert.match(grace.fileUrl, /^https:\/\/archive\.podaac\.earthdata\.nasa\.gov\/.+\.nc$/);
  assert.match(grace.fileId, /RL06\.3M\.MSCNv04CRI\.nc$/);
  assert.match(grace.granuleId, /^G\d+-POCLOUD$/);
  assert.match(grace.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isFinite(Date.parse(grace.retrievedAt)));
  assert.ok(grace.method);
  assert.match(grace.resolution.effective, /300 km/);
  assert.equal(grace.units, 'cm');
  assert.equal(grace.variable, 'lwe_thickness');
  assert.equal(grace.baseline.start, '2004-01-01');
  assert.equal(grace.baseline.end, '2009-12-31');
  assert.match(grace.nativeMetadata.time_mean_removed, /2004.*2009/);
  assert.match(grace.note, /not a groundwater-only estimate/);
  for (const [id, site] of Object.entries(grace.sites)) {
    assert.equal(site.lat, sites[id].lat);
    assert.equal(site.lon, sites[id].lon);
    assert.ok(Number.isInteger(site.masconId));
    assert.ok(Number.isFinite(site.gridCentre.lat) && Number.isFinite(site.gridCentre.lon));
    assert.equal(site.monthly.length, 12);
    site.monthly.forEach((row, index) => {
      assert.equal(row.month, `2024-${String(index + 1).padStart(2, '0')}`);
      assert.equal(row.fileId, grace.fileId);
      assert.equal(row.granuleId, grace.granuleId);
      if (row.twsAnomalyCm === null) assert.ok(row.reason?.length);
      else {
        assert.ok(Number.isFinite(row.twsAnomalyCm));
        assert.ok(Number.isInteger(row.timeIndex));
        assert.ok(row.nativeTime.startsWith(row.month));
      }
    });
  }
});

test('deep soil keeps Fan and well readings separate from GRACE total water anomalies', () => {
  const { aquifer } = buildCalloutData({ data, grace, waterTable });
  const expected = grace.sites.mithapukur.monthly.find(row => row.month === '2024-04').twsAnomalyCm;
  assert.equal(aquifer.twsAnomalyCm, expected);
  assert.equal(aquifer.nasaKey, 'grace');
  assert.match(aquifer.nasaValue, /−70\.8 cm vs normal \(Apr 2024\).*NASA GRACE-FO ~300 km/);
  assert.match(aquifer.nasaNote, /Total water, including groundwater.*2004–2009/);
  assert.match(aquifer.truthLabel, /Fan et al\. 2017/);
  assert.equal(aquifer.askReading, true);
  assert.doesNotMatch(aquifer.value + aquifer.truthLabel, /NASA/);
  const measured = buildCalloutData({ data, grace, waterTable, soilOverrides: { gwDepthM: 4.5 } }).aquifer;
  assert.equal(measured.value, '4.5 m (Measured)');
  assert.equal(measured.twsAnomalyCm, expected);
  for (const value of [null, NaN, Infinity, '2.5']) {
    const pack = { sites: { mithapukur: { monthly: [{ month: '2024-04', twsAnomalyCm: value, reason: 'unavailable' }] } } };
    const missing = buildCalloutData({ data, grace: pack }).aquifer;
    assert.equal(missing.nasaKey, null);
    assert.equal(missing.nasaValue, null);
  }
  assert.equal(buildCalloutData({ data: { ...data, months: [{ month: '2025-04' }] }, grace }).aquifer.nasaKey, null);
  for (const key of ['soilgrids', 'fan2017']) assert.equal(nasaBadge(key), '');
});
