# STUDIO5K · Interactive 3D annotations like the reference

Owner: "our image feels less interactive than the reference — fix the annotations". Compare `helper/prompts/STUDIO5K_now.png` (ours, #rotations) with `STUDIO5K_reference.png` (target; source `helper/reference/rotation-tool/reference.html`, functions `placeCallout`, `sync3DCallouts`, `buildStratigraphicSoilWallTexture`, `createBotanicalPlantGeometry`). Work in `src/legacy/studio3d.js` (+ helpers, `app/studio.css`). Rebase on main first (it has STUDIO5I organic land via `src/legacy/landshape.js` — keep it).

1. **Soil-layer callouts pinned to the cut wall** (HTML labels projected from 3D anchors each frame, hidden when the anchor faces away/occluded, leader tick to the wall), one per band with real data:
   - "0–15 cm · TOPSOIL" — texture class from `soil-profile.json` (sand/silt/clay → USDA class), pH, OM % (from SOC) — SoilGrids, Estimated.
   - "15–60 cm · ROOT ZONE" — root-zone wetness (POWER GWETROOT for the selected month, `earth-data.json`) · current crop + its root depth (from agronomy/studio data).
   - ">120 cm · SUBSOIL & WATER TABLE" — tubewell/water-table depth if the farmer entered it (soil test dialog, `setSoilOverrides`) else "Well depth unknown (add local reading)" as a button that opens the soil-test dialog.
   Labels: mono eyebrow + bold value line, coloured left rule per band, white card, ≥12 px; bilingual `t(en,bn)`; truth label on hover/tap.
2. **Hover/tap interaction:** hovering a band highlights it (emissive tint) and its callout; tapping the surface updates the probe card AND drops a small pin; tapping a callout focuses that band (camera eases to it). Cursor changes on interactive things. Respect reduced-motion (no easing).
3. **Read the land:** default vertical exaggeration so relief is visible (auto: target ~0.25 × block width of relief, label "Exag N× (illustrative)"); ponding fills hollows visibly when rain > 0 (still clipped to outline); thin translucent "glass" frame around the cut block like the reference.
4. **Crops:** distinct individual plants in rows (stem + leaves, per-crop colour: mustard yellow-green, rice green, potato bushy), visible from the default camera — not a flat green carpet. Instanced; ≤ 40k instances.
5. A few edge trees on the boundary are allowed (marked illustrative), never outside the outline.
6. Phone 390 px: callouts collapse to numbered dots ①②③ with a legend list below the canvas.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/studio3d-helpers.js src/legacy/landshape.js` clean; `npm test` (+ tests: texture-class helper, auto-exaggeration, callout data builder); `npm run build`. Never touch package-lock.json/node_modules. Commit.
Out of scope: rotations.js panels (STUDIO5J), data scripts.
