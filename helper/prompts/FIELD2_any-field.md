# FIELD2 — Pick ANY field: village search, "start my field here", live NASA POWER data cached on the phone

## Goal
Today only 3 prepared sites work; a plot elsewhere can be measured but is a dead end. Let a farmer start a real field anywhere
in Bangladesh and get REAL data for it. Owner approved (9 Nov 2026): fetch NASA data live ONCE when online, then cache it in
localStorage so it works offline. Never show another site's numbers for a new field (that would be dummy data).

## Do
1. Village search: new `scripts/fetch-places.py` → `public/data/places-rangpur.json` from OSM Overpass (place=village|hamlet|town|
   suburb in Rangpur division bbox 88.0,25.0,89.95,26.7): {name, name_bn?, lat, lon, kind}, sorted, ≤ 400 KB, ODbL attribution.
   `searchResults()` in fields.js: also match places (case-insensitive, Bengali too); result = "Start a field here" at that point.
   Keep upazila/plot-code/coordinate search. Coordinates anywhere in Bangladesh (20.5–26.7 N, 88–92.7 E) → "Start a field here".
2. "Start a field here" also from: Locate me (after the map moves, a toast/button "Start my field here") and a long-press /
   "Pick on map" mode (tap once to choose the point). New field = {id:"custom-<timestamp>", name (village or "My field"),
   lat, lon, custom:true}, saved in state (localStorage) next to the 3 prepared fields; a small boundary square ~20 decimals
   centred on the point that the farmer then edits with the existing boundary editor. Field switcher lists custom fields too
   (with delete).
3. Data for a custom field: new `src/legacy/powerlive.js` — port `scripts/fetch-earth-data.py` logic to JS: POWER daily point API
   (community AG, time-standard UTC) for 2024 with the SAME parameter MAP incl. IMERG_PRECTOT, compute monthly summaries and
   FAO-56 ETo exactly as the Python does (`reference_et0`, `summarize`). Store {monthly, retrievedAt, requestUrls} per field in
   localStorage. Show a loading state, an error state with Retry, and "needs internet to fetch" when offline and not cached.
4. Climate tiles for custom fields use that data, truth labels with source + "fetched <date>". Sentinel-2/NDVI/low ground/
   tap-probe NDVI: show "Not prepared for this field" (empty state), High detail photo still works. Rotations/Water/Seasons
   that read `f.monthly` must work with the custom field's monthly (or show an empty state) — no crashes, no fake numbers.
5. Bilingual t(en,bn), 44 px targets, 360 px clean.

## Files in scope
src/legacy/fields.js, boundary.js, ui.js (state/field list only), app.js, new src/legacy/powerlive.js, scripts/fetch-places.py,
public/data/places-rangpur.json, docs/, tests/.

## Acceptance
`npm test` green + new tests: ETo/summary parity with the Python on a fixed POWER JSON fixture (commit a small fixture), search
finds a village and coordinates, custom field never reuses prepared-site monthly data, offline-without-cache shows the empty state.

## Out of scope
Live Sentinel-2/NDVI/DEM for custom fields, server code, the 3D landscape, net-area feature (separate card FIELD3).
