import test from 'node:test';
import assert from 'node:assert/strict';
import { netArea, DEFAULT_NET_INPUTS, M2_PER_DECIMAL, cultivableUsablePct } from '../src/legacy/netarea.js';
import { controlLimits, clampPlannerValue, usableDefaultFromNet, resolvePlannerUsable, zoneSourceLabel } from '../src/legacy/planner-controls.js';
import {
  plannerRowLayout, pointInPolygon,
  edgeLengths, longestEdgeIndex, pickDrainEdge, pathAxisThroughCentroid,
  computeFieldZones, buildZoneGeometry, pointInFieldZones, zonePopoverData,
  drainSurfacePolygons,
  fieldZoneClearance,
} from '../src/legacy/planner3d-helpers.js';
import { capacity } from '../src/legacy/engine.js';

const rect = [[-20, -10], [20, -10], [20, 10], [-20, 10]]; // 40 m x 20 m = 800 m2
const grossHa = 0.08;
const perimM = 120;
const widths = { bundWidthM: 0.4, drainWidthM: 0.1, pathWidthM: 0.5, otherDecimals: 0 };

test('usable default comes from netarea cultivable share', () => {
  const net = netArea(grossHa, perimM, widths);
  const def = usableDefaultFromNet(grossHa, perimM, widths);
  assert.ok(Math.abs(def - Math.round(net.netPct * 10) / 10) < 1e-9);
  assert.ok(def > 1 && def <= 100);
  assert.equal(cultivableUsablePct(grossHa, perimM, widths), def);
  // Scenario defaults match netArea with DEFAULT_NET_INPUTS.
  assert.equal(usableDefaultFromNet(grossHa, perimM, undefined),
    Math.round(netArea(grossHa, perimM, DEFAULT_NET_INPUTS).netPct * 10) / 10);
});

test('usable slider keeps one decimal and clamps like the journey', () => {
  assert.deepEqual(controlLimits('rice', 'usable'), { min: 1, max: 100, step: 0.1 });
  assert.equal(clampPlannerValue('rice', 'usable', 88.7), 88.7);
  assert.equal(clampPlannerValue('rice', 'usable', 88.74), 88.7);
  assert.equal(clampPlannerValue('rice', 'usable', 0), 1);
  assert.equal(clampPlannerValue('rice', 'usable', 140), 100);
});

test('override keeps the farmer value; otherwise the field default wins', () => {
  assert.equal(resolvePlannerUsable({ usable: 70, usableSource: 'override' }, 88.7), 70);
  assert.equal(resolvePlannerUsable({ usable: 70, usableSource: 'field' }, 88.7), 88.7);
  assert.equal(resolvePlannerUsable({ usable: 70 }, 88.7), 88.7);
  assert.equal(resolvePlannerUsable({}, 88.7), 88.7);
});

test('counts and seed recompute from the usable share', () => {
  const full = capacity(grossHa, 100, 'rice', 0.2, 0.2);
  const part = capacity(grossHa, 88.7, 'rice', 0.2, 0.2);
  assert.equal(part.positions, Math.floor((grossHa * 0.887 * 1e4) / (0.2 * 0.2) + 1e-8));
  assert.ok(part.positions < full.positions);
  const seed = capacity(grossHa, 88.7, 'mustard', 0, 0);
  assert.ok(Math.abs(seed.seedKg - grossHa * 0.887 * 7) < 1e-9);
});

test('drain picks the lowest edge from elevation, else the longest edge', () => {
  assert.deepEqual(edgeLengths(rect), [40, 20, 40, 20]);
  assert.equal(longestEdgeIndex(rect), 0);
  // Vertices 2,3 high: edges avg [0, 5, 10, 5] -> edge 0 lowest.
  assert.equal(pickDrainEdge(rect, [0, 0, 10, 10]).index, 0);
  // Vertices 0,1 high: edge 2 lowest.
  assert.equal(pickDrainEdge(rect, [10, 10, 0, 0]).index, 2);
  const fn = (x, y) => (y < 0 ? 5 : 0);
  assert.equal(pickDrainEdge(rect, fn).index, 2);
  // No usable elevation -> longest edge fallback.
  assert.equal(pickDrainEdge(rect, null).index, 0);
  assert.equal(pickDrainEdge(rect, null).fallback, true);
  assert.equal(pickDrainEdge(rect, [NaN, NaN, NaN, NaN]).fallback, true);
});

test('zone areas derive from the entered widths', () => {
  const zones = computeFieldZones(rect, widths, { drainEdgeIndex: 0 });
  assert.ok(zones.bund && zones.drain && zones.path);
  assert.equal(zones.bund.widthM, 0.4);
  assert.ok(Math.abs(zones.bund.lengthM - 120) < 1e-6);
  assert.ok(zones.bund.areaM2 > 0 && zones.bund.sharePct > 0);
  assert.equal(zones.drain.widthM, 0.1);
  assert.ok(Math.abs(zones.drain.lengthM - 40) < 1e-6);
  assert.equal(zones.path.widthM, 0.5);
  const axis = pathAxisThroughCentroid(rect);
  assert.ok(Math.abs(zones.path.lengthM - axis.lengthM) < 1e-6);
  assert.equal(zones.other, null);
  const withOther = computeFieldZones(rect, { ...widths, otherDecimals: 1 });
  assert.ok(Math.abs(withOther.other.areaM2 - M2_PER_DECIMAL) < 1e-6);
  assert.ok(Math.abs(withOther.other.decimals - 1) < 1e-9);
});

test('zero widths produce no zones', () => {
  const zones = computeFieldZones(rect, { bundWidthM: 0, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 });
  assert.equal(zones.bund, null);
  assert.equal(zones.drain, null);
  assert.equal(zones.path, null);
  assert.equal(zones.other, null);
  assert.deepEqual(buildZoneGeometry(rect, { bundWidthM: 0, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 }), null);
});

test('sub-pixel features are enlarged for readability, honestly flagged', () => {
  const tiny = computeFieldZones(rect, { bundWidthM: 0.05, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 });
  assert.equal(tiny.bund.enlarged, true);
  assert.ok(tiny.bund.displayWidthM > tiny.bund.widthM);
  const normal = computeFieldZones(rect, widths, { drainEdgeIndex: 0 });
  assert.equal(normal.bund.enlarged, false);
  assert.equal(normal.path.enlarged, false);
  // On a 40 m span the 0.1 m drain is sub-pixel, so it is honestly enlarged.
  assert.equal(normal.drain.enlarged, true);
  assert.ok(normal.drain.displayWidthM > normal.drain.widthM);
  assert.ok(normal.drain.displayWidthM / 40 * 320 >= 3, 'channel stays visible on a phone');
  assert.equal(normal.enlarged, true);
  assert.equal(tiny.enlarged, true);
});

test('row layout excludes every zone and shrinks with usable area', () => {
  const wide = { bundWidthM: 1.5, drainWidthM: 0.5, pathWidthM: 2, otherDecimals: 0.5 };
  const geom = buildZoneGeometry(rect, wide, { drainEdgeIndex: 0 });
  assert.ok(geom);
  // Spot checks: centre sits on the path, the bottom strip in the bund.
  assert.equal(pointInFieldZones(0, 0, geom, rect), 'path');
  assert.equal(pointInFieldZones(0, -9.9, geom, rect), 'bund');
  assert.equal(pointInFieldZones((geom.drain.ax + geom.drain.bx) / 2,
    (geom.drain.ay + geom.drain.by) / 2, geom, rect), 'drain');
  const base = plannerRowLayout(rect, 20, 20, 100);
  const zoned = plannerRowLayout(rect, 20, 20, 100, geom);
  assert.ok(base.positions.length > 0);
  assert.ok(zoned.positions.length < base.positions.length);
  assert.ok(zoned.positions.every(([x, y]) => pointInFieldZones(x, y, geom, rect) === null));
  const excluded = base.positions.filter(([x, y]) => pointInFieldZones(x, y, geom, rect) !== null);
  assert.ok(excluded.length > 0);
  assert.equal(zoned.positions.length, base.positions.length - excluded.length);
  const half = plannerRowLayout(rect, 20, 20, 50, geom);
  assert.ok(half.positions.length < zoned.positions.length);
});

test('popover carries parameters and the truth label', () => {
  const zones = computeFieldZones(rect, widths, { drainEdgeIndex: 0 });
  const pop = zonePopoverData('bund', zones, true);
  assert.equal(pop.name, 'Bund');
  assert.equal(pop.widthM, 0.4);
  assert.ok(pop.lengthM > 0 && pop.areaM2 > 0 && pop.decimals > 0 && pop.sharePct > 0);
  assert.equal(pop.source, 'Entered by farmer');
  assert.equal(zoneSourceLabel(true), 'Entered by farmer');
  assert.equal(zoneSourceLabel(false), 'Scenario default');
  assert.equal(zonePopoverData('drain', zones, false).source, 'Scenario default');
  assert.match(pop.editHref, /#field/);
});

test('path follows the long axis of a rotated field', () => {
  const rotated = rect.map(([x, y]) => [(x - y) / Math.sqrt(2), (x + y) / Math.sqrt(2)]);
  const axis = pathAxisThroughCentroid(rotated);
  assert.ok(Math.abs(axis.lengthM - 40) < 1e-6);
  assert.ok(Math.abs(Math.abs(axis.bx - axis.ax) - Math.abs(axis.by - axis.ay)) < 1e-6);
});

test('concave fields still draw a path when the centroid lies outside', () => {
  const u = [[0, 0], [40, 0], [40, 40], [30, 40], [30, 10], [10, 10], [10, 40], [0, 40]];
  const axis = pathAxisThroughCentroid(u);
  assert.equal(axis.lengthM, 10);
  assert.ok(pointInPolygon((axis.ax + axis.bx) / 2, (axis.ay + axis.by) / 2, u));
});

test('drawn plants avoid enlarged zones and represent the capacity without deducting widths twice', () => {
  const zones = computeFieldZones(rect, widths);
  const geom = buildZoneGeometry(rect, widths, { display: true });
  assert.equal(geom.drain.widthM, zones.drain.displayWidthM);
  const layout = plannerRowLayout(rect, 20, 20, 88.7, geom);
  assert.equal(layout.totalPositions, 17740);
  assert.ok(layout.positions.every(([x, y]) => pointInFieldZones(x, y, geom, rect) === null));
  assert.equal(layout.sampleWeights.reduce((sum, n) => sum + n, 0), 17740);
});

test('drain cuts the ground surface by its visible width', () => {
  const drain = { ax: 0, ay: 1, bx: 10, by: 1, widthM: 0.4 };
  const pieces = drainSurfacePolygons([[0, 0], [10, 0], [0, 10]], drain);
  const area = poly => Math.abs(poly.reduce((sum, [x, y], i) => {
    const next = poly[(i + 1) % poly.length];
    return sum + x * next[1] - next[0] * y;
  }, 0)) / 2;
  assert.ok(Math.abs(pieces.reduce((sum, poly) => sum + area(poly), 0) - 46.4) < 1e-6);
});

test('other patch stays in a rotated field and has its entered area', () => {
  const rotated = rect.map(([x, y]) => [(x - y) / Math.sqrt(2), (x + y) / Math.sqrt(2)]);
  const other = buildZoneGeometry(rotated, { ...widths, otherDecimals: 1 }).other;
  const poly = other.polygon;
  assert.ok(poly?.length >= 3);
  const area = Math.abs(poly.reduce((sum, [x, y], i) => {
    const next = poly[(i + 1) % poly.length];
    return sum + x * next[1] - next[0] * y;
  }, 0)) / 2;
  assert.ok(Math.abs(area - M2_PER_DECIMAL) < 1e-6);
  const center = poly.reduce(([x, y], p) => [x + p[0] / poly.length, y + p[1] / poly.length], [0, 0]);
  assert.ok(pointInPolygon(...center, rotated));
  assert.equal(pointInFieldZones(...center, { other }, rotated), 'other');
});

test('corner patch area stays correct when the first vertex is the bounding-box center', () => {
  const l = [[10, 10], [10, 20], [0, 20], [0, 0], [20, 0], [20, 10]];
  const poly = buildZoneGeometry(l, { otherDecimals: 0.5 }).other.polygon;
  const area = Math.abs(poly.reduce((sum, [x, y], i) => {
    const next = poly[(i + 1) % poly.length];
    return sum + x * next[1] - next[0] * y;
  }, 0)) / 2;
  assert.ok(Math.abs(area - M2_PER_DECIMAL / 2) < 1e-6);
});

test('plant footprints have clearance from each visible zone', () => {
  const geom = buildZoneGeometry(rect, widths, { display: true });
  assert.equal(fieldZoneClearance(0, 0, geom, rect), 0);
  assert.ok(Math.abs(fieldZoneClearance(0, 1, geom, rect) - 0.75) < 1e-8);
  assert.equal(fieldZoneClearance(0, -9.9, geom, rect), 0);
});
