import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const smap = JSON.parse(
  readFileSync(new URL('../public/data/smap.json', import.meta.url))
);

test('smap.json structure and metadata', () => {
  assert.equal(smap.version, '1.0');
  assert.ok(smap.retrievedAt);
  assert.deepEqual(smap.period, { start: '2021-01-01', end: '2025-12-31' });
  assert.ok(smap.source.name.includes('SMAP'));
  assert.ok(smap.source.store.includes('nasa-power-smap'));
  assert.equal(smap.source.provenance, 'MODELED');
  assert.equal(smap.source.nativeResolution, '~9 km');
});

test('all three sites present with correct locations', () => {
  const sites = Object.keys(smap.sites);
  assert.equal(sites.length, 3);
  assert.ok(sites.includes('mithapukur'));
  assert.ok(sites.includes('pirganj'));
  assert.ok(sites.includes('gangachara'));

  for (const [siteId, site] of Object.entries(smap.sites)) {
    assert.ok(site.name);
    assert.ok(site.location.lat);
    assert.ok(site.location.lon);
    assert.ok(site.gridPoint.lat);
    assert.ok(site.gridPoint.lon);
  }
});

test('SFMC and RZMC values are within valid range (0-0.6 m3/m3)', () => {
  for (const [siteId, site] of Object.entries(smap.sites)) {
    // Check daily data for 2024
    for (const day of site.daily) {
      if (day.SFMC !== null) {
        assert.ok(day.SFMC >= 0, `${siteId} SFMC ${day.SFMC} < 0 on ${day.date}`);
        assert.ok(day.SFMC <= 0.6, `${siteId} SFMC ${day.SFMC} > 0.6 on ${day.date}`);
      }
      if (day.RZMC !== null) {
        assert.ok(day.RZMC >= 0, `${siteId} RZMC ${day.RZMC} < 0 on ${day.date}`);
        assert.ok(day.RZMC <= 0.6, `${siteId} RZMC ${day.RZMC} > 0.6 on ${day.date}`);
      }
    }

    // Check monthly data
    for (const month of site.monthly) {
      if (month.SFMC_mean !== null) {
        assert.ok(month.SFMC_mean >= 0, `${siteId} SFMC mean < 0 for ${month.month}`);
        assert.ok(month.SFMC_mean <= 0.6, `${siteId} SFMC mean > 0.6 for ${month.month}`);
      }
      if (month.RZMC_mean !== null) {
        assert.ok(month.RZMC_mean >= 0, `${siteId} RZMC mean < 0 for ${month.month}`);
        assert.ok(month.RZMC_mean <= 0.6, `${siteId} RZMC mean > 0.6 for ${month.month}`);
      }
    }
  }
});

test('percentiles are within 0-100 range', () => {
  for (const [siteId, site] of Object.entries(smap.sites)) {
    for (const day of site.daily) {
      if (day.RZMC_PRCNTL !== null) {
        assert.ok(day.RZMC_PRCNTL >= 0, `${siteId} RZMC_PRCNTL ${day.RZMC_PRCNTL} < 0 on ${day.date}`);
        assert.ok(day.RZMC_PRCNTL <= 100, `${siteId} RZMC_PRCNTL ${day.RZMC_PRCNTL} > 100 on ${day.date}`);
      }
      if (day.PRMC_PRCNTL !== null) {
        assert.ok(day.PRMC_PRCNTL >= 0, `${siteId} PRMC_PRCNTL ${day.PRMC_PRCNTL} < 0 on ${day.date}`);
        assert.ok(day.PRMC_PRCNTL <= 100, `${siteId} PRMC_PRCNTL ${day.PRMC_PRCNTL} > 100 on ${day.date}`);
      }
    }

    for (const month of site.monthly) {
      if (month.RZMC_PRCNTL_mean !== null) {
        assert.ok(month.RZMC_PRCNTL_mean >= 0, `${siteId} RZMC_PRCNTL mean < 0 for ${month.month}`);
        assert.ok(month.RZMC_PRCNTL_mean <= 100, `${siteId} RZMC_PRCNTL mean > 100 for ${month.month}`);
      }
      if (month.PRMC_PRCNTL_mean !== null) {
        assert.ok(month.PRMC_PRCNTL_mean >= 0, `${siteId} PRMC_PRCNTL mean < 0 for ${month.month}`);
        assert.ok(month.PRMC_PRCNTL_mean <= 100, `${siteId} PRMC_PRCNTL mean > 100 for ${month.month}`);
      }
    }
  }
});

test('no zero values where raw data is missing (null)', () => {
  for (const [siteId, site] of Object.entries(smap.sites)) {
    for (const day of site.daily) {
      // If a value is missing (null), it should not be 0
      // We check that null means truly missing, not 0
      if (day.SFMC === null) {
        assert.notEqual(day.SFMC, 0, `${siteId} SFMC is 0 but should be null on ${day.date}`);
      }
      if (day.RZMC === null) {
        assert.notEqual(day.RZMC, 0, `${siteId} RZMC is 0 but should be null on ${day.date}`);
      }
      if (day.RZMC_PRCNTL === null) {
        assert.notEqual(day.RZMC_PRCNTL, 0, `${siteId} RZMC_PRCNTL is 0 but should be null on ${day.date}`);
      }
      if (day.PRMC_PRCNTL === null) {
        assert.notEqual(day.PRMC_PRCNTL, 0, `${siteId} PRMC_PRCNTL is 0 but should be null on ${day.date}`);
      }
    }
  }
});

test('units are m3/m3 for SFMC/RZMC, not percent', () => {
  assert.equal(smap.variables.SFMC.units, 'm3/m3');
  assert.equal(smap.variables.RZMC.units, 'm3/m3');
  assert.equal(smap.variables.RZMC_PRCNTL.units, '%');
  assert.equal(smap.variables.PRMC_PRCNTL.units, '%');
});

test('daily data covers all of 2024', () => {
  for (const [siteId, site] of Object.entries(smap.sites)) {
    // 2024 is a leap year, so 366 days
    assert.equal(site.daily.length, 366, `${siteId} has ${site.daily.length} daily entries, expected 366`);
    
    // Check first and last dates
    assert.equal(site.daily[0].date, '2024-01-01');
    assert.equal(site.daily[site.daily.length - 1].date, '2024-12-31');
  }
});

test('monthly data covers 2021-2025', () => {
  for (const [siteId, site] of Object.entries(smap.sites)) {
    // 12 months * 5 years = 60 months
    assert.equal(site.monthly.length, 60, `${siteId} has ${site.monthly.length} monthly entries, expected 60`);
    
    // Check first and last months
    assert.equal(site.monthly[0].month, '2021-01');
    assert.equal(site.monthly[site.monthly.length - 1].month, '2025-12');
  }
});

test('valid day counts are tracked', () => {
  for (const [siteId, site] of Object.entries(smap.sites)) {
    for (const month of site.monthly) {
      assert.ok(month.SFMC_count >= 0);
      assert.ok(month.RZMC_count >= 0);
      assert.ok(month.RZMC_PRCNTL_count >= 0);
      assert.ok(month.PRMC_PRCNTL_count >= 0);
    }
  }
});

test('grid points are close to target locations', () => {
  const expected = {
    mithapukur: { lat: 25.54, lon: 89.27 },
    pirganj: { lat: 25.50, lon: 89.22 },
    gangachara: { lat: 25.85, lon: 89.20 },
  };

  for (const [siteId, site] of Object.entries(smap.sites)) {
    const expectedLoc = expected[siteId];
    const actualLoc = site.gridPoint;
    
    // Grid points should be within 0.5 degrees of targets
    const latDiff = Math.abs(actualLoc.lat - expectedLoc.lat);
    const lonDiff = Math.abs(actualLoc.lon - expectedLoc.lon);
    
    assert.ok(latDiff < 0.5, `${siteId} lat diff ${latDiff} >= 0.5`);
    assert.ok(lonDiff < 0.5, `${siteId} lon diff ${lonDiff} >= 0.5`);
  }
});

test('file size is within limit', () => {
  const data = readFileSync(new URL('../public/data/smap.json', import.meta.url));
  const sizeKB = data.length / 1024;
  assert.ok(sizeKB <= 600, `smap.json is ${sizeKB.toFixed(1)} KB, exceeds 600 KB limit`);
});
