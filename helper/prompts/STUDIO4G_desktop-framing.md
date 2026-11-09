# STUDIO4G · Desktop framing (simple, numeric)

Context: on a 1280 px desktop the studio canvas is ~640×560 px. Default "3D field" view makes the block too big: it covers the end of the hint text (top-left stack ends at y≈50 % of canvas) and its lower-left edge sits under the bottom-left "Terrain height" card (x 0–40 %, y 70–100 %). A previous attempt (STUDIO4F, reverted) measured overlay rects and moved the block LEFT under the panels — wrong.

Do in `fitPerspective()` in `src/legacy/studio3d.js` only, when NOT `isPhone()` and not close/top view:
1. Multiply the fitted camera distance by ~1.3 (block ≈ 50 % of canvas width).
2. Use `camera.setViewOffset` (or equivalent) so the block centre lands at ≈ (62 %, 66 %) of the canvas — right of and below the panels. Clear the view offset for phone, Close-up and Top view. Recompute on resize.
Phone framing (≤ 480 px canvas) must stay exactly as now.

Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test`; `npm run build`. Never delete/edit package-lock.json or node_modules. Commit.
