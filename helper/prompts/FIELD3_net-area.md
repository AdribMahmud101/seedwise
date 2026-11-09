# FIELD3 — "How much can be cultivated": net cultivable area (spec #1, F18 "koto tuku jaygay chash kora jabe")

## Goal
Show gross boundary area AND net cultivable area after bunds (aal), drains and paths, in the 5 local units, from farmer inputs.
## Do
- New `src/legacy/netarea.js`: `netArea(grossHa, perimeterM, {bundWidthM, drainWidthM, pathWidthM, otherDecimals})` — bund/drain
  strips along the perimeter (width × perimeter, clipped so net ≥ 0), path as an extra strip, other = deducted directly.
  Defaults: bund 0.3 m, drain 0, path 0, other 0 (editable examples, labelled FARMER_REPORTED once edited, SCENARIO as defaults).
- Plot dossier in `#field`: under "Boundary area" add "Cultivable area" with % of gross and the 5 units (reuse `units()` from
  boundary.js), plus a small "Edit" that opens a modal with the 4 inputs (bilingual, numeric validation, saved per field in state).
- Planner/rotations keep using gross area unless they already read a net value (do not change them).
- Bilingual, 44 px, 360 px clean. One short note: "An administrative boundary is not land-ownership documentation."
## Files in scope
new src/legacy/netarea.js, src/legacy/fields.js (dossier block + modal + action only), app/style.css (few lines), tests/netarea.test.mjs.
## Acceptance
`npm test` green; tests: 30 m × 30 m plot with 0.3 m bund ≈ 3.96 % loss; widths that exceed the plot give net 0, never negative.
## Out of scope
search, custom fields, map layers, SMAP.
