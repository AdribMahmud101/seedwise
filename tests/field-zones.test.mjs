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
  plannerMeasurementAnchors, plannerSpacingAnchors,
  measurementWidthLabel, measurementEdgeLabel, spacingMeasurementLabel,
  zonePixelsPerMetre, clampZonePopover,
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

test('dimension anchors span the drawn width while labels state the real width', () => {
  for (const boundary of [rect, [...rect].reverse()]) {
    const zones = computeFieldZones(boundary, widths, { drainEdgeIndex: 0 });
    const geom = buildZoneGeometry(boundary, widths, { drainEdgeIndex: 0, display: true });
    const markers = plannerMeasurementAnchors(boundary, zones, geom);
    assert.equal(markers.length, 4);
    // The 0.1 m drain is enlarged to 0.4 m on a 40 m span: the marker spans
    // the drawn ribbon, the label keeps the real width.
    for (const [id, label, drawn] of [['bund', '0.4 m', 0.4], ['drain', '0.1 m', 0.4], ['path', '0.5 m', 0.5]]) {
      const marker = markers.find((m) => m.id === id);
      assert.equal(marker.label, label);
      assert.ok(Math.abs(Math.hypot(marker.b[0] - marker.a[0], marker.b[1] - marker.a[1]) - drawn) < 1e-6);
      for (const fraction of [0.1, 0.5, 0.9]) {
        assert.equal(pointInFieldZones(
          marker.a[0] + (marker.b[0] - marker.a[0]) * fraction,
          marker.a[1] + (marker.b[1] - marker.a[1]) * fraction, geom, boundary), id);
      }
    }
    assert.equal(markers.find((m) => m.id === 'edge').label, '40 m');
  }
  assert.deepEqual(plannerMeasurementAnchors([], null, null), []);
  assert.deepEqual(plannerMeasurementAnchors(rect, computeFieldZones(rect,
    { bundWidthM: 0, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 }), null)
    .map((m) => m.id), ['edge']);
});

test('dimension labels keep real widths with units and never round to zero', () => {
  assert.equal(measurementWidthLabel(0.4), '0.4 m');
  assert.equal(measurementWidthLabel(0.1), '0.1 m');
  assert.equal(measurementWidthLabel(0.0005), '0.0005 m');
  assert.equal(measurementEdgeLabel(24.84), '24.8 m');
  assert.equal(measurementEdgeLabel(40), '40 m');
  assert.equal(spacingMeasurementLabel('row', 20), '↔ 20 cm');
  assert.equal(spacingMeasurementLabel('plant', 20), '↕ 20 cm');
});

test('rotated dimensions stay perpendicular and concave strips keep full cross-sections', () => {
  const angle = Math.PI / 7;
  const rotate = ([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  const boundary = rect.map(rotate);
  const zones = computeFieldZones(boundary, widths, { drainEdgeIndex: 0 });
  const geom = buildZoneGeometry(boundary, widths, { drainEdgeIndex: 0, display: true });
  const markers = plannerMeasurementAnchors(boundary, zones, geom);
  const path = markers.find((m) => m.id === 'path');
  const along = [Math.cos(angle), Math.sin(angle)];
  assert.ok(Math.abs((path.b[0] - path.a[0]) * along[0] + (path.b[1] - path.a[1]) * along[1]) < 1e-8);
  const concave = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]];
  const czones = computeFieldZones(concave, widths, { drainEdgeIndex: 0 });
  const cgeom = buildZoneGeometry(concave, widths, { drainEdgeIndex: 0, display: true });
  for (const marker of plannerMeasurementAnchors(concave, czones, cgeom).filter((m) => m.id !== 'edge')) {
    for (const fraction of [0.1, 0.5, 0.9]) {
      assert.equal(pointInFieldZones(
        marker.a[0] + (marker.b[0] - marker.a[0]) * fraction,
        marker.a[1] + (marker.b[1] - marker.a[1]) * fraction, cgeom, concave), marker.id);
    }
  }
  const empty = { ...cgeom, bundWidthM: 0, drain: null, path: null, other: null };
  assert.deepEqual(plannerMeasurementAnchors(concave, czones, empty).map((m) => m.id), ['edge']);
});

test('NETAREA1C: default-zoom pixels-per-metre follows the studio estimator', () => {
  assert.equal(zonePixelsPerMetre(600, 40), 8.25);
  assert.equal(zonePixelsPerMetre(300, 30), 5.5);
  // Hidden stage / degenerate outline fall back to studio defaults, never NaN.
  assert.equal(zonePixelsPerMetre(0, 0), 11);
  assert.equal(zonePixelsPerMetre(-5, -2), 11);
  assert.ok(Number.isFinite(zonePixelsPerMetre(412, 25)));
});

test('NETAREA1C: bund and drain enlarge to 6 px at default zoom, capped at x6', () => {
  const ppm = 8.25; // 600 px stage on a 40 m span -> 6 px ~= 0.727 m
  const zones = computeFieldZones(rect, widths, { drainEdgeIndex: 0, pixelsPerMetre: ppm });
  const minReadable = 6 / ppm;
  assert.ok(Math.abs(zones.bund.displayWidthM - minReadable) < 1e-9);
  assert.equal(zones.bund.enlarged, true);
  // The 0.1 m drain hits the x6 cap instead of the 6 px target.
  assert.ok(Math.abs(zones.drain.displayWidthM - 0.6) < 1e-9);
  assert.equal(zones.drain.enlarged, true);
  // The path keeps the span rule (0.5 m stays true scale on a 40 m span).
  assert.equal(zones.path.displayWidthM, 0.5);
  assert.equal(zones.path.enlarged, false);
  // Real numbers never follow the display enlargement.
  assert.equal(zones.bund.widthM, 0.4);
  assert.equal(zones.drain.widthM, 0.1);
  const plain = computeFieldZones(rect, widths, { drainEdgeIndex: 0 });
  for (const kind of ['bund', 'drain', 'path']) {
    assert.equal(zones[kind].widthM, plain[kind].widthM);
    assert.equal(zones[kind].lengthM, plain[kind].lengthM);
    assert.equal(zones[kind].areaM2, plain[kind].areaM2);
  }
});

test('NETAREA1C: tiny pixels-per-metre still caps at six times the real width', () => {
  const zones = computeFieldZones(rect, widths, { drainEdgeIndex: 0, pixelsPerMetre: 1 });
  assert.ok(Math.abs(zones.bund.displayWidthM - 2.4) < 1e-9);
  assert.ok(Math.abs(zones.drain.displayWidthM - 0.6) < 1e-9);
});

test('NETAREA1C: features already above 6 px keep their true widths', () => {
  const zones = computeFieldZones(rect, widths, { drainEdgeIndex: 0, pixelsPerMetre: 30 });
  assert.equal(zones.bund.displayWidthM, 0.4);
  assert.equal(zones.bund.enlarged, false);
  assert.ok(Math.abs(zones.drain.displayWidthM - 0.2) < 1e-9);
  const zero = computeFieldZones(rect,
    { bundWidthM: 0, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 },
    { pixelsPerMetre: 8.25 });
  assert.equal(zero.bund, null);
  assert.equal(zero.drain, null);
});

test('NETAREA1C: display geometry matches the capped widths; plants stay out', () => {
  const ppm = 8.25;
  const zones = computeFieldZones(rect, widths, { drainEdgeIndex: 0, pixelsPerMetre: ppm });
  const geom = buildZoneGeometry(rect, widths, { drainEdgeIndex: 0, display: true, pixelsPerMetre: ppm });
  assert.equal(geom.bundWidthM, zones.bund.displayWidthM);
  assert.equal(geom.drain.widthM, zones.drain.displayWidthM);
  assert.equal(geom.path.widthM, zones.path.displayWidthM);
  // The drain centre-line still sits just inside the drawn bund.
  assert.ok(geom.drain.widthM > 0 && geom.bundWidthM > 0);
  const markers = plannerMeasurementAnchors(rect, zones, geom);
  const drain = markers.find((m) => m.id === 'drain');
  assert.equal(drain.label, '0.1 m');
  assert.ok(Math.abs(Math.hypot(drain.b[0] - drain.a[0], drain.b[1] - drain.a[1]) - 0.6) < 1e-6);
  const layout = plannerRowLayout(rect, 20, 20, 100, geom);
  assert.ok(layout.positions.length > 0);
  assert.ok(layout.positions.every(([x, y]) => pointInFieldZones(x, y, geom, rect) === null));
});

test('NETAREA1C: zone popover placement flips and clamps inside the stage', () => {
  const bounds = { left: 8, top: 8, right: 392, bottom: 352 };
  const right = clampZonePopover({ anchorX: 100, anchorY: 200, width: 240, height: 160, bounds });
  assert.equal(right.left, 130);
  assert.equal(right.top, 120);
  const left = clampZonePopover({ anchorX: 360, anchorY: 200, width: 240, height: 160, bounds });
  assert.equal(left.left, 90);
  const bottom = clampZonePopover({ anchorX: 100, anchorY: 340, width: 240, height: 160, bounds });
  assert.equal(bottom.top, 192);
  assert.ok(bottom.top + bottom.height <= bounds.bottom);
  const small = clampZonePopover({ anchorX: 200, anchorY: 180, width: 800, height: 600, bounds });
  assert.equal(small.width, bounds.right - bounds.left);
  assert.equal(small.height, bounds.bottom - bounds.top);
  assert.equal(small.left, bounds.left);
  assert.equal(small.top, bounds.top);
});

test('spacing markers sit on a clear planted patch and track the sliders', () => {
  const geom = buildZoneGeometry(rect, widths, { drainEdgeIndex: 0, display: true });
  const markers = plannerSpacingAnchors(rect, 20, 20, geom, 100);
  assert.equal(markers.length, 2);
  const row = markers.find((m) => m.id === 'row-spacing');
  const plant = markers.find((m) => m.id === 'plant-spacing');
  assert.equal(row.label, '↔ 20 cm');
  assert.equal(plant.label, '↕ 20 cm');
  assert.deepEqual(row.a, plant.a);
  const layout = plannerRowLayout(rect, 20, 20, 100, geom);
  assert.ok(Math.abs(Math.hypot(row.b[0] - row.a[0], row.b[1] - row.a[1]) - layout.spacingY) < 1e-6);
  assert.ok(Math.abs(Math.hypot(plant.b[0] - plant.a[0], plant.b[1] - plant.a[1]) - layout.spacingX) < 1e-6);
  for (const marker of markers) {
    for (const fraction of [0, 0.5, 1]) {
      const x = marker.a[0] + (marker.b[0] - marker.a[0]) * fraction;
      const y = marker.a[1] + (marker.b[1] - marker.a[1]) * fraction;
      assert.ok(pointInPolygon(x, y, rect));
      assert.equal(pointInFieldZones(x, y, geom, rect), null);
    }
  }
  // Slider moves change the labels and the drawn spans.
  const moved = plannerSpacingAnchors(rect, 30, 25, geom, 100);
  assert.equal(moved.find((m) => m.id === 'row-spacing').label, '↔ 30 cm');
  assert.equal(moved.find((m) => m.id === 'plant-spacing').label, '↕ 25 cm');
  const movedLayout = plannerRowLayout(rect, 30, 25, 100, geom);
  assert.ok(Math.abs(Math.hypot(moved[0].b[0] - moved[0].a[0], moved[0].b[1] - moved[0].a[1]) - movedLayout.spacingY) < 1e-6);
  assert.deepEqual(plannerSpacingAnchors(rect, 1, 20, geom), []);
  assert.deepEqual(plannerSpacingAnchors([], 20, 20, geom), []);
});
