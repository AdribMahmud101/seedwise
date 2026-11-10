# MOB3D · Phone-first 3D studio (mobile is the main screen)

Owner: "mobile is our main screen". Screenshot `helper/prompts/MOB3D_now.png` (left: poster, right: 3D after "Open 3D studio" on a Pixel 7, 412 px). On phone the controls stack (view switch, SURFACE select, Slice card wrapping "Full field" onto its own line, illustrative chip) fills the top ~45 % of the stage, so the field is tiny. Files: `src/legacy/studio3d.js` (overlay markup/layout only), `app/studio.css`. Don't touch other routes (POLISH card owns them).
At canvas width < 600 px:
1. **One compact top bar** inside the stage: view switch as a segmented control (3D · Slice · Top) + a "Layers" icon button (≥ 44 px). SURFACE select, slice slider and the illustrative chip move into a bottom sheet opened by "Layers" (drag handle, Esc/back closes, focus trap). Slice slider label on one line.
2. Zoom +/−, reset, fullscreen: a vertical pill on the right, 44 px buttons, 8 px gap, below the top bar.
3. Field framing: block ≈ 85–90 % of canvas width, vertically centred in the free area (top bar → bottom), sway kept.
4. Stage height on phone: fills the screen when scrolled to (`calc(100svh - 72px)`, min 420 px); poster unchanged.
5. Fullscreen button uses the Fullscreen API on the stage (fallback: fixed full-viewport overlay), Esc/back exits.
6. Pins ①②③ + "Soil layers" strip and probe/transect tabs below stay as STUDIO5R built them.
Verify on emulated Pixel 7 + iPhone 13 (Playwright devices): open poster → tap "Open 3D studio" → canvas visible, nothing overlapping the field, all buttons ≥ 44 px; also confirm desktop 1366×768 unchanged. Describe in commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
