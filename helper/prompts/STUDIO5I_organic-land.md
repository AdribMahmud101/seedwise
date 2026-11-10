# STUDIO5I · Realistic, organic land shape in the 3D (rotation studio + planner)

Owner: "turn land 3D from dummy square box to realistic non-even shapes, curves, edges, slopes, overall realism, keeping variety between land shapes instead of generic shapes". Shape mood: `helper/prompts/STUDIO5I_shape-ref.png` (organic, soft lobed outline). Runs AFTER STUDIO5H (water fix) — rebase on main first.

Truth rule: the TOP outline must stay the field's real boundary (`polygon()` — traced or farmer-drawn); never invent a different field shape. Realism comes from everything around it:
1. **Outline:** use the true polygon with all its vertices (no bounding box, no forced rectangle); soften corners with a small Chaikin/Catmull-Rom pass (≤ 1.5 m deviation) so edges read as earth, not CAD.
2. **Surface:** real micro-relief from our NASADEM/low-ground grid + subtle deterministic noise (seeded by field id, ≤ 10 cm, labelled illustrative) → gentle slopes and hollows; bund ridge (~20–30 cm) along the boundary; field drain where low-ground says water collects.
3. **Edges & walls:** irregular eroded rim (slight overhang/crumble, deterministic per field), walls that follow the curved outline; soil horizons from SoilGrids as wavy (not straight) bands.
4. **Underside:** an organic tapering "floating island" base — lobed, uneven, rocky/root-textured — instead of a flat box bottom, so each field silhouette differs. Seeded by field id → stable per field, different between fields.
5. **Variety:** the 3 pilot fields and any custom field must look distinct (outline + relief + underside seed). Add a test: two fields → different underside vertex hashes; same field twice → identical.
6. Apply to both `src/legacy/studio3d.js` (#rotations) and `src/legacy/planner3d.js` (#planner) via a shared pure helper `src/legacy/landshape.js` (outline smoothing, rim noise, underside generation) with unit tests.
Keep crops, water (5H rules: never outside the outline), cutaway, truth labels, performance (≤ 60k triangles for land), reduced-motion.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/planner3d.js src/legacy/landshape.js` clean; `npm test` (+ landshape tests); `npm run build`. Never touch package-lock.json/node_modules. Commit.
