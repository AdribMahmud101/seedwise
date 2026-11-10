import test from 'node:test';
import assert from 'node:assert/strict';
import { studioOverlayBreakpoint, clampStudioPopover, studio3dHtml } from '../src/legacy/studio3d.js';
import { readFile } from 'node:fs/promises';
import { state } from '../src/legacy/ui.js';

test('overlay breakpoints follow canvas width at each boundary', () => {
  for (const [width, expected] of [[360, 'narrow'], [599.9, 'narrow'], [600, 'medium'],
    [650, 'medium'], [899.9, 'medium'], [900, 'wide'], [1000, 'wide']]) {
    assert.equal(studioOverlayBreakpoint(width), expected);
  }
});

test('full chrome requires both a 900 px wide and 640 px tall stage', () => {
  for (const [width, height, expected] of [
    [1000, 465, 'medium'], [1200, 639.9, 'medium'], [900, 640, 'wide'],
    [899.9, 820, 'medium'], [599.9, 820, 'narrow'], [600, 440, 'medium'],
    [1884, 640, 'wide'], [390, 772, 'narrow'],
  ]) assert.equal(studioOverlayBreakpoint(width, height), expected);
});

test('popover stays inside the canvas and below controls, including oversized content', () => {
  for (const canvasWidth of [360, 650, 1000]) {
    const bounds = { left: 8, top: 280, right: canvasWidth - 8, bottom: 552 };
    for (const anchorX of [-100, 22, canvasWidth / 2, canvasWidth - 22, canvasWidth + 100]) {
      for (const anchorY of [-50, 300, 540, 900]) {
        for (const [width, height] of [[220, 160], [320, 500], [1200, 800]]) {
          const placed = clampStudioPopover({ anchorX, anchorY, width, height, bounds });
          assert.ok(placed.left >= bounds.left);
          assert.ok(placed.top >= bounds.top);
          assert.ok(placed.left + placed.width <= bounds.right);
          assert.ok(placed.top + placed.height <= bounds.bottom);
        }
      }
    }
  }
  const bounds = { left: 8, top: 200, right: 992, bottom: 692 };
  assert.equal(clampStudioPopover({ anchorX: 100, anchorY: 400, width: 240, height: 160, bounds }).left, 130);
  assert.equal(clampStudioPopover({ anchorX: 900, anchorY: 400, width: 240, height: 160, bounds }).left, 630);
});

test('pins expose disclosure state and bilingual details remain outside the canvas', async () => {
  const fixture = JSON.parse(await readFile(new URL('fixtures/studio-data.json', import.meta.url)));
  try {
    for (const lang of ['en', 'bn']) {
      state.lang = lang;
      const html = studio3dHtml(fixture);
      assert.equal((html.match(/data-soil-pin=/g) || []).length, 6);
      assert.equal((html.match(/aria-expanded="false" aria-controls="studio-soil-popover"/g) || []).length, 6);
      assert.equal((html.match(/id="studio-soil-popover"/g) || []).length, 1);
      assert.ok(html.indexOf('class="studio-soil-layers"') > html.indexOf('class="studio-model-caption"'));
      assert.match(html, /role="tablist"/);
      assert.match(html, lang === 'en' ? /Cross-section A–A′/ : /আড়াআড়ি ছেদ A–A′/);
      assert.match(html, lang === 'en' ? /Soil layers/ : /মাটির স্তরসমূহ/);
      assert.match(html, lang === 'en' ? /Unknown — add local reading/ : /অজানা — স্থানীয় তথ্য দিন/);
    }
  } finally { state.lang = 'en'; }
});
