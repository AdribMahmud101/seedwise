import test from 'node:test';
import assert from 'node:assert/strict';
import { placeBubble, guideState, advanceGuide, guideMotion } from '../src/legacy/planty-guide-helpers.js';

const rect = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height, width, height });

test('placement flips beside desktop targets and clamps both viewport sizes', () => {
  const bubble = { width: 336, height: 190 };
  const desktop = { width: 1366, height: 768 };
  assert.equal(placeBubble(rect(120, 200, 100, 44), bubble, desktop).side, 'right');
  assert.equal(placeBubble(rect(1180, 200, 100, 44), bubble, desktop).side, 'left');
  assert.equal(placeBubble(rect(20, 100, 1300, 44), bubble, desktop).side, 'bottom');
  assert.equal(placeBubble(rect(20, 680, 1300, 44), bubble, desktop).side, 'top');
  for (const viewport of [desktop, { width: 412, height: 915 }]) {
    for (const target of [rect(-20, -10, 40, 40), rect(viewport.width - 50, viewport.height - 60, 44, 44), rect(10, 200, viewport.width - 20, 100)]) {
      const placed = placeBubble(target, bubble, viewport);
      assert.ok(placed.left >= 12 && placed.top >= 12);
      assert.ok(placed.left + placed.width <= viewport.width - 12);
      assert.ok(placed.top + placed.height <= viewport.height - 12);
    }
  }
});

test('phone bubble sits at bottom but lifts above a fixed launcher', () => {
  const viewport = { width: 412, height: 915 }, bubble = { width: 388, height: 190 };
  const normal = placeBubble(rect(30, 180, 350, 100), bubble, viewport);
  assert.equal(normal.top, 713);
  const launcher = rect(240, 841, 150, 56);
  const lifted = placeBubble(launcher, bubble, viewport);
  assert.ok(lifted.top + lifted.height < launcher.top);
  const huge = placeBubble(launcher, { width: 1000, height: 2000 }, viewport);
  assert.equal(huge.width, 388);
  assert.equal(huge.height, 891);
});

test('sequence handles next/back, real action waits, missing targets and Skip', () => {
  const actions = ['none', 'click', 'input', 'none'];
  let state = guideState(actions.length);
  assert.equal(advanceGuide(state, 'back', actions).index, 0);
  state = advanceGuide(state, 'next', actions);
  assert.equal(state.index, 1);
  assert.equal(state.waiting, true);
  assert.equal(advanceGuide(state, 'next', actions), state);
  state = advanceGuide(state, 'action', actions);
  assert.equal(state.index, 2);
  assert.equal(state.waiting, true);
  state = advanceGuide(state, 'back', actions);
  assert.equal(state.index, 1);
  assert.equal(state.waiting, true);
  state = advanceGuide(state, 'missing', actions);
  assert.equal(state.index, 2);
  state = advanceGuide(state, 'action', actions);
  assert.equal(state.waiting, false);
  assert.equal(advanceGuide(state, 'action', actions), state);
  assert.equal(advanceGuide(state, 'skip', actions).done, true);
  state = advanceGuide(state, 'next', actions);
  assert.equal(state.done, true);
  assert.equal(advanceGuide(state, 'back', actions), state);
  assert.equal(guideState(0).done, true);
  assert.equal(guideState(1, 'input').waiting, true);
});

test('reduced motion uses instant scrolling and disables animation', () => {
  assert.deepEqual(guideMotion(true), { behavior: 'instant', animate: false });
  assert.deepEqual(guideMotion(false), { behavior: 'smooth', animate: true });
});
