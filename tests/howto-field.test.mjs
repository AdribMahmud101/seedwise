import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FIELD_HOWTO_STEPS,
  HOWTO_STEPS,
  HOWTO_IDS,
  ROTATION_HOWTO_STEPS,
  applyFieldDoneEvent,
  clipMarkup,
  countWords,
  resolveOpenId,
} from '../src/legacy/howto-field.js';
import { HOWTO_STEPS as REGISTRY_STEPS } from '../src/legacy/howto-registry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('sub-step model shape: bilingual, word limits, micro-sequence per control', () => {
  assert.deepEqual(HOWTO_IDS, ['field-map', 'field-area', 'field-constraints', 'field-use']);
  assert.equal(FIELD_HOWTO_STEPS.length, 4);
  for (const step of FIELD_HOWTO_STEPS) {
    for (const key of ['id', 'title', 'why', 'how', 'target', 'doneEvent', 'clip', 'poster', 'micro', 'seconds']) {
      assert.ok(step[key] !== undefined && step[key] !== null, `${step.id} has ${key}`);
    }
    for (const lang of ['en', 'bn']) {
      assert.ok(step.title[lang]?.trim(), `${step.id} title.${lang}`);
      assert.ok(step.why[lang]?.trim(), `${step.id} why.${lang}`);
      assert.ok(step.how[lang]?.trim(), `${step.id} how.${lang}`);
    }
    assert.ok(countWords(step.why.en) <= 10, `${step.id} why.en ≤10 words`);
    assert.ok(countWords(step.how.en) <= 14, `${step.id} how.en ≤14 words`);
    assert.ok(countWords(step.why.bn) <= 10, `${step.id} why.bn ≤10 words`);
    assert.ok(countWords(step.how.bn) <= 14, `${step.id} how.bn ≤14 words`);
    assert.equal(step.clip, `/assets/howto/${step.id}.webp`);
    assert.equal(step.poster, `/assets/howto/${step.id}.jpg`);
    assert.ok(Array.isArray(step.micro) && step.micro.length >= 1, `${step.id} has micro-steps`);
    for (const m of step.micro) {
      assert.ok(m.target?.trim(), `${step.id} micro target`);
      assert.ok(m.text.en?.trim() && m.text.bn?.trim(), `${step.id} micro bilingual text`);
      assert.ok(['click', 'input', 'change', 'pointerup', 'none'].includes(m.action), `${step.id} micro action`);
    }
  }
  // Amendment E: every button/action has its own micro-step.
  const byId = Object.fromEntries(FIELD_HOWTO_STEPS.map(s => [s.id, s]));
  assert.equal(byId['field-map'].micro.length, 3);
  assert.equal(byId['field-area'].micro.length, 7); // value, Edit, bund, drain, path, other, Save
  assert.ok(byId['field-area'].micro.filter(m => m.target.startsWith('#in-')).every(m => m.action === 'none'), 'area inputs wait for Next, not the first keystroke');
  assert.equal(byId['field-constraints'].micro.length, 5);
  assert.ok(byId['field-constraints'].micro.some(m => m.target.includes('in-irrigation')));
  assert.ok(byId['field-constraints'].micro.some(m => m.target.includes('in-budget')));
  assert.ok(byId['field-constraints'].micro.at(-1).target.includes('profile-form'));
  assert.equal(byId['field-use'].micro.length, 1);
});

test('rotation sub-steps start with the 3D intro, then priorities, top two, selection, and optional constraints', () => {
  assert.deepEqual(HOWTO_STEPS.field, FIELD_HOWTO_STEPS);
  assert.deepEqual(HOWTO_STEPS.rotations, ROTATION_HOWTO_STEPS);
  assert.deepEqual(ROTATION_HOWTO_STEPS.map(step => step.id), [
    'rotation-intro', 'rotation-priorities', 'rotation-compare', 'rotation-choose', 'rotation-constraints',
  ]);
  for (const step of ROTATION_HOWTO_STEPS) {
    for (const lang of ['en', 'bn']) {
      assert.ok(step.title[lang]?.trim());
      assert.ok(step.why[lang]?.trim());
      assert.ok(step.how[lang]?.trim());
      assert.ok(countWords(step.why[lang]) <= 10, `${step.id} why.${lang} ≤10 words`);
      assert.ok(countWords(step.how[lang]) <= 14, `${step.id} how.${lang} ≤14 words`);
    }
    assert.equal(step.clip, `/assets/howto/${step.id}.webp`);
    assert.equal(step.poster, `/assets/howto/${step.id}.jpg`);
    assert.ok(step.micro.length);
    for (const micro of step.micro) {
      assert.ok(micro.target && micro.text.en && micro.text.bn);
      assert.ok(['click', 'change', 'none'].includes(micro.action));
    }
  }
  assert.equal(REGISTRY_STEPS.rotations, ROTATION_HOWTO_STEPS);
  const intro = ROTATION_HOWTO_STEPS[0];
  assert.equal(intro.title.en, 'Meet your field in 3D');
  assert.equal(intro.why.en, 'See your field, soil and seasons before choosing');
  assert.equal(intro.how.en, 'Look, then tap Next');
  assert.deepEqual(intro.micro.map(step => step.target), [
    '.studio-stage-canvas-host', '.studio-calendar-bar', '.studio-view-toggle',
    '.studio-soil-pin', '.studio-feature-chips', '[data-studio-layers]',
  ]);
  assert.equal(intro.micro[3].targetAll, true, 'spotlight includes all three soil labels');
  assert.deepEqual(intro.micro.map(step => step.text.en), [
    'Your field, built from NASA elevation data',
    'Play the year — crops grow month by month',
    'Switch between 3D view, soil slice, and top view',
    'Tap a layer to see soil and NASA moisture',
    'Your bunds, drains and paths with real sizes',
    'Switch to NASA water, greenness, elevation',
  ]);
  assert.ok(intro.micro.every(step => step.action === 'none'));
  assert.deepEqual(ROTATION_HOWTO_STEPS[1].micro.map(step => step.target), [
    '#weight-water', '#weight-soil', '#weight-income', '#weight-stability',
  ]);
  assert.ok(ROTATION_HOWTO_STEPS[1].micro.every(step => step.action === 'none'));
  assert.equal(ROTATION_HOWTO_STEPS[2].micro.length, 10);
  assert.equal(ROTATION_HOWTO_STEPS[3].micro[0].action, 'click');
  assert.equal(ROTATION_HOWTO_STEPS[4].optional, true);
  assert.ok(ROTATION_HOWTO_STEPS[4].micro.slice(1).every(step => step.inDialog));
  assert.ok(ROTATION_HOWTO_STEPS[4].micro.some(step => step.target === '#in-irrigation' && step.action === 'change'));
  assert.ok(ROTATION_HOWTO_STEPS[4].micro.some(step => step.target === '#in-budget' && step.action === 'change'));
});

test('planting and My plans guidance uses bilingual, bounded copy and real selectors', () => {
  for (const page of ['planner', 'plans', 'plan']) {
    assert.ok(REGISTRY_STEPS[page]?.length, `${page} has guidance`);
    for (const step of REGISTRY_STEPS[page]) {
      assert.ok(countWords(step.why.en) <= 10 && countWords(step.why.bn) <= 10, `${step.id} why is short`);
      assert.ok(countWords(step.how.en) <= 14 && countWords(step.how.bn) <= 14, `${step.id} how is short`);
      assert.ok(step.micro.length && step.micro.every(m => m.target && m.text.en && m.text.bn));
      assert.ok(step.clip.endsWith(`${step.id}.webp`) && step.poster.endsWith(`${step.id}.jpg`));
    }
  }
  assert.deepEqual(REGISTRY_STEPS.planner.map(step => step.id), [
    'planting-open-season', 'planting-adjust-spacing', 'planting-save-next', 'planting-finish',
  ]);
  assert.deepEqual(REGISTRY_STEPS.plans.map(step => step.id), ['plan-open', 'plan-calendar', 'plan-task', 'plan-download']);
  assert.ok(REGISTRY_STEPS.planner[1].micro.filter(m => /plan-(usable|row|spacing)-range/.test(m.target)).every(m => m.action === 'none'));
});

test('done-events: constraints ticks only on save, never on open', () => {
  const fresh = () => ({});
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'map-interact'), { 'field-map': true });
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'area-opened'), { 'field-area': true });
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'area-saved'), { 'field-area': true });
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'area-confirmed'), { 'field-area': true });
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'constraints-opened'), {}, 'opening the dialog ticks nothing');
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'constraints-saved'), { 'field-constraints': true });
  assert.deepEqual(applyFieldDoneEvent(fresh(), 'field-used'), { 'field-use': true });
  // Events accumulate and never untick.
  const done = applyFieldDoneEvent(applyFieldDoneEvent(fresh(), 'constraints-opened'), 'map-interact');
  assert.deepEqual(done, { 'field-map': true });
});

test('one-open-at-a-time: current defaults to first not done', () => {
  const ids = ['field-map', 'field-area', 'field-constraints', 'field-use'];
  assert.equal(resolveOpenId(ids, {}, null), 'field-map');
  assert.equal(resolveOpenId(ids, { 'field-map': true }, null), 'field-area');
  assert.equal(resolveOpenId(ids, { 'field-map': true, 'field-area': true }, null), 'field-constraints');
  assert.equal(resolveOpenId(ids, {}, 'field-use'), 'field-use', 'explicit choice wins');
  assert.equal(resolveOpenId(ids, {}, '__closed'), null, 'user can collapse all');
  assert.equal(resolveOpenId(ids, {}, 'nope'), 'field-map', 'unknown id falls back');
});

test('reduced-motion path renders poster still only, never the animated clip', () => {
  const step = FIELD_HOWTO_STEPS[0];
  const playing = clipMarkup(step, { playing: true, reducedMotion: false });
  assert.match(playing, /\.webp/, 'playing shows the animated webp');
  const still = clipMarkup(step, { playing: true, reducedMotion: true });
  assert.match(still, /\.jpg/, 'reduced motion shows the poster');
  assert.doesNotMatch(still, /\.webp/, 'reduced motion never loads the animation');
  assert.match(still, /coach-clip-arrow/, 'poster carries an arrow overlay');
  const idle = clipMarkup(step, { playing: false, reducedMotion: false });
  assert.match(idle, /\.jpg/, 'poster first');
  assert.doesNotMatch(idle, /\.webp/, 'clip loads lazily only on tap');
});

test('generated clips + posters exist within size limits', () => {
  for (const step of [...FIELD_HOWTO_STEPS, ...ROTATION_HOWTO_STEPS, ...REGISTRY_STEPS.planner, ...REGISTRY_STEPS.plans]) {
    for (const [file, limit] of [[step.clip, 250 * 1024], [step.poster, 30 * 1024]]) {
      const path = join(ROOT, 'public', file);
      assert.ok(existsSync(path), `${file} generated`);
      const size = statSync(path).size;
      assert.ok(size > 0 && size <= limit, `${file} ${(size / 1024).toFixed(1)}KB ≤ ${limit / 1024}KB`);
    }
  }
});

test('service worker precache excludes lazy howto clips', () => {
  const script = readFileSync(join(ROOT, 'scripts/prepare-offline.py'), 'utf8');
  assert.match(script, /howto/, 'prepare-offline excludes public/assets/howto');
});
