import test from "node:test";
import assert from "node:assert/strict";
import { touchGestureIntent, TOUCH_INTENT_THRESHOLD_PX } from "../src/legacy/studio3d.js";

// STUDIO5T · map-style gesture split: the first ~10 px of a one-finger drag
// decides whether the field rotates (horizontal) or the page scrolls
// (vertical). Never both.

test("gesture intent threshold is ~10 px", () => {
  assert.strictEqual(TOUCH_INTENT_THRESHOLD_PX, 10);
});

test("movement under the threshold stays undecided", () => {
  assert.strictEqual(touchGestureIntent(0, 0), "undecided");
  assert.strictEqual(touchGestureIntent(6, 6), "undecided");
  assert.strictEqual(touchGestureIntent(-9, 0), "undecided");
  assert.strictEqual(touchGestureIntent(0, 9.9), "undecided");
});

test("horizontal drag rotates, vertical drag scrolls", () => {
  assert.strictEqual(touchGestureIntent(30, 2), "rotate");
  assert.strictEqual(touchGestureIntent(-40, -5), "rotate");
  assert.strictEqual(touchGestureIntent(3, 30), "scroll");
  assert.strictEqual(touchGestureIntent(-4, -50), "scroll");
});

test("diagonal drag follows the dominant axis", () => {
  assert.strictEqual(touchGestureIntent(20, 12), "rotate");
  assert.strictEqual(touchGestureIntent(12, 20), "scroll");
  assert.strictEqual(touchGestureIntent(-15, 11), "rotate");
  assert.strictEqual(touchGestureIntent(11, -15), "scroll");
});

test("exact tie lets the page scroll", () => {
  assert.strictEqual(touchGestureIntent(10, 10), "scroll");
  assert.strictEqual(touchGestureIntent(-12, 12), "scroll");
});

test("threshold boundary: 10 px decides, just under does not", () => {
  assert.strictEqual(touchGestureIntent(10, 0), "rotate");
  assert.strictEqual(touchGestureIntent(0, 10), "scroll");
  assert.strictEqual(touchGestureIntent(9.99, 0), "undecided");
});

test("custom threshold is honoured", () => {
  assert.strictEqual(touchGestureIntent(6, 0, 5), "rotate");
  assert.strictEqual(touchGestureIntent(6, 0, 8), "undecided");
});
