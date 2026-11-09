# STUDIO4L · Studio overlays: stop overlaps, match reference layout

Reference: `helper/prompts/STUDIO4_reference.png`. Current state (1280 px): the studio panels overlap each other and the field. Fix layout only in `app/studio.css` (+ minimal markup in `src/legacy/studio3d.js`).

1. Top-left stack, no overlap: view switch → "Slice field ↔ Full field" slider → illustrative chip → title "Your field. Brought to life." + hint. The hint must be fully readable (not covered).
2. Move the "Surroundings" checkbox INTO the bottom-left "Terrain height" card (like the reference's "High-detail basemap" row). No separate floating panel.
3. "FIELD MODEL" caption bottom-centre must not touch the Terrain card; at widths where it would collide, hide the caption's 2nd/3rd lines.
4. Camera framing: the field block sits centred in the free space below the title stack (shift target down / frame with top padding), ~60–70 % of canvas width, never under any panel.
5. Phone 390 px (EN + BN): title shrinks to one line or hides the hint; terrain card collapses to a compact row; nothing covers the field; all tap targets ≥44 px; no sideways scroll.
6. Every variable you use must be declared (a previous worker shipped `floatGroup`/`isDragging` undeclared → crash). Run `npx -y eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/rotations.js` → 0 errors.

Acceptance: eslint command above clean, `npm test`, `npm run build` pass. Commit.
Out of scope: rendering/materials, data, other views, deploy.
