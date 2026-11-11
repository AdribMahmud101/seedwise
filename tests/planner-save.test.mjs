import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as journey from '../src/legacy/journey.js';
import { planner, plannerAction, plannerInput } from '../src/legacy/planner.js';
import { plans } from '../src/legacy/plans.js';
import { plan as planPage, planAction, buildExportHTML } from '../src/legacy/plan.js';
import { state, loadData, basePolygon, defaultProfile } from '../src/legacy/ui.js';
import { recommendedSettings } from '../src/legacy/planner-controls.js';

const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const site = earth.fields[0];
const storage = new Map();
const memory = prefix => ({
  getItem: key => storage.get(prefix + key) ?? null,
  setItem: (key, value) => storage.set(prefix + key, String(value)),
  removeItem: key => storage.delete(prefix + key),
});
const custom = () => ({
  fieldId: site.id, title: 'Maize and mango', verdict: 'possible_with_conditions', mode: 'mixed',
  planting: [
    { crop: 'Maize', model: 'maize', color: '#3f7f3a', sharePct: 60, rowSpacingCm: 75, withinRowCm: 25 },
    { crop: 'Mango', model: 'tree', color: '#b8c93a', sharePct: 40, rowSpacingCm: 600, withinRowCm: 500 },
  ],
  calendar: Array.from({ length: 12 }, (_, i) => ({ month: i + 1,
    crop: [10, 11, 0, 1].includes(i) ? 'Maize + Mango' : 'Mango', stage: 'grow' })),
});

beforeEach(async t => {
  storage.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: memory(''), configurable: true });
  globalThis.sessionStorage = memory('session:');
  globalThis.location = { hash: '#planner' };
  globalThis.document = { baseURI: 'https://example.test/', querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window = { dispatchEvent() {} };
  t.mock.method(globalThis, 'fetch', async url => Response.json(String(url).includes('agronomy') ? agronomy : earth));
  journey.resetPlan();
  Object.assign(state, { lang: 'en', fieldId: site.id, plans: [], boundaries: {}, profiles: {}, netInputs: {},
    planner: { ...recommendedSettings('rice'), row: 30, spacing: 15, usable: 73, usableSource: 'override' } });
  await loadData();
});

test('saved field and custom plan build a valid Ready plan without an active journey', async () => {
  const outline = basePolygon(site).map(([lat, lon]) => [lat + 0.001, lon]);
  state.boundaries[site.id] = outline;
  state.profiles[site.id] = { ...defaultProfile(), irrigation: 'none' };
  state.netInputs[site.id] = { bundWidthM: 0.4, drainWidthM: 0.1, pathWidthM: 0.5, otherDecimals: 0 };
  const source = custom();
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(source));
  assert.equal(journey.getPlan(), null);
  assert.match(planner(), /data-action="plan-save"[^>]*>Save as my plan/);
  plannerAction('plan-save');
  assert.equal(location.hash, '#plans');
  assert.equal(journey.getPlan(), null);
  const [entry] = journey.listPlans();
  assert.equal(entry.status, 'ready');
  assert.deepEqual(entry.plan.field.outline, outline);
  assert.deepEqual(entry.plan.field.constraints, state.profiles[site.id]);
  assert.deepEqual(entry.plan.field.netInputs, state.netInputs[site.id]);
  assert.deepEqual(entry.plan.rotation.customPlan.calendar, source.calendar);
  assert.equal(entry.plan.rotation.customPlan.verdict, source.verdict);
  assert.deepEqual(entry.plan.rotation.seasons.map(s => [s.crop, s.sowMonth, s.harvestMonth]),
    [['Maize', 11, 2], ['Mango', 1, 12]]);
  assert.deepEqual(Object.values(entry.plan.planting).map(s => [s.crop, s.rowSpacingCm, s.withinRowCm, s.sharePct]),
    [['Maize', 75, 25, 60], ['Mango', 600, 500, 40]]);
  assert.ok(Object.values(entry.plan.planting).every(s => s.usableAreaPct === 73 && s.confirmedAt));
  assert.equal(entry.plan.steps.plan, 'done');
  const reloaded = await import('../src/legacy/journey.js?planner-save-reload');
  assert.equal(reloaded.listPlans()[0].id, entry.id);
  assert.match(plans(), /Maize/);
  assert.match(plans(), /Nov–Feb/);
  assert.match(plans(), /75 × 25 cm/);
  assert.doesNotThrow(() => planPage());
  assert.match(planPage(), /600×500 cm/);
});

test('missing or other-field rotations show a link and never create a journey or plan', () => {
  state.plans = [{ fieldId: 'another-field', rotation: 'legume' }];
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify({ ...custom(), fieldId: 'another-field' }));
  assert.match(planner(), /href="#rotations">Choose crops in Rotation studio →/);
  plannerAction('plan-save');
  assert.equal(journey.getPlan(), null);
  assert.deepEqual(journey.listPlans(), []);
  assert.equal(location.hash, '#planner');
});

test('missing custom calendar never substitutes a standard rotation', () => {
  state.plans = [{ fieldId: site.id, rotation: 'legume' }];
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify({ ...custom(), calendar: [] }));
  assert.match(planner(), /href="#rotations">[^<]*calendar/i);
  plannerAction('plan-save');
  assert.equal(journey.getPlan(), null);
  assert.deepEqual(journey.listPlans(), []);
});

test('last saved standard rotation uses current planner controls and preserves older saved plans', () => {
  state.plans = [{ fieldId: site.id, rotation: 'legume' }, { fieldId: site.id, rotation: 'baseline' }];
  planner();
  plannerAction('plan-save');
  const [entry] = journey.listPlans();
  assert.equal(entry.plan.rotation.id, 'baseline');
  assert.equal(entry.plan.planting.aman.rowSpacingCm, 30);
  assert.equal(entry.plan.planting.aman.withinRowCm, 15);
  assert.equal(entry.plan.planting.aman.usableAreaPct, 73);
  assert.equal(entry.status, 'ready');
  assert.equal(entry.plan.version, 1);
});

test('custom summary uses each crop spacing and shares, with Scenario / AI labels', () => {
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(custom()));
  let html = planner();
  let summary = html.slice(html.indexOf('id="plan-estimate"'), html.indexOf('class="panel plan-settings'));
  assert.match(summary, /75 × 25 cm/);
  assert.match(summary, /600 × 500 cm/);
  assert.match(summary, /Scenario/);
  assert.match(summary, /AI/);
  assert.doesNotMatch(summary, /by farmer|Trial-based harvest|30 × 15 cm/);
  plannerInput({ name: 'custom-row', value: '100', dataset: { idx: '0' } });
  html = planner();
  assert.match(html, /100 × 25 cm/);
  state.lang = 'bn';
  assert.match(planner(), /আমার পরিকল্পনা হিসেবে সংরক্ষণ/);
});

test('active journeys retain their existing finish actions', () => {
  journey.startPlan();
  assert.doesNotMatch(planner(), /data-action="plan-save"/);
});

test('direct standard layout choices persist without starting a journey', async () => {
  const { rotationAction } = await import('../src/legacy/rotations.js');
  rotationAction('layout-for', 'legume');
  assert.equal(journey.getPlan(), null);
  assert.deepEqual(JSON.parse(localStorage.getItem('ropon-radar.workspace.3')).planner.rotation,
    { fieldId: site.id, id: 'legume' });
  planner();
  plannerAction('plan-save');
  assert.equal(journey.listPlans()[0].plan.rotation.id, 'legume');
  assert.equal(journey.listPlans()[0].plan.planting.mungbean.crop, 'mungbean');
});

test('a changed standard crop is saved even when it is absent from the rotation', () => {
  state.plans = [{ fieldId: site.id, rotation: 'baseline' }];
  Object.assign(state.planner, recommendedSettings('potato'), { row: 70, spacing: 30 });
  planner();
  plannerAction('plan-save');
  const [entry] = journey.listPlans();
  assert.ok(Object.values(entry.plan.planting).some(s => s.crop === 'potato' && s.rowSpacingCm === 70 && s.withinRowCm === 30));
});

test('custom count tampering and invalid spacing are rejected without losing existing saved plans', () => {
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(custom()));
  planner();
  plannerAction('plan-save');
  const [entry] = journey.listPlans();
  const corrupted = structuredClone(entry.plan);
  Object.values(corrupted.planting)[0].counts.plants++;
  assert.throws(() => journey.savePlan(corrupted));
  const invalid = custom();
  invalid.planting[0].rowSpacingCm = 0;
  assert.throws(() => journey.rotationSnapshot(invalid, state.weights, agronomy));
  assert.deepEqual(journey.listPlans(), [entry]);
});

test('storage failure leaves saved inputs available for another attempt', t => {
  const source = custom();
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(source));
  planner();
  const set = localStorage.setItem;
  t.mock.method(localStorage, 'setItem', (key, value) => {
    if (key === 'ropon_saved_plans_v1') throw new Error('Storage full');
    set(key, value);
  });
  t.mock.method(console, 'warn', () => {});
  plannerAction('plan-save');
  assert.equal(location.hash, '#planner');
  assert.equal(journey.getPlan(), null);
  assert.deepEqual(journey.listPlans(), []);
  // Recommended-setup migration adds original* fields; the user's saved inputs must otherwise be untouched.
  const kept = JSON.parse(localStorage.getItem('ropon_custom_plan_v1'), (k, v) => (k.startsWith('original') ? undefined : v));
  assert.deepEqual(kept, source);
  assert.match(planner(), /data-action="plan-save"/);
});

test('editing a saved custom plan restores its crops and persists custom panel changes', () => {
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(custom()));
  planner();
  plannerAction('plan-save');
  localStorage.removeItem('ropon_custom_plan_v1');
  planAction('plan-edit');
  assert.match(planner(), /cs-panel/);
  plannerInput({ name: 'custom-row', value: '100', dataset: { idx: '0' } });
  const plan = journey.getPlan();
  assert.deepEqual(Object.values(plan.planting).map(s => [s.crop, s.rowSpacingCm]), [['Maize', 100], ['Mango', 600]]);
  assert.equal(plan.steps.planting, 'review');
  assert.match(planner(), /100 × 25 cm/);
});

test('custom offline exports preserve land shares and omit unsupported water comparisons', () => {
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(custom()));
  planner();
  plannerAction('plan-save');
  const html = buildExportHTML(journey.listPlans()[0].plan, { monthly: site.monthly });
  assert.doesNotMatch(html, /Same water as|<h2>Water/);
  assert.match(html, /data-share="40"/);
  const output = {};
  const pane = { dataset: { crop: 'Mango', share: '40', source: 'ai' }, querySelector: selector => {
    if (selector === '[data-result]') return output;
    return { value: selector.includes('row"') ? '600' : selector.includes('within') ? '500' : '100' };
  } };
  const context = { document: { querySelectorAll: selector => selector === '.season-pane' ? [pane] : [] } };
  runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1], context);
  context.recalc(1);
  assert.equal(output.textContent, '133 positions · 0.40 ha usable');
});
