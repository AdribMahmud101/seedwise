import test from "node:test";
import assert from "node:assert/strict";
import {
  idleSwayOffset,
  idleResumeGain,
  idleCameraSway,
  idleFloatOffset,
  IDLE_SWAY_PERIOD_S,
  IDLE_SWAY_AMPLITUDE_DEG,
  IDLE_DOLLY_AMPLITUDE,
  IDLE_RESUME_DELAY_S,
  IDLE_EASE_IN_S,
} from "../src/legacy/studio3d-helpers.js";
import {
  idleSwayOffset as plannerSwayOffset,
  idleCameraSway as plannerCameraSway,
  IDLE_SWAY_AMPLITUDE_DEG as PLANNER_SWAY_AMPLITUDE_DEG,
} from "../src/legacy/planner3d-helpers.js";

// STUDIO5P: slow horizontal yaw sway of the camera around the field centre.

test("studio idle sway is ±7° sinusoidal with a ~14 s period", () => {
  assert.equal(IDLE_SWAY_PERIOD_S, 14);
  assert.equal(IDLE_SWAY_AMPLITUDE_DEG, 7);

  const quarter = idleSwayOffset(IDLE_SWAY_PERIOD_S / 4); // peak
  assert.ok(Math.abs(quarter.yawDeg - 7) < 1e-9, `peak yaw ${quarter.yawDeg} should be +7°`);
  const trough = idleSwayOffset((3 * IDLE_SWAY_PERIOD_S) / 4);
  assert.ok(Math.abs(trough.yawDeg + 7) < 1e-9, `trough yaw ${trough.yawDeg} should be −7°`);
  assert.ok(Math.abs(idleSwayOffset(0).yawDeg) < 1e-9, "sway starts centred");
  assert.ok(Math.abs(idleSwayOffset(IDLE_SWAY_PERIOD_S / 2).yawDeg) < 1e-9, "half period crosses centre");

  // Periodicity: same phase one period later.
  for (const t of [0, 1.3, 5.9, 11.2]) {
    const a = idleSwayOffset(t);
    const b = idleSwayOffset(t + IDLE_SWAY_PERIOD_S);
    assert.ok(Math.abs(a.yawDeg - b.yawDeg) < 1e-9, `yaw repeats every 14 s (t=${t})`);
    assert.ok(Math.abs(a.dolly - b.dolly) < 1e-12, `dolly repeats every 14 s (t=${t})`);
  }

  // Radians track degrees.
  assert.ok(Math.abs(quarter.yawRad - (quarter.yawDeg * Math.PI) / 180) < 1e-12);
});

test("studio idle sway breathes distance by ±1 %", () => {
  assert.equal(IDLE_DOLLY_AMPLITUDE, 0.01);
  const peak = idleSwayOffset(IDLE_SWAY_PERIOD_S / 4);
  assert.ok(Math.abs(peak.dolly - 0.01) < 1e-12, `peak dolly ${peak.dolly} should be +1 %`);
  const trough = idleSwayOffset((3 * IDLE_SWAY_PERIOD_S) / 4);
  assert.ok(Math.abs(trough.dolly + 0.01) < 1e-12, `trough dolly ${trough.dolly} should be −1 %`);
  for (let t = 0; t <= IDLE_SWAY_PERIOD_S; t += 0.25) {
    assert.ok(Math.abs(idleSwayOffset(t).dolly) <= 0.01 + 1e-12, `dolly bounded at t=${t}`);
  }
});

test("residual vertical float is at most 25 % of today's bob", () => {
  for (const span of [10, 30, 100]) {
    let maxNew = 0;
    let maxOld = 0;
    for (let t = 0; t <= 14; t += 0.05) {
      maxNew = Math.max(maxNew, Math.abs(idleSwayOffset(t, { fieldSpanM: span }).dy));
      maxOld = Math.max(maxOld, Math.abs(idleFloatOffset(t, span, false, false).dy));
    }
    assert.ok(maxOld > 0, `old bob has amplitude (span ${span})`);
    assert.ok(
      maxNew <= 0.25 * maxOld + 1e-12,
      `new dy ${maxNew} exceeds 25 % of old ${maxOld} (span ${span})`,
    );
  }
});

test("planner idle sway matches studio shape at ±5°", () => {
  assert.equal(PLANNER_SWAY_AMPLITUDE_DEG, 5);
  const peak = plannerSwayOffset(IDLE_SWAY_PERIOD_S / 4);
  assert.ok(Math.abs(peak.yawDeg - 5) < 1e-9, `planner peak yaw ${peak.yawDeg} should be +5°`);
  const trough = plannerSwayOffset((3 * IDLE_SWAY_PERIOD_S) / 4);
  assert.ok(Math.abs(trough.yawDeg + 5) < 1e-9, `planner trough yaw ${trough.yawDeg} should be −5°`);
  assert.ok(Math.abs(peak.dolly - 0.01) < 1e-12, "planner keeps the ±1 % dolly breathing");
});

test("resume gain holds 0 for 6 s then eases 0→1 over 1.5 s", () => {
  assert.equal(IDLE_RESUME_DELAY_S, 6);
  assert.equal(IDLE_EASE_IN_S, 1.5);

  assert.equal(idleResumeGain(0), 0);
  assert.equal(idleResumeGain(5.999), 0);
  assert.equal(idleResumeGain(6), 0);
  assert.equal(idleResumeGain(7.5), 1);
  assert.equal(idleResumeGain(60), 1);
  // Smooth ease midpoint, monotonic ramp, gentle ends.
  assert.ok(Math.abs(idleResumeGain(6.75) - 0.5) < 1e-9, "mid-ramp gain is 0.5");
  let prev = 0;
  for (let t = 6; t <= 7.5; t += 0.1) {
    const g = idleResumeGain(t);
    assert.ok(g >= prev - 1e-12, `gain monotonic at t=${t}`);
    prev = g;
  }
  assert.ok(idleResumeGain(6.1) < 0.1, "ramp starts gently");
  assert.ok(idleResumeGain(7.4) > 0.9, "ramp ends gently");
  // Degenerate inputs stay parked.
  assert.equal(idleResumeGain(NaN), 0);
  assert.equal(idleResumeGain(-2), 0);
});

test("combined sway scales with gain and parks on drag, reduced motion, or hidden tab", () => {
  const t = 3.5; // sway peak
  const full = idleCameraSway(t, 60);
  assert.equal(full.gain, 1);
  assert.ok(Math.abs(full.yawDeg - 7) < 1e-9);
  assert.ok(Math.abs(full.dolly - 0.01) < 1e-12);

  const mid = idleCameraSway(t, 6.75);
  assert.ok(Math.abs(mid.gain - 0.5) < 1e-9);
  assert.ok(Math.abs(mid.yawDeg - 3.5) < 1e-9, "paused motion eases back in proportionally");

  for (const opts of [
    { isDragging: true },
    { prefersReducedMotion: true },
    { hidden: true },
  ]) {
    assert.deepEqual(
      idleCameraSway(t, 60, opts),
      { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0, gain: 0 },
      `sway parks for ${JSON.stringify(opts)}`,
    );
  }
  assert.deepEqual(idleCameraSway(t, 2), { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0, gain: 0 });

  // Planner combined helper parks the same way.
  assert.deepEqual(plannerCameraSway(t, 60, { prefersReducedMotion: true }),
    { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0, gain: 0 });
  assert.ok(Math.abs(plannerCameraSway(t, 60).yawDeg - 5) < 1e-9);

  // Degenerate clock input stays safe.
  assert.deepEqual(idleSwayOffset(NaN), { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0 });
  assert.deepEqual(idleCameraSway(NaN, 60), { yawDeg: 0, yawRad: 0, dolly: 0, dy: 0, gain: 1 });
});
