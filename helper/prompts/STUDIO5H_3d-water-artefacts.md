# STUDIO5H · Fix broken 3D water/markers in the rotation studio

Owner screenshot: `helper/prompts/STUDIO5H_bug.png` (#rotations, live, rain scenario 45 mm). Defects in `src/legacy/studio3d.js` (+ `studio3d-helpers.js`):
1. **Water planes are wrong**: two big flat blue quads cut diagonally through the soil block and stick out beyond it on all sides. Fix:
   - **Ponding** = water only on the TOP surface, only in cells whose terrain height is below the fill level for the rain scenario (low-ground + `s1-water.json` + rain mm), built as a mesh on the same grid as the surface, clipped to the exact field `polygon()`, slightly above terrain (no z-fighting), semi-transparent. 0 mm → nothing visible.
   - **Groundwater table** (if shown) = a horizontal level INSIDE the block (between the soil walls), never outside the block outline, honouring the cutaway.
   - No water geometry may extend beyond the field outline — add a helper test that every water vertex lies inside the polygon (point-in-polygon) at 0/45/240 mm.
2. **Tree/bund markers float outside the field** (top-left). Bunds must sit ON the boundary edge, at terrain height; trees only where a real feature exists or remove them. Never outside the outline.
3. **Blue dashed streaks** across the crop surface — remove (or render as proper thin drainage lines only when "Show bunds"/drain is on, on the surface).
4. **Crops look like round blobs** — restore the fine dense blade/clump look from tag `planner-3d-base` (`git show planner-3d-base:src/legacy/studio3d.js`, crop geometry), still per-crop/month.
5. Callout pins A/A′ must sit on the field surface at the transect ends.
Verify visually yourself if possible (headless chromium screenshot of `npx serve out` at #rotations with rain 0/45/240 mm) and describe what you saw in the commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/studio3d-helpers.js` clean; `npm test` (+ the new water-inside-polygon tests); `npm run build`. Never touch package-lock.json/node_modules. Only studio3d*.js, tests, app/studio.css. Commit.
