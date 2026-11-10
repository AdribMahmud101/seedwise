# STUDIO5R · Responsive 3D overlays (progressive disclosure, no dragging)

Owner screenshot `helper/prompts/STUDIO5R_now.png`: on a ~650 px-wide studio canvas the soil callout cards, title, probe card and transect card pile over the field. Decision: NOT draggable (conflicts with orbit drag on touch). Rebase on main first (STUDIO5Q framing fix). Files: `src/legacy/studio3d.js` (overlay DOM/positioning only), `app/studio.css`.
1. **Breakpoints by canvas width** (ResizeObserver / CSS container queries on the studio host), not viewport: wide ≥ 900, medium 600–899, narrow < 600.
2. **Callouts → pins + popover:** on the cut wall show small numbered pins ①②③ with a one-line label beside each at wide only ("Topsoil · Clay loam"); medium/narrow show pins only. Tap/hover/focus a pin → one detail card (current full content incl. truth labels + soil-test button), anchored near the pin, clamped inside the canvas, never over the controls; Esc / outside tap closes; only one open.
3. **"Soil layers" strip below the canvas** (outside the 3D) listing ①②③ with full text — always present at medium/narrow, collapsible at wide. Pins and strip rows highlight each other.
4. **Probe + transect:** overlays only at wide; at medium/narrow move them below the canvas as two tabs ("Point probe" / "Cross-section A–A′").
5. **Title + hint:** hide below 700 px canvas width; show the hint once as a dismissible tooltip.
6. Keyboard: pins are buttons (≥ 44 px hit area), aria-expanded, focus returns on close. Bilingual strings.
7. Verify headless at canvas widths ~1000, ~650, ~360 (desktop 1600, desktop 1280 with side panel, phone 390): field never covered except by an open popover; describe in commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test` (+ test for breakpoint + popover clamp helpers); `npm run build`. Never touch package-lock.json/node_modules. Commit.
