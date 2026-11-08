# MAP3 · Map layers, date timeline and context lines

## Goal
Wire MAP1's offline data into MAP2's map in `#field`. Rules: `spec/15-ui-ux-spec.md` §5 §8 §9 §12, `spec/14` D-C5/D-C6/D-C7/D-Q4.

## Do
1. Read `public/data/map-layers.json` (manifest from MAP1). Add a Leaflet tile layer from `public/tiles/...` (local paths only, no online URLs).
2. **Layer switcher** (segmented control, 44 px): Natural colour · Greenness (NDVI) · Original 2024 photo (the existing image). One layer at a time, each with its own legend and chip: source · date · 10 m · ◈ Estimated.
3. **Date timeline:** buttons or a slider over the manifest dates for the chosen site; a cloudy or missing date → "No reliable observation", never blank or 0.
4. **Opacity** slider for the imagery (keeps the field outline readable).
5. **Context lines** from `public/data/context-osm.geojson`: roads, rivers, village names in muted styling; toggle on/off; attribution "© OpenStreetMap contributors (ODbL)".
6. **Tap to inspect** (from MAP2): add the NDVI value for the tapped spot and date from `public/data/ndvi-grid.json`, with label, date and cell size; null → "No reliable observation".
7. Rangpur overview tiles show when zoomed out.

## Files in scope
`src/legacy/fields.js`, `app/style.css`, `tests/views.test.mjs`, `docs/ui-audit.md`.

## Out of scope
New data downloads, 3D (card MAP4), new libraries/CDNs/fonts/colours.

## Acceptance
- `npm test && npm run build` exit 0; a test that a null NDVI renders "No reliable observation"
- at 360 px and 1280 px, `#field`: no horizontal scroll, controls ≥ 44 px, legend not covered
- the built `out/` makes no request to any non-local tile host (grep the build for `http` tile URLs)
- `git add -A && git commit -m "MAP3: layers, date timeline, OSM context, NDVI probe"`
