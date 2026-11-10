# STUDIO5L · Fix the soil callout layout (follow-up to STUDIO5K)

Your STUDIO5K callouts have correct real data but the layout is broken — see `helper/prompts/STUDIO5L_slice.png` (Root Slice) and `STUDIO5L_default.png` (3D field), target `STUDIO5K_reference.png`. In `src/legacy/studio3d.js` + `app/studio.css`:
1. **Anchor each callout to its band on the visible cut wall**, not the top surface: anchor = point on the front-most wall face (the one facing the camera) at the band's mid-depth (0–15 → 7.5 cm, 15–60 → 37 cm, >120 → 135 cm, after exaggeration). Recompute which wall faces the camera each frame.
2. **No overlaps:** place labels in a column beside the block (left or right side with more free space), sorted by depth, min 8 px gap, each with a thin leader line (SVG overlay) to its anchor dot. Never on top of the title stack, probe card, transect card, or another label.
3. **Show callouts in the default "3D field" view too** (reference does), not only Root Slice. In Root Slice they stay and the title/hint overlay hides.
4. **Root Slice framing:** camera frames the cut face so the whole block fits with the overlays (use the same free-region view offset as 3D field); the depth ruler (0/15/30/60/100 cm) sits at the canvas left edge clear of the controls stack, or move it to the right of the block.
5. The duplicated callout DOM nodes (each label appears 2–3 times in the DOM) → one node per band.
6. Phone 390 px: numbered dots ①②③ on the wall + legend under the canvas (as STUDIO5K brief).
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test` (+ a test for the label de-overlap helper); `npm run build`. Never touch package-lock.json/node_modules. Commit.
