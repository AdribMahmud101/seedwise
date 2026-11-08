# MAP4C · Make the 3D view honest and readable (no fake mountains)

## Problem (supervisor screenshot of merged MAP4B, 1280 px)
The 6 km Mithapukur box renders as jagged **mountains**: NASADEM is a surface model (trees and houses), and 2.5× exaggeration of a noisy 128² grid looks like hills on a flat floodplain. The field outline is a tiny speck. "Possible water collects here" shading is scattered over the whole area, so it means nothing.

## Do (in `src/legacy/terrain3d.js` only, plus its test)
1. **Smooth before display:** apply a documented smoothing (e.g. a 5×5 mean or Gaussian) to the height grid, and keep exaggeration at **2.5×** with the existing label. Add a line to the chip: "Smoothed surface model".
2. **Frame the field:** crop the mesh to about **1.5 km around the field centre** (from the existing field polygon) and fit the camera so the field fills ~1/3 of the view. Draw the field outline thicker (≥ 3 px look), lifted slightly above the surface, in the existing outline colour.
3. **Meaningful low areas:** shade only cells in the **lowest 10 %** of the smoothed heights *inside the cropped area*, with the existing ◈ Estimated chip and the text "Lower ground — water may collect after heavy rain (check locally)".
4. Keep everything else: lazy load, WebGL fallback, Reset view, damping, no auto-spin, reduced-motion support, no CDN.
5. Test in `tests/views.test.mjs` (append a new `test(...)` block; don't edit others): the smoothing function reduces the max−min range of a noisy grid, and the low-area mask covers ≤ 10 % of the cells.

## Files in scope
`src/legacy/terrain3d.js`, `tests/views.test.mjs` (append only).

## Out of scope
`fields.js`, CSS files, data files.

## Acceptance
- `npm ci && npm test && npm run build` exit 0 (no `node_modules` symlink)
- `git add -A && git commit -m "MAP4C: smoothed, field-framed, honest 3D view"`
