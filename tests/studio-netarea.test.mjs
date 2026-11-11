import test from 'node:test';
import assert from 'node:assert/strict';
import * as helpers from '../src/legacy/studio3d-helpers.js';
import * as studio from '../src/legacy/studio3d.js';
import { state } from '../src/legacy/ui.js';

const outline = [[0, 0], [100, 0], [100, 50], [0, 50]];
const triangles = [[0, 1, 2], [0, 2, 3]];
const zero = { bundWidthM: 0, drainWidthM: 0, pathWidthM: 0, otherDecimals: 0 };

test('lowest edge samples the whole edge, handles reversed winding and missing heights', () => {
  assert.equal(typeof helpers.lowestFieldEdge, 'function');
  assert.equal(helpers.lowestFieldEdge(outline, (x, y) => y), 0);
  assert.equal(helpers.lowestFieldEdge([...outline].reverse(), (x, y) => y), 2);
  assert.equal(helpers.lowestFieldEdge(outline, () => null), 0);
  assert.equal(helpers.lowestFieldEdge(outline, (x, y) => x), 3);
});

test('strip areas use physical widths, stay disjoint and ignore display enlargement', () => {
  assert.equal(typeof helpers.fieldInfrastructure, 'function');
  const features = helpers.fieldInfrastructure(outline, triangles, { ...zero, bundWidthM: 0.4, drainWidthM: 0.1, pathWidthM: 0.5 }, (x, y) => y, 1);
  const bund = features.find(f => f.id === 'bund');
  const drain = features.find(f => f.id === 'drain');
  const path = features.find(f => f.id === 'path');
  assert.ok(Math.abs(bund.areaM2 - 119.36) < 1e-6);
  assert.ok(Math.abs(drain.areaM2 - 9.92) < 1e-6);
  assert.ok(Math.abs(path.areaM2 - 49.6) < 1e-6);
  assert.equal(bund.lengthM, 300);
  assert.equal(drain.edgeIndex, 0);
  assert.equal(drain.widthM, 0.1);
  assert.ok(Math.abs(drain.displayWidthM - 0.6) < 1e-12);
  assert.ok(helpers.infrastructureAt(features, 50, 25));
  assert.equal(helpers.infrastructureAt(features, 50, 10), null);
});

test('zero widths draw nothing; other patch uses decimals and crop clearance', () => {
  assert.equal(typeof helpers.fieldInfrastructure, 'function');
  assert.deepEqual(helpers.fieldInfrastructure(outline, triangles, zero, () => 0), []);
  const features = helpers.fieldInfrastructure(outline, triangles, { ...zero, otherDecimals: 1 }, () => 0);
  assert.equal(features.length, 1);
  assert.ok(Math.abs(features[0].areaM2 - 40.4685642) < 0.0001);
  assert.ok(features[0].polygons.every(poly => poly.every(([x, y]) => helpers.pointInPolygon(x, y, outline))));
  assert.equal(helpers.infrastructureAt(features, 50, 25), null);
  const all = helpers.fieldInfrastructure(outline, triangles, { ...zero, bundWidthM: 1000, otherDecimals: 1000 }, () => 0);
  assert.ok(all.reduce((sum, f) => sum + f.areaM2, 0) <= 5000 + 1e-6);
});

test('path follows a rotated field long axis and crop clearance includes canopy spread', () => {
  const angle = Math.PI / 9;
  const rotated = outline.map(([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)]);
  const path = helpers.fieldInfrastructure(rotated, triangles, { ...zero, pathWidthM: 0.5 }, () => 0);
  assert.ok(Math.abs(path[0].areaM2 - 50) < 1e-6);
  const bund = helpers.fieldInfrastructure(outline, triangles, { ...zero, bundWidthM: 0.4 }, () => 0);
  assert.equal(helpers.infrastructureAt(bund, 0.6, 10), null);
  assert.equal(helpers.infrastructureAt(bund, 0.6, 10, 0.3)?.id, 'bund');
});

test('extra boundary vertices do not rotate the long-axis path', () => {
  const ring = [[0, 0], [25, 0], [50, 0], [75, 0], [100, 0], [100, 50], [75, 50], [50, 50], [25, 50], [0, 50]];
  const fan = Array.from({ length: 8 }, (_, i) => [0, i + 1, i + 2]);
  const features = helpers.fieldInfrastructure(ring, fan, { ...zero, pathWidthM: 0.5 }, () => 0);
  assert.ok(Math.abs(features[0].areaM2 - 50) < 1e-6);
});

test('rendered bund follows rounded terrain while keeping physical area measurements', () => {
  const rounded = [[0, 1], [1, 0], [99, 0], [100, 1], [100, 49], [99, 50], [1, 50], [0, 49]];
  const fan = Array.from({ length: 6 }, (_, i) => [0, i + 1, i + 2]);
  const features = helpers.fieldInfrastructure(outline, triangles, { ...zero, bundWidthM: 0.4 }, () => 0, 0,
    { outline: rounded, triangles: fan });
  assert.equal(helpers.infrastructureAt(features, 0.1, 0.1), null);
  assert.equal(helpers.infrastructureAt(features, 0.6, 0.6)?.id, 'bund');
  assert.ok(Math.abs(features[0].areaM2 - 119.36) < 1e-6);
});

test('feature popover gives units, field share, saved truth and My field edit link', () => {
  assert.equal(typeof studio.infrastructureDetailHtml, 'function');
  state.lang = 'en';
  const feature = { id: 'drain', widthM: 0.1, lengthM: 99.2, areaM2: 9.92 };
  const html = studio.infrastructureDetailHtml(feature, 5000, true);
  for (const content of ['Drain', '0.1 m', '99.2 m', '9.92 m²', '0.245', '0.2%', 'Entered by farmer', 'Edit on My field', 'href="#field"']) assert.ok(html.includes(content), content);
  assert.match(studio.infrastructureDetailHtml(feature, 5000, false), /Scenario default/);
  assert.match(html, /illustrative|Illustrative/);
});

test('display widths reach six pixels where possible, cap at six times real width and preserve path scale', () => {
  assert.equal(typeof helpers.infrastructureDisplayWidth, 'function');
  assert.equal(helpers.infrastructureDisplayWidth(0.4, 12), 0.5);
  assert.ok(Math.abs(helpers.infrastructureDisplayWidth(0.1, 5) - 0.6) < 1e-12);
  assert.equal(helpers.infrastructureDisplayWidth(0.4, 30), 0.4);
  assert.equal(helpers.infrastructureDisplayWidth(0, 5), 0);
  const features = helpers.fieldInfrastructure(outline, triangles, { ...zero, bundWidthM: 0.4, drainWidthM: 0.1, pathWidthM: 0.5 }, () => 0, 2);
  assert.equal(features.find(f => f.id === 'bund').displayWidthM, 2);
  assert.ok(Math.abs(features.find(f => f.id === 'drain').displayWidthM - 0.6) < 1e-12);
  assert.equal(features.find(f => f.id === 'path').displayWidthM, 0.5);
  assert.ok(Math.abs(features.find(f => f.id === 'drain').areaM2 - 9.92) < 1e-6);
});

test('dimension anchors cross drawn widths and labels retain real metres', () => {
  assert.equal(typeof helpers.infrastructureMeasurementAnchors, 'function');
  for (const boundary of [outline, [...outline].reverse()]) {
    const features = helpers.fieldInfrastructure(boundary, triangles, { ...zero, bundWidthM: 0.4, drainWidthM: 0.1, pathWidthM: 0.5 }, () => 0, 0.6);
    const markers = helpers.infrastructureMeasurementAnchors(features, boundary);
    assert.equal(markers.length, 4);
    for (const [id, label, width] of [['bund', '0.4 m', 0.6], ['drain', '0.1 m', 0.6], ['path', '0.5 m', 0.5]]) {
      const marker = markers.find(m => m.id === id);
      assert.equal(marker.label, label);
      assert.ok(Math.abs(Math.hypot(marker.b[0] - marker.a[0], marker.b[1] - marker.a[1]) - width) < 1e-6);
      const midpoint = [(marker.a[0] + marker.b[0]) / 2, (marker.a[1] + marker.b[1]) / 2];
      assert.equal(helpers.infrastructureAt(features, ...midpoint)?.id, id);
    }
    assert.equal(markers.find(m => m.id === 'edge').label, '100 m');
  }
  assert.deepEqual(helpers.infrastructureMeasurementAnchors([], []), []);
});

test('recessed drain removes only its footprint from the terrain', () => {
  assert.equal(typeof helpers.terrainOutsideDrain, 'function');
  const features = helpers.fieldInfrastructure(outline, triangles, { ...zero, drainWidthM: 1 }, () => 0);
  const positions = triangles.flatMap(ids => ids.flatMap(i => [outline[i][0], 0, -outline[i][1]]));
  const cut = helpers.terrainOutsideDrain(positions, features, () => 0);
  let area = 0;
  for (let i = 0; i < cut.length; i += 9) {
    const poly = [[cut[i], -cut[i + 2]], [cut[i + 3], -cut[i + 5]], [cut[i + 6], -cut[i + 8]]];
    area += Math.abs(helpers.ringSignedArea(poly));
    const center = [poly.reduce((s, p) => s + p[0], 0) / 3, poly.reduce((s, p) => s + p[1], 0) / 3];
    assert.equal(helpers.infrastructureAt(features, ...center), null);
  }
  assert.ok(Math.abs(area - 4900) < 1e-6);
});

test('popover uses visible viewport intersection and anchors above bottom chips', () => {
  assert.equal(typeof studio.studioPopoverBounds, 'function');
  const bounds = studio.studioPopoverBounds({ left: 400, top: -100, width: 900, height: 900 },
    { width: 1366, height: 768 }, 100, false);
  assert.deepEqual(bounds, { left: 8, top: 108, right: 892, bottom: 860 });
  const placed = studio.clampStudioPopover({ anchorX: 150, anchorY: 850, width: 320, height: 330, bounds });
  assert.ok(placed.top + 330 <= 860);
  const phone = studio.studioPopoverBounds({ left: 0, top: 72, width: 412, height: 843 },
    { width: 412, height: 915 }, 64, true);
  assert.deepEqual(phone, { left: 8, top: 194.5, right: 404, bottom: 835 });
});

test('rotated dimensions stay perpendicular and narrow labels never round real widths to zero', () => {
  const angle = Math.PI / 7, rotate = ([x, y]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
  const boundary = outline.map(rotate);
  const features = helpers.fieldInfrastructure(boundary, triangles, { ...zero, bundWidthM: 0.0005, drainWidthM: 0.1, pathWidthM: 0.5 }, () => 0, 0.6);
  const markers = helpers.infrastructureMeasurementAnchors(features, boundary);
  assert.equal(markers.find(m => m.id === 'bund').label, '0.0005 m');
  const path = markers.find(m => m.id === 'path');
  const along = [Math.cos(angle), Math.sin(angle)];
  assert.ok(Math.abs((path.b[0] - path.a[0]) * along[0] + (path.b[1] - path.a[1]) * along[1]) < 1e-8);
  assert.equal(helpers.infrastructureMeasurementAnchors([], outline)[0].label, '100 m');
});

test('dimension anchors stay inside concave strips and disappear when no complete cross-section fits', () => {
  const concave = [[0, 0], [20, 0], [20, 8], [8, 8], [8, 20], [0, 20]];
  const fan = [[0, 1, 2], [0, 2, 3], [0, 3, 5], [3, 4, 5]];
  const features = helpers.fieldInfrastructure(concave, fan, { ...zero, bundWidthM: 0.4, drainWidthM: 0.1, pathWidthM: 0.5 }, () => 0, 0.6);
  const markers = helpers.infrastructureMeasurementAnchors(features, concave);
  for (const marker of markers.filter(m => m.id !== 'edge')) {
    for (const fraction of [0.1, 0.5, 0.9]) assert.equal(helpers.infrastructureAt(features,
      marker.a[0] + (marker.b[0] - marker.a[0]) * fraction,
      marker.a[1] + (marker.b[1] - marker.a[1]) * fraction)?.id, marker.id);
  }
  const empty = features.map(f => ({ ...f, polygons: [], polygonBounds: [] }));
  assert.deepEqual(helpers.infrastructureMeasurementAnchors(empty, concave).map(m => m.id), ['edge']);
});
