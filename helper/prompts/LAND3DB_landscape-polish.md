# LAND3D-B — polish the 3D landscape (review fixes for LAND3D)

Owner rule: visual quality matters most, UI simple. Review found (screenshots at 1280 and 360 px):
1. EDGES: at the start view the camera sees past the DEM: tan streaks smeared to the horizon and a black void top-left.
   Fix: add MapLibre `sky` (soft pale-blue → horizon haze, fog blending into it, so the far distance fades, never black);
   give both raster sources `bounds` = data bbox and `minzoom/maxzoom` that exist on disk (no 404s — currently z8 dem and z9 colour
   tiles at the edges 404); set `maxBounds` so you cannot pan off the data; limit `maxPitch` to ~65; choose the start camera
   (centre/zoom/pitch/bearing) so that at 1280×800 AND 360×780 no edge of the data is visible. If needed, extend the DEM buffer
   to ~15 km in build-landscape.py so edges are far away and hidden by fog.
2. COLOURS: too uniform green. Stretch the hypsometric ramp to the 2nd–98th percentile of the region; lowlands cool deep green /
   teal-green, mid olive, high ground warm sand; keep soft NW hillshade. Rivers must stand out (clear blue, slightly glowing).
3. RIVERS: too many small channels → keep only OSM `waterway=river` with names (Teesta, Ghaghat, Karatoya, Jamuneshwari, etc.),
   width 2–3 px, no streams/canals/drains.
4. OUTLINES: upazila borders are noisy dashes → solid white 1.5 px at 70 % opacity with a faint dark casing.
5. PANEL: use the app's standard `panel(title, body, tag)` from ui.js like every other section (proper padding, heading style);
   subtitle as `.note`. Replace the custom blue "MODELED" badge with `truth("MODELED")` from ui.js.
6. Pins: use the app font; keep EN + BN names.
7. No 404s and no console errors when the panel loads (check with the browser network tab or a headless run).
Acceptance: `npm test` green; landscape files ≤ 4 MB. Files: src/legacy/landscape3d.js, src/legacy/water.js, app/landscape.css,
scripts/build-landscape.py, public/landscape/, public/data/landscape-rivers.geojson, tests/landscape.test.mjs.
Out of scope: fields.js, low-ground files.
