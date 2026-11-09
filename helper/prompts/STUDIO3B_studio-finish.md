# STUDIO3B · Finish the 3D studio port (continue STUDIO3)

STUDIO3 ran out of quota mid-way; its work is merged on main (commit "STUDIO3 (partial…)"). Read `helper/prompts/STUDIO3_studio-polish.md` — it is the full spec. Finish every item it lists that is not yet done. Reference sample: `helper/reference/field-studio-sample/` (port from it; never ship it).

Known gaps seen in a 1280 px / 390 px screenshot of #rotations:
1. Crops render as a flat green mat — must be 3D plant clumps in rows, inside the field outline only, sized and coloured per crop and month (sample `dist/app.mjs` crop rows + wind sway; respect prefers-reduced-motion).
2. Check the field top follows the exact `polygon()` outline (not its bounding box) and the elevation surface/contours from our data.
3. Month timeline, month chip text ("Nov · Potato · growing", not "2024-11 · Potato (grow)"), nearest-month NDVI, and truth labels must all work; Bengali via `t(en,bn)` on every new string.
4. Software-renderer fallback when WebGL is missing; lazy load intact (three not loaded on #field).
5. Phone (390 px): overlays must not cover the field; controls ≥44 px; no sideways scroll.

Files: `src/legacy/studio3d.js`, `src/legacy/studio3d-helpers.js`, `src/legacy/rotations.js`, `app/studio.css`, tests.
Acceptance: `npm test` passes with tests for any new pure logic; `npm run build` passes. Commit when done.
Out of scope: other views, data scripts, deploy.
