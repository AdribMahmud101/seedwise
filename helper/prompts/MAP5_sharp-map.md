# MAP5 — Sharp field map: online high-detail imagery, remove 3D terrain

## Goal
Owner feedback: the #field map is blurry (Sentinel-2 = 10 m/pixel, a plot is 2-4 pixels) and the 3D terrain is meaningless
(30 m DEM on a flat floodplain). Make the map sharp and useful; remove what does not help a farmer.
Spec change approved by owner 9 Nov 2026: an ONLINE imagery layer is allowed (relaxes D-Q4); app must still work offline.

## Do
1. REMOVE 3D terrain completely: `src/legacy/terrain3d.js`, `public/assets/three/`, `public/terrain/`, `scripts/fetch-terrain.py`,
   the 2D/3D switch, 3D chips/legend/reset button/hint, `.hidden-2d/.hidden-3d/.field-3d-container/.terrain-*` CSS, 3D tests,
   any three.js preload in `app/layout.js`. Do NOT touch the planner's "planting density" preview in `planner.js`.
2. REMOVE the "Original 2024 photo" layer mode and its code path.
3. ADD layer "High detail" (default when `navigator.onLine`):
   `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxNativeZoom 19, maxZoom 19.
   Attribution: `Imagery © Esri, Maxar, Earthstar Geographics`. Chip text: "High-detail photo · Esri · date varies · online".
   Truth label REMOTE_OBSERVED. Network only: the service worker must NOT cache these tiles (Esri terms).
   If offline, or >=3 tile errors, switch to "Natural colour 10 m" automatically with a bilingual toast
   ("No internet — showing offline 10 m satellite map").
4. Layer switcher becomes 3 buttons: High detail (online) · Natural colour 10 m (offline) · Greenness NDVI (offline).
   Observation-date timeline shows only for the two Sentinel-2 layers. High detail button disabled + "needs internet" when offline.
5. NDVI on top of photo: when NDVI is selected and online, draw High detail underneath and NDVI over it; the opacity slider
   controls NDVI (default 0.6). Offline: NDVI over nothing, as now.
6. Zoom: Sentinel-2 layers maxZoom 16 (stop the blocky over-zoom). Map maxZoom 19 when High detail is the base.
   Fit the field boundary with maxZoom 18 when online, 16 offline.
7. All new strings bilingual `t(en,bn)`; keep 44 px targets, 16 px body, no text < 12 px; works at 360 px wide.

## Files in scope
src/legacy/fields.js, boundary.js, app.js (service worker rules only), app/style.css, app/layout.js, public/data/map-layers.json,
tests/*.test.mjs, scripts/fetch-terrain.py (delete), public/terrain/, public/assets/three/, docs/ mentions of 3D terrain.

## Acceptance (must pass)
`npm test` all green; `grep -rniE "terrain3d|three\.module|field-3d|Original 2024 photo" src app tests public/data` → nothing;
add a test asserting the layer list is [high-detail, natural, ndvi] and that Esri tiles are excluded from SW caching.

## Out of scope
New data downloads, planner.js, other routes, changing the boundary editor behaviour.
