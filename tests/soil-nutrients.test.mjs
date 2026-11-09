import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const FILE_PATH = resolve(ROOT, 'public/data/soil-nutrients.json');

test('Soil nutrients data exists, satisfies schema, citations and value ranges', () => {
  const stat = statSync(FILE_PATH);
  assert.ok(stat.size > 0, 'soil-nutrients.json should not be empty');
  assert.ok(stat.size <= 200_000, `soil-nutrients.json (${stat.size} bytes) stays within compact budget`);

  const data = JSON.parse(readFileSync(FILE_PATH, 'utf8'));

  assert.equal(data.schemaVersion, 1);
  assert.ok(typeof data.retrievedAt === 'string');
  assert.ok(data.standardReference.includes('BARC'));
  assert.ok(data.agency.includes('SRDI'));

  const expectedSites = ['mithapukur', 'pirganj', 'gangachara'];
  assert.deepEqual(Object.keys(data.sites).sort(), expectedSites.sort());

  const requiredNutrients = ['P', 'K', 'Zn', 'B', 'pH', 'OM', 'N', 'S'];

  for (const siteId of expectedSites) {
    const site = data.sites[siteId];
    assert.equal(site.siteId, siteId);
    assert.ok(typeof site.name === 'string');
    assert.ok(typeof site.upazila === 'string');
    assert.ok(typeof site.guideCitation === 'string' && site.guideCitation.includes('SRDI'));
    assert.ok(typeof site.soilSeries === 'string');

    for (const nut of requiredNutrients) {
      const entry = site.nutrients[nut];
      assert.ok(entry, `Missing nutrient ${nut} for site ${siteId}`);
      assert.equal(entry.nutrient, nut);

      // Value type and realistic agricultural soil physical range check
      assert.ok(typeof entry.value === 'number' && Number.isFinite(entry.value), `${nut} value must be a number`);
      switch (nut) {
        case 'P':
          assert.ok(entry.value >= 1.0 && entry.value <= 100.0, `P value ${entry.value} out of range`);
          assert.equal(entry.unit, 'µg/g');
          break;
        case 'K':
          assert.ok(entry.value >= 0.01 && entry.value <= 2.0, `K value ${entry.value} out of range`);
          assert.equal(entry.unit, 'meq/100g');
          break;
        case 'Zn':
          assert.ok(entry.value >= 0.05 && entry.value <= 10.0, `Zn value ${entry.value} out of range`);
          assert.equal(entry.unit, 'µg/g');
          break;
        case 'B':
          assert.ok(entry.value >= 0.01 && entry.value <= 5.0, `B value ${entry.value} out of range`);
          assert.equal(entry.unit, 'µg/g');
          break;
        case 'pH':
          assert.ok(entry.value >= 3.5 && entry.value <= 9.5, `pH value ${entry.value} out of range`);
          assert.equal(entry.unit, 'pH');
          break;
        case 'OM':
          assert.ok(entry.value >= 0.2 && entry.value <= 10.0, `OM value ${entry.value} out of range`);
          assert.equal(entry.unit, '%');
          break;
        case 'N':
          assert.ok(entry.value >= 0.01 && entry.value <= 1.0, `N value ${entry.value} out of range`);
          assert.equal(entry.unit, '%');
          break;
        case 'S':
          assert.ok(entry.value >= 1.0 && entry.value <= 50.0, `S value ${entry.value} out of range`);
          assert.equal(entry.unit, 'µg/g');
          break;
      }

      // Qualitative classes in EN and BN
      assert.ok(typeof entry.class_en === 'string' && entry.class_en.length > 0);
      assert.ok(typeof entry.class_bn === 'string' && entry.class_bn.length > 0);

      // Provenance, citations and truth
      assert.ok(typeof entry.source === 'string' && entry.source.includes('SRDI'));
      assert.ok(typeof entry.citation === 'string' && entry.citation.includes('Table'));
      assert.ok(typeof entry.url === 'string');
      assert.ok(typeof entry.year === 'number');
      assert.ok(typeof entry.scale === 'string');
      assert.ok(['ESTIMATED', 'MODELED', 'REMOTE_OBSERVED'].includes(entry.truth));
    }
  }
});
