# COMPACT · Use the compact studio chrome whenever the stage is short (laptops too)

On a 1366×768 laptop the stage is only ~465 px tall (it is sized to fit the window). The full desktop chrome — view switch, SURFACE select card, Slice card, illustrative chip, big title "Your field. Brought to life." + hint box, probe/transect overlays, outlet callouts — leaves the field tiny in the middle (screens: `helper/prompts/COMPACT_now-*.png`). Rebase on main first (STUDIO5T/LEGENDS may have landed).
Files: `src/legacy/studio3d.js` (overlay layout only), `app/studio.css`.
1. Choose chrome by the stage's own size: **compact** when stage height < 640 px OR width < 900 px (phones already use it via MOB3D) — one top bar: segmented 3D·Slice·Top + "Layers" button (bottom sheet / popover with SURFACE, slice slider, illustrative chip) + right control pill. **Full** chrome only when the stage is ≥ 640 tall and ≥ 900 wide.
2. Title + hint: hidden in compact; hint shown once as a small dismissible toast.
3. Probe/transect: in compact they live in the tabs under the canvas (as on phone); the colour key stays under the canvas (LEGENDS).
4. Outlet / "Low basin" callouts must never cover controls or the hint; hide them in compact unless the Water surface is selected.
5. Framing: in compact the field block fills ≈ 70 % of stage width, vertically centred in the free area.
Verify at 1366×768, 1280×720, 1440×900, 1884×913 and 390×844: field large and clear, nothing overlapping; describe in commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
