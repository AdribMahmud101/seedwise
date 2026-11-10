# LEGENDS · Every 3D surface layer gets a clear key + bolder ponding

Owner: the surface layers have no colour key — "what does light green and dark green mean", "soil fertility zone is all yellow, what does that mean", "no pie chart or colour indicators", "same for elevation and contours"; and "ponding water should be distinguished more boldly". Must stay responsive on all devices.
Files: `src/legacy/studio3d.js` (texture colouring + legend markup), `src/legacy/studio3d-helpers.js` (pure legend/class helpers), `app/studio.css`. Rebase on main first; another card (STUDIO5T) edits touch/framing in studio3d.js — keep your diff to colouring/legend code.

1. **One legend component** per surface mode, driven by the SAME class breaks the texture uses (single source of truth helper `surfaceLegend(mode, data)` → `{title, unit, classes:[{label, color, from, to, pct}], note, truth, source, date}`):
   - **Crop canopy**: crop + growth stage colours (e.g. seedling light green → full canopy dark green → ripening gold → bare/fallow brown), stating it is illustrative from the rotation plan.
   - **Greenness (NDVI)**: 5 classes with values (bare <0.2, sparse 0.2–0.4, moderate 0.4–0.6, dense 0.6–0.75, very dense >0.75), Sentinel-2 date shown.
   - **Moisture (NDMI)**: dry → wet 5 classes with values + date.
   - **Water ponding**: depth classes (none, <5 cm, 5–15, 15–30, >30 cm) for the current rain scenario; Sentinel-1 flooded % for the month as a line.
   - **Elevation & contours**: hypsometric ramp with real min/max metres, contour interval stated ("contours every 0.25 m"), relief exaggeration noted.
   - **Soil fertility zones**: colour by a real class (pH or OM class from soil-nutrients.json / soil-profile). If the whole field falls in ONE SoilGrids 250 m cell, say so plainly: "Whole field is one 250 m soil cell → one class: Medium (pH 6.1, OM 2.98 %)", and show P/K/Zn/B as "add soil test". Never a mystery colour.
2. **Share of field (pie/donut):** each legend shows a small donut (inline SVG, ≥ 64 px) with % of field area per class, computed from the field's cells inside the polygon; the class rows show the % too (colour + text, never colour alone).
3. **Ponding boldly:** saturated blue (#1d6fe0 → #0b3d91 by depth) with a light shimmer/specular and a 1–2 px white outline at the waterline; ≥ 0.75 opacity; obvious against green crop and brown soil; legend matches.
4. **Responsive placement:** desktop/laptop (canvas ≥ 900 px): legend card bottom-left inside the stage, collapsible, not over the field (respect the free-region logic). 600–899: compact legend bar under the canvas. Phone (< 600): legend lives in the Layers bottom sheet under the surface selector AND a one-line mini key strip under the canvas. Bengali + English; ≥ 12 px text; ≥ 44 px targets.
5. Truth label + source/date on every legend.
6. Tests: `surfaceLegend` breaks match the texture colour function; donut percentages sum to 100 ± 0.5; fertility single-cell message.
Verify with screenshots at 1366×768, 820×1180, 390×844 for each mode (6 modes) — describe in commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/studio3d-helpers.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
