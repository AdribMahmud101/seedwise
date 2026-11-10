import test from "node:test";
import assert from "node:assert/strict";
import {
  fieldIdSeed,
  seededRandom,
  smoothOutline,
  computeMicroRelief,
  rimErosionNoise,
  distToPolygonEdge,
  rayBoundaryDistance,
  generateUndersideGeometry,
  hashVertexPositions,
} from "../src/legacy/landshape.js";

test("fieldIdSeed produces stable 32-bit integer hashes", () => {
  const seed1 = fieldIdSeed("mithapukur");
  const seed2 = fieldIdSeed("mithapukur");
  const seedPir = fieldIdSeed("pirganj");
  assert.equal(typeof seed1, "number");
  assert.equal(seed1, seed2);
  assert.notEqual(seed1, seedPir);
});

test("seededRandom produces deterministic numbers in [0, 1)", () => {
  const seed = 12345;
  const val1 = seededRandom(seed, 1);
  const val2 = seededRandom(seed, 1);
  const val3 = seededRandom(seed, 2);
  assert.equal(val1, val2);
  assert.ok(val1 >= 0 && val1 < 1);
  assert.notEqual(val1, val3);
});

test("smoothOutline softens corners with deviation <= 1.5 m", () => {
  const square = [[0, 0], [40, 0], [40, 30], [0, 30]];
  const smoothed = smoothOutline(square, 1.5);
  assert.ok(smoothed.length > square.length);

  // Check that every point in smoothed polygon deviates by <= 1.5 m from original boundaries
  for (const [x, y] of smoothed) {
    const d = distToPolygonEdge(x, y, square);
    assert.ok(d <= 1.5 + 1e-6, `Point [${x}, ${y}] exceeded 1.5 m deviation: ${d}`);
  }

  // Check that original sharp corners were smoothed (corner cut > 0.05m and <= 1.5m)
  for (const [cx, cy] of square) {
    let minD = Infinity;
    for (const [sx, sy] of smoothed) {
      const d = Math.hypot(sx - cx, sy - cy);
      if (d < minD) minD = d;
    }
    assert.ok(minD > 0.05, `Corner [${cx}, ${cy}] was not smoothed (distance ${minD})`);
    assert.ok(minD <= 1.5 + 1e-6, `Corner [${cx}, ${cy}] cut too deep: ${minD}`);
  }
});

test("smoothOutline preserves degenerate and small rings safely", () => {
  assert.deepEqual(smoothOutline([]), []);
  assert.deepEqual(smoothOutline([[0, 0], [1, 1]]), [[0, 0], [1, 1]]);
  assert.deepEqual(smoothOutline(null), []);
});

test("computeMicroRelief generates micro-relief <= 10 cm noise + bund + drain", () => {
  const poly = [[0, 0], [40, 0], [40, 30], [0, 30]];
  // Deep interior (no bund, level ground)
  const interior = computeMicroRelief({
    x: 20,
    z: -15,
    fieldId: "mithapukur",
    outlineM: poly,
    isLowGround: false,
    maxNoiseM: 0.08,
  });
  assert.ok(Math.abs(interior) <= 0.10, `Interior micro-relief noise ${interior} exceeds 10 cm`);

  // Near boundary (bund ridge ~20-30 cm)
  const bundPoint = computeMicroRelief({
    x: 0.35,
    z: -15,
    fieldId: "mithapukur",
    outlineM: poly,
    isLowGround: false,
  });
  assert.ok(bundPoint >= 0.15 && bundPoint <= 0.35, `Bund height ${bundPoint} should be ~20-30 cm`);

  // Low ground drain swale creates hollow in field interior
  const lowGroundInterior = computeMicroRelief({
    x: 20,
    z: -15,
    fieldId: "mithapukur",
    outlineM: poly,
    isLowGround: true,
  });
  const normalInterior = computeMicroRelief({
    x: 20,
    z: -15,
    fieldId: "mithapukur",
    outlineM: poly,
    isLowGround: false,
  });
  assert.ok(lowGroundInterior < normalInterior, "Low-ground drain must create a hollow/depression");
});

test("rimErosionNoise produces subtle edge crumble per field", () => {
  const noiseM1 = rimErosionNoise("mithapukur", 0, 0.5);
  const noiseM2 = rimErosionNoise("mithapukur", 0, 0.5);
  const noiseP = rimErosionNoise("pirganj", 0, 0.5);

  assert.equal(noiseM1.dh, noiseM2.dh);
  assert.equal(noiseM1.crumble, noiseM2.crumble);
  assert.notEqual(noiseM1.dh, noiseP.dh);
  assert.ok(Math.abs(noiseM1.dh) < 0.1);
  assert.ok(Math.abs(noiseM1.crumble) < 0.15);
});

test("rayBoundaryDistance finds distance along ray to polygon boundary", () => {
  const poly = [[-20, -15], [20, -15], [20, 15], [-20, 15]];
  const east = rayBoundaryDistance(0, 0, 0, poly);
  const north = rayBoundaryDistance(0, 0, Math.PI / 2, poly);
  assert.ok(Math.abs(east - 20) < 1e-4);
  assert.ok(Math.abs(north - 15) < 1e-4);
});

test("variety & stability: two fields -> different underside vertex hashes; same field twice -> identical", () => {
  const outline = [[-15.2, -18.4], [14.8, -16.2], [16.1, 17.5], [-13.9, 15.3]];
  const smoothed = smoothOutline(outline, 1.5);

  const m1 = generateUndersideGeometry({ ringM: smoothed, bottomY: -2.5, depthM: 3.0, fieldId: "mithapukur" });
  const m2 = generateUndersideGeometry({ ringM: smoothed, bottomY: -2.5, depthM: 3.0, fieldId: "pirganj" });
  const m3 = generateUndersideGeometry({ ringM: smoothed, bottomY: -2.5, depthM: 3.0, fieldId: "gangachara" });
  const mCustom = generateUndersideGeometry({ ringM: smoothed, bottomY: -2.5, depthM: 3.0, fieldId: "custom-demo-field" });
  const m1Repeat = generateUndersideGeometry({ ringM: smoothed, bottomY: -2.5, depthM: 3.0, fieldId: "mithapukur" });

  const h1 = hashVertexPositions(m1.positions);
  const h2 = hashVertexPositions(m2.positions);
  const h3 = hashVertexPositions(m3.positions);
  const hC = hashVertexPositions(mCustom.positions);
  const h1Rep = hashVertexPositions(m1Repeat.positions);

  // Same field twice -> identical
  assert.equal(h1, h1Rep, "Same field underside mesh must be completely identical");

  // Two different fields -> different underside vertex hashes
  assert.notEqual(h1, h2, "Different fields must have different underside vertex hashes");
  assert.notEqual(h1, h3, "Different fields must have different underside vertex hashes");
  assert.notEqual(h2, h3, "Different fields must have different underside vertex hashes");
  assert.notEqual(h1, hC, "Custom field must differ from pilot fields");

  // Vertices and indices are valid
  assert.ok(m1.positions.length > 100);
  assert.ok(m1.indices.length > 100);
  assert.equal(m1.positions.length % 3, 0);
  assert.equal(m1.indices.length % 3, 0);
});
