import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as journey from '../src/legacy/journey.js';
import * as plansPage from '../src/legacy/plans.js';
import * as planPage from '../src/legacy/plan.js';
import * as bar from '../src/legacy/journey-bar.js';
import { state, basePolygon, defaultProfile, defaultPriorities } from '../src/legacy/ui.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
  clear: () => storage.clear(),
};
globalThis.sessionStorage = {
  getItem: key => storage.get('session:' + key) ?? null,
  setItem: (key, value) => storage.set('session:' + key, String(value)),
  removeItem: key => storage.delete('session:' + key),
};

const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const site = earth.fields[0];
const field = () => journey.fieldSnapshot(site, basePolygon(site), defaultProfile());
const rotation = () => journey.rotationSnapshot('legume', defaultPriorities(), agronomy);

beforeEach(() => {
  storage.clear();
  journey.resetPlan();
  state.lang = 'en';
});

test('saved plans store: list CRUD, default name, duplicate, rename, delete', () => {
  assert.deepEqual(journey.listPlans(), []);

  journey.startPlan({ mode: 'own' });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  journey.confirmPlanting();
  const current = journey.getPlan();

  // Save as draft
  const savedDraft = journey.savePlan(current, { status: 'draft' });
  assert.equal(savedDraft.status, 'draft');
  assert.ok(savedDraft.name.includes(site.name));
  assert.equal(journey.listPlans().length, 1);

  // Update as ready
  const savedReady = journey.savePlan(current, { status: 'ready' });
  assert.equal(savedReady.status, 'ready');
  assert.equal(journey.listPlans().length, 1);
  assert.equal(journey.listPlans()[0].status, 'ready');

  // Rename plan
  journey.renamePlan(savedReady.id, 'My Custom Rice Season');
  assert.equal(journey.getSavedPlan(savedReady.id).name, 'My Custom Rice Season');

  // Duplicate plan
  const dup = journey.duplicatePlan(savedReady.id);
  assert.ok(dup);
  assert.notEqual(dup.id, savedReady.id);
  assert.equal(dup.name, 'My Custom Rice Season (Copy)');
  assert.equal(journey.listPlans().length, 2);

  // Delete plan
  journey.deletePlan(savedReady.id);
  assert.equal(journey.listPlans().length, 1);
  assert.equal(journey.getSavedPlan(savedReady.id), null);
  assert.equal(journey.getSavedPlan(dup.id).id, dup.id);
});

test('corrupt entries in ropon_saved_plans_v1 are tolerated and dropped without crash', () => {
  storage.set('ropon_saved_plans_v1', JSON.stringify([
    { id: 'corrupt-1', name: 123 },
    null,
    { id: 'corrupt-2', name: 'No plan field', status: 'draft', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    'string-entry',
  ]));

  const list = journey.listPlans();
  assert.deepEqual(list, []);
});

test('single active plan is migrated once into saved plans list', () => {
  journey.startPlan({ mode: 'own' });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  journey.confirmPlanting();
  const active = journey.getPlan();

  journey.migrateActivePlanOnce();
  const list = journey.listPlans();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, active.id);
  assert.equal(list[0].status, 'draft');

  // Second migration call does not duplicate
  journey.migrateActivePlanOnce();
  assert.equal(journey.listPlans().length, 1);
});

test('demo plans are never saved to saved plans list', async () => {
  journey.startPlan({ mode: 'demo' });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  journey.confirmPlanting();
  const demo = journey.getPlan();
  assert.equal(demo.mode, 'demo');

  const res = journey.savePlan(demo, { status: 'ready' });
  assert.equal(res, null);
  assert.deepEqual(journey.listPlans(), []);
});

test('exit plan: draft saves to My plans and discards active session; discard wipes plan', () => {
  journey.startPlan({ mode: 'own' });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  const plan = journey.getPlan();

  // Exit as draft
  journey.savePlan(plan, { status: 'draft' });
  journey.resetPlan();
  assert.equal(journey.getPlan(), null);
  const list = journey.listPlans();
  assert.equal(list.length, 1);
  assert.equal(list[0].status, 'draft');

  // Open draft plan resumes
  const opened = journey.openPlan(list[0].id);
  assert.ok(opened);
  assert.equal(journey.getPlan().id, list[0].id);

  // Discard plan
  journey.resetPlan();
  journey.deletePlan(list[0].id);
  assert.equal(journey.getPlan(), null);
  assert.equal(journey.listPlans().length, 0);
});

test('finish routes to #plans and highlights new plan', async t => {
  const { guide } = await import('../src/legacy/planty-guide.js');
  const destinations = [];
  const navigate = target => destinations.push(target);
  const oldDoc = globalThis.document;
  globalThis.document = { querySelector: () => null };
  t.mock.method(guide, 'celebrate', () => {});
  t.mock.method(guide, 'stop', () => {});

  try {
    journey.startPlan({ mode: 'own' });
    journey.confirmField(field());
    journey.confirmRotation(rotation());
    journey.confirmPlanting();

    bar.mountJourney('planner', navigate, () => true);
    await bar.journeyAction('finish');

    assert.equal(destinations.at(-1), 'plans');
    assert.equal(storage.get('session:ropon_highlight_plan_id'), journey.getPlan().id);
    assert.equal(journey.listPlans()[0].status, 'ready');
  } finally {
    globalThis.document = oldDoc;
  }
});

test('nav numbering and #plans route rendering', () => {
  // Empty state
  let html = plansPage.plans();
  assert.match(html, /My plans  \/  04/);
  assert.match(html, /No plans yet/);

  // With a plan
  journey.startPlan({ mode: 'own' });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  journey.confirmPlanting();
  journey.savePlan(journey.getPlan(), { status: 'ready', name: 'Mithapukur · Legume Plan' });

  html = plansPage.plans();
  assert.match(html, /Mithapukur · Legume Plan/);
  assert.match(html, /Ready ✓/);
  assert.match(html, /data-plans-action="open"/);
  assert.match(html, /data-plans-action="rename"/);
  assert.match(html, /data-plans-action="duplicate"/);
  assert.match(html, /data-plans-action="download"/);
  assert.match(html, /data-plans-action="delete"/);
});

test('spacing truth label rules: Recommended unless farmer changed from defaults', () => {
  // Default rice settings: row 20, spacing 20
  const defaultSettings = { crop: 'rice', rowSpacingCm: 20, withinRowCm: 20, usableAreaPct: 88, custom: false };
  assert.match(planPage.spacingTruth(defaultSettings), /Recommended|প্রস্তাবিত/);
  assert.doesNotMatch(planPage.spacingTruth(defaultSettings), /by farmer/);

  // Farmer changed settings
  const customSettings = { crop: 'rice', rowSpacingCm: 25, withinRowCm: 20, usableAreaPct: 88, custom: true };
  assert.match(planPage.spacingTruth(customSettings), /Measured|by farmer/);
});

test('water chart label reads Need ... mm · Rain ... mm', () => {
  const svg = planPage.waterChartSVG([{ label: 'Rice', needMm: 463, rainMm: 728 }], { lang: 'en' });
  assert.match(svg, /Need 463 mm · Rain 728 mm/);
  assert.doesNotMatch(svg, />463\/728</);
});
