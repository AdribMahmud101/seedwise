import test from "node:test";
import assert from "node:assert/strict";
import { netArea, polygonPerimeterM, DEFAULT_NET_INPUTS } from "../src/legacy/netarea.js";

test("30 m × 30 m plot with 0.3 m bund ≈ 3.96 % loss", () => {
  const grossHa = (30 * 30) / 10000; // 0.09 ha = 900 m²
  const perimeterM = 120; // 4 * 30 m
  const result = netArea(grossHa, perimeterM, { bundWidthM: 0.3, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 });

  assert.ok(Math.abs(result.lossPct - 3.96) < 0.001, `Loss % should be ~3.96%, got ${result.lossPct}`);
  assert.ok(Math.abs(result.netPct - 96.04) < 0.001, `Net % should be ~96.04%, got ${result.netPct}`);
  assert.ok(Math.abs(result.lossM2 - 35.64) < 0.001, `Loss m² should be ~35.64 m², got ${result.lossM2}`);
  assert.ok(Math.abs(result.netHa - 0.086436) < 0.0001, `Net ha should be ~0.086436, got ${result.netHa}`);
});

test("widths that exceed the plot give net 0, never negative", () => {
  const grossHa = 0.09; // 900 m²
  const perimeterM = 120;

  // Excessive bund
  const rBund = netArea(grossHa, perimeterM, { bundWidthM: 50 });
  assert.equal(rBund.netHa, 0);
  assert.equal(rBund.netPct, 0);
  assert.equal(rBund.lossPct, 100);
  assert.ok(rBund.netHa >= 0);

  // Excessive drain
  const rDrain = netArea(grossHa, perimeterM, { drainWidthM: 50 });
  assert.equal(rDrain.netHa, 0);
  assert.equal(rDrain.netPct, 0);
  assert.ok(rDrain.netHa >= 0);

  // Excessive path
  const rPath = netArea(grossHa, perimeterM, { pathWidthM: 50 });
  assert.equal(rPath.netHa, 0);
  assert.equal(rPath.netPct, 0);
  assert.ok(rPath.netHa >= 0);

  // Excessive other decimals
  const rOther = netArea(grossHa, perimeterM, { otherDecimals: 9999 });
  assert.equal(rOther.netHa, 0);
  assert.equal(rOther.netPct, 0);
  assert.ok(rOther.netHa >= 0);

  // Combined excessive deductions
  const rAll = netArea(grossHa, perimeterM, { bundWidthM: 10, drainWidthM: 10, pathWidthM: 10, otherDecimals: 100 });
  assert.equal(rAll.netHa, 0);
  assert.equal(rAll.netPct, 0);
  assert.ok(rAll.netHa >= 0);
});

test("default values and missing options", () => {
  const grossHa = 0.09;
  const perimeterM = 120;
  const result = netArea(grossHa, perimeterM);

  assert.equal(result.inputs.bundWidthM, DEFAULT_NET_INPUTS.bundWidthM);
  assert.equal(result.inputs.drainWidthM, 0);
  assert.equal(result.inputs.pathWidthM, 0);
  assert.equal(result.inputs.otherDecimals, 0);
  assert.ok(Math.abs(result.lossPct - 3.96) < 0.001);
});

test("polygonPerimeterM computes perimeter for coordinate points", () => {
  // A 30m x 30m square in Rangpur coordinates
  const lat = 25.54;
  const lon = 89.27;
  const m = 111195.08;
  const dLat = 30 / m;
  const dLon = 30 / (m * Math.cos((lat * Math.PI) / 180));
  const points = [
    [lat, lon],
    [lat, lon + dLon],
    [lat + dLat, lon + dLon],
    [lat + dLat, lon],
  ];

  const perim = polygonPerimeterM(points);
  assert.ok(Math.abs(perim - 120) < 0.1, `Perimeter should be ~120m, got ${perim}`);
  assert.equal(polygonPerimeterM([]), 0);
  assert.equal(polygonPerimeterM([[lat, lon]]), 0);
});
