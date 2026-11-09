# LOW1B — make the Low ground layer actually visible (review fixes for LOW1)

Owner reviewed screenshots: the blue tint is too faint to notice over the High-detail photo; visuals matter.
1. Regenerate `public/overlays/low-ground-*.png` via `scripts/fetch-low-ground.py`: colour #1f6fd1, alpha ramp 0.25 at −1 m → 0.75 at ≤ −3 m,
   keep feathered edges (blur alpha ~1 cell), add a thin lighter rim (alpha +0.1) at the −1 m contour so patches read as shapes.
   Keep total ≤ 300 KB.
2. Overlay: CSS `mix-blend-mode: multiply` is NOT allowed (kills colour on dark photo) — use normal blend; overlay opacity 1.
3. "Low ground" button gets the same leading icon pattern as "Context lines" (a water-drop style icon from ui.js icon set; add
   one tiny SVG to the set only if none fits) and shows active state like the others.
4. Legend swatch matches the new colour.
Acceptance: `npm test` green (update tests if thresholds change). Files: scripts/fetch-low-ground.py, public/overlays/,
public/data/low-ground.json, src/legacy/fields.js, app/lowground.css, src/legacy/ui.js (icon only), tests/low-ground.test.mjs.
Out of scope: water.js, landscape files.
