import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  outlineBounds,
  projectFramingBox,
  solveFramingMultiplier,
} from "../src/legacy/studio3d-helpers.js";

// STUDIO5P: closer default framing — the field block fills ~70–75 % of the
// canvas width on desktop and ~90 % on phone, while staying fully visible.

const fixture = JSON.parse(
  await readFile(new URL("fixtures/studio-data.json", import.meta.url), "utf8"),
);
const outline = fixture.field.outlineM;
const span = (() => {
  const b = outlineBounds(outline);
  return Math.max(b.width, b.height);
})();
const depth = Math.max(1.5, span / 6); // mirrors blockDepthM in studio3d.js
const VOX = 0.5 - 0.66; // desktop free-region view offset (fractions)
const VOY = 0.5 - 0.56;

function rotateOutline(ring, deg) {
  const b = outlineBounds(ring);
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return ring.map(([x, y]) => [
    b.cx + (x - b.cx) * c - (y - b.cy) * s,
    b.cy + (x - b.cx) * s + (y - b.cy) * c,
  ]);
}

test("projectFramingBox puts the look target at the view-offset centre", () => {
  const position = [10, 12, 40];
  const target = [0, -1, 0];
  const centred = projectFramingBox([target], { position, target });
  assert.ok(Math.abs(centred.minX) < 1e-9);
  assert.ok(Math.abs(centred.minY) < 1e-9);
  const shifted = projectFramingBox([target], {
    position, target, viewOffsetX: VOX, viewOffsetY: VOY,
  });
  assert.ok(Math.abs(shifted.minX - 0.32) < 1e-9, `target x ${shifted.minX} should sit at +0.32`);
  assert.ok(Math.abs(shifted.minY - -0.12) < 1e-9, `target y ${shifted.minY} should sit at −0.12`);
});

test("desktop framing fills ~70–75 % width and keeps the fixed view offset", () => {
  for (const aspect of [1.0, 1.33, 1.5, 1.78]) {
    const s = solveFramingMultiplier({
      outlineM: outline, depthM: depth, fovDeg: 38, aspect,
      elevationDeg: 14, yawDeg: 10, margin: 0.18,
      targetFrac: 0.72, viewOffsetX: VOX, viewOffsetY: VOY,
    });
    assert.equal(s.viewOffsetX, VOX, "desktop offset stays fixed");
    assert.equal(s.fits, true, `block fully visible at aspect ${aspect}`);
    assert.ok(
      s.widthFrac >= 0.68 && s.widthFrac <= 0.76,
      `aspect ${aspect}: width ${(s.widthFrac * 100).toFixed(1)} % outside 68–76 %`,
    );
    assert.ok(s.multiplier < 1, "closer than the old default");
  }
});

test("desktop framing stays fully visible for awkward field orientations", () => {
  for (const rot of [37, 90, 150]) {
    const s = solveFramingMultiplier({
      outlineM: rotateOutline(outline, rot), depthM: depth, fovDeg: 38, aspect: 1.5,
      elevationDeg: 14, yawDeg: 10, margin: 0.18,
      targetFrac: 0.72, viewOffsetX: VOX, viewOffsetY: VOY,
    });
    assert.equal(s.fits, true, `rotated ${rot}° stays fully visible`);
    assert.ok(s.widthFrac > 0.5, `rotated ${rot}° still zoomed in (${(s.widthFrac * 100).toFixed(1)} %)`);
  }
});

test("phone framing fills ~90 % width with a small bounded centre shift", () => {
  for (const aspect of [0.45, 0.55, 0.65, 0.75]) {
    const s = solveFramingMultiplier({
      outlineM: outline, depthM: depth, fovDeg: 38, aspect,
      elevationDeg: 14, yawDeg: 10, margin: 0.22,
      targetFrac: 0.9, centerX: true,
    });
    assert.equal(s.fits, true, `block fully visible at aspect ${aspect}`);
    assert.ok(
      s.widthFrac >= 0.87 && s.widthFrac <= 0.92,
      `aspect ${aspect}: width ${(s.widthFrac * 100).toFixed(1)} % outside 87–92 %`,
    );
    assert.ok(Math.abs(s.viewOffsetX) <= 0.1, `centre shift ${s.viewOffsetX} bounded`);
  }
});

test("phone framing stays fully visible for awkward field orientations", () => {
  for (const rot of [37, 90, 150]) {
    for (const aspect of [0.5, 0.7]) {
      const s = solveFramingMultiplier({
        outlineM: rotateOutline(outline, rot), depthM: depth, fovDeg: 38, aspect,
        elevationDeg: 14, yawDeg: 10, margin: 0.22,
        targetFrac: 0.9, centerX: true,
      });
      assert.equal(s.fits, true, `rotated ${rot}° at aspect ${aspect} stays fully visible`);
      assert.ok(s.widthFrac >= 0.8, `rotated ${rot}° fills ${(s.widthFrac * 100).toFixed(1)} %`);
    }
  }
});

test("framing solver falls back safely on degenerate outlines", () => {
  for (const bad of [null, [], [[0, 0]], [[0, 0], [1, 1]]]) {
    const s = solveFramingMultiplier({ outlineM: bad });
    assert.equal(s.multiplier, 1);
    assert.equal(s.fits, true);
  }
});
