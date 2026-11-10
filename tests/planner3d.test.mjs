import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { plannerRowLayout, pointInPolygon, idleFloatOffset } from '../src/legacy/planner3d-helpers.js';

const rectangle = [[-50, -30], [50, -30], [50, 30], [-50, 30]];

test('row spacing reduces row count; plant spacing reduces positions within rows', () => {
  const dense = plannerRowLayout(rectangle, 20, 20);
  const wideRows = plannerRowLayout(rectangle, 60, 20);
  const widePlants = plannerRowLayout(rectangle, 20, 60);
  assert.ok(dense.rowCount > wideRows.rowCount);
  assert.ok(dense.positions.length > widePlants.positions.length);
  assert.equal(dense.spacingY, widePlants.spacingY);
  assert.equal(dense.spacingX, wideRows.spacingX);
  // Swapping field axes preserves counts and changes which coordinate holds rows.
  const vertical = plannerRowLayout(rectangle.map(([x, y]) => [y, x]), 20, 20);
  assert.equal(vertical.rowCount, dense.rowCount);
  assert.equal(vertical.positions.length, dense.positions.length);
});

test('readable grid stays bounded, inside concave boundaries, and reserves usable area', () => {
  const concave = [[0, 0], [100, 0], [100, 30], [35, 30], [35, 80], [0, 80]];
  const dense = plannerRowLayout(concave, 2, 2);
  assert.ok(dense.positions.length > 0 && dense.positions.length < 4900);
  assert.ok(dense.positions.every(([x, y]) => pointInPolygon(x, y, concave)));
  const reserved = plannerRowLayout(concave, 2, 2, 50);
  assert.ok(reserved.positions.length < dense.positions.length);
  assert.deepEqual(plannerRowLayout([...concave].reverse(), 2, 2), dense);
});

test('invalid spacing and boundaries produce no planting grid', () => {
  for (const spacing of [0, -1, NaN, Infinity, 1]) {
    assert.equal(plannerRowLayout(rectangle, spacing, 20).rowCount, 0);
    assert.equal(plannerRowLayout(rectangle, 20, spacing).positions.length, 0);
  }
  for (const outline of [null, [], [[0, 0]], [[0, 0], [NaN, 1], [1, 0]]]) {
    assert.equal(plannerRowLayout(outline, 20, 20).positions.length, 0);
  }
  assert.equal(plannerRowLayout(rectangle, 20, 20, 0).positions.length, 0);
});

test('saved idle motion stops for reduced motion and dragging', () => {
  assert.notEqual(idleFloatOffset(1, 100).dy, 0);
  assert.deepEqual(idleFloatOffset(1, 100, false, true), { dy: 0, yaw: 0 });
  assert.deepEqual(idleFloatOffset(1, 100, true), { dy: 0, yaw: 0 });
});

test('Planner fork stays independent of current rotation studio and loads lazily', async () => {
  const planner = await readFile(new URL('../src/legacy/planner.js', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../src/legacy/planner3d.js', import.meta.url), 'utf8');
  assert.match(planner, /import\('\.\/planner3d\.js'\)/);
  assert.doesNotMatch(planner, /import\s+.+\s+from ['"].*planner3d\.js/);
  assert.doesNotMatch(renderer, /from ['"].*(?:studio3d|rotations)\.js/);
});
