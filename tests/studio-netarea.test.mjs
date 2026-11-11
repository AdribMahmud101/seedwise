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
  assert.equal(drain.displayWidthM, 1);
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
