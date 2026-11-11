import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as journey from '../src/legacy/journey.js';
import { state, basePolygon, defaultProfile, defaultPriorities, loadData, persist } from '../src/legacy/ui.js';

const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const bar = await import('../src/legacy/journey-bar.js');
const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const site = earth.fields[0];
const field = () => journey.fieldSnapshot(site, basePolygon(site), defaultProfile());
const rotation = () => journey.rotationSnapshot('legume', defaultPriorities(), agronomy);
beforeEach(() => { journey.resetPlan(); state.lang = 'en'; });

test('no plan hides bar and handoffs; only explicit start choices appear', () => {
  assert.equal(bar.journeyBar('field'), '');
  assert.equal(bar.journeyFieldCTA(), '');
  assert.equal(bar.journeyRotationCTA('legume'), '');
  assert.equal(bar.journeyFinishCTA(), '');
  assert.match(bar.journeyStart(), /Plan my season/);
  assert.match(bar.journeyStart(), /Watch Rahim&#39;s journey|Watch Rahim's journey/);
});

test('steps render todo/current/done/review with accessible jump links', () => {
  journey.startPlan();
  let html = bar.journeyBar('field');
  assert.match(html, /data-status="current"[^>]*aria-current="step"/);
  assert.equal((html.match(/data-status="todo"/g) ?? []).length, 3);
  assert.match(html, /data-journey="continue"/);
  journey.confirmField(field());
  journey.confirmRotation(rotation());
  journey.confirmPlanting();
  journey.confirmField({ ...field(), constraints: { ...defaultProfile(), irrigation: 'none' } });
  html = bar.journeyBar('rotations');
  assert.match(html, /data-status="done"/);
  assert.match(html, /data-status="review"[^>]*aria-current="step"/);
  assert.match(html, /⚠/);
  assert.match(html, /href="#planner"/);
  assert.equal(bar.journeyBar('clinic'), '');
});

test('finish needs one chosen rotation; season review is optional', () => {
  journey.startPlan();
  assert.match(bar.journeyFinishCTA(), /disabled/);
  journey.confirmField(field());
  assert.equal(bar.canFinishPlanting(journey.getPlan()), false);
  journey.confirmRotation(rotation());
  // One rotation chosen: finish is available on recommended settings; season review is optional
  assert.equal(bar.canFinishPlanting(journey.getPlan()), true);
  assert.doesNotMatch(bar.journeyFinishCTA(), /disabled/);
  assert.match(bar.journeyFinishCTA(), /Optional: check/);
  journey.confirmPlanting();
  assert.doesNotMatch(bar.journeyFinishCTA(), /Optional: check/);
  // Invalid settings still block finishing
  const plan = journey.getPlan();
  plan.planting[plan.rotation.seasons.find(s => s.crop !== 'fallow').key].usableAreaPct = 0;
  assert.equal(bar.canFinishPlanting(plan), false);
  // Field change invalidates planting
  journey.confirmField({ ...field(), constraints: { ...defaultProfile(), irrigation: 'none' } });
  assert.match(bar.journeyFinishCTA(), /disabled/);
});

test('demo ribbon and exit are explicit and bilingual', () => {
  journey.startPlan({ mode: 'demo' });
  assert.match(bar.journeyBar('planner'), /Demo — Rahim/);
  assert.match(bar.journeyBar('planner'), /Start my own/);
  assert.equal(bar.journeyStart(), '');
  state.lang = 'bn';
  assert.match(bar.journeyBar('field'), /রহিমের জমি/);
  assert.match(bar.journeyBar('field'), /নিজের পরিকল্পনা শুরু/);
  assert.match(bar.journeyBar('field'), /জমি/);
});

test('review banner translates reasons and scopes warnings to the affected page', () => {
  journey.startPlan(); journey.confirmField(field()); journey.confirmRotation(rotation()); journey.confirmPlanting();
  journey.confirmField({ ...field(), constraints: { ...defaultProfile(), irrigation: 'none' } });
  assert.match(bar.journeyReview('rotations'), /field changed/);
  assert.match(bar.journeyReview('rotations'), /data-journey="review"/);
  assert.match(bar.journeyReview('rotations'), /data-journey="dismiss"/);
  assert.equal(bar.journeyReview('field'), '');
  state.lang = 'bn';
  assert.match(bar.journeyReview('planner'), /জমি পরিবর্তিত হয়েছে/);
});

test('compact markup keeps four numbered targets and one visible route label', () => {
  journey.startPlan();
  const html = bar.journeyBar('planner');
  assert.equal((html.match(/class="journey-number"/g) ?? []).length, 4);
  assert.match(html, /class="journey-step-label"/);
  assert.match(html, /aria-label="3\. Planting/);
  const css = readFileSync(new URL('../app/journey.css', import.meta.url), 'utf8');
  assert.match(css, /min-(?:width|height): 44px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('first visit and unrelated workspace saves never implicitly start a season', async t => {
  const oldDocument = globalThis.document;
  globalThis.document = { baseURI: 'https://example.test/', querySelector: () => null };
  t.mock.method(globalThis, 'fetch', async input => Response.json(String(input).includes('agronomy') ? agronomy : earth));
  try {
    await loadData(); persist();
    assert.equal(journey.getPlan(), null);
    journey.startPlan(); persist();
    assert.equal(journey.getPlan().field, null);
  } finally { globalThis.document = oldDocument; }
});

test('hand-offs confirm snapshots, celebrate, and show hints after the destination mounts', async t => {
  const { guide } = await import('../src/legacy/planty-guide.js');
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: () => null };
  const destinations = [];
  const navigate = target => destinations.push(target);
  const celebrate = t.mock.method(guide, 'celebrate', () => {});
  const hint = t.mock.method(guide, 'hint', () => {});
  t.mock.method(guide, 'stop', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    journey.startPlan();
    bar.mountJourney('field', navigate, () => true);
    await bar.journeyAction('field');
    assert.equal(journey.stepStatus().field, 'done');
    assert.equal(destinations.at(-1), 'rotations');
    bar.mountJourney('rotations', navigate, () => true);
    t.mock.timers.tick(900);
    assert.equal(hint.mock.calls[0].arguments[0], '#rotation-list');
    await bar.journeyAction('rotation', 'legume');
    assert.equal(journey.getPlan().rotation.id, 'legume');
    assert.equal(destinations.at(-1), 'planner');
    bar.mountJourney('planner', navigate, () => true);
    t.mock.timers.tick(900);
    assert.equal(hint.mock.calls[1].arguments[0], '#plan-seasons');
    assert.match(hint.mock.calls[1].arguments[1], /each season/);
    // Need to confirm all seasons before finish
    journey.confirmPlanting();
    await bar.journeyAction('finish');
    assert.equal(journey.stepStatus().planting, 'done');
    assert.equal(destinations.at(-1), 'plan');
    assert.equal(celebrate.mock.calls.length, 3);
  } finally { globalThis.document = oldDocument; }
});

test('optional-season note clears live after reviewing the last season', async t => {
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: selector => selector === '#journey-finish-slot' ? { innerHTML: '' } : null };
  try {
    journey.startPlan();
    journey.confirmField(field());
    journey.confirmRotation(rotation());
    const plan = journey.getPlan();
    const seasons = plan.rotation.seasons.filter(s => s.crop !== 'fallow');
    // Confirm all but one season
    for (let i = 0; i < seasons.length - 1; i++) {
      journey.setPlanting(seasons[i].key, { ...plan.planting[seasons[i].key], confirmedAt: new Date().toISOString() });
    }
    bar.mountJourney('planner', () => {}, () => false);
    assert.doesNotMatch(bar.journeyFinishCTA(), /disabled/);
    assert.match(bar.journeyFinishCTA(), /Optional: check/);
    // Confirm the last season
    journey.setPlanting(seasons[seasons.length - 1].key, { ...plan.planting[seasons[seasons.length - 1].key], confirmedAt: new Date().toISOString() });
    assert.doesNotMatch(bar.journeyFinishCTA(), /disabled|Optional: check/);
  } finally { globalThis.document = oldDocument; }
});

test('review dismissal hides only the current warning and a new change restores it', async t => {
  const { guide } = await import('../src/legacy/planty-guide.js');
  const hint = t.mock.method(guide, 'hint', () => {});
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: () => null };
  try {
    journey.startPlan(); journey.confirmField(field()); journey.confirmRotation(rotation()); journey.confirmPlanting();
    journey.confirmField({ ...field(), constraints: { ...defaultProfile(), irrigation: 'none' } });
    bar.mountJourney('rotations', () => {}, () => false);
    await bar.journeyAction('review');
    assert.equal(hint.mock.calls[0].arguments[0], '[data-action="profile"]');
    await bar.journeyAction('dismiss');
    assert.equal(bar.journeyReview('rotations'), '');
    assert.match(bar.journeyReview('planner'), /field changed/);
    journey.confirmRotation(rotation());
    journey.confirmField({ ...field(), constraints: { ...defaultProfile(), budget: 'low' } });
    assert.match(bar.journeyReview('rotations'), /field changed/);
  } finally { globalThis.document = oldDocument; }
});

test('reconfirming unchanged values still animates the completed step', async t => {
  const { guide } = await import('../src/legacy/planty-guide.js');
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: () => null };
  t.mock.method(guide, 'celebrate', () => {});
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    journey.startPlan();
    bar.mountJourney('field', () => {}, () => false);
    await bar.journeyAction('field');
    t.mock.timers.tick(2000);
    assert.doesNotMatch(bar.journeyBar('field'), /just-completed/);
    await bar.journeyAction('field');
    assert.match(bar.journeyBar('field'), /just-completed/);
    t.mock.timers.tick(2000);
    assert.doesNotMatch(bar.journeyBar('field'), /just-completed/);
  } finally { globalThis.document = oldDocument; }
});

test('planting review points to the spacing control that changed', async t => {
  const { guide } = await import('../src/legacy/planty-guide.js');
  const hint = t.mock.method(guide, 'hint', () => {});
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: () => null };
  try {
    journey.startPlan(); journey.confirmField(field()); journey.confirmRotation(rotation()); journey.confirmPlanting();
    bar.mountJourney('planner', () => {}, () => false);
    journey.setPlanting('potato', { rowSpacingCm: 70 });
    await bar.journeyAction('review');
    assert.equal(hint.mock.calls[0].arguments[0], '#plan-row');
  } finally { globalThis.document = oldDocument; }
});
