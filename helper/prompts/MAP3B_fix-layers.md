# MAP3B · Fix MAP3: tiles don't load, Leaflet crash, wrong timeline dates

## Start
Your branch starts from main. **First run `git merge --no-edit card/MAP3`** (MAP3's work, already merged with main and passing 28 tests). Then fix the bugs below. Same rules as `helper/prompts/MAP3_layers-timeline.md` and `spec/15-ui-ux-spec.md`.

## Bugs found by the supervisor (headless Chrome, built `out/`, `#field`, 1280 and 390 px)
1. **JS crash on load:** `TypeError: Cannot read properties of undefined (reading 'min')` at `leaflet.js` `intersects` ← `_clipPoints`. That's a polyline/polygon with empty or invalid coordinates, most likely from `public/data/context-osm.geojson` (empty LineStrings, nested arrays, or [lat,lon] order). Filter or repair features with fewer than 2 valid points before `L.geoJSON`, and make sure no other layer gets empty bounds.
2. **0 map tiles load** with any layer selected. The tile layer from `public/data/map-layers.json` must show tiles at the field's zoom (z12–16). Check the URL template (leading `/`, `{z}/{x}/{y}`), `bounds`, `minZoom`/`maxNativeZoom`/`maxZoom`, and that selecting "Natural colour" or "Greenness" actually adds the tile layer. Default to **Natural colour (Sentinel-2 tiles)** when tiles exist.
3. **Wrong timeline:** it shows 28 Jan, 9 Mar, 14 Jul, 18 Oct 2024 (the old Landsat optical-history dates). For Natural colour and Greenness, the dates must come from the manifest (**2024-03-09 and 2024-11-09**). Landsat dates belong only to "Original 2024 photo", if anywhere.

## Prove it
Add `tests/map-layers.test.mjs`: every manifest date has a tile at z12 and z16 on disk for each site, and the OSM loader drops features with fewer than 2 valid points (unit test on the filter function).

## Files in scope
`src/legacy/fields.js`, `app/style.css`, `tests/*.test.mjs`, `docs/ui-audit.md`. Data files only to remove invalid OSM features (don't re-download).

## Acceptance
- `npm ci && npm test && npm run build` exit 0 (no `node_modules` symlink)
- in a browser on the built `out/`: no page errors on `#field`; natural tiles visible; switching to Greenness shows NDVI tiles; the timeline shows 9 Mar 2024 and 9 Nov 2024
- `git add -A && git commit -m "MAP3B: fix tile loading, OSM crash, manifest timeline"`
