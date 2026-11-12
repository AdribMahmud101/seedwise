import test from 'node:test';
import assert from 'node:assert/strict';
import { riskStatus } from '../src/legacy/recovery-risk.js';
const brief = (near, gw, t2m) => ({ date: '2026-11-12', flood: { testMetrics: { IoU_water: 82 }, summary: { 2024: { scenes_found: 32, usable: 3, water_fraction_box_max: 0.016, water_fraction_buffer300m_max: near }, 2025: { scenes_found: 35, usable: 3, water_fraction_box_max: 0, water_fraction_buffer300m_max: 0 } } },
  outlook: { backtest: { skill_vs_climatology: { gwetroot: { h1: 0.68 }, rain_mm_day: { h1: 0.27 }, t2m_c: { h1: 0.11 } } }, outlook: {
    gwetroot: { months: [{ month: '2026-11', p50: gw, climatology: 0.67 }] }, rain_mm_day: { months: [{ month: '2026-11', p50: 0.25, p90: 1, climatology: 0.1 }] },
    t2m_c: { months: [{ month: '2026-11', p50: t2m, climatology: 21.8 }] } } } });
test('all clear when no water near the field and outlook near normal', () => {
  const r = riskStatus(brief(0, 0.65, 22));
  assert.equal(r.level, 'ok');
  assert.deepEqual(r.signals.map(s => [s.id, s.level]), [['flood', 'ok'], ['dry', 'ok'], ['rain', 'ok'], ['heat', 'ok']]);
  assert.equal(r.signals[0].confidence, 'low'); // only 6 clear scenes
  assert.equal(r.signals[1].confidence, 'high');
});
test('drier soil gives a watch, water near the field gives a warning (worst wins)', () => {
  assert.equal(riskStatus(brief(0, 0.5, 22)).level, 'watch');
  assert.equal(riskStatus(brief(0.08, 0.5, 22)).level, 'warn');
  assert.equal(riskStatus(null).signals.length, 0);
});
