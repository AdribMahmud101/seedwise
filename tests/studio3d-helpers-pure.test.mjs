import test from "node:test";
import assert from "node:assert/strict";
import {
  computePonding,
  sampleTransectProfile,
  lookupProbePoint,
} from "../src/legacy/studio3d-helpers.js";

test("computePonding calculates ponding depth from low-ground and rainfall scenario", () => {
  // Dry spell (rainMm = 0) -> 0 cm
  const dry = computePonding({ elev: 30, elevMin: 29, elevMax: 32, rainMm: 0 });
  assert.equal(dry.pondCm, 0);
  assert.equal(dry.isPonded, false);
  assert.equal(dry.truth, "SCENARIO");

  // Heavy rain (rainMm = 120), lowest elevation (elev = elevMin) -> maximum ponding
  const heavyLow = computePonding({ elev: 29, elevMin: 29, elevMax: 32, rainMm: 120 });
  assert.ok(heavyLow.pondCm > 0);
  assert.equal(heavyLow.isPonded, true);

  // Highest point (elev = elevMax) -> 0 cm ponding even in heavy rain
  const heavyHigh = computePonding({ elev: 32, elevMin: 29, elevMax: 32, rainMm: 120 });
  assert.equal(heavyHigh.pondCm, 0);

  // Proposed drain lowers ponding vs blocked outlet
  const drained = computePonding({ elev: 29, elevMin: 29, elevMax: 32, rainMm: 120, proposedDrain: true, outletBlocked: false });
  const blocked = computePonding({ elev: 29, elevMin: 29, elevMax: 32, rainMm: 120, proposedDrain: true, outletBlocked: true });
  assert.ok(drained.pondCm < blocked.pondCm);

  // When Sentinel-1 water mask is provided (from STUDIO5D data)
  const radarWater = computePonding({ elev: 30, rainMm: 40, s1WaterMask: 1 });
  assert.equal(radarWater.truth, "REMOTE_OBSERVED");
  assert.ok(radarWater.pondCm >= 15);
});

test("sampleTransectProfile samples elevation across field transect A -> A'", () => {
  const profile = sampleTransectProfile({
    u0: 0.1,
    v0: 0.2,
    u1: 0.9,
    v1: 0.8,
    steps: 10,
    sampleElevationFn: (u, v) => 30 + u * 2 - v * 1,
    elevMean: 30,
    rainMm: 45,
  });

  assert.equal(profile.pts.length, 11);
  assert.ok(profile.minE <= profile.maxE);
  assert.ok(profile.reliefM >= 0);
  assert.ok(profile.lineD.startsWith("M "));
  assert.ok(profile.areaD.startsWith("M "));
  assert.ok(typeof profile.X(0) === "number");
  assert.ok(typeof profile.Y(30) === "number");
});

test("lookupProbePoint retrieves accurate probe data and labels for tapped cell", () => {
  const field = {
    centroid: [25.54, 89.27],
    bboxLatLon: [89.26, 25.53, 89.28, 25.55],
    elevMin: 29.5,
    elevMax: 32.5,
  };

  const probe = lookupProbePoint({
    u: 0.6,
    v: 0.4,
    field,
    sampleElevationFn: (u, v) => 30.5,
    ndviObservation: { ndvi: 0.72 },
    moistureObservation: { ndmi: 0.35 },
    groundClass: { class: "low" },
    rainMm: 60,
  });

  assert.ok(probe.lat >= 25.53 && probe.lat <= 25.55);
  assert.ok(probe.lon >= 89.26 && probe.lon <= 89.28);
  assert.equal(probe.elevationM, 30.5);
  assert.equal(probe.ndvi, 0.72);
  assert.equal(probe.ndmi, 0.35);
  assert.equal(probe.groundClass, "low");
  assert.equal(probe.pondTruth, "SCENARIO");
});
