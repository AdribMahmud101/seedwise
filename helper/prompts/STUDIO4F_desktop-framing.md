# STUDIO4F · Desktop framing of the studio field block

At ≥1024 px wide (studio canvas ~640×560) the default "3D field" camera makes the block too big: its top-left corner covers the end of the hint "Drag to rotate · scroll to zoom · tap to inspect", and the bottom-left "Terrain height" card covers the block's lower edge. Phone (390 px) framing is already correct — do not change it.

Fix in `src/legacy/studio3d.js` (`fitPerspective` / camera target) only: on wide canvases frame the block in the free region right of the bottom-left card and below the title stack (≈ x 30–95 %, y 45–85 % of the canvas), block width ≈ 55 % of canvas. Keep Close-up/Top view and reset consistent with the new default. Measure the overlay rects (`getBoundingClientRect`) to compute the free region rather than hard-coding pixels.

Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test`; `npm run build`. Do NOT delete or edit package-lock.json or node_modules. Commit.
