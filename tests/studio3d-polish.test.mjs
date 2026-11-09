import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  nearestObservation,
  plantPositionsInPolygon,
  monthChipText,
  outlineBounds,
  distToPolygonEdge,
  fitCameraToBlock,
} from "../src/legacy/studio3d-helpers.js";
import { studio3dHtml } from "../src/legacy/studio3d.js";
import { state } from "../src/legacy/ui.js";

const fixture = JSON.parse(
  await readFile(new URL("fixtures/studio-data.json", import.meta.url), "utf8")
);

test("nearestObservation picks the observation closest to the 15th of the selected month", () => {
  const vegetation = fixture.vegetation; // Jan 28, Mar 9, Apr 25, Oct 18
  // Selecting November: nearest is 2024-10-18 (28 days), not 2024-04-25 (205 days).
  const near = nearestObservation(vegetation, 10);
  assert.equal(near.observation.date, "2024-10-18");
  assert.equal(near.index, 3);

  // Selecting January: nearest is 2024-01-28.
  const jan = nearestObservation(vegetation, 0);
  assert.equal(jan.observation.date, "2024-01-28");

  // Selecting April: 2024-04-25 wins over 2024-03-09.
  const apr = nearestObservation(vegetation, 3);
  assert.equal(apr.observation.date, "2024-04-25");
});

test("nearestObservation returns null for an empty list and skips undated entries", () => {
  assert.equal(nearestObservation([], 5), null);
  assert.equal(nearestObservation(null, 5), null);
  const mix = [{ date: "not-a-date", ndvi: 0.1 }, { date: "2024-07-01", ndvi: 0.2 }];
  assert.equal(nearestObservation(mix, 6).observation.date, "2024-07-01");
});

test("plantPositionsInPolygon keeps every instance strictly inside a convex test polygon", () => {
  // Diamond polygon with 20 m radius.
  const poly = [[0, -20], [20, 0], [0, 20], [-20, 0]];
  const positions = plantPositionsInPolygon(poly, 1);
  assert.ok(positions.length > 100, `Expected many positions, got ${positions.length}`);
  for (const [x, y] of positions) {
    // Point-in-poly with the inset guarantee: every point sits at least spacing/2 from the edge.
    assert.ok(distToPolygonEdge(x, y, poly) >= 0.5 - 1e-9,
      `position [${x}, ${y}] violates the inset`);
  }
});

test("plantPositionsInPolygon handles a non-convex field outline", () => {
  // Concave L-shape.
  const poly = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]];
  const positions = plantPositionsInPolygon(poly, 1);
  assert.ok(positions.length > 20);
  for (const [x, y] of positions) {
    // Must remain inside the L (not inside the missing notch at x>8, y>8).
    assert.ok(!(x > 8 && y > 8), `position [${x}, ${y}] leaked into the notch`);
  }
});

test("plantPositionsInPolygon returns [] for degenerate inputs", () => {
  assert.deepEqual(plantPositionsInPolygon([], 1), []);
  assert.deepEqual(plantPositionsInPolygon([[0, 0], [1, 0]], 1), []);
  assert.deepEqual(plantPositionsInPolygon([[0, 0], [1, 0], [0, 1]], 0), []);
});

test("plantPositionsInPolygon respects the cutaway eastern cap", () => {
  const poly = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
  const full = plantPositionsInPolygon(poly, 2);
  const cut = plantPositionsInPolygon(poly, 2, 0); // east half chopped
  assert.ok(cut.length < full.length);
  for (const [x] of cut) assert.ok(x <= 0 + 1e-9);
});

test("monthChipText renders 'Mon · Crop · stage' in English and Bengali", () => {
  const nov = fixture.months[10]; // Nov 2024, Aman harvest in the fixture rotation
  assert.equal(monthChipText(nov, "en"), "Nov · Aman Rice · harvest");
  assert.equal(monthChipText(nov, "bn"), "নভে · আমন ধান · ফসল কাটা");
});

test("monthChipText handles each growth stage with a readable word", () => {
  const stages = ["establish", "grow", "mature", "harvest", "fallow"];
  const en = stages.map((stage) => monthChipText({ month: "2024-05", cropName: "Boro", stage }, "en"));
  assert.deepEqual(en, [
    "May · Boro · establishing",
    "May · Boro · growing",
    "May · Boro · maturing",
    "May · Boro · harvest",
    "May · Boro · fallow",
  ]);
});

test("studio3dHtml uses the chip text format (no raw 2024-11)", () => {
  state.lang = "en";
  const html = studio3dHtml(fixture, 10); // November
  // The chip contains the formatted text — the raw "2024-11 · ..." form must be gone.
  assert.match(html, /Nov · Aman Rice · harvest/);
  assert.doesNotMatch(html, /2024-11 ·/);
  state.lang = "bn";
  const bn = studio3dHtml(fixture, 10);
  assert.match(bn, /নভে · আমন ধান · ফসল কাটা/);
  state.lang = "en";
});

test("studio3dHtml surfaces the nearest observation value in the panel, not the first list entry", () => {
  state.lang = "en";
  // The fixture contains a Jan 2024 NDVI of 0.524 and an Oct 2024 NDVI of 0.852.
  const html = studio3dHtml(fixture, 10); // November
  // The panel's primary value shows the nearest (Oct), not the first (Jan: 0.524 / 0.32 variant).
  assert.match(html, /studio-obs-value[^>]*>0\.85</);
  assert.match(html, /studio-obs-date[^>]*>2024-10-18</);
  // The old broken label "0.32" from the previous build must not appear anywhere.
  assert.doesNotMatch(html, />0\.32</);
});

test("studio3dHtml lists all ranked rotations when options are provided", () => {
  state.lang = "en";
  const options = [
    { id: "mustard", label: "Make the winter gap count", bn: "শীতের ফাঁকে সরিষা", score: 82, active: true },
    { id: "legume", label: "Bring a pulse into the cycle", bn: "ফসলচক্রে ডাল যোগ করুন", score: 74, active: false },
    { id: "potato", label: "Plan for a potato harvest", bn: "আলুর মৌসুম পরিকল্পনা", score: 61, active: false },
    { id: "baseline", label: "Keep the familiar rhythm", bn: "পরিচিত ফসলচক্র", score: 44, active: false },
  ];
  const html = studio3dHtml(fixture, 0, { rotations: options });
  for (const r of options) {
    assert.match(html, new RegExp(r.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  // Scores render once each with the /100 suffix.
  for (const r of options) assert.match(html, new RegExp(`${r.score}/100`));
  // Only one option is marked active.
  const activeMatches = html.match(/class="studio-rotation-option active"/g) || [];
  assert.equal(activeMatches.length, 1);
});

test("fitCameraToBlock positions a perspective camera above and off-axis, fitting the bounding sphere", () => {
  const outline = fixture.field.outlineM;
  const fit = fitCameraToBlock({ outlineM: outline, depthM: 5, fovDeg: 40, aspect: 1.6 });
  const b = outlineBounds(outline);
  assert.ok(fit.distance > fit.radius, "camera should sit outside the bounding sphere");
  // Target is the block centre with a half-depth offset in -Y.
  assert.ok(Math.abs(fit.target[0] - b.cx) < 1e-9);
  assert.ok(Math.abs(fit.target[1] - -2.5) < 1e-9);
  assert.ok(Math.abs(fit.target[2] - -b.cy) < 1e-9);
  // Elevation ≈ 35° means the camera is noticeably above the target.
  const dy = fit.position[1] - fit.target[1];
  assert.ok(dy > 0.4 * fit.distance && dy < 0.7 * fit.distance,
    `camera elevation ${dy}/${fit.distance} is outside expected range`);
});
