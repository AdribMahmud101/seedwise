import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as journey from '../src/legacy/journey.js';
import * as story from '../src/legacy/journey-story.js';
import { state, basePolygon, defaultProfile, defaultPriorities } from '../src/legacy/ui.js';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: key => storage.delete(key),
};

const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const site = earth.fields[0];
const field = () => journey.fieldSnapshot(site, basePolygon(site), defaultProfile());
const rotation = () => journey.rotationSnapshot('legume', defaultPriorities(), agronomy);

beforeEach(() => {
  journey.resetPlan();
  state.lang = 'en';
});

test('checklist state from plan + events per page', () => {
  // 1. Initial field page checklist
  journey.startPlan();
  story.setStoryPage('field', () => {});
  let checklist = story.getPageChecklist('field');
  assert.equal(checklist.length, 4);
  assert.equal(checklist[0].id, 'field-map');
  assert.equal(checklist[1].id, 'field-area');
  assert.equal(checklist[2].id, 'field-constraints');
  assert.equal(checklist[3].id, 'field-use');
  assert.equal(checklist[3].done, false);

  // Confirm field
  journey.confirmField(field());
  checklist = story.getPageChecklist('field');
  assert.equal(checklist[3].done, true);

  // 2. Rotations page checklist
  story.setStoryPage('rotations', () => {});
  checklist = story.getPageChecklist('rotations');
  assert.equal(checklist.length, 4);
  assert.equal(checklist[0].id, 'rotation-priorities');
  assert.equal(checklist[1].id, 'rotation-compare');
  assert.equal(checklist[2].id, 'rotation-choose');
  assert.equal(checklist[2].done, false);
  assert.equal(checklist[3].id, 'rotation-constraints');
  assert.equal(checklist[3].optional, true);

  // Confirm rotation
  journey.confirmRotation(rotation());
  checklist = story.getPageChecklist('rotations');
  assert.equal(checklist[2].done, true);

  // 3. Planner page checklist
  story.setStoryPage('planner', () => {});
  checklist = story.getPageChecklist('planner');
  assert.equal(checklist.length, 4);
  assert.equal(checklist[0].id, 'planting-open-season');
  assert.equal(checklist[1].id, 'planting-adjust-spacing');
  assert.equal(checklist[2].id, 'planting-save-next');
  assert.equal(checklist[3].id, 'planting-finish');
  assert.equal(checklist[0].done, false);
  assert.equal(checklist[1].done, false);

  // Confirm planting
  journey.confirmPlanting();
  checklist = story.getPageChecklist('planner');
  assert.equal(checklist[2].done, true);
  assert.equal(checklist[3].done, true);

  // 4. Plan page checklist
  story.setStoryPage('plan', () => {});
  checklist = story.getPageChecklist('plan');
  assert.equal(checklist.length, 4);
  assert.equal(checklist[0].id, 'plan-open');
  assert.equal(checklist[1].id, 'plan-calendar');
  assert.equal(checklist[2].id, 'plan-task');
  assert.equal(checklist[3].id, 'plan-download');
});

test('Continue behaviour: incomplete triggers show-me target; complete allows handoff', () => {
  journey.startPlan();
  const navigated = [];
  story.setStoryPage('field', dest => navigated.push(dest));

  // Initially incomplete (field not confirmed)
  const allowedIncomplete = story.handleContinue();
  assert.equal(allowedIncomplete, false);
  assert.equal(navigated.length, 0);

  // Confirm field and test Continue
  journey.confirmField(field());
  const allowedComplete = story.handleContinue();
  assert.equal(allowedComplete, true);
  assert.equal(navigated.at(-1), 'rotations');
});

test('demo beat sequencer: order, progressive ticks, pause/exit, and own plan untouched', async () => {
  // Set up own plan first
  journey.startPlan({ mode: 'own' });
  journey.confirmField({ ...field(), name: 'My Own Custom Farm' });
  const ownPlanSnapshot = journey.getPlan();
  assert.equal(ownPlanSnapshot.field.name, 'My Own Custom Farm');

  // Verify demo beats structure
  assert.ok(story.DEMO_BEATS.length >= 8);
  assert.equal(story.DEMO_BEATS[0].page, 'field');
  assert.equal(story.DEMO_BEATS[3].page, 'rotations');
  assert.equal(story.DEMO_BEATS[5].page, 'planner');
  assert.equal(story.DEMO_BEATS.at(-1).page, 'plan');

  const visitedBeats = [];
  const director = new story.DemoStoryDirector({
    beats: story.DEMO_BEATS,
    beatDurationMs: 50,
    onBeat: (beat, idx) => visitedBeats.push({ beat: beat.name, idx }),
  });

  await director.start();
  assert.equal(director.isPlaying(), true);
  assert.equal(visitedBeats[0].idx, 0);
  assert.equal(visitedBeats[0].beat, 'welcome');

  // Check demo plan mode
  assert.equal(journey.getPlan().mode, 'demo');
  assert.match(journey.getPlan().field.name, /Rahim/);

  // Test Pause / Resume
  director.pause();
  assert.equal(director.isPlaying(), false);
  director.resume();
  assert.equal(director.isPlaying(), true);

  // Next beat manually
  await director.next();
  assert.equal(visitedBeats[1].idx, 1);

  // Exit demo and verify own plan restored
  director.exit();
  assert.equal(director.isPlaying(), false);
  const restoredPlan = journey.getPlan();
  assert.equal(restoredPlan.mode, 'own');
  assert.equal(restoredPlan.field.name, 'My Own Custom Farm');
});
