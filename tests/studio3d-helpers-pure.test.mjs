import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { ShapeUtils, Vector2 } from "three";
import { buildClumpGeometry } from "../src/legacy/studio3d.js";
import { projectWgs84ToUtm45N } from "../src/legacy/spatial.js";
import {
  computePonding,
  sampleTransectProfile,
  lookupProbePoint,
  pointInPolygon, outlineBounds, clipRing, surfaceGridPositions, pondingPositions,
  sampleS1Water, transectEndpoints, waterTablePositions,
  usdaTextureClass, computeAutoExaggeration, buildCalloutData, deoverlapLabels,
  easeOutCubic, introCameraParams, shouldSkipIntro, sampleRowCropScale,
  nearestCropMonth, cropStageAt, monthChipText,
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

// Exercise the same triangulation, subdivision and Float32 coordinates used by the renderer.
function surfaceFor(ring, heightAt, subdivisions = 28) {
  const triangles = ShapeUtils.triangulateShape(ring.map(([x, y]) => new Vector2(x, y)), []);
  return new Float32Array(surfaceGridPositions(ring, triangles, heightAt, subdivisions));
}

const outlines = [
  [[-16, -8], [13, -12], [18, 10], [-10, 15]],
  [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]],
  [[0, 20], [8, 20], [8, 8], [20, 8], [20, 0], [0, 0]],
];
for (const [shape, outline] of outlines.entries()) {
  for (const cut of [0, 0.4, 0.8]) {
    for (const rainMm of [0, 45, 240]) {
      test(`water vertices stay inside polygon: shape ${shape}, cut ${cut}, rain ${rainMm} mm`, () => {
        const b = outlineBounds(outline);
        const cap = b.maxX - b.width * cut;
        const ring = cut ? clipRing(outline, cap) : outline;
        const terrain = surfaceFor(ring, (x, z) => (x - b.minX) * 0.03 + (z + b.maxY) * 0.01);
        const water = new Float32Array(pondingPositions(terrain, {
          rainMm, lowGround: true, waterMaskAt: (x) => x < b.cx ? 1 : 0,
        }));
        if (!rainMm) assert.equal(water.length, 0);
        else assert.ok(water.length > 0);
        const groundwater = new Float32Array(waterTablePositions(terrain, -1, -2, 0));
        assert.equal(groundwater.length, terrain.length);
        for (let i = 0; i < groundwater.length; i += 3) {
          assert.ok(pointInPolygon(groundwater[i], -groundwater[i + 2], ring));
          assert.equal(groundwater[i + 1], -1);
        }
        for (let i = 0; i < water.length; i += 3) {
          const [x, h, z] = water.slice(i, i + 3);
          assert.ok(pointInPolygon(x, -z, outline), `water outside original field: ${x}, ${-z}`);
          assert.ok(pointInPolygon(x, -z, ring), `water outside cutaway: ${x}, ${-z}`);
          assert.ok(x <= cap + 1e-5);
          const ground = (x - b.minX) * 0.03 + (z + b.maxY) * 0.01;
          assert.ok(Math.abs(h - ground - 0.02) < 1e-5, "water must sit just above terrain");
        }
      });
    }
  }
}

test("ponding fills only low cells; rain, radar, low ground and drainage affect coverage", () => {
  const ring = [[0, 0], [10, 0], [10, 10], [0, 10]];
  const terrain = surfaceFor(ring, (x) => x / 10);
  const area = (positions) => {
    let sum = 0;
    for (let i = 0; i < positions.length; i += 9) {
      sum += Math.abs((positions[i + 3] - positions[i]) * (positions[i + 8] - positions[i + 2])
        - (positions[i + 6] - positions[i]) * (positions[i + 5] - positions[i + 2])) / 2;
    }
    return sum;
  };
  const wet = (opts) => pondingPositions(terrain, { rainMm: 45, ...opts });
  assert.ok(Math.abs(area(wet({})) - 4.5) < 1e-5, "45 mm fills below 0.045 m");
  assert.ok(Math.abs(area(wet({ rainMm: 240 })) - 24) < 1e-5);
  assert.ok(area(wet({ lowGround: true })) > area(wet({})));
  assert.ok(area(wet({ waterMaskAt: () => 1 })) > area(wet({})));
  assert.ok(area(wet({ proposedDrain: true })) < area(wet({})));
  assert.ok(area(wet({ outletBlocked: true })) > area(wet({})));
  assert.deepEqual(wet({ rainMm: 0, waterMaskAt: () => 1 }), []);
  const exaggerated = surfaceFor(ring, (x) => x / 10 * 8);
  assert.ok(Math.abs(area(pondingPositions(exaggerated, { rainMm: 45, exaggeration: 8 })) - 4.5) < 1e-5);
  assert.deepEqual(pondingPositions([], { rainMm: 45 }), []);
});

test("radar water samples actual UTM cells and handles absent or out-of-range data", async () => {
  const pack = JSON.parse(await readFile(new URL("../public/data/s1-water.json", import.meta.url)));
  const fields = JSON.parse(await readFile(new URL("../public/data/earth-data.json", import.meta.url))).fields;
  for (const field of fields) {
    const site = pack[field.id];
    const coordinates = site.polygon.coordinates[0].slice(0, -1);
    const lon = coordinates.reduce((sum, p) => sum + p[0], 0) / coordinates.length;
    const lat = coordinates.reduce((sum, p) => sum + p[1], 0) / coordinates.length;
    const [x, y] = projectWgs84ToUtm45N(lon, lat);
    const [dx, , west, , dy, north] = site.transform;
    const row = Math.floor((y - north) / dy), col = Math.floor((x - west) / dx);
    for (const observation of site.dates) {
      assert.equal(sampleS1Water(site, observation, lon, lat), observation.water[row][col]);
    }
    assert.equal(sampleS1Water(site, site.dates[0], 0, 0), null);
    assert.equal(sampleS1Water(site, null, lon, lat), null);
  }
  assert.equal(sampleS1Water(null, null, 89, 25), null);
});

test("transect endpoints and intervening points stay in the visible outline", () => {
  for (const outline of outlines) {
    const b = outlineBounds(outline);
    for (const cut of [0, 0.4, 0.8]) {
      const ring = clipRing(outline, b.maxX - cut * b.width);
      const [a, end] = transectEndpoints(ring, b);
      assert.ok(a && end);
      for (let i = 0; i <= 36; i++) {
        const x = a[0] + (end[0] - a[0]) * i / 36;
        const y = a[1] + (end[1] - a[1]) * i / 36;
        assert.ok(pointInPolygon(x, y, ring));
      }
    }
  }
  assert.deepEqual(transectEndpoints([]), []);
});

test("groundwater table rejects levels outside the soil block", () => {
  const terrain = surfaceFor(outlines[0], () => 0);
  assert.deepEqual(waterTablePositions(terrain, 1, -2, 0), []);
  assert.deepEqual(waterTablePositions(terrain, -3, -2, 0), []);
});

test("crop clumps keep fine tapered leaves and scale with the active month's height", () => {
  for (const crop of ["aman", "boro", "mustard", "potato", "mungbean"]) {
    const small = buildClumpGeometry(crop, 0.2, 0.3);
    const grown = buildClumpGeometry(crop, 0.8, 0.3);
    small.computeBoundingBox();
    grown.computeBoundingBox();
    assert.ok(small.attributes.position.count >= 72, `${crop} needs multiple tapered leaves`);
    assert.ok(grown.boundingBox.max.y > small.boundingBox.max.y * 3.5, `${crop} must grow with month`);
    assert.ok(grown.boundingBox.max.x - grown.boundingBox.min.x < 0.3, `${crop} must remain a fine clump`);
    assert.ok(Math.abs(grown.boundingBox.min.y) < 0.01, "clumps must start at terrain");
    small.dispose(); grown.dispose();
  }
  const young = buildClumpGeometry("mustard", 0.8, 0.3, "grow");
  const flowering = buildClumpGeometry("mustard", 0.8, 0.3, "mature");
  assert.ok(flowering.attributes.position.count > young.attributes.position.count);
  young.dispose(); flowering.dispose();
});

test("usdaTextureClass accurately maps sand, silt, and clay percentages to USDA soil classes", () => {
  // Clay (c >= 40, not high silt/sand)
  assert.equal(usdaTextureClass(50, 20, 30), "clay");
  // Silty clay (c >= 40, si >= 40)
  assert.equal(usdaTextureClass(45, 10, 45), "silty clay");
  // Sandy clay (c >= 35, sa > 45)
  assert.equal(usdaTextureClass(40, 50, 10), "sandy clay");
  // Clay loam (27 <= c < 40, 20 < sa <= 45)
  assert.equal(usdaTextureClass(32, 35, 33), "clay loam");
  // Sandy clay loam (20 <= c < 35, si < 28, sa > 45)
  assert.equal(usdaTextureClass(25, 55, 20), "sandy clay loam");
  // Silt (si >= 80, c < 12)
  assert.equal(usdaTextureClass(8, 10, 82), "silt");
  // Silt loam (si >= 50, c < 27)
  assert.equal(usdaTextureClass(15, 20, 65), "silt loam");
  // Sandy loam ((c < 20 && sa > 52) || (c < 7 && si < 50))
  assert.equal(usdaTextureClass(10, 65, 25), "sandy loam");
  // Sand (si + 1.5 * c < 15)
  assert.equal(usdaTextureClass(4, 92, 4), "sand");
  // Loamy sand (si + 2 * c < 30)
  assert.equal(usdaTextureClass(8, 80, 12), "loamy sand");
  // Loam (c < 27, 28 <= si < 50, sa <= 52)
  assert.equal(usdaTextureClass(20, 40, 40), "loam");
});

test("computeAutoExaggeration targets ~0.25 * blockWidth / relief snapped to 0.25 within [1.0, 4.5]", () => {
  // Normal field: width 30 m, relief 2.5 m -> 0.25 * 30 / 2.5 = 3.0
  assert.equal(computeAutoExaggeration(2.5, 30), 3.0);
  // Very flat field: width 40 m, relief 0.5 m -> 0.25 * 40 / 0.5 = 20.0 -> clamped to 4.5
  assert.equal(computeAutoExaggeration(0.5, 40), 4.5);
  // Very steep relief: width 20 m, relief 10 m -> 0.25 * 20 / 10 = 0.5 -> clamped to 1.0
  assert.equal(computeAutoExaggeration(10, 20), 1.0);
  // Edge cases: non-positive or missing relief
  assert.equal(computeAutoExaggeration(0, 30), 1.0);
  assert.equal(computeAutoExaggeration(NaN, 30), 1.0);
  assert.equal(computeAutoExaggeration(2.5, 0), 1.0);
});

test("buildCalloutData separates estimated soil conditions from the planned crop", () => {
  const dummyData = {
    rotation: { label: "Rotation 01", bn: "ফসলচক্র 01" },
    months: [
      { month: "2024-01", cropName: "Mustard", cropNameBn: "সরিষা", rootDepthM: 0.6, wetness: 0.48 },
    ],
    soil: {
      layers: [
        { clayPct: 32, sandPct: 35, siltPct: 33, ph: 5.8, socGkg: 10.6 },
        { clayPct: 35, sandPct: 35, siltPct: 30, ph: 6.0, socGkg: 6.2 },
      ],
    },
  };

  const callouts = buildCalloutData({
    data: dummyData,
    monthIdx: 0,
    soilOverrides: null,
    t: (en, bn) => en,
  });

  assert.ok(callouts.topsoil);
  assert.equal(callouts.topsoil.eyebrow, "0–15 cm · TOPSOIL");
  assert.equal(callouts.topsoil.truth, "MODELED");
  assert.equal(callouts.topsoil.truthLabel, "Estimated · SoilGrids 250 m");
  assert.match(callouts.topsoil.value, /Clay Loam/);
  assert.match(callouts.topsoil.value, /pH 5.8/);
  assert.match(callouts.topsoil.value, /OM 1.83%/);

  assert.ok(callouts.rootzone);
  assert.equal(callouts.rootzone.eyebrow, "15–60 cm · ROOT ZONE");
  assert.equal(callouts.rootzone.value, "Root zone: moist (48 % of saturation)");
  assert.equal(callouts.rootzone.truth, "MODELED");
  assert.equal(callouts.rootzone.truthLabel, "Estimated · NASA POWER ~50 km, top ~1 m");
  assert.equal(callouts.rootzone.cropValue, "Planned: Mustard (Rotation 01) · roots ~0.6 m");
  assert.equal(callouts.rootzone.cropTruth, "SCENARIO");
  assert.equal(callouts.rootzone.cropTruthLabel, "Scenario");

  assert.ok(callouts.aquifer);
  assert.equal(callouts.aquifer.eyebrow, ">120 cm · SUBSOIL & WATER TABLE");
  assert.equal(callouts.aquifer.truth, "UNKNOWN");
  assert.equal(callouts.aquifer.isButton, true);
  assert.match(callouts.aquifer.value, /Well depth unknown/);

  // With farmer soil overrides
  const overrides = { ph: 6.5, omPct: 2.1, gwDepthM: 2.8 };
  const customCallouts = buildCalloutData({
    data: dummyData,
    monthIdx: 0,
    soilOverrides: overrides,
    t: (en, bn) => en,
  });

  assert.equal(customCallouts.topsoil.truth, "FARMER_REPORTED");
  assert.equal(customCallouts.topsoil.truthLabel, "Soil test, Measured");
  assert.equal(customCallouts.aquifer.truth, "FARMER_REPORTED");
  assert.equal(customCallouts.aquifer.isButton, false);
  assert.equal(customCallouts.aquifer.value, "2.8 m (Measured)");
});

test("buildCalloutData classifies unrounded root wetness at every threshold", () => {
  for (const [rootWetness, word] of [
    [0, "dry"], [0.2999, "dry"], [0.3, "moist"], [0.5999, "moist"],
    [0.6, "wet"], [0.8, "wet"], [0.85, "wet"], [0.8501, "saturated"], [1, "saturated"],
  ]) {
    const { rootzone } = buildCalloutData({ data: { months: [{ rootWetness, wetness: 0.5 }] } });
    assert.equal(rootzone.value, `Root zone: ${word} (${Math.round(rootWetness * 100)} % of saturation)`);
    assert.doesNotMatch(rootzone.value, /GWETROOT/);
  }
});

test("buildCalloutData leaves missing or invalid wetness unknown", () => {
  assert.equal(buildCalloutData({ data: null }), null);
  for (const wetness of [undefined, null, "", NaN, Infinity, -0.1, 1.1, "bad"]) {
    const { rootzone } = buildCalloutData({ data: { months: [{ wetness }] } });
    assert.equal(rootzone.value, "Root zone: unknown");
    assert.equal(rootzone.gwetroot, null);
    assert.equal(rootzone.cropValue, "Planned: Crop");
  }
  const { rootzone } = buildCalloutData({ data: { months: [{ rootWetness: null, wetness: 0 }] } });
  assert.equal(rootzone.value, "Root zone: dry (0 % of saturation)");
});

test("buildCalloutData uses the previewed rotation and selected month's crop and roots", () => {
  const data = {
    rotation: { label: "Rotation 01", bn: "ফসলচক্র 01" },
    months: [
      { cropName: "Mustard", cropNameBn: "সরিষা", rootDepthM: 0.6, wetness: 0.48 },
      { cropName: "Potato", cropNameBn: "আলু", rootDepthM: 0.1, rootWetness: 0.8 },
    ],
    soil: { layers: [{ clayPct: 32, sandPct: 35, siltPct: 33, ph: 5.8, socGkg: 10.6 }] },
  };
  const callouts = buildCalloutData({ data, monthIdx: 1 });
  assert.equal(callouts.rootzone.value, "Root zone: wet (80 % of saturation)");
  assert.equal(callouts.rootzone.cropValue, "Planned: Potato (Rotation 01) · roots ~0.1 m");

  const bn = buildCalloutData({ data, monthIdx: 1, t: (en, bn) => bn });
  assert.equal(bn.topsoil.eyebrow, "0–15 cm · উপরের মাটি");
  assert.equal(bn.topsoil.value, "এঁটেল দোআঁশ · pH 5.8 · জৈব পদার্থ 1.83%");
  assert.equal(bn.topsoil.truthLabel, "আনুমানিক · SoilGrids 250 মি");
  assert.equal(bn.rootzone.eyebrow, "15–60 cm · শিকড় অঞ্চল");
  assert.equal(bn.rootzone.value, "শিকড় অঞ্চল: ভেজা (সম্পৃক্ততার 80 %)");
  assert.equal(bn.rootzone.truthLabel, "আনুমানিক · NASA POWER ~50 কিমি, উপরের ~1 মি");
  assert.equal(bn.rootzone.cropValue, "পরিকল্পিত: আলু (ফসলচক্র 01) · শিকড় ~0.1 মি");
  assert.equal(bn.rootzone.cropTruthLabel, "কাল্পনিক পরিকল্পনা");

  for (const [wetness, word] of [[0.2, "শুষ্ক"], [0.4, "আর্দ্র"], [0.9, "সম্পৃক্ত"], [null, "অজানা"]]) {
    const { rootzone } = buildCalloutData({ data: { months: [{ wetness }] }, t: (en, bn) => bn });
    assert.ok(rootzone.value.includes(word));
  }
});

test("deoverlapLabels arranges labels vertically with minGap and without overlaps", () => {
  const items = [
    { id: "aquifer", anchorY: 260, height: 40, order: 3 },
    { id: "topsoil", anchorY: 240, height: 40, order: 1 },
    { id: "rootzone", anchorY: 250, height: 40, order: 2 },
  ];

  const minGap = 8;
  const placed = deoverlapLabels(items, 600, minGap, 20, 20);

  assert.equal(placed.length, 3);
  assert.equal(placed[0].id, "topsoil");
  assert.equal(placed[1].id, "rootzone");
  assert.equal(placed[2].id, "aquifer");

  for (let i = 1; i < placed.length; i++) {
    const prevBottom = placed[i - 1].y + placed[i - 1].height;
    assert.ok(
      placed[i].y >= prevBottom + minGap,
      `Label ${placed[i].id} overlaps with ${placed[i - 1].id}: y=${placed[i].y}, prevBottom=${prevBottom}`,
    );
  }

  // Clamping within bounds
  assert.ok(placed[0].y >= 20);
  assert.ok(placed[2].y + placed[2].height <= 580);

  // When overflowing bottom
  const crowded = [
    { id: "1", anchorY: 550, height: 50, order: 1 },
    { id: "2", anchorY: 560, height: 50, order: 2 },
    { id: "3", anchorY: 570, height: 50, order: 3 },
  ];
  const placedCrowded = deoverlapLabels(crowded, 600, minGap, 10, 10);
  assert.ok(placedCrowded[2].y + placedCrowded[2].height <= 590);
  for (let i = 1; i < placedCrowded.length; i++) {
    const prevBottom = placedCrowded[i - 1].y + placedCrowded[i - 1].height;
    assert.ok(placedCrowded[i].y >= prevBottom + minGap);
  }

  // Empty list
  assert.deepEqual(deoverlapLabels([], 600), []);
});

test("easeOutCubic produces smooth 0->1 curve with standard easing behavior", () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.equal(easeOutCubic(-0.5), 0);
  assert.equal(easeOutCubic(1.5), 1);
  assert.equal(easeOutCubic(NaN), 0);

  // Eases out faster early, decelerating towards end
  const mid = easeOutCubic(0.5);
  assert.ok(mid > 0.5, "easeOutCubic(0.5) must be > 0.5");
  assert.equal(mid, 0.875);
});

test("introCameraParams smoothly swings camera around target while descending", () => {
  const finalDistance = 80;
  const finalTarget = [10, -1.5, -20];
  const finalElevationDeg = 14;
  const finalYawDeg = 10;

  // Start (progress = 0)
  const start = introCameraParams({
    progress: 0,
    finalDistance,
    finalTarget,
    finalElevationDeg,
    finalYawDeg,
    swingDeg: 80,
  });

  assert.deepEqual(start.target, finalTarget);
  assert.ok(start.elevationDeg > finalElevationDeg, "camera starts higher");
  assert.ok(start.distance > finalDistance, "camera starts farther");
  assert.ok(Math.abs(start.yawDeg - (finalYawDeg + 80)) < 1e-6, "camera starts swung by 80 deg");

  // End (progress = 1)
  const end = introCameraParams({
    progress: 1,
    finalDistance,
    finalTarget,
    finalElevationDeg,
    finalYawDeg,
  });

  assert.deepEqual(end.target, finalTarget);
  assert.ok(Math.abs(end.elevationDeg - finalElevationDeg) < 1e-6);
  assert.ok(Math.abs(end.distance - finalDistance) < 1e-6);
  assert.ok(Math.abs(end.yawDeg - finalYawDeg) < 1e-6);

  // Mid progress moves smoothly
  const mid = introCameraParams({
    progress: 0.5,
    finalDistance,
    finalTarget,
    finalElevationDeg,
    finalYawDeg,
  });
  assert.ok(mid.distance < start.distance && mid.distance > end.distance);
  assert.ok(mid.elevationDeg < start.elevationDeg && mid.elevationDeg > end.elevationDeg);
});

test("shouldSkipIntro obeys prefersReducedMotion, hidden tab, and already played state", () => {
  assert.equal(shouldSkipIntro(), false);
  assert.equal(shouldSkipIntro({ prefersReducedMotion: false, isHidden: false, hasPlayed: false }), false);

  assert.equal(shouldSkipIntro({ prefersReducedMotion: true, isHidden: false, hasPlayed: false }), true);
  assert.equal(shouldSkipIntro({ prefersReducedMotion: false, isHidden: true, hasPlayed: false }), true);
  assert.equal(shouldSkipIntro({ prefersReducedMotion: false, isHidden: false, hasPlayed: true }), true);
});

test("sampleRowCropScale staggers growth across row positions", () => {
  // Before start time
  assert.equal(sampleRowCropScale(0.3, 0.0, 0.6, 2.2), 0);
  assert.equal(sampleRowCropScale(0.3, 1.0, 0.6, 2.2), 0);

  // After end time
  assert.equal(sampleRowCropScale(2.5, 0.0, 0.6, 2.2), 1);
  assert.equal(sampleRowCropScale(2.5, 1.0, 0.6, 2.2), 1);

  // In between: front row (row = 0) grows earlier than back row (row = 1)
  const midT = 1.3;
  const frontScale = sampleRowCropScale(midT, 0.0, 0.6, 2.2);
  const backScale = sampleRowCropScale(midT, 1.0, 0.6, 2.2);
  assert.ok(frontScale > 0);
  assert.ok(frontScale > backScale, "front row must grow before back row");
});

test("nearestCropMonth finds the nearest active crop month in a rotation", () => {
  // Array of string/object months:
  // indices: 0: fallow, 1: boro (crop), 2: fallow, 3: fallow, 4: aman (crop)
  const rotation = [
    "fallow",
    { cropId: "boro_rice" },
    "fallow",
    "fallow",
    { cropId: "t_aman" },
    "fallow",
    "fallow",
    "fallow",
    "fallow",
    "fallow",
    "fallow",
    "fallow",
  ];

  // Already on a crop month
  assert.equal(nearestCropMonth(rotation, 1), 1);
  assert.equal(nearestCropMonth(rotation, 4), 4);

  // Month 0 (fallow): nearest is 1 (dist 1 vs 4 dist 4)
  assert.equal(nearestCropMonth(rotation, 0), 1);
  // Month 2 (fallow): nearest is 1 (dist 1)
  assert.equal(nearestCropMonth(rotation, 2), 1);
  // Month 3 (fallow): nearest is 4 (dist 1)
  assert.equal(nearestCropMonth(rotation, 3), 4);
  // Month 11 (fallow): wraps around -> dist 1 to month 0, dist 2 to month 1
  assert.equal(nearestCropMonth(rotation, 11), 1);

  // Empty or invalid rotation
  assert.equal(nearestCropMonth([], 5), 5);
  assert.equal(nearestCropMonth(null, 3), 3);
});

test("cropStageAt calculates stage and metadata for a month", () => {
  const rotation = {
    months: [
      { cropId: "mustard", stage: "grow", cropName: "Mustard", cropNameBn: "সরিষা" },
      { cropId: "fallow" },
      "fallow",
    ],
  };

  const crop = cropStageAt(rotation, 0);
  assert.equal(crop.cropId, "mustard");
  assert.equal(crop.stage, "grow");
  assert.equal(crop.cropName, "Mustard");
  assert.equal(crop.cropNameBn, "সরিষা");

  const fallowCrop = cropStageAt(rotation, 1);
  assert.equal(fallowCrop.cropId, null);
  assert.equal(fallowCrop.stage, "fallow");

  const fallowStrCrop = cropStageAt(rotation, 2);
  assert.equal(fallowStrCrop.cropId, null);
  assert.equal(fallowStrCrop.stage, "fallow");
});

test('nearestCropMonth skips ripening and harvest, wraps years, and keeps ties forward', () => {
  const months = Array.from({ length: 12 }, () => ({ stage: 'fallow' }));
  months[0] = { cropId: 'potato', stage: 'grow' };
  months[9] = { cropId: 'aman', stage: 'grow' };
  months[10] = { cropId: 'aman', stage: 'mature' };
  months[11] = { cropId: 'aman', stage: 'harvest' };
  assert.equal(nearestCropMonth(months, 10), 9);
  assert.equal(nearestCropMonth(months, 11), 0);
  months[0].stage = 'establish';
  assert.equal(nearestCropMonth(months, 0), 0);
  months[9].stage = 'harvest';
  months[0].stage = 'mature';
  assert.equal(nearestCropMonth(months, 10), 10);
});

test('month chips retain stage details and provide short translated phone labels', () => {
  const month = { month: '2024-10', cropName: 'Aman rice', cropNameBn: 'আমন ধান', stage: 'grow' };
  assert.equal(monthChipText(month), 'Oct · Aman rice · growing');
  assert.equal(monthChipText(month, 'en', true), 'Oct · Aman');
  assert.equal(monthChipText(month, 'bn', true), 'অক্টো · আমন');
});

test("buildCalloutData includes fallow residue description for fallow months", () => {
  const dummyData = {
    months: [
      { month: "2024-01", cropId: "mustard", cropName: "Mustard", cropNameBn: "সরিষা", rootDepthM: 0.6, wetness: 0.48 },
      { month: "2024-02", cropId: "fallow", stage: "fallow", cropName: "Fallow", cropNameBn: "পতিত", wetness: 0.42 },
    ],
    soil: { layers: [] },
  };

  const enCallouts = buildCalloutData({
    data: dummyData,
    monthIdx: 1,
    soilOverrides: null,
    t: (en, bn) => en,
  });
  assert.match(enCallouts.rootzone.cropValue, /Fallow · residue of Mustard/);  // crop line moved to cropValue (LABELS)

  const bnCallouts = buildCalloutData({
    data: dummyData,
    monthIdx: 1,
    soilOverrides: null,
    t: (en, bn) => bn || en,
  });
  assert.match(bnCallouts.rootzone.cropValue, /পতিত · সরিষা-এর অবশেষ/);
});



test('deep soil uses the Fan 2017 water-table model for the calendar month; a well reading overrides it', () => {
  const waterTable = { sites: { mithapukur: { monthlyDepthM: [1.9, 2.2, 2.6, 3.2, 3.5, 2.7, 0.6, 0.3, 0.2, 0.3, 1.0, 1.7] } } };
  const data = { field: { id: 'mithapukur' }, months: [{ month: '2024-04' }] };
  const { aquifer } = buildCalloutData({ data, waterTable });
  assert.equal(aquifer.truth, 'MODELED');
  assert.equal(aquifer.modelGwM, 3.2);
  assert.match(aquifer.value, /~3\.2 m below ground \(model\)/);
  assert.equal(aquifer.isButton, false);
  assert.equal(aquifer.askReading, true);
  const measured = buildCalloutData({ data, waterTable, soilOverrides: { gwDepthM: 4.5 } }).aquifer;
  assert.equal(measured.truth, 'FARMER_REPORTED');
  assert.equal(measured.modelGwM, null);
  assert.equal(buildCalloutData({ data: { ...data, field: { id: 'elsewhere' } }, waterTable }).aquifer.truth, 'UNKNOWN');
});
