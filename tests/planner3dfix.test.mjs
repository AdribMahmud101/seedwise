import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { computeFieldFraming, outlineBounds, plannerRowLayout } from '../src/legacy/planner3d-helpers.js';

const outline = [[-50, -30], [50, -30], [50, 30], [-50, 30]];

test('overview samples actual planting rows and reports its display scale', () => {
  const layout = plannerRowLayout(outline, 20, 25);
  assert.ok(layout.displayScale > 1);
  assert.ok(layout.positions.length < 300, 'individual clumps remain readable on a phone');
  assert.equal(layout.spacingY, 0.2 * layout.rowStep);
  assert.equal(layout.spacingX, 0.25 * layout.plantStep);
  for (const [x, y] of layout.positions) {
    assert.ok(Math.abs((x + 50 - 0.125) / 0.25 - Math.round((x + 50 - 0.125) / 0.25)) < 1e-7);
    assert.ok(Math.abs((y + 30 - 0.1) / 0.2 - Math.round((y + 30 - 0.1) / 0.2)) < 1e-7);
  }
});

test('perspective fit contains the full block and canopy throughout idle sway at both canvas aspects', () => {
  for (const [width, height] of [[100, 60], [30, 110], [120, 20]]) {
    const bounds = outlineBounds([[0, 0], [width, 0], [width, height], [0, height]]);
    for (const aspect of [0.94, 1.6, 2.4]) {
      const fit = computeFieldFraming({ bounds, aspect, depthM: 20, topM: 9, elevationDeg: 36, yawDeg: 24, targetWidthRatio: 0.86 });
      for (const yawDeg of [19, 24, 29]) {
        const el = 36 * Math.PI / 180, yaw = yawDeg * Math.PI / 180;
        const distance = fit.distance * 0.99;
        const camera = new PerspectiveCamera(38, aspect, 0.1, 10000);
        camera.position.set(fit.target[0] + Math.cos(el) * Math.sin(yaw) * distance,
          fit.target[1] + Math.sin(el) * distance, fit.target[2] + Math.cos(el) * Math.cos(yaw) * distance);
        camera.lookAt(...fit.target);
        camera.updateMatrixWorld();
        for (const x of [0, width]) for (const y of [-20, 9]) for (const z of [-height, 0]) {
          const p = new Vector3(x, y, z).project(camera);
          assert.ok(Math.abs(p.x) < 0.95 && Math.abs(p.y) < 0.95,
            `cropped ${width}×${height}, aspect ${aspect}, yaw ${yawDeg}: ${p.toArray()}`);
        }
      }
    }
  }
});

test('thin fields still draw representative plants on actual grid coordinates', () => {
  for (const ring of [[[0, 0], [100, 0], [100, 1], [0, 1]], [[0, 0], [1, 0], [1, 100], [0, 100]]]) {
    const layout = plannerRowLayout(ring, 20, 25);
    assert.ok(layout.positions.length > 0, 'a narrow field must not lose every sampled row');
    assert.ok(layout.positions.every(([x, y]) => x > 0 && y > 0));
  }
});
