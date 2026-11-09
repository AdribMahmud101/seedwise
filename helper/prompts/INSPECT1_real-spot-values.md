# INSPECT1 · Tap-to-inspect: real per-spot values, honest area values

## Goal
The #field tap popup shows the same wetness/rain/temp everywhere (one POWER/IMERG value per site) and a wrong
"Observation date 28 Nov 2022 (Maxar)" (no value comes from that photo). Make the popup show real values that change
per tap, and label area values with their scale.

## Work
1. **Moisture grid (NDMI).** Reuse `scripts/fetch-map-tiles.py` helpers (same Planetary Computer data API, same scene
   item ids, dates, transform, width/height as each entry in `public/data/ndvi-grid.json`). NDMI = (B8A−B11)/(B8A+B11)
   on offset-corrected BOA reflectance, same SCL 4/5/6 mask, 20 m. Write `public/data/moisture-grid.json` with the
   same schema as ndvi-grid grids plus `"index": "NDMI"`; values rounded to 3 decimals; file ≤ 2 MB. Add a
   `--self-check` assert for the expression and a validate step: shape/transform equal to the matching NDVI grid.
   Run it for real so the JSON is committed.
2. **Popup** (`src/legacy/fields.js`, prepared-site branch near "Tap to inspect", and the custom-field branch):
   - Group **"At this spot"** (BN "এই জায়গায়"): Greenness NDVI with the grid date (e.g. "9 Nov 2024") and, when both
     dates exist, "Mar → Nov" values; Moisture NDMI with a word: < 0 Dry / 0–0.2 Moderate / > 0.2 Moist
     (BN শুকনো / মাঝারি / আর্দ্র), label "Plant & soil moisture (NDMI)"; Ground (existing low-ground).
     Reuse `queryNdvi` for the moisture grid (same lookup). Null → "No reliable observation".
   - Group **"Area weather · <Month> 2024"**: Rain (IMERG, ~10 km), Wetness index (POWER, ~50 km), Temp (POWER, ~50 km);
     scale in small text.
   - Remove the "Cell size" row and the Maxar "Observation date" row. Footer: "◈ Estimated · Sentinel-2 L2A ·
     NASA POWER · GPM IMERG". Custom fields: spot values say "Not prepared for this field", area weather from live POWER.
   - Fetch `moisture-grid.json` lazily on first tap; add it to the offline list in `scripts/prepare-offline.py`
     wherever ndvi-grid.json is listed.
   - Every label bilingual via `t(en, bn)`; text ≥ 12 px; popup must fit 360 px wide.
3. **Tests** in `tests/`: NDMI lookup on a small fixture grid; popup HTML contains "At this spot", has no "Maxar".

## Acceptance (must pass)
`npm test` · `python3 scripts/fetch-map-tiles.py --self-check` (or the new script's self-check) ·
`ls -l public/data/moisture-grid.json` ≤ 2 MB.

## Out of scope
Map layers, tiles, 3D, other views, ndvi-grid.json contents. Never print or commit any token/key.
