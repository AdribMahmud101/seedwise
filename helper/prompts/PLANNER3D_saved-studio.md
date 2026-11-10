# PLANNER3D · Planner uses the saved studio 3D (limited)

The Planting planner (`src/legacy/planner.js`, canvas `#plant-model`, 2D-canvas schematic + "↺/↻ 30°" buttons) shows a dummy 3D. Replace it with the owner-approved studio saved at git tag `planner-3d-base`.
1. Create `src/legacy/planner3d.js` from `git show planner-3d-base:src/legacy/studio3d.js` (+ helpers it needs from that tag, saved as `planner3d-helpers.js`; CSS → `app/planner3d.css` from `git show planner-3d-base:app/studio.css`, classes renamed `planner3d-*`). Do NOT import or edit today's `studio3d.js` (it is being rebuilt for #rotations).
2. Limited functionality for the planner: field block with exact boundary + terrain, crop rows drawn from the planner's own crop, **row spacing and plant spacing** (the planner state already has them), soil sides, floating idle motion (reduced-motion off), drag-rotate/zoom, views 3D / Top. Remove: rotation picker, surface layers, slice/cutaway, surroundings, terrain-height card, title/caption overlays. Keep the "Illustrative · rows drawn at readable scale" truth chip.
3. Lazy-load three only when the planner view opens (same pattern as studio); WebGL missing → keep the old 2D schematic as the fallback. Re-attach after repaint; dispose on leave.
4. Re-render when the planner's crop/spacing/boundary changes (debounced).
5. Bilingual `t(en,bn)`; ≥44 px controls; phone 390 px no overlap.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/planner3d.js src/legacy/planner.js` clean; `npm test` (+ a test for the spacing→row-count helper); `npm run build`. Never touch package-lock.json/node_modules. Commit.
Out of scope: studio3d.js, rotations.js, deploy.
