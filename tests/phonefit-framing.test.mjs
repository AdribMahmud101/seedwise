import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  outlineBounds,
  fitCameraToBlock,
  projectFramingBox,
  solveFramingMultiplier,
  IDLE_SWAY_AMPLITUDE_DEG,
} from '../src/legacy/studio3d-helpers.js';

// PHONEFIT: phone field block fills ~85 % of the stage width and the block +
// leader-label row centre together in the free area below the top bar.
// Desktop/laptop (medium + wide) framing must not change.

// Live fixture outline; depth mirrors blockDepthM() in studio3d.js.
const fixture = JSON.parse(
  await readFile(new URL('fixtures/studio-data.json', import.meta.url), 'utf8'),
);
const outline = fixture.field.outlineM;
const span = (() => { const b = outlineBounds(outline); return Math.max(b.width, b.height); })();
const depth = Math.max(1.5, span / 6);
const topM = 1.5; // topMax + canopy slack, phone portrait
const bottomM = -depth - depth * 0.02;

const studioSrc = await readFile(new URL('../src/legacy/studio3d.js', import.meta.url), 'utf8');

function rotateOutline(ring, deg) {
  const b = outlineBounds(ring);
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r), s = Math.sin(r);
  return ring.map(([x, y]) => [
    b.cx + (x - b.cx) * c - (y - b.cy) * s,
    b.cy + (x - b.cx) * s + (y - b.cy) * c,
  ]);
}

// Resting phone portrait geometry, measured live at 412x915 (stage 378x843,
// top bar bottom 62): the free region reserves the 28px label pills + 20px
// leader gap below the block so block + label row centre in the free area.
const STAGE_W = 378, STAGE_H = 843, OVERLAY_BOTTOM = 62;
const LABEL_ALLOW = 48; // 28px pills + 20px gap
const LABEL_BELOW_RING = 41; // measured: pins bottom minus ring bottom
const phoneRegion = () => ({
  left: 0.03, right: 0.97,
  top: (OVERLAY_BOTTOM + 16) / STAGE_H,
  bottom: (STAGE_H - 16 - LABEL_ALLOW) / STAGE_H,
});
const phoneOpts = (outlineM) => ({
  outlineM, depthM: depth, fovDeg: 38, aspect: STAGE_W / STAGE_H,
  elevationDeg: 14, yawDeg: 10, margin: 0.22, targetFrac: 0.92,
  region: phoneRegion(), topM, bottomM, swayDeg: 7, maxMult: 8,
});

function restingBox(outlineM, solved, fit) {
  const distance = fit.distance * solved.multiplier * 0.99;
  const el = (14 * Math.PI) / 180, a = (10 * Math.PI) / 180;
  const target = [fit.target[0], -depth * 0.45, fit.target[2]];
  const position = [target[0] + Math.cos(el) * Math.sin(a) * distance,
    target[1] + Math.sin(el) * distance, target[2] + Math.cos(el) * Math.cos(a) * distance];
  const corners = outlineM.flatMap(([x, y]) => [[x, topM, -y], [x, bottomM, -y]]);
  return projectFramingBox(corners, {
    position, target, fovDeg: 38, aspect: STAGE_W / STAGE_H,
    viewOffsetX: solved.viewOffsetX, viewOffsetY: solved.viewOffsetY,
  });
}

test('phone solver fills ~85% stage width with the label row centred in the free area', () => {
  for (const rot of [0, 37, 90]) {
    const ring = rot ? rotateOutline(outline, rot) : outline;
    const solved = solveFramingMultiplier(phoneOpts(ring));
    assert.equal(solved.fits, true, `rot ${rot}: sway envelope fits the free region`);
    assert.ok(Math.abs(solved.widthFrac - 0.92) < 0.006,
      `rot ${rot}: envelope ${(solved.widthFrac * 100).toFixed(1)}% should sit at ~92%`);
    const fit = fitCameraToBlock({ ...phoneOpts(ring) });
    const box = restingBox(ring, solved, fit);
    // Envelope is the controlled quantity (92%); resting varies with outline
    // orientation vs sway direction, ~85% for the live field shape.
    if (rot === 0) {
      assert.ok(box.widthFrac >= 0.83 && box.widthFrac <= 0.87,
        `resting width ${(box.widthFrac * 100).toFixed(1)}% outside 83-87%`);
    } else {
      assert.ok(box.widthFrac >= 0.8,
        `rot ${rot}: resting width ${(box.widthFrac * 100).toFixed(1)}% below the 80% floor`);
    }
    // Block + label row together, centred between top bar and stage bottom.
    const top = ((1 - box.maxY) / 2) * STAGE_H;
    const bottom = ((1 - box.minY) / 2) * STAGE_H + LABEL_BELOW_RING;
    const topMargin = top - OVERLAY_BOTTOM, botMargin = STAGE_H - bottom;
    assert.ok(topMargin > 0 && botMargin > 0, `rot ${rot}: combined block stays in the free area`);
    assert.ok(Math.min(topMargin, botMargin) / Math.max(topMargin, botMargin) >= 0.85,
      `rot ${rot}: margins ${topMargin.toFixed(0)}/${botMargin.toFixed(0)} outside 15%`);
  }
});

test('phone fit reserves the label row below the block (canvas width < 600 only)', () => {
  // Narrow free region keeps the pills inside the stage instead of recentring
  // the block alone.
  assert.match(studioSrc, /if \(w < 600\) \{[^}]*labelAllow/s);
  assert.match(studioSrc, /targetFrac: phone \? 0\.90/);
});

test('desktop/laptop framing parameters and base view', () => {
  assert.match(studioSrc, /: compact \? 0\.76 : 0\.62/);
  assert.match(studioSrc, /isPhone\(\) \? 0\.12 : 0\.10/);
  assert.match(studioSrc, /swayDeg: 2\.5/);
  assert.ok(IDLE_SWAY_AMPLITUDE_DEG <= 2.5, 'subtle idle sway <= 2.5°');
  // Intro ends at the fitted frame: it starts from fitPerspective and eases to
  // that fit's distance/target.
  assert.match(studioSrc, /const fit = fitPerspective\(currentData, isCloseView\)/);
  assert.match(studioSrc, /finalDistance: fit\.distance/);
  assert.match(studioSrc, /finalTarget: fit\.target/);
});

test('medium/laptop solver baseline is unchanged (1366x768 in-page stage)', () => {
  // In-page stage at 1366x768 measures 735x464 (overlaySize medium -> compact
  // branch, targetFrac 0.78). Representative compact region; the exact live
  // camera distance (55.030) is asserted before/after in the Playwright log.
  const solved = solveFramingMultiplier({
    outlineM: outline, depthM: depth, fovDeg: 38, aspect: 735.375 / 464.547,
    elevationDeg: 14, yawDeg: 10, margin: 0.18, targetFrac: 0.78,
    region: { left: 0.015, right: 0.9, top: 0.1, bottom: 0.95 },
    topM, bottomM, swayDeg: 7, maxMult: 8,
  });
  assert.equal(solved.fits, true);
  assert.equal(solved.multiplier, 0.6326617401675321);
  assert.equal(solved.widthFrac, 0.7799999970407085);
});
