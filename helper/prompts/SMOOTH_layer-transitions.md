# SMOOTH · Animated surface-layer switching + animated colour key

Owner: "when I switch between 3D surface layers the change feels like an immediate glitch — make the switching animated; also the pie chart, colour indicator boxes and text should animate smoothly."
Files: `src/legacy/studio3d.js` (surface switch + legend render), `src/legacy/studio3d-helpers.js` (pure tween helpers), `app/studio.css`. Keep the diff focused.
1. **Surface cross-fade (≈450 ms, ease-in-out):** when the surface mode changes (radio list, Layers sheet select, or buttons that switch modes), keep the previous top-surface texture on a temporary overlay copy of the top mesh (same geometry, polygonOffset, transparent) and fade its opacity 1 → 0 while the new texture is already applied underneath; then dispose the overlay + old texture. No geometry rebuild for a mode change unless needed (water flow meshes fade in/out with the same timing). Rapid switching: cancel the running fade and start from the current state (no stacking, no leaks).
2. **Colour key animation:** donut arcs animate from old to new shares (tween stroke-dasharray/offset or arc angles, 500 ms); percentage numbers count to new values; class rows cross-fade (old rows fade/slide out 150 ms, new rows fade/slide in 250 ms, staggered 30 ms); swatch colours transition. Title/source text fades. Legend height animates without layout jump (animate max-height or use FLIP).
3. `prefers-reduced-motion`: everything switches instantly (no fades).
4. Performance: animate only opacity/transforms/uniforms; ≤ 1 extra draw call during fade; 60 fps target on phone.
5. Tests: tween helper (progress → value, easing, cancel/restart), donut arc interpolation sums to 100 %.
Verify: switch through all 7 modes quickly; no flashes, no console errors, memory (renderer.info textures) returns to baseline after switches. Describe in commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/studio3d-helpers.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
