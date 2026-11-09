# LOW1 — "Low ground" layer on the #field map (2D, calm, optional)

## Goal
Show farmers where land sits LOWER than its surroundings (water may collect after heavy rain), as a soft blue tint over the
High-detail photo. Owner rule: visual quality matters, UI must stay uncluttered and obvious.

## Data (script, run it, commit outputs)
- New `scripts/fetch-low-ground.py`: for each site in `public/data/map-layers.json` (`sites[].bounds`), get NASADEM 30 m from
  Planetary Computer (recover the working access code from `git show 427991b:scripts/fetch-terrain.py`; request ~200x200 px).
- Relative elevation = elev − median of a ~1 km window; Gaussian-smooth (sigma ~1.5 cells). Low = rel < −1.0 m.
- Write `public/overlays/low-ground-<site>.png` (RGBA, soft blue #2f6fb5, alpha 0 at −1 m → 0.55 at ≤ −4 m, feathered edges, no hard pixels)
  and `public/data/low-ground.json` {sites:[{id,bounds,png,stats}], source, method, caveat}. Total ≤ 300 KB.

## UI (src/legacy/fields.js + new app/lowground.css imported in app/layout.js)
- ONE new toggle button next to "Context lines": "Low ground" / "নিচু জমি", off by default, same button style.
- On: L.imageOverlay with smooth scaling (`image-rendering:auto`), opacity tied to nothing else, drawn above imagery, below boundary.
- Legend row (only while on) under the map: blue swatch + "Lower than land around it — water may collect after heavy rain.
  Approximate (30 m, includes trees)" + truth label MODELED. Bilingual.
- Tap-to-inspect card: add one line "Ground: lower than surroundings / about level / higher" from the same grid.
- Works over all three imagery layers; hidden automatically if site has no overlay.

## Rules
Bilingual t(en,bn); 44 px targets; no text < 12 px; 360 px no horizontal scroll; no new dependency; offline (files are local).

## Acceptance
`npm test` green + new `tests/low-ground.test.mjs` (json schema, 3 PNGs exist, total size ≤ 300 KB, legend only when on).
## Out of scope
water.js, 3D anything, other routes, map engine changes.
