# MAP2 · Make the field map interactive, sharp and phone-friendly

## Goal
Upgrade the Leaflet map in `#field` (`src/legacy/fields.js` `mountMap` + `boundary.js`) so it feels like a good farm map app, using existing data. Rules: `spec/15-ui-ux-spec.md` (binding, especially §4, §5, §8, §9, §11, §12), `spec/14` D-C4/D-C5/D-C6.

## Do
1. **Sharpness:** stop zooming past where the imagery stays sharp. Set the max zoom from the image's real resolution (10 m Sentinel-2 ≈ z16, 30 m Landsat ≈ z15) and fit the field on load. No CSS pixelation tricks.
2. **Boundary editing:** draggable corner handles, add/remove a corner, undo, "Reset to demo outline". Show the area live in **shotok, bigha, katha, acre, ha** (spec 15 rule 7; use the existing area function and keep the shoelace method). Save as before.
3. **Tap to inspect:** tapping the map opens a small card: lat/lon, inside/outside the field, and the field's existing values with truth labels (◈ Estimated, the source and the date). No new data.
4. **Controls (44 px, labelled, keyboard reachable):** zoom, **Locate me** (browser geolocation; works offline; handle denial politely), **Full screen**, **Reset view**. Keep the scale bar.
5. **Look:** a cleaner overlay chip ("Sentinel-2 · 9 Mar 2024 · 10 m · ◈ Estimated"), a field outline with a soft halo, a legend that doesn't cover controls, and good behaviour at 360 px (spec 15 §11). Use existing tokens and classes only.
6. **Map styling only in** `app/style.css` (section for `.field-map` / `.leaflet-*`).

## Files in scope
`src/legacy/fields.js`, `src/legacy/boundary.js`, `app/style.css`. Add a test to `tests/views.test.mjs` for the area-unit conversion.

## Out of scope
New tiles, layers or timeline (card MAP3 after MAP1), 3D, new libraries/CDNs/fonts/colours, `public/` data files.

## Acceptance
- `npm test && npm run build` exit 0 (with a new test for area units)
- at 360 px and 1280 px, `#field`: no horizontal scroll; every map control ≥ 44×44 px
- spec 15 §12 checklist for the map pasted into `docs/ui-audit.md` (✅/❌ honestly)
- `git add -A && git commit -m "MAP2: interactive, sharp, phone-friendly field map"`
