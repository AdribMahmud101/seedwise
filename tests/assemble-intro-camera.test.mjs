import test from "node:test";
import assert from "node:assert/strict";
import {
  ASSEMBLY_STAGGER_ORDER,
  ASSEMBLY_TOTAL_DURATION_S,
  ASSEMBLY_STAGES,
  assemblyProgress,
  circuitSettle,
  sampleRowCropScale,
  introCameraParams,
  shouldSkipIntro,
  IDLE_SWAY_PERIOD_S,
  IDLE_SWAY_AMPLITUDE_DEG,
  IDLE_DOLLY_AMPLITUDE,
  outlineBounds,
  fitCameraToBlock,
  projectFramingBox,
} from "../src/legacy/studio3d-helpers.js";
import { readFile } from "node:fs/promises";

test("circuit assembly intro: stagger order is correct and bottom-up", () => {
  assert.deepEqual(ASSEMBLY_STAGGER_ORDER, [
    "slab",
    "rootzone",
    "topsoil",
    "surface",
    "crops",
    "trees",
    "markers",
    "leaders",
  ]);

  // Verify starts are non-decreasing
  for (let i = 1; i < ASSEMBLY_STAGGER_ORDER.length; i++) {
    const prev = ASSEMBLY_STAGES[ASSEMBLY_STAGGER_ORDER[i - 1]];
    const curr = ASSEMBLY_STAGES[ASSEMBLY_STAGGER_ORDER[i]];
    assert.ok(curr.start >= prev.start, `${ASSEMBLY_STAGGER_ORDER[i]} starts at or after ${ASSEMBLY_STAGGER_ORDER[i - 1]}`);
  }
});

test("circuit assembly intro: total duration is in ~1.8–2.4 s range", () => {
  assert.ok(ASSEMBLY_TOTAL_DURATION_S >= 1.8 && ASSEMBLY_TOTAL_DURATION_S <= 2.4, "total duration ~1.8-2.4s");
  const lastStage = ASSEMBLY_STAGES[ASSEMBLY_STAGGER_ORDER.at(-1)];
  assert.ok(lastStage.end <= ASSEMBLY_TOTAL_DURATION_S, "last stage finishes within total duration");
});

test("circuit assembly intro: assemblyProgress is clamped between 0 and 1", () => {
  assert.equal(assemblyProgress(-1, "slab"), 0);
  assert.equal(assemblyProgress(0, "slab"), 0);
  assert.equal(assemblyProgress(10, "slab"), 1);
  assert.equal(assemblyProgress(NaN, "slab"), 0);

  // Monotonic ramp
  const stage = "slab";
  let prev = 0;
  for (let t = ASSEMBLY_STAGES[stage].start; t <= ASSEMBLY_STAGES[stage].end; t += 0.05) {
    const p = assemblyProgress(t, stage);
    assert.ok(p >= prev && p <= 1, `progress monotonic: ${p} >= ${prev}`);
    prev = p;
  }
});

test("circuit assembly intro: circuitSettle has soft settle with no bounce > 2%", () => {
  assert.equal(circuitSettle(0), 0);
  assert.equal(circuitSettle(1), 1);
  assert.equal(circuitSettle(-0.5), 0);
  assert.equal(circuitSettle(1.5), 1);

  let maxVal = 0;
  for (let i = 0; i <= 1000; i++) {
    const v = circuitSettle(i / 1000);
    if (v > maxVal) maxVal = v;
  }
  const bouncePercent = (maxVal - 1) * 100;
  assert.ok(bouncePercent <= 2.0, `soft settle bounce ${bouncePercent.toFixed(2)}% must not exceed 2%`);
  assert.ok(maxVal >= 1.0, "settle reaches or slightly overshoots 1.0 for soft feel");
});

test("circuit assembly intro: row-wise crop stagger scales smoothly", () => {
  const t = 1.0;
  const front = sampleRowCropScale(t, 0.0, 0.6, 1.45);
  const back = sampleRowCropScale(t, 1.0, 0.6, 1.45);
  assert.ok(front > back, "front row grows before back row");
  assert.equal(sampleRowCropScale(0.5, 0.5, 0.6, 1.45), 0);
  assert.equal(sampleRowCropScale(2.0, 0.5, 0.6, 1.45), 1);
});

test("circuit assembly intro: shouldSkipIntro honors prefersReducedMotion and isHidden", () => {
  assert.equal(shouldSkipIntro({ prefersReducedMotion: true }), true);
  assert.equal(shouldSkipIntro({ isHidden: true }), true);
  assert.equal(shouldSkipIntro({ hasPlayed: true }), true);
  assert.equal(shouldSkipIntro({ prefersReducedMotion: false, isHidden: false, hasPlayed: false }), false);
});

test("subtle idle motion: sway parameters reduced to ~1/3 with period in 14–20s", () => {
  assert.ok(IDLE_SWAY_AMPLITUDE_DEG >= 1.5 && IDLE_SWAY_AMPLITUDE_DEG <= 2.5, "yaw amplitude in 1.5–2.5°");
  assert.ok(IDLE_SWAY_PERIOD_S >= 14 && IDLE_SWAY_PERIOD_S <= 20, "period in 14–20 s");
  assert.ok(IDLE_DOLLY_AMPLITUDE < 0.005, "tiny dolly drift");
});

test("base camera: block visible across target viewports with ~8–12% margin", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("fixtures/studio-data.json", import.meta.url), "utf8"),
  );
  const outlineM = fixture.field.outlineM;
  const b = outlineBounds(outlineM);
  const depthM = Math.max(1.5, Math.max(b.width, b.height) / 6);
  const el = (30 * Math.PI) / 180;
  const yaw = (28 * Math.PI) / 180;

  const viewports = [
    [1366, 768],
    [1884, 913],
    [1280, 720],
    [820, 1180],
    [412, 915],
  ];

  for (const [w, h] of viewports) {
    const aspect = w / h;
    const fit = fitCameraToBlock({
      outlineM,
      depthM,
      fovDeg: 38,
      aspect,
      elevationDeg: 30,
      yawDeg: 28,
      margin: 0.10,
    });
    const target = [fit.target[0], -depthM * 0.45, fit.target[2]];
    const position = [
      target[0] + Math.cos(el) * Math.sin(yaw) * fit.distance,
      target[1] + Math.sin(el) * fit.distance,
      target[2] + Math.cos(el) * Math.cos(yaw) * fit.distance,
    ];
    const corners = outlineM.flatMap(([x, y]) => [[x, 0.5, -y], [x, -depthM, -y]]);
    const box = projectFramingBox(corners, { position, target, fovDeg: 38, aspect });

    // Ensure completely within screen NDC [-1, 1] with margin
    assert.ok(box.minX > -1.0, `${w}x${h}: minX inside viewport`);
    assert.ok(box.maxX < 1.0, `${w}x${h}: maxX inside viewport`);
    assert.ok(box.minY > -1.0, `${w}x${h}: minY inside viewport`);
    assert.ok(box.maxY < 1.0, `${w}x${h}: maxY inside viewport`);

    const marginX = Math.min((box.minX + 1) / 2, (1 - box.maxX) / 2);
    const marginY = Math.min((box.minY + 1) / 2, (1 - box.maxY) / 2);
    assert.ok(marginX >= 0.05, `${w}x${h}: horizontal margin >= 5%`);
    assert.ok(marginY >= 0.08, `${w}x${h}: vertical margin >= 8%`);
  }
});
