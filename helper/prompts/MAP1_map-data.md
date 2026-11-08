# MAP1 · Offline map data: sharp Sentinel-2 tiles, greenness, context lines

## Goal
The field map is one 2.2 km JPG stretched to zoom 19, so it is blurry and empty around the field. Build offline map data so the map is sharp and has context. Rules: `spec/17-open-data-access.md` (§4 Planetary Computer, "Rules for anyone adding a data call"), `spec/14` D-Q4 (offline), D-C5 (provenance).

## Do
1. `scripts/fetch-map-tiles.py`: render XYZ PNG tiles from Planetary Computer (no login), using the data API tile endpoint, into `public/tiles/<layer>/<date>/{z}/{x}/{y}.png`:
   - layers: `natural` (Sentinel-2 L2A true colour) and `ndvi` (`(B08-B04)/(B08+B04)`, a fixed colour ramp, the same rescale for all dates)
   - dates: up to 4 clear 2024 scenes per site (low `eo:cloud_cover`, spread across seasons); keep the scene ID
   - extent: a 6 km box around each of the 3 sites, zoom 12–17; plus a Rangpur overview at zoom 9–12
   - total size of `public/tiles/` ≤ 30 MB (report the actual size)
2. `public/data/map-layers.json` (manifest): for each layer and date → path template, minZoom/maxZoom, bounds, sceneId, cloud %, resolution 10 m, source, the request URL pattern, provenance `REMOTE_OBSERVED`.
3. `public/data/ndvi-grid.json`: for each site and date, a coarse NDVI value grid (10 m or 20 m cells, nulls where cloud or no data) so the map can show a number on tap. Missing → null, never 0.
4. `public/data/context-osm.geojson`: roads, waterways, rivers and village/place names inside the 3 site boxes from the OpenStreetMap Overpass API. Add the ODbL attribution to `docs/credits.md`.
5. Python deps: use a throwaway `uv venv` outside the repo if needed. Don't commit the venv or any keys.

## Files in scope
`scripts/fetch-map-tiles.py`, `public/tiles/**`, `public/data/map-layers.json`, `public/data/ndvi-grid.json`, `public/data/context-osm.geojson`, `docs/credits.md`, `data-raw/` (raw responses only if small).

## Out of scope
App UI code (`src/legacy/*.js`, CSS): another card wires it in. No online tile URLs in the app.

## Acceptance
- `python3 scripts/fetch-map-tiles.py` re-runs without errors (it may skip existing tiles)
- `du -sh public/tiles` ≤ 30M; the manifest parses and every listed tile path exists for at least one z/x/y
- `npm test && npm run build` exit 0
- `git add -A && git commit -m "MAP1: offline Sentinel-2 tiles, NDVI grid, OSM context"`
