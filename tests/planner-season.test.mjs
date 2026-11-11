import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as journey from '../src/legacy/journey.js';
import { capacity } from '../src/legacy/engine.js';
import { recommendedSettings } from '../src/legacy/planner-controls.js';
import { planner, plannerAction, plannerInput, setPlantCrop } from '../src/legacy/planner.js';
import { state, loadData, basePolygon, defaultProfile, defaultPriorities } from '../src/legacy/ui.js';

const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const site = earth.fields.find(field => field.id === 'mithapukur');
const storage = new Map();

beforeEach(async t => {
  t.mock.method(globalThis, 'fetch', async url => Response.json(String(url).includes('agronomy') ? agronomy : earth));
  Object.defineProperty(globalThis, 'localStorage', { value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  }, configurable: true });
  globalThis.document = {
    baseURI: 'https://example.test/', querySelector: () => null,
    querySelectorAll: () => [], getElementById: () => null,
  };
  globalThis.window = { dispatchEvent() {} };
  journey.resetPlan();
  state.lang = 'en';
  state.fieldId = site.id;
  state.planner = { ...recommendedSettings('rice'), angle: 0.62 };
  await loadData();
  journey.resetPlan();
});

function start(id = 'legume', includeFallow = false) {
  journey.startPlan();
  journey.confirmField(journey.fieldSnapshot(site, basePolygon(site), defaultProfile()));
  const rotation = journey.rotationSnapshot(id, defaultPriorities(), agronomy);
  if (!includeFallow) rotation.seasons = rotation.seasons.filter(season => season.crop !== 'fallow');
  journey.confirmRotation(rotation);
  planner();
  return journey.getPlan();
}

function edit(name, value) {
  const inputs = [{ value: String(value) }, { value: String(value) }];
  const control = { querySelectorAll: () => inputs, querySelector: () => null, style: { setProperty() {} } };
  plannerInput({ name, value: String(value), type: 'range', closest: () => control });
}

test('three season tabs follow rotation labels, dates and locked crops in both languages', () => {
  start();
  const html = planner();
  assert.equal((html.match(/role="tab"/g) ?? []).length, 3);
  assert.match(html, /① Aman rice · Jul–Oct/);
  assert.match(html, /② Potato · Nov–Feb/);
  assert.match(html, /③ Mungbean · Mar–Apr/);
  assert.match(html, /class="plan-locked-crop"/);
  assert.doesNotMatch(html, /name="plantCrop"/);
  assert.match(html, /Looks good ✓/);
  assert.match(html, /planner-journey-slot/);
  assert.match(html, /planner-finish-slot/);
  assert.equal(state.planner.crop, 'rice');
  state.lang = 'bn';
  assert.match(planner(), /আমন ধান/);
  assert.match(planner(), /ফসল বদলান/);
});

test('fallow periods have disabled tabs, no planting records and need no confirmation', () => {
  const plan = start('baseline', true);
  const html = planner();
  const fallows = plan.rotation.seasons.filter(season => season.crop === 'fallow');
  assert.equal(fallows.length, 2);
  assert.equal(new Set(fallows.map(season => season.key)).size, 2);
  assert.equal((html.match(/tabindex="-1" disabled/g) ?? []).length, 2);
  assert.match(html, /Fallow · Dec–Dec/);
  for (const season of fallows) {
    assert.equal(plan.planting[season.key], undefined);
    plannerAction('plan-season', season.key);
    assert.deepEqual(journey.getPlan(), plan);
  }
  for (const key of ['aman', 'boro']) {
    plannerAction('plan-season', key);
    plannerAction('plan-confirm');
  }
  assert.equal(journey.stepStatus().planting, 'done');
});

test('switching tabs restores spacing and usable area; writes target the explicit season key', () => {
  const original = start();
  edit('row', 27);
  edit('spacing', 23);
  edit('usable', 72);
  plannerAction('plan-confirm');
  const aman = journey.getPlan().planting.aman;
  assert.ok(aman.confirmedAt);
  assert.equal(journey.getPlan().planting.potato.confirmedAt, null);
  plannerAction('plan-season', 'potato');
  assert.equal(state.planner.crop, 'potato');
  assert.equal(state.planner.row, recommendedSettings('potato').row);
  edit('row', 71);
  edit('spacing', 32);
  edit('usable', 64);
  const potato = journey.getPlan().planting.potato;
  assert.equal(potato.rowSpacingCm, 71);
  assert.equal(potato.withinRowCm, 32);
  assert.equal(potato.usableAreaPct, 64);
  const counts = capacity(original.field.areaHa, 64, 'potato', 0.71, 0.32);
  assert.equal(potato.counts.plants, counts.positions);
  assert.match(planner(), new RegExp(`data-value="${counts.positions}"`));
  assert.deepEqual(journey.getPlan().planting.aman, aman);
  assert.deepEqual(journey.getPlan().planting.mungbean, original.planting.mungbean);
  plannerAction('plan-season', 'aman');
  assert.deepEqual([state.planner.crop, state.planner.row, state.planner.spacing, state.planner.usable], ['rice', 27, 23, 72]);
  assert.match(planner(), /class="plan-season-check"/);
  plannerAction('plan-season', 'potato');
  assert.deepEqual([state.planner.row, state.planner.spacing, state.planner.usable], [71, 32, 64]);
  assert.equal(JSON.parse(storage.get('ropon_season_plan_v1')).planting.potato.rowSpacingCm, 71);
});

test('crop escape persists custom status on the selected season and summarizes broadcast seed', () => {
  start();
  plannerAction('plan-season', 'potato');
  plannerAction('plan-confirm');
  plannerAction('plan-change-crop');
  assert.equal(journey.getPlan().planting.potato.custom, true);
  assert.equal(journey.getPlan().planting.potato.confirmedAt, null);
  assert.match(planner(), /Custom crop/);
  setPlantCrop('mustard');
  const settings = journey.getPlan().planting.potato;
  assert.equal(settings.crop, 'mustard');
  assert.equal(journey.getPlan().planting.aman.crop, 'rice');
  assert.match(planner(), /kg seed/);
  assert.match(planner(), /Broadcast mustard \(Custom\)/);
  plannerAction('plan-season', 'aman');
  plannerAction('plan-season', 'potato');
  assert.equal(state.planner.crop, 'mustard');
  assert.match(planner(), /name="plantCrop" value="mustard" checked/);
  const serialized = journey.exportPlanJSON();
  journey.resetPlan();
  journey.importPlanJSON(serialized);
  assert.equal(journey.getPlan().planting.potato.custom, true);
});

test('two rice seasons keep separate spacing, confirmation and count records', () => {
  const original = start('baseline', true);
  plannerAction('plan-season', 'boro');
  edit('row', 30);
  edit('usable', 76);
  plannerAction('plan-confirm');
  assert.deepEqual(journey.getPlan().planting.aman, original.planting.aman);
  assert.equal(journey.getPlan().planting.boro.rowSpacingCm, 30);
  assert.ok(journey.getPlan().planting.boro.confirmedAt);
  plannerAction('plan-season', 'aman');
  assert.equal(state.planner.row, 20);
  plannerAction('plan-season', 'boro');
  assert.equal(state.planner.row, 30);
});

test('rotation handoff selects a season without replacing its saved settings or marking it custom', async t => {
  start();
  journey.setPlanting('mungbean', { rowSpacingCm: 35, usableAreaPct: 63 });
  const planting = journey.getPlan().planting;
  const previousLocation = globalThis.location;
  globalThis.location = { hash: '#rotations' };
  t.after(() => { globalThis.location = previousLocation; });
  const { rotationAction } = await import('../src/legacy/rotations.js');
  rotationAction('layout-for', 'legume');
  assert.equal(globalThis.location.hash, 'planner');
  assert.equal(state.planner.crop, 'mungbean');
  assert.equal(state.planner.row, 35);
  assert.equal(state.planner.usable, 63);
  assert.deepEqual(journey.getPlan().planting, planting);
});

test('confirmation completes planting only after all seasons; later edits invalidate generated plans', () => {
  const plan = start();
  for (const [index, season] of plan.rotation.seasons.entries()) {
    plannerAction('plan-season', season.key);
    plannerAction('plan-confirm');
    assert.equal(journey.stepStatus().planting, index === 2 ? 'done' : 'todo');
  }
  journey.markPlanGenerated({});
  edit('usable', 73);
  assert.equal(journey.getPlan().planting.mungbean.confirmedAt, null);
  assert.equal(journey.stepStatus().planting, 'review');
  assert.equal(journey.stepStatus().plan, 'review');
  plannerAction('plan-confirm');
  assert.equal(journey.stepStatus().planting, 'done');
  assert.equal(journey.stepStatus().plan, 'review');
});

test('no plan or rotation retains the single crop picker and rotation link', () => {
  for (const withField of [false, true]) {
    if (withField) {
      journey.startPlan();
      journey.confirmField(journey.fieldSnapshot(site, basePolygon(site), defaultProfile()));
    }
    const html = planner();
    assert.doesNotMatch(html, /role="tab"/);
    assert.equal((html.match(/name="plantCrop"/g) ?? []).length, 4);
    assert.match(html, /href="#rotations">Choose a rotation first to plan every season/);
    setPlantCrop('potato');
    assert.equal(state.planner.crop, 'potato');
    assert.deepEqual(journey.getPlan()?.planting ?? {}, {});
  }
});

test('field changes clear checkmarks and block confirmation until rotation is reviewed', t => {
  start();
  journey.confirmPlanting();
  journey.confirmField({ ...journey.getPlan().field, constraints: { ...defaultProfile(), irrigation: 'none' } });
  assert.ok(Object.values(journey.getPlan().planting).every(settings => settings.confirmedAt === null));
  assert.doesNotMatch(planner(), /class="plan-season-check"/);
  assert.match(planner(), /data-action="plan-confirm" disabled/);
  t.mock.method(console, 'warn', () => {});
  plannerAction('plan-confirm');
  assert.equal(journey.getPlan().planting.aman.confirmedAt, null);
});

test('adding fallow periods to an older snapshot preserves existing planting settings', () => {
  start();
  edit('row', 29);
  journey.confirmPlanting();
  const planting = journey.getPlan().planting;
  journey.confirmRotation(journey.rotationSnapshot('legume', defaultPriorities(), agronomy));
  assert.deepEqual(journey.getPlan().planting, planting);
  assert.equal(journey.stepStatus().planting, 'done');
  assert.equal(journey.getPlan().rotation.seasons.length, 4);
});

test('invalid custom flags, timestamps and failed storage cannot replace saved settings', t => {
  const original = start();
  assert.throws(() => journey.setPlanting('aman', { confirmedAt: 'yesterday' }));
  assert.throws(() => journey.setPlanting('aman', { custom: 'yes' }));
  assert.throws(() => journey.setPlanting('fallow-5', {}));
  assert.deepEqual(journey.getPlan(), original);
  t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('quota'); });
  t.mock.method(console, 'warn', () => {});
  plannerAction('plan-confirm');
  assert.deepEqual(journey.getPlan(), original);
  assert.doesNotMatch(planner(), /class="plan-season-check"/);
});
