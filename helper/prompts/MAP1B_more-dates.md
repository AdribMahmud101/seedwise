# MAP1B · More seasons in the map tiles (same size budget)

## Goal
MAP1 (merged) shipped only **1 date** (2024-03-09) because zoom 17 used most of the 30 MB. 10 m imagery gains nothing past ~z16 (the map caps there), so trade z17 for more seasons, so the date timeline (MAP3) is useful.

## Do
1. In `scripts/fetch-map-tiles.py`: site tiles **z12–16** (drop z17); keep the overview z9–12.
2. Delete the existing `public/tiles/*/*/17/` folders.
3. Add up to **3 more clear 2024 Sentinel-2 dates**, one per season where possible: dry/Rabi (Jan–Feb), pre-monsoon (Apr–May), Aman (Oct–Nov). Keep 2024-03-09. Use the same lowest-cloud rule (≤ 15 %) and record the scene ID and cloud % per date. If a season has no clear scene, say so in the manifest (`"skipped": "no scene ≤15 % cloud"`); never fake one.
4. Regenerate `public/data/map-layers.json` (same schema) and `public/data/ndvi-grid.json` for every shipped date (null where cloud or no data).
5. Total `public/tiles` ≤ 30 MB (report the size per date).

## Files in scope
`scripts/fetch-map-tiles.py`, `public/tiles/**`, `public/data/map-layers.json`, `public/data/ndvi-grid.json`.

## Out of scope
UI code, OSM context, terrain.

## Acceptance
- `du -sh public/tiles` ≤ 30M; no `/17/` folder left
- the manifest lists ≥ 2 dates per layer (or explains each skipped season); each date's tiles exist at z12 and z16 for every site
- `npm test && npm run build` exit 0
- `git add -A && git commit -m "MAP1B: seasonal Sentinel-2 dates, z12-16"`
