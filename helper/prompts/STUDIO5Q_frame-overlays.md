# STUDIO5Q · Fix framing + overlay regressions after RESP1/STUDIO5P

Screenshot `helper/prompts/STUDIO5Q_now.png` (#rotations 1280 px, studio canvas ≈ 640×560, after intro). Regressions on main:
1. **Top-left controls wrap:** "3D field | Root Slice | Top view" breaks onto 2 lines ("Top view" alone), "Slice field ··· Full field" wraps, chip text wraps. Restore single-line controls at ≥ 600 px canvas width (no max-width squeeze; allow the stack ~300 px wide). At narrower canvases they may wrap neatly.
2. **Too zoomed:** block now runs under the title "Your field. Brought to life." and under the right-side soil callouts. Target: block width ≈ 60 % of canvas, fully inside the free region = right of the left overlay stack, below the title/hint, above the probe/transect cards. Title/hint and callouts must never overlap the block.
3. **Callouts:** column must sit in free space (left side under the title stack OR right side) with ≥ 12 px clearance from the block's projected bounds; recompute side each resize. Bottom cards stay clear of the column.
4. Keep the horizontal idle sway (STUDIO5P) and intro end frame = the new default framing.
Verify with a headless screenshot after the intro (≥ 6 s) at 1280×900 and 390×844 and describe the clearances in the commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
