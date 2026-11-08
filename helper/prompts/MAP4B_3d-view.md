# MAP4B · 2D / 3D switch with terrain in My field

## Goal
Add an optional 3D view of the field area in `#field`, per `spec/15-ui-ux-spec.md` §8 (binding) and `spec/14` D-C4.

## Do
1. Vendor three.js + OrbitControls into `public/assets/three/` (exact version, licence file). **Load it only when the user taps 3D** (dynamic import); the first page load is unchanged.
2. `2D map │ 3D view` segmented control (44 px). 2D is the default; if WebGL is missing, the 3D button explains and stays in 2D.
3. Mesh from `public/terrain/<site>.json` (MAP4A), draped with the selected MAP3 layer/date tiles; vertical exaggeration fixed at 2.5× with the label "Height exaggerated 2.5×".
4. Always-visible chip: "Real satellite + illustrative 3D — heights include trees and houses — check locally" (tag SCENARIO geometry).
5. Field outline drawn on the surface; low areas shaded as "Possible water collects here" with ◈ Estimated.
6. Controls: drag rotate, pinch zoom, **Reset view** (44 px), damping on, no auto-spin; `prefers-reduced-motion` → no fly-in. Render only on interaction; pause when hidden; mesh ≤ 128×128.

## Files in scope
`src/legacy/fields.js` (or a new `src/legacy/terrain3d.js`), `public/assets/three/**`, `app/style.css`, `tests/views.test.mjs`, `docs/credits.md`, `docs/ui-audit.md`.

## Out of scope
New data downloads, other routes, CDN loading, new colours/fonts.

## Acceptance
- `npm test && npm run build` exit 0; a test that without WebGL the view stays 2D with a message
- the first load of `#field` does not fetch three.js (check the network or build chunks)
- at 360 px: no horizontal scroll, controls ≥ 44 px
- `git add -A && git commit -m "MAP4B: optional 3D terrain view in My field"`
