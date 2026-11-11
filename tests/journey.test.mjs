import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as journey from '../src/legacy/journey.js';
import { areaHa, capacity, rotationEvidence, STRATEGIES } from '../src/legacy/engine.js';
import { recommendedSettings } from '../src/legacy/planner-controls.js';
import { basePolygon, defaultPriorities, defaultProfile, fieldName, state, persist, loadData, setProfile, field as selectedField, polygon, profile } from '../src/legacy/ui.js';

const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const site = earth.fields.find(f => f.id === 'mithapukur');
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};
const field = () => journey.fieldSnapshot(site, basePolygon(site), defaultProfile());
const fieldWithoutOutline = () => {
  const { outline, ...snapshot } = field();
  assert.ok(outline);
  return snapshot;
};
const rotation = (id = 'legume') => journey.rotationSnapshot(id, defaultPriorities(), agronomy);
function ready() {
  journey.startPlan({ mode: 'own' });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  journey.confirmPlanting();
  journey.markPlanGenerated({ summary: 'Season ready' });
  return journey.getPlan();
}
beforeEach(() => journey.resetPlan());

test('uninitialized selection and non-browser event targets remain safe', async () => {
  const { getSelectedRotationId } = await import('../src/legacy/rotations.js');
  assert.equal(getSelectedRotationId(), 'mustard');
  const oldWindow = globalThis.window;
  globalThis.window = {};
  try { assert.doesNotThrow(() => journey.startPlan()); }
  finally { globalThis.window = oldWindow; }
});

test('versioned schema, step order, defensive snapshots, and reset', () => {
  assert.equal(journey.getPlan(), null);
  assert.equal(journey.nextStep(), 'field');
  const plan = journey.startPlan({ mode: 'own' });
  assert.equal(plan.version, 1);
  assert.ok(plan.id);
  assert.ok(Number.isFinite(Date.parse(plan.createdAt)));
  assert.deepEqual(journey.stepStatus(), { field: 'todo', rotation: 'todo', planting: 'todo', plan: 'todo' });
  plan.steps.field = 'done';
  assert.equal(journey.stepStatus().field, 'todo');
  journey.confirmField(field());
  assert.equal(journey.nextStep(), 'rotation');
  journey.confirmRotation(rotation());
  assert.equal(journey.nextStep(), 'planting');
  journey.confirmPlanting();
  assert.equal(journey.nextStep(), 'plan');
  journey.markPlanGenerated({});
  assert.equal(journey.nextStep(), null);
  journey.resetPlan();
  assert.equal(storage.has('ropon_season_plan_v1'), false);
});

test('persistence and import/export round trip preserve review reasons across reload', async () => {
  ready();
  journey.confirmField({ ...field(), id: 'another' });
  const json = journey.exportPlanJSON();
  assert.equal(storage.get('ropon_season_plan_v1'), JSON.stringify(journey.getPlan()));
  const reloaded = await import('../src/legacy/journey.js?reload');
  assert.deepEqual(reloaded.getPlan(), journey.getPlan());
  journey.resetPlan();
  journey.importPlanJSON(json);
  assert.deepEqual(journey.getPlan(), JSON.parse(json));
  assert.deepEqual(journey.reviewReasons(), ['field changed']);
  assert.deepEqual(journey.reviewReasons((en, bn) => bn), ['জমি পরিবর্তিত হয়েছে']);
});

test('field identity, outline, and area changes invalidate downstream work through a pure transition', () => {
  const original = ready();
  const frozen = JSON.stringify(original);
  for (const change of [{ id: 'new' }, { outlineHash: 'new' }, { areaHa: original.field.areaHa * 1.011 }]) {
    const next = journey.transitionPlan(original, { type: 'field', value: { ...fieldWithoutOutline(), ...change } }, '2026-11-11T12:00:00.000Z');
    assert.equal(next.steps.rotation, 'review');
    assert.equal(next.steps.planting, 'review');
    assert.equal(next.steps.plan, 'review');
    assert.equal(next.reviews.rotation.en, 'field changed');
    assert.equal(next.reviews.planting.bn, 'জমি পরিবর্তিত হয়েছে');
    assert.equal(JSON.stringify(original), frozen);
  }
  for (const ratio of [1, 1.009, 1.01, 0.99]) {
    const next = journey.transitionPlan(original, { type: 'field', value: { ...fieldWithoutOutline(), areaHa: original.field.areaHa * ratio } });
    assert.equal(next.steps.rotation, 'done');
  }
});

test('field constraints also trigger review and counts follow the current area', () => {
  const original = ready();
  journey.confirmField({ ...field(), constraints: { ...field().constraints, irrigation: 'none' } });
  assert.equal(journey.stepStatus().rotation, 'review');
  journey.confirmField({ ...fieldWithoutOutline(), areaHa: original.field.areaHa * 2 });
  for (const settings of Object.values(journey.getPlan().planting)) {
    const expected = capacity(original.field.areaHa * 2, settings.usableAreaPct, settings.crop,
      settings.crop === 'mustard' ? 0 : settings.rowSpacingCm / 100,
      settings.crop === 'mustard' ? 0 : settings.withinRowCm / 100);
    assert.equal(settings.counts.plants, expected.positions);
  }
});

test('rotation changes reset planting to real recommended defaults and retain bilingual reasons', () => {
  ready();
  journey.setPlanting('potato', { rowSpacingCm: 70, variety: 'Custom' });
  journey.confirmRotation(rotation('mustard'));
  const plan = journey.getPlan();
  assert.deepEqual(Object.keys(plan.planting), ['aman', 'mustard', 'boro']);
  assert.equal(plan.steps.planting, 'review');
  assert.match(journey.reviewReasons().join(), /rotation changed: Aman rice → Mustard → Boro rice/);
  assert.match(journey.reviewReasons((en, bn) => bn).join(), /আমন ধান → সরিষা → বোরো ধান/);
  for (const season of plan.rotation.seasons) {
    const settings = plan.planting[season.key];
    const defaults = recommendedSettings(settings.crop);
    assert.equal(settings.rowSpacingCm, defaults.row);
    assert.equal(settings.withinRowCm, defaults.spacing);
    assert.equal(settings.usableAreaPct, defaults.usable);
    assert.equal(settings.confirmedAt, null);
  }
  journey.confirmPlanting();
  assert.equal(journey.stepStatus().planting, 'done');
});

test('editing generated planting invalidates plan; unchanged writes are silent', () => {
  ready();
  let calls = 0;
  const unsubscribe = journey.subscribe(plan => { calls++; if (plan) plan.mode = 'demo'; });
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  const settings = journey.getPlan().planting.potato;
  journey.setPlanting('potato', settings);
  assert.equal(calls, 0);
  journey.setPlanting('potato', { rowSpacingCm: 70 });
  assert.equal(calls, 1);
  assert.equal(journey.getPlan().mode, 'own');
  assert.equal(journey.stepStatus().plan, 'review');
  assert.match(journey.reviewReasons().join(), /planting settings changed: potato/);
  assert.match(journey.reviewReasons((en, bn) => bn).join(), /বপনের মাপ পরিবর্তিত/);
  assert.throws(() => journey.markPlanGenerated({}), /confirm/i);
  journey.confirmPlanting();
  journey.markPlanGenerated({});
  assert.deepEqual(journey.reviewReasons(), []);
  unsubscribe();
  journey.resetPlan();
  assert.equal(calls, 3);
});

test('CustomEvent notifications include detached snapshots and reset', () => {
  const oldWindow = globalThis.window;
  const events = [];
  globalThis.window = { dispatchEvent: event => events.push(event) };
  try {
    journey.startPlan({ mode: 'demo' });
    assert.equal(events[0].type, 'ropon:plan');
    events[0].detail.mode = 'own';
    assert.equal(journey.getPlan().mode, 'demo');
    journey.resetPlan();
    assert.equal(events[1].detail, null);
  } finally { globalThis.window = oldWindow; }
});

test('malformed JSON and nested schemas are rejected without replacing the plan', () => {
  const original = ready();
  const mutations = [
    p => { p.version = 2; }, p => { p.mode = 'other'; }, p => { p.createdAt = 'bad'; },
    p => { p.field.areaHa = -1; }, p => { p.field.constraints = []; },
    p => { p.rotation.seasons[1].key = p.rotation.seasons[0].key; },
    p => { p.rotation.seasons[0].sowMonth = 13; },
    p => { p.planting.potato.crop = 'unknown'; }, p => { p.planting.potato.rowSpacingCm = 0; },
    p => { p.planting.potato.usableAreaPct = 101; }, p => { p.planting.potato.counts.plants = 'many'; },
    p => { delete p.planting.potato; }, p => { p.steps.plan = 'maybe'; },
    p => { p.reviews.plan = { en: 2 }; }, p => { p.plan.generatedAt = 'bad'; },
    p => { p.steps.rotation = 'review'; },
    p => { p.rotation.id = 'unknown'; }, p => { p.rotation.priorities = {}; },
    p => { p.planting.potato.rowSpacingCm = 60.5; }, p => { p.planting.potato.rowSpacingCm = 500; },
    p => { p.steps.rotation = 'todo'; },
    p => { p.rotation.priorities.extra = 1; },
    p => { p.field.constraints.harvest = { toString: 'not-callable' }; },
    p => { p.field.constraints.floodDays = 'many'; }, p => { p.field.constraints.irrigation = 'unknown'; },
    p => { p.field.outlineHash = 'wrong'; },
    p => { p.field.id = '__proto__'; }, p => { p.field.id = 'constructor'; }, p => { p.field.id = 'toString'; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(original); mutate(invalid);
    assert.throws(() => journey.importPlanJSON(JSON.stringify(invalid)), /invalid|version/i);
    assert.deepEqual(journey.getPlan(), original);
  }
  for (const json of ['{', 'null', '[]', '{}', '{"__proto__":{}}']) assert.throws(() => journey.importPlanJSON(json));
  assert.throws(() => journey.setPlanting('__proto__', {}));
  assert.throws(() => journey.setPlanting('potato', { rowSpacingCm: NaN }));
  assert.throws(() => journey.setPlanting('potato', { rowSpacingCm: 60.5 }));
  assert.throws(() => journey.startPlan({ mode: 'other' }));
});

test('changing priorities preserves chosen rotation planting settings and confirmations', () => {
  ready();
  journey.setPlanting('potato', { rowSpacingCm: 70 });
  journey.confirmPlanting();
  const planting = journey.getPlan().planting;
  journey.confirmRotation({ ...rotation(), priorities: { ...defaultPriorities(), water: 5 } });
  assert.deepEqual(journey.getPlan().planting, planting);
  assert.equal(journey.stepStatus().planting, 'done');
  assert.deepEqual(journey.reviewReasons(), ['rotation priorities changed']);
  assert.deepEqual(journey.reviewReasons((en, bn) => bn), ['ফসলচক্রের অগ্রাধিকার পরিবর্তিত হয়েছে']);
});

test('imported outlines, areas, and stored counts cannot disagree', () => {
  const plan = ready();
  plan.field.areaHa *= 2;
  for (const settings of Object.values(plan.planting)) {
    const result = capacity(plan.field.areaHa, settings.usableAreaPct, settings.crop,
      settings.rowSpacingCm / 100, settings.withinRowCm / 100);
    settings.counts = { plants: result.positions, seedKg: result.seedKg };
  }
  assert.throws(() => journey.importPlanJSON(JSON.stringify(plan)), /invalid/i);
});

test('imports accept reordered count keys and failed storage writes preserve the previous plan', t => {
  ready();
  const imported = journey.getPlan();
  const counts = imported.planting.potato.counts;
  imported.planting.potato.counts = { seedKg: counts.seedKg, plants: counts.plants };
  journey.importPlanJSON(JSON.stringify(imported));
  const previous = journey.getPlan();
  t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('quota'); });
  assert.throws(() => journey.setPlanting('potato', { rowSpacingCm: 70 }), /quota/);
  assert.deepEqual(journey.getPlan(), previous);
});

test('all rotation calendars and counts match existing engine data, including New Year', () => {
  for (const strategy of STRATEGIES) {
    journey.startPlan({ mode: 'own' });
    journey.confirmField(field());
    const snapshot = rotation(strategy.id);
    journey.confirmRotation(snapshot);
    assert.equal(snapshot.seasons[0].crop, 'aman');
    for (const season of snapshot.seasons) {
      const calendarCrop = season.crop === 'mungbean' ? 'pulse' : season.crop;
      assert.equal(strategy.months[season.sowMonth - 1], calendarCrop);
      assert.equal(strategy.months[season.harvestMonth - 1], calendarCrop);
      const settings = journey.getPlan().planting[season.key];
      if (season.crop === 'fallow') {
        assert.equal(settings, undefined);
        continue;
      }
      const result = capacity(field().areaHa, settings.usableAreaPct, settings.crop,
        settings.crop === 'mustard' ? 0 : settings.rowSpacingCm / 100,
        settings.crop === 'mustard' ? 0 : settings.withinRowCm / 100);
      assert.deepEqual(settings.counts, { plants: result.positions, seedKg: result.seedKg });
    }
  }
  const potato = rotation('legume').seasons.find(s => s.crop === 'potato');
  assert.equal(potato.sowMonth, 11);
  assert.equal(potato.harvestMonth, 2);
});

test('demo uses Rahim’s prepared Mithapukur geometry and real ranking with default priorities', async t => {
  t.mock.method(globalThis, 'fetch', async input => {
    const url = String(input);
    return Response.json(url.includes('agronomy') ? agronomy : earth);
  });
  const plan = await journey.demoPlan();
  assert.equal(plan.mode, 'demo');
  assert.equal(plan.field.name, "Rahim's field");
  assert.equal(plan.field.id, site.id);
  assert.equal(plan.field.areaHa, areaHa(basePolygon(site)));
  const best = rotationEvidence(site.monthly, defaultPriorities(), defaultProfile())[0];
  assert.equal(plan.rotation.id, best.id);
  assert.deepEqual(plan.rotation.priorities, defaultPriorities());
  assert.ok(Object.values(plan.planting).every(p => p.confirmedAt));
  assert.equal(journey.nextStep(), null);
});

test('field persistence and planner/rotation hooks preserve page state and sync the shared plan', async t => {
  const savedState = structuredClone(state);
  const oldDocument = globalThis.document;
  const oldWindow = globalThis.window;
  globalThis.document = { baseURI: 'https://example.test/', querySelector: () => null,
    querySelectorAll: () => [], getElementById: () => null };
  globalThis.window = { dispatchEvent() {} };
  t.mock.method(globalThis, 'fetch', async input => Response.json(String(input).includes('agronomy') ? agronomy : earth));
  try {
    await loadData();
    assert.equal(journey.getPlan(), null);
    journey.startPlan();
    journey.confirmField(journey.fieldSnapshot(selectedField(), polygon(), profile()));
    persist();
    assert.equal(journey.getPlan().field.id, state.fieldId);
    const { rotationAction, getSelectedRotationId, mountRotations } = await import('../src/legacy/rotations.js');
    rotationAction('save-rotation', 'legume');
    assert.equal(journey.getPlan().rotation.id, 'legume');
    assert.equal(getSelectedRotationId(), 'legume');
    const { setPlantCrop, plannerAction, planner } = await import('../src/legacy/planner.js');
    plannerAction('plan-season', 'potato');
    state.planner.usable = 71;
    setPlantCrop('potato');
    assert.equal(journey.getPlan().planting.potato.usableAreaPct, 71);
    assert.equal(state.planner.usable, 71);
    plannerAction('plan-reset');
    assert.equal(journey.getPlan().planting.potato.usableAreaPct, recommendedSettings('potato').usable);
    journey.setPlanting('potato', { rowSpacingCm: 72, usableAreaPct: 69 });
    planner();
    assert.equal(state.planner.row, 72);
    assert.equal(state.planner.usable, 69);
    setPlantCrop('mustard');
    assert.ok(Object.values(journey.getPlan().planting).some(settings => settings.crop === 'mustard'));
    journey.confirmPlanting();
    setProfile({ irrigation: 'none' });
    assert.equal(journey.stepStatus().rotation, 'review');
    await mountRotations();
    assert.equal(journey.stepStatus().rotation, 'review');
    state.boundaries[state.fieldId] = basePolygon(site).map(([lat, lon]) => [lat + 0.001, lon]);
    persist();
    assert.equal(journey.getPlan().field.outlineHash, journey.fieldSnapshot(site, state.boundaries[state.fieldId], {}).outlineHash);
    journey.confirmRotation(rotation('mustard'));
    assert.equal(getSelectedRotationId(), 'mustard');
    t.mock.method(console, 'warn', () => {});
    t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('quota'); });
    assert.doesNotThrow(() => setPlantCrop('rice'));
    assert.equal(state.planner.crop, 'rice');
    assert.doesNotThrow(() => rotationAction('save-rotation', 'legume'));
  } finally {
    Object.assign(state, savedState);
    globalThis.document = oldDocument;
    globalThis.window = oldWindow;
  }
});

test('prepared data still loads when season storage is unavailable; unrelated saves preserve imports and demo', async t => {
  const oldDocument = globalThis.document;
  const savedState = structuredClone(state);
  globalThis.document = { baseURI: 'https://example.test/' };
  t.mock.method(globalThis, 'fetch', async input => Response.json(String(input).includes('agronomy') ? agronomy : earth));
  const failure = t.mock.method(globalThis.localStorage, 'setItem', () => { throw new Error('quota'); });
  t.mock.method(console, 'warn', () => {});
  try {
    await assert.doesNotReject(loadData());
    failure.mock.restore();
    await loadData();
    const plan = await journey.demoPlan();
    assert.equal(state.boundaries[site.id], undefined);
    assert.equal(fieldName(), "Rahim's field");
    const savedLang = state.lang;
    state.lang = state.lang === 'en' ? 'bn' : 'en';
    try { persist(); } finally { state.lang = savedLang; }
    assert.deepEqual(journey.getPlan(), plan);
    await loadData();
    assert.deepEqual(journey.getPlan(), plan);
    const other = earth.fields.find(f => f.id === 'pirganj');
    const outline = basePolygon(other).map(([lat, lon]) => [lat + 0.0001, lon]);
    journey.confirmField(journey.fieldSnapshot(other, outline, { ...defaultProfile(), budget: 'low' }));
    const imported = journey.exportPlanJSON();
    journey.resetPlan();
    state.fieldId = site.id;
    journey.importPlanJSON(imported);
    assert.equal(state.fieldId, other.id);
    assert.deepEqual(state.boundaries[other.id], outline);
    assert.equal(state.profiles[other.id].budget, 'low');
    const customId = 'custom-imported';
    journey.confirmField({ ...journey.fieldSnapshot(other, outline, defaultProfile()), id: customId, name: 'Imported field' });
    const customPlan = journey.exportPlanJSON();
    journey.resetPlan();
    state.customFields = state.customFields.filter(f => f.id !== customId);
    state.fieldId = site.id;
    journey.importPlanJSON(customPlan);
    assert.equal(state.fieldId, customId);
    assert.ok(state.customFields.some(f => f.id === customId));
    assert.deepEqual(state.boundaries[customId], outline);
  } finally {
    Object.assign(state, savedState);
    globalThis.document = oldDocument;
  }
});
