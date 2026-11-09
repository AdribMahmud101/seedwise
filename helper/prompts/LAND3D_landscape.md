# LAND3D — 3D landscape of the three pilot upazilas in #water (the demo "wow" visual)

## Goal
A beautiful, calm 3D landscape of Mithapukur + Pirganj + Gangachara: Teesta floodplain, chars, low basins and the higher
Barind ground, so a farmer/judge sees at a glance "where water goes". Visual quality is the top priority; UI must stay simple.

## Engine + data (offline-first)
- Vendor MapLibre GL JS v5 (latest 5.x from npm) into `public/assets/maplibre/` (js, css, LICENSE). Lazy-load ONLY when the panel
  scrolls into view (IntersectionObserver) — zero bytes on first page load.
- `scripts/build-landscape.py`: NASADEM 30 m (Planetary Computer; reuse access code from `git show 427991b:scripts/fetch-terrain.py`)
  for the union bbox of the 3 upazilas in `public/data/rangpur_upazilas.geojson` + 3 km buffer. Write Terrarium-encoded
  `public/landscape/dem/{z}/{x}/{y}.png` z8–12, plus pre-rendered colour tiles `public/landscape/color/{z}/{x}/{y}.webp`
  (hypsometric: deep green lowlands → olive → warm sand/tan high ground, blended with soft hillshade, light from NW). Smooth, no
  speckle (light Gaussian before shading). Budget: all landscape files ≤ 4 MB. Rivers: Teesta/Ghaghat etc. from OSM Overpass
  for the bbox → `public/data/landscape-rivers.geojson` (simplified, ODbL attribution).

## View (new src/legacy/landscape3d.js, hook into water.js, CSS in new app/landscape.css imported in app/layout.js)
- One panel near the top of #water: title "Your land in 3D" / "আপনার এলাকা ত্রিমাত্রিকে", one-line subtitle
  "Low green = where water collects · higher tan = drains first".
- Map: terrain exaggeration ~10×, pitch ~60°, sky + soft fog/haze, rivers in clear blue, the 3 upazila outlines as thin white lines,
  3 HTML pin labels (upazila names, bilingual) — no other labels, no clutter. One-time gentle 2 s fly-in on first show
  (skip if prefers-reduced-motion). No auto-rotate.
- Controls (max 2, 44 px): segmented "Height colours | Photo" (Photo = Esri World Imagery, online only, disabled offline with
  "needs internet"; same URL/attribution as fields.js) and a "Reset view" icon button. Gestures: drag rotate, pinch zoom.
- Always-visible small chip: "Height exaggerated 10× · NASADEM 30 m · includes trees" + truth label MODELED. Bilingual.
- Legend: one thin gradient bar "Lower ← → Higher" (no numbers needed).
- Fallbacks: no WebGL → static message + nothing broken. Panel height 4:3 on phones, 16:9 desktop.

## Rules
Bilingual t(en,bn); 44 px targets; no text < 12 px; 360 px no horizontal scroll; service worker must not cache Esri tiles.

## Acceptance
`npm test` green + new `tests/landscape.test.mjs` (files exist, size budget, maplibre not imported on initial load path).
## Out of scope
fields.js, field map, other routes, removing existing Water content.
