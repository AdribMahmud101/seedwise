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
