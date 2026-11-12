import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as journey from '../src/legacy/journey.js';
import { planner, plannerAction, plannerInput } from '../src/legacy/planner.js';
import { plans, plansAction, disposePlans } from '../src/legacy/plans.js';
import { customPlanFor3d, advisorAction } from '../src/legacy/advisor.js';
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
  disposePlans();
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

function saveCustomPlan() {
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(custom()));
  planner();
  plannerAction('plan-save');
  return journey.listPlans()[0];
}

test('repeated planner saves update the same custom plan and retain its renamed title', () => {
  const first = saveCustomPlan();
  journey.renamePlan(first.id, 'My maize');
  planner();
  plannerAction('plan-save');
  assert.equal(journey.listPlans().length, 1);
  assert.equal(journey.listPlans()[0].id, first.id);
  assert.equal(journey.listPlans()[0].name, 'My maize');
});

test('refinement approval updates custom crop data and supports undo', () => {
  const first = saveCustomPlan();
  const approved = journey.approveRefinement(first.id, [{ season: 0, from: 'Maize', to: 'Sorghum', why: 'Fits the field' }], [
    { crop: 'Sorghum', model: 'maize', color: '#3f7f3a', fruitColor: null, heightM: 1.2,
      rowSpacingCm: 80, withinRowCm: 30, sharePct: 60 },
  ]);
  assert.equal(approved.plan.rotation.customPlan.planting[0].crop, 'Sorghum');
  assert.equal(approved.plan.rotation.customPlan.needsRecheck, false);
  assert.equal(journey.restorePreviousPlan(first.id).plan.rotation.customPlan.planting[0].crop, 'Maize');
});

test('Open restores the saved field, calendar, spacing, split and custom 3D; edits save as draft', () => {
  const first = saveCustomPlan();
  localStorage.removeItem('ropon_custom_plan_v1');
  state.fieldId = earth.fields[1].id;
  plansAction('open', first.id);
  assert.equal(location.hash.replace('#', ''), 'plan');
  planner();
  assert.equal(state.fieldId, site.id);
  assert.deepEqual(customPlanFor3d().calendar, custom().calendar);
  assert.deepEqual(customPlanFor3d().planting.map(p => [p.crop, p.rowSpacingCm, p.withinRowCm, p.sharePct]),
    [['Maize', 75, 25, 60], ['Mango', 600, 500, 40]]);
  plansAction('edit', first.id);
  planner();
  plannerInput({ name: 'custom-row', value: '100', dataset: { idx: '0' } });
  plannerInput({ name: 'custom-split', value: '70', dataset: {} });
  assert.match(planner(), /data-action="plan-save"/);
  plannerAction('plan-save');
  const [edited] = journey.listPlans();
  assert.equal(journey.listPlans().length, 1);
  assert.equal(edited.id, first.id);
  assert.equal(edited.status, 'draft');
  assert.equal(edited.plan.planting['custom-0'].rowSpacingCm, 100);
  assert.equal(edited.plan.planting['custom-0'].sharePct, 70);
  assert.equal(edited.plan.rotation.customPlan.planting[0].sharePct, 70);
});

test('custom duplicate edits remain independent; delete requires inline confirmation and supports cancel', () => {
  const first = saveCustomPlan();
  journey.renamePlan(first.id, 'Original');
  const duplicate = journey.duplicatePlan(first.id);
  assert.notEqual(duplicate.id, first.id);
  assert.equal(duplicate.name, 'Original (Copy)');
  plansAction('delete', first.id);
  assert.equal(journey.listPlans().length, 2);
  assert.match(plans(), /data-plans-action="delete-confirm"/);
  plansAction('delete-cancel', first.id);
  assert.doesNotMatch(plans(), /data-plans-action="delete-confirm"/);
  plansAction('delete', first.id);
  plansAction('delete-confirm', first.id);
  assert.equal(journey.getSavedPlan(first.id), null);
  assert.equal(journey.getSavedPlan(duplicate.id).name, 'Original (Copy)');
});

test('Re-check stores the real response and prior verdict using the saved crops and current field context', async t => {
  const first = saveCustomPlan();
  state.profiles[site.id] = { ...defaultProfile(), irrigation: 'none', budget: 'low' };
  state.fieldId = earth.fields[1].id;
  let request;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/rotation-advisor');
    request = JSON.parse(options.body);
    return Response.json({ verdict: 'not_suitable', summary: 'Water supply is insufficient.', calendar: [], planting: [] });
  });
  await plansAction('recheck', first.id);
  const saved = journey.getSavedPlan(first.id);
  assert.deepEqual(request.crops, ['Maize', 'Mango']);
  assert.equal(request.context.fieldId, site.id);
  assert.equal(request.context.irrigation, 'none');
  assert.equal(saved.plan.rotation.customPlan.verdict, 'not_suitable');
  assert.equal(saved.plan.rotation.customPlan.summary, 'Water supply is insufficient.');
  assert.equal(saved.plan.rotation.customPlan.recheck.previousVerdict, 'possible_with_conditions');
  assert.ok(Number.isFinite(Date.parse(saved.plan.rotation.customPlan.recheck.checkedAt)));
  assert.deepEqual(saved.plan.rotation.customPlan.calendar, custom().calendar);
  assert.match(plans(), /Re-checked .*Not suitable/);
  assert.match(plans(), /Possible with conditions.*Not suitable/);
  assert.match(plans(), /Water supply is insufficient/);
});

test('offline and malformed re-checks preserve the previous saved verdict and show a clear message', async t => {
  const first = saveCustomPlan();
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await plansAction('recheck', first.id);
  assert.deepEqual(journey.getSavedPlan(first.id), first);
  assert.match(plans(), /previous verdict.*kept|Previous verdict.*kept/);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ verdict: 'invented', summary: 'Invalid' }));
  await plansAction('recheck', first.id);
  assert.deepEqual(journey.getSavedPlan(first.id), first);
});

test('saving after a re-check retains its latest verdict and date', async t => {
  const first = saveCustomPlan();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ verdict: 'recommended', summary: 'Suitable with current irrigation.' }));
  await plansAction('recheck', first.id);
  const checked = journey.getSavedPlan(first.id).plan.rotation.customPlan;
  planner();
  plannerAction('plan-save');
  const saved = journey.getSavedPlan(first.id).plan.rotation.customPlan;
  assert.equal(saved.verdict, 'recommended');
  assert.equal(saved.summary, checked.summary);
  assert.deepEqual(saved.recheck, checked.recheck);
});

test('a failed handoff refresh cannot overwrite a re-checked verdict on the next save', async t => {
  const first = saveCustomPlan();
  const setItem = localStorage.setItem;
  const failure = t.mock.method(localStorage, 'setItem', (key, value) => {
    if (key === 'ropon_custom_plan_v1') throw new Error('Storage full');
    setItem(key, value);
  });
  t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async () => Response.json({ verdict: 'recommended', summary: 'Updated verdict.' }));
  await plansAction('recheck', first.id);
  assert.equal(journey.getSavedPlan(first.id).plan.rotation.customPlan.verdict, 'recommended');
  failure.mock.restore();
  planner();
  plannerAction('plan-save');
  assert.equal(journey.getSavedPlan(first.id).plan.rotation.customPlan.verdict, 'recommended');
  assert.equal(journey.getSavedPlan(first.id).plan.rotation.customPlan.summary, 'Updated verdict.');
});

test('legacy PLANANY custom handoffs without saved IDs update their matching saved entry', () => {
  const first = saveCustomPlan();
  const legacy = structuredClone(first);
  delete legacy.plan.rotation.customPlan.savedPlanId;
  localStorage.setItem('ropon_saved_plans_v1', JSON.stringify([legacy]));
  localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(custom()));
  planner();
  plannerAction('plan-save');
  assert.equal(journey.listPlans().length, 1);
  assert.equal(journey.listPlans()[0].id, first.id);
});

test('duplicate edits save only the copy; storage failure never reports successful CRUD', t => {
  const first = saveCustomPlan();
  const duplicate = journey.duplicatePlan(first.id);
  plansAction('edit', duplicate.id);
  planner();
  plannerInput({ name: 'custom-row', value: '110', dataset: { idx: '0' } });
  plannerAction('plan-save');
  assert.equal(journey.getSavedPlan(duplicate.id).plan.planting['custom-0'].rowSpacingCm, 110);
  assert.deepEqual(journey.getSavedPlan(first.id), first);
  t.mock.method(localStorage, 'setItem', () => { throw new Error('Storage full'); });
  t.mock.method(console, 'warn', () => {});
  assert.throws(() => journey.renamePlan(first.id, 'Lost name'), /Could not rename/);
  assert.throws(() => journey.duplicatePlan(first.id), /Could not duplicate/);
  assert.throws(() => journey.deletePlan(first.id), /Could not delete/);
  assert.deepEqual(journey.getSavedPlan(first.id), first);
});

test('edits and deletion during re-check never overwrite or resurrect a saved plan', async t => {
  const first = saveCustomPlan();
  let finish;
  t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { finish = resolve; }));
  const pending = plansAction('recheck', first.id);
  plansAction('edit', first.id);
  planner();
  plannerInput({ name: 'custom-row', value: '100', dataset: { idx: '0' } });
  plannerAction('plan-save');
  const edited = journey.getSavedPlan(first.id);
  finish(Response.json({ verdict: 'recommended', summary: 'Stale response.' }));
  await pending;
  assert.deepEqual(journey.getSavedPlan(first.id), edited);
  assert.match(plans(), /Plan changed during re-check/);
  const deleting = plansAction('recheck', first.id);
  journey.deletePlan(first.id);
  finish(Response.json({ verdict: 'recommended', summary: 'Deleted plan.' }));
  await deleting;
  assert.equal(journey.getSavedPlan(first.id), null);
});

test('Finish cannot promote an edited custom draft or unsuitable verdict without a successful re-check', async t => {
  const first = saveCustomPlan();
  plansAction('edit', first.id);
  planner();
  plannerInput({ name: 'custom-row', value: '100', dataset: { idx: '0' } });
  plannerAction('plan-save');
  const edited = journey.getSavedPlan(first.id);
  assert.equal(journey.savePlan(edited.plan, { status: 'ready' }).status, 'draft');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ verdict: 'not_suitable', summary: 'Unsuitable for this field.' }));
  await plansAction('recheck', first.id);
  assert.equal(journey.savePlan(journey.getSavedPlan(first.id).plan, { status: 'ready' }).status, 'draft');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ verdict: 'recommended', summary: 'Suitable for this field.' }));
  await plansAction('recheck', first.id);
  assert.equal(journey.getSavedPlan(first.id).status, 'ready');
  assert.equal(journey.getSavedPlan(first.id).plan.rotation.customPlan.needsRecheck, false);
});

test('changing custom crops through the decision helper saves the same plan with the new calendar and model', async t => {
  const first = saveCustomPlan();
  plansAction('edit', first.id);
  planner();
  const replacement = { ...custom(), title: 'Potato and mango',
    planting: [{ ...custom().planting[0], crop: 'Potato', model: 'potato', rowSpacingCm: 60 }, custom().planting[1]],
    calendar: custom().calendar.map(m => ({ ...m, crop: m.crop.replace('Maize', 'Potato') })) };
  t.mock.method(globalThis, 'fetch', async () => Response.json(replacement));
  window.matchMedia = () => ({ matches: true });
  document.dispatchEvent = () => {};
  await advisorAction('adv-crop', 'Potato');
  await advisorAction('adv-check');
  await advisorAction('adv-use');
  planner();
  plannerAction('plan-save');
  const [saved] = journey.listPlans();
  assert.equal(journey.listPlans().length, 1);
  assert.equal(saved.id, first.id);
  assert.equal(saved.status, 'draft');
  assert.equal(saved.plan.rotation.seasons[0].crop, 'Potato');
  assert.equal(saved.plan.planting['custom-0'].crop, 'Potato');
  assert.equal(saved.plan.rotation.customPlan.planting[0].model, 'potato');
  assert.deepEqual(saved.plan.rotation.customPlan.calendar, replacement.calendar);
});

test('repeated standard PLANANY saves also update their saved identity', () => {
  state.plans = [{ fieldId: site.id, rotation: 'legume' }];
  planner();
  plannerAction('plan-save');
  const first = journey.listPlans()[0];
  plannerAction('plan-save');
  assert.equal(journey.listPlans().length, 1);
  assert.equal(journey.listPlans()[0].id, first.id);
});

test('Re-check uses current context after saved boundary and profile overrides were reset', async t => {
  const defaultArea = journey.fieldSnapshot(site, basePolygon(site), defaultProfile()).areaHa;
  state.boundaries[site.id] = basePolygon(site).map(([lat, lon]) => [site.lat + (lat - site.lat) * 2, site.lon + (lon - site.lon) * 2]);
  state.profiles[site.id] = { ...defaultProfile(), irrigation: 'none' };
  const first = saveCustomPlan();
  assert.ok(first.plan.field.areaHa > defaultArea * 3);
  delete state.boundaries[site.id];
  delete state.profiles[site.id];
  let sentArea;
  let sentIrrigation;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    sentArea = JSON.parse(options.body).context.areaHa;
    sentIrrigation = JSON.parse(options.body).context.irrigation;
    return Response.json({ verdict: 'recommended', summary: 'Checked against the current field.' });
  });
  await plansAction('recheck', first.id);
  assert.equal(sentArea, defaultArea);
  assert.equal(sentIrrigation, undefined);
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
  assert.equal(location.hash, '#plan');
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

test('active journeys can also save straight from the planner', () => {
  journey.startPlan();
  assert.match(planner(), /data-action="plan-save"/);
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
