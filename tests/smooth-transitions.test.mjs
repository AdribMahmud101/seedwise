import test from "node:test";
import assert from "node:assert/strict";
import {
  easeInOutCubic,
  tweenValue,
  interpolateDonutArcs,
  createTween,
  surfaceLegend,
} from "../src/legacy/studio3d-helpers.js";
import { surfaceLegendHtml } from "../src/legacy/studio3d.js";

// SMOOTH: a manually-driven clock/scheduler so the tween runner is testable
// without rAF or timers.
function manualClock() {
  let nowMs = 0;
  let scheduled = [];
  return {
    now: () => nowMs,
    schedule: (cb) => {
      scheduled.push(cb);
      return scheduled.length;
    },
    cancelFrame: (id) => {
      scheduled[id - 1] = null;
    },
    step: (ms) => {
      nowMs += ms;
      const pending = scheduled;
      scheduled = [];
      for (const cb of pending) if (cb) cb();
    },
    get pending() {
      return scheduled.filter(Boolean).length;
    },
  };
}

const approx = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test("SMOOTH: easeInOutCubic eases 0->1 with midpoint 0.5 and clamps", () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(approx(easeInOutCubic(0.5), 0.5));
  assert.equal(easeInOutCubic(-2), 0);
  assert.equal(easeInOutCubic(2), 1);
  assert.equal(easeInOutCubic(NaN), 0);
  // Slow start and end: below linear early, above linear late, symmetric.
  assert.ok(easeInOutCubic(0.25) < 0.25);
  assert.ok(easeInOutCubic(0.75) > 0.75);
  assert.ok(approx(easeInOutCubic(0.25), 1 - easeInOutCubic(0.75)));
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = easeInOutCubic(i / 20);
    assert.ok(v >= prev);
    prev = v;
  }
});

test("SMOOTH: tweenValue maps progress to value with easing", () => {
  assert.equal(tweenValue(10, 20, 0), 10);
  assert.equal(tweenValue(10, 20, 1), 20);
  assert.equal(tweenValue(10, 20, 0.5, (x) => x), 15);
  assert.ok(approx(tweenValue(0, 100, 0.5), 50)); // default ease is symmetric
  assert.ok(tweenValue(0, 100, 0.25) < 25); // eased below linear early
  assert.equal(tweenValue(5, 5, 0.7), 5);
  assert.equal(tweenValue(0, 10, 2, (x) => x), 10); // clamped progress
  assert.equal(tweenValue(0, 10, -1, (x) => x), 0);
});

test("SMOOTH: donut arc interpolation hits both endpoints", () => {
  const from = [
    { pct: 60, color: "#a1a1a1" },
    { pct: 40, color: "#b2b2b2" },
  ];
  const to = [
    { pct: 25, color: "#c3c3c3" },
    { pct: 25, color: "#d4d4d4" },
    { pct: 50, color: "#e5e5e5" },
  ];
  const start = interpolateDonutArcs(from, to, 0);
  assert.equal(start.length, 3);
  assert.ok(approx(start[0].pct, 60));
  assert.equal(start[0].offset, 0);
  assert.ok(approx(start[1].pct, 40));
  assert.ok(approx(start[1].offset, 60));
  assert.ok(approx(start[2].pct, 0));
  const end = interpolateDonutArcs(from, to, 1);
  assert.ok(approx(end[0].pct, 25));
  assert.equal(end[0].offset, 0);
  assert.ok(approx(end[1].pct, 25));
  assert.ok(approx(end[1].offset, 25));
  assert.ok(approx(end[2].pct, 50));
  assert.ok(approx(end[2].offset, 50));
  assert.equal(end[0].color, "#c3c3c3");
});

test("SMOOTH: donut arc interpolation sums to 100 % at every step", () => {
  const pairs = [
    [
      [{ pct: 100, color: "#111111" }],
      [
        { pct: 30, color: "#222222" },
        { pct: 70, color: "#333333" },
      ],
    ],
    [
      [
        { pct: 33.3, color: "#444444" },
        { pct: 33.3, color: "#555555" },
        { pct: 33.4, color: "#666666" },
      ],
      [
        { pct: 10, color: "#777777" },
        { pct: 20, color: "#888888" },
        { pct: 30, color: "#999999" },
        { pct: 40, color: "#aaaaaa" },
      ],
    ],
  ];
  for (const [from, to] of pairs) {
    for (let i = 0; i <= 10; i++) {
      const frames = interpolateDonutArcs(from, to, i / 10);
      const sum = frames.reduce((s, f) => s + f.pct, 0);
      assert.ok(approx(sum, 100, 1e-6), `progress ${i / 10} sums to ${sum}`);
      // Offsets stay cumulative so arcs tile the ring without gaps.
      for (let k = 1; k < frames.length; k++) {
        assert.ok(approx(frames[k].offset, frames[k - 1].offset + frames[k - 1].pct, 1e-9));
      }
    }
  }
});

test("SMOOTH: donut interpolation bridges two real legends without losing share", () => {
  const cells = (values) => values.map((value) => ({ value, area: 1 }));
  const a = surfaceLegend("ndvi", { cells: cells([0.1, 0.3, 0.5, 0.7, 0.8]), observation: { date: "2024-03-09" } });
  const b = surfaceLegend("water", { cells: cells([0, 0, 3, 10, 40]), rainMm: 45 });
  const rows = (legend) => legend.classes.filter((c) => !c.unknown || c.pct > 0).filter((c) => c.pct > 0);
  const from = rows(a);
  const to = rows(b);
  assert.ok(from.length > 0 && to.length > 0);
  for (const p of [0, 0.2, 0.5, 0.8, 1]) {
    const sum = interpolateDonutArcs(from, to, p).reduce((s, f) => s + f.pct, 0);
    assert.ok(approx(sum, 100, 1e-6), `progress ${p} sums to ${sum}`);
  }
});

test("SMOOTH: tween runner completes with eased progress then fires onDone once", () => {
  const clock = manualClock();
  const seen = [];
  let done = 0;
  const tween = createTween({
    duration: 450,
    onUpdate: (eased, raw) => seen.push([eased, raw]),
    onDone: () => {
      done += 1;
    },
    now: clock.now,
    schedule: clock.schedule,
    cancelFrame: clock.cancelFrame,
  });
  assert.equal(tween.running, false);
  tween.start();
  assert.equal(tween.running, true);
  clock.step(112.5); // raw 0.25 -> eased below linear
  assert.equal(seen.length, 1);
  assert.ok(approx(seen[0][1], 0.25));
  assert.ok(seen[0][0] < 0.25);
  clock.step(112.5);
  clock.step(112.5);
  clock.step(112.5); // raw 1 -> done
  assert.equal(done, 1);
  assert.equal(tween.running, false);
  assert.ok(approx(seen.at(-1)[0], 1));
  assert.ok(approx(seen.at(-1)[1], 1));
  assert.equal(clock.pending, 0);
  clock.step(500); // settled tweens schedule nothing further
  assert.equal(done, 1);
  assert.equal(seen.length, 4);
});

test("SMOOTH: tween cancel stops updates and skips onDone", () => {
  const clock = manualClock();
  const seen = [];
  let done = 0;
  const tween = createTween({
    duration: 450,
    onUpdate: (eased, raw) => seen.push(raw),
    onDone: () => {
      done += 1;
    },
    now: clock.now,
    schedule: clock.schedule,
    cancelFrame: clock.cancelFrame,
  });
  tween.start();
  clock.step(100);
  assert.equal(seen.length, 1);
  tween.cancel();
  assert.equal(tween.running, false);
  clock.step(1000);
  assert.equal(seen.length, 1);
  assert.equal(done, 0);
  assert.equal(clock.pending, 0);
});

test("SMOOTH: tween restart begins from zero and never double-fires onDone", () => {
  const clock = manualClock();
  const seen = [];
  let done = 0;
  const tween = createTween({
    duration: 400,
    onUpdate: (eased, raw) => seen.push(raw),
    onDone: () => {
      done += 1;
    },
    now: clock.now,
    schedule: clock.schedule,
    cancelFrame: clock.cancelFrame,
  });
  tween.start();
  clock.step(300); // raw 0.75
  assert.ok(approx(seen.at(-1), 0.75));
  tween.restart(); // rapid re-trigger: the old run is dropped
  assert.equal(tween.running, true);
  clock.step(100); // raw restarts near 0.25, not 1.0
  assert.ok(approx(seen.at(-1), 0.25));
  assert.equal(done, 0);
  tween.start(); // start() while running also restarts cleanly
  clock.step(400);
  assert.equal(done, 1);
  clock.step(400);
  assert.equal(done, 1);
  assert.equal(clock.pending, 0);
});

test("SMOOTH: legend markup exposes arc and percentage hooks for the animator", () => {
  const legend = surfaceLegend("ndvi", {
    cells: [0.1, 0.3, 0.5, 0.7, 0.8].map((value) => ({ value, area: 1 })),
    observation: { date: "2024-03-09" },
  });
  const html = surfaceLegendHtml(legend);
  const arcs = html.match(/data-arc="\d+"/g) || [];
  const pcts = html.match(/data-pct="/g) || [];
  assert.ok(arcs.length > 0);
  assert.equal(arcs.length, new Set(arcs).size);
  assert.ok(pcts.length >= arcs.length);
});
