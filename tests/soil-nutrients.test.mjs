import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../public/data/soil-nutrients.json', import.meta.url)));

// Expected schema for each nutrient
test('soil-nutrients.json has valid schema structure', () => {
  assert.equal(data.schemaVersion, 1);
  assert.ok(data.source);
  assert.ok(data.retrievedAt);
  assert.ok(data.license);
  assert.ok(data.note);
  assert.ok(data.sites);
});

// Check all three sites are present
test('all three sites (mithapukur, pirganj, gangachara) are present', () => {
  const siteIds = Object.keys(data.sites);
  assert.equal(siteIds.length, 3);
  assert.ok(siteIds.includes('mithapukur'));
  assert.ok(siteIds.includes('pirganj'));
  assert.ok(siteIds.includes('gangachara'));
});

// Check each site has required fields
test('each site has required metadata', () => {
  for (const [siteId, site] of Object.entries(data.sites)) {
    assert.ok(site.id);
    assert.ok(site.name);
    assert.ok(site.lat !== undefined);
    assert.ok(site.lon !== undefined);
    assert.ok(site.upazila);
    assert.ok(site.nutrients);
  }
});

// Check all required nutrients are present
test('all required nutrients are present in each site', () => {
  const requiredNutrients = ['ph', 'om', 'soc', 'totalN', 'cec', 'P', 'K', 'S', 'Zn', 'B'];
  
  for (const [siteId, site] of Object.entries(data.sites)) {
    for (const nutrient of requiredNutrients) {
      assert.ok(site.nutrients[nutrient], `Missing nutrient: ${nutrient} in ${siteId}`);
    }
  }
});

// Check SoilGrids nutrients have valid values and metadata
test('SoilGrids nutrients (ph, soc, totalN, cec, om) have valid structure and values', () => {
  const soilGridsNutrients = ['ph', 'soc', 'totalN', 'cec', 'om'];
  
  for (const [siteId, site] of Object.entries(data.sites)) {
    for (const nutrient of soilGridsNutrients) {
      const dataPoint = site.nutrients[nutrient];
      
      // Check required fields
      assert.ok(dataPoint.value !== undefined, `${siteId}.${nutrient}: missing value`);
      assert.ok(dataPoint.unit !== undefined, `${siteId}.${nutrient}: missing unit`);
      assert.ok(dataPoint.class_en !== undefined, `${siteId}.${nutrient}: missing class_en`);
      assert.ok(dataPoint.source !== undefined, `${siteId}.${nutrient}: missing source`);
      assert.ok(dataPoint.url !== undefined, `${siteId}.${nutrient}: missing url`);
      assert.ok(dataPoint.truth !== undefined, `${siteId}.${nutrient}: missing truth`);
      assert.ok(dataPoint.retrieved !== undefined, `${siteId}.${nutrient}: missing retrieved`);
      
      // Check value is a number (not null for SoilGrids nutrients)
      if (nutrient !== 'om') {
        assert.ok(typeof dataPoint.value === 'number', `${siteId}.${nutrient}: value should be number, got ${typeof dataPoint.value}`);
        assert.ok(!isNaN(dataPoint.value), `${siteId}.${nutrient}: value is NaN`);
        assert.ok(isFinite(dataPoint.value), `${siteId}.${nutrient}: value is not finite`);
      }
      
      // Check truth is MODELED for SoilGrids
      if (nutrient !== 'om') {
        assert.equal(dataPoint.truth, 'MODELED', `${siteId}.${nutrient}: truth should be MODELED`);
      }
    }
  }
});

// Check OM is derived from SOC
test('OM is derived from SOC with factor 1.724', () => {
  for (const [siteId, site] of Object.entries(data.sites)) {
    const soc = site.nutrients.soc.value;
    const om = site.nutrients.om.value;
    const expectedOm = soc * 1.724;
    assert.ok(Math.abs(om - expectedOm) < 0.001, 
      `${siteId}: OM (${om}) should equal SOC (${soc}) × 1.724 (${expectedOm})`);
  }
});

// Check pH ranges (4-9 is typical)
test('pH values are within reasonable range (4-9)', () => {
  for (const [siteId, site] of Object.entries(data.sites)) {
    const ph = site.nutrients.ph.value;
    assert.ok(ph >= 4 && ph <= 9, `${siteId}: pH ${ph} is outside 4-9 range`);
  }
});

// Check SOC ranges (0-100 g/kg is typical)
test('SOC values are within reasonable range (0-100 g/kg)', () => {
  for (const [siteId, site] of Object.entries(data.sites)) {
    const soc = site.nutrients.soc.value;
    assert.ok(soc >= 0 && soc <= 100, `${siteId}: SOC ${soc} g/kg is outside 0-100 range`);
  }
});

// Check totalN ranges (0-10 g/kg is typical)
test('Total N values are within reasonable range (0-10 g/kg)', () => {
  for (const [siteId, site] of Object.entries(data.sites)) {
    const totalN = site.nutrients.totalN.value;
    assert.ok(totalN >= 0 && totalN <= 10, `${siteId}: Total N ${totalN} g/kg is outside 0-10 range`);
  }
});

// Check CEC ranges (0-100 cmol+/kg is typical)
test('CEC values are within reasonable range (0-100 cmol+/kg)', () => {
  for (const [siteId, site] of Object.entries(data.sites)) {
    const cec = site.nutrients.cec.value;
    assert.ok(cec >= 0 && cec <= 100, `${siteId}: CEC ${cec} cmol+/kg is outside 0-100 range`);
  }
});

// Check SoilGrids nutrients have source URL
test('SoilGrids nutrients have valid source URLs', () => {
  const soilGridsNutrients = ['ph', 'soc', 'totalN', 'cec'];
  
  for (const [siteId, site] of Object.entries(data.sites)) {
    for (const nutrient of soilGridsNutrients) {
      const dataPoint = site.nutrients[nutrient];
      assert.ok(dataPoint.url.includes('maps.isric.org'), 
        `${siteId}.${nutrient}: URL should reference maps.isric.org`);
      assert.ok(dataPoint.url.includes('map'), 
        `${siteId}.${nutrient}: URL should reference a map file`);
    }
  }
});

// Check SRDI nutrients (P, K, S, Zn, B) have proper null handling
test('SRDI nutrients (P, K, S, Zn, B) are properly documented when not found', () => {
  const srdiNutrients = ['P', 'K', 'S', 'Zn', 'B'];
  
  for (const [siteId, site] of Object.entries(data.sites)) {
    for (const nutrient of srdiNutrients) {
      const dataPoint = site.nutrients[nutrient];
      
      // If value is null, check that status and searched are present
      if (dataPoint.value === null) {
        assert.equal(dataPoint.status, 'no open source found', 
          `${siteId}.${nutrient}: missing status field`);
        assert.ok(Array.isArray(dataPoint.searched), 
          `${siteId}.${nutrient}: searched should be an array`);
        assert.ok(dataPoint.searched.length > 0, 
          `${siteId}.${nutrient}: searched should not be empty`);
        
        // Check each searched URL has url and status
        for (const search of dataPoint.searched) {
          assert.ok(search.url, `${siteId}.${nutrient}: searched entry missing url`);
          assert.ok(search.status !== undefined, 
            `${siteId}.${nutrient}: searched entry missing status`);
        }
      }
    }
  }
});

// Check BARC FRG-2018 classes are valid
test('Fertility classes match BARC FRG-2018 categories', () => {
  const validClasses = ['Very Low', 'Low', 'Medium', 'Optimum', 'High', 'Very High', null];
  const allNutrients = ['ph', 'om', 'soc', 'totalN', 'cec', 'P', 'K', 'S', 'Zn', 'B'];
  
  for (const [siteId, site] of Object.entries(data.sites)) {
    for (const nutrient of allNutrients) {
      const dataPoint = site.nutrients[nutrient];
      const classEn = dataPoint.class_en;
      assert.ok(validClasses.includes(classEn), 
        `${siteId}.${nutrient}: invalid class_en '${classEn}'`);
    }
  }
});

// Check coordinates match expected values
test('Site coordinates match expected values', () => {
  const expectedCoords = {
    mithapukur: { lat: 25.54, lon: 89.27 },
    pirganj: { lat: 25.5, lon: 89.22 },
    gangachara: { lat: 25.85, lon: 89.2 },
  };
  
  for (const [siteId, expected] of Object.entries(expectedCoords)) {
    const site = data.sites[siteId];
    assert.equal(site.lat, expected.lat, `${siteId}: lat mismatch`);
    assert.equal(site.lon, expected.lon, `${siteId}: lon mismatch`);
  }
});

// Check units are appropriate
test('Units are appropriate for each nutrient', () => {
  const expectedUnits = {
    ph: '',
    om: 'g/kg',
    soc: 'g/kg',
    totalN: 'g/kg',
    cec: 'cmol+/kg',
    P: 'kg/ha',
    K: 'kg/ha',
    S: 'kg/ha',
    Zn: 'mg/kg',
    B: 'mg/kg',
  };
  
  for (const [siteId, site] of Object.entries(data.sites)) {
    for (const [nutrient, expectedUnit] of Object.entries(expectedUnits)) {
      const dataPoint = site.nutrients[nutrient];
      assert.equal(dataPoint.unit, expectedUnit, 
        `${siteId}.${nutrient}: expected unit '${expectedUnit}', got '${dataPoint.unit}'`);
    }
  }
});
