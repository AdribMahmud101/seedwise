import test from 'node:test';
import assert from 'node:assert/strict';
import { wmoKind, farmAdvice, powerDays } from '../src/legacy/weather.js';

test('WMO codes map to weather kinds', () => {
  assert.equal(wmoKind(0), 'clear');
  assert.equal(wmoKind(2), 'partly');
  assert.equal(wmoKind(45), 'fog');
  assert.equal(wmoKind(63), 'rain');
  assert.equal(wmoKind(81), 'showers');
  assert.equal(wmoKind(95), 'storm');
});

test('farm advice reads spray day, water balance, heat and heavy rain', () => {
  const a = farmAdvice({
    time: ['2026-11-13', '2026-11-14', '2026-11-15'],
    precipitation_sum: [12, 0, 60], precipitation_probability_max: [80, 10, 90],
    wind_speed_10m_max: [3, 2, 6], temperature_2m_max: [30, 36, 29], et0_fao_evapotranspiration: [3, 4, 2],
  });
  assert.equal(a.spray, '2026-11-14');
  assert.equal(a.rain7, 72);
  assert.equal(a.deficit, 0);
  assert.deepEqual(a.heat, ['2026-11-14']);
  assert.deepEqual(a.heavy, ['2026-11-15']);
});

test('POWER days drop unprocessed -999 days', () => {
  const p = { T2M_MAX: { 20261109: 32.8, 20261110: 30.7, 20261111: -999 }, T2M_MIN: { 20261109: 19.8, 20261110: 20.8, 20261111: -999 },
    PRECTOTCORR: { 20261109: 2.05, 20261110: 3.91, 20261111: -999 }, RH2M: {} };
  const days = powerDays({ properties: { parameter: p } });
  assert.deepEqual(days.map(d => d.date), ['2026-11-09', '2026-11-10']);
});
