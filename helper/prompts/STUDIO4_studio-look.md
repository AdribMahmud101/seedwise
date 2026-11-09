# STUDIO4 · Make the 3D studio look like the owner's reference

Open both images first: `helper/prompts/STUDIO4_reference.png` (target — the owner's sample) and `STUDIO4_now.png` (what we ship). The owner says ours "does not look polished like the reference". Match the reference look; keep all our real data, the rotation picker, layers, truth labels, lazy load and repaint re-attach. Port look/code from `helper/reference/field-studio-sample/` (`dist/app.mjs`, `style.css`); never ship that folder.

Do, in `src/legacy/studio3d.js`, `studio3d-helpers.js`, `app/studio.css`:
1. **Background:** clean soft light-sage gradient with faint haze. Surroundings (blurry photo plane) OFF by default; keep the checkbox to turn it on.
2. **Floating field block:** the field floats with a soft contact shadow below; gentle idle float/slow drift (crisp, subtle). Off under `prefers-reduced-motion`. Stops while the user drags.
3. **Top surface:** follows our elevation (wavy edge, not a flat box), thin pale rim line around the outline, exact `polygon()` outline.
4. **Crops:** dense, fine, tall blades/clumps with a soft fuzzy top silhouette like the reference (instanced, one draw call per crop type), coloured by crop + month; slight wind sway (reduced-motion off).
5. **Soil sides:** smooth vertical gradient dark topsoil → sandy tan with subtle fine strata/noise texture from our soil-profile horizons; no hard flat brown bands.
6. **Camera:** default 3D view is low and side-on like the reference, block fills ~70 % width, centred; Close-up and Top view keep working.
7. **Overlays (reference layout):** view switch top-left ("3D field / Top view"; Close-up stays); Soil cutaway as a "Slice field ↔ Full field" slider; chip "Illustrative crop preview · not observed plants"; title "Your field. Brought to life." + hint "Drag to rotate · scroll to zoom · tap to inspect"; bottom-left card "Terrain height 1×" slider with "True scale · NASADEM ~30 m"; small centred caption "FIELD MODEL / Selected boundary + terrain / Illustrative plants & enlarged soil section". Every string bilingual via `t(en,bn)`. Rounded, light, soft-shadow panels as in the reference; ≥44 px tap targets.
8. **Phone 390 px:** title/hint and caption may shrink or hide; nothing covers the field; no sideways scroll.
9. Sharp rendering: devicePixelRatio capped at 2, antialias on, ACES tone mapping, soft hemisphere + key light.

Acceptance: `npm test` and `npm run build` pass; add tests for any new pure helpers. Commit.
Out of scope: other views, data scripts, deploy.
