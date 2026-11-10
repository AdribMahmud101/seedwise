# RESPONSIVE · Final responsiveness & polish pass (all routes)

Supervisor swept every route at 360/390/768/1280 px, EN+BN (headless Chrome). Most routes are clean. Fix exactly these:
**#rotations**
1. 768 px sideways scroll: `.ranking-header-bar` ("Four rotation scenarios" + pump tariff) and `#rotation-list .rotation-card` extend to 966 px. Let the header wrap (flex-wrap, tariff select full-width below title at < 900 px) and give cards `min-width: 0` / grid `minmax(0,1fr)`.
2. Text < 12 px at 1280: `.note` 11px, `.eyebrow` 10px, `.callout-eyebrow` 10px, `.callout-dot-num` 11px, `.num-badge` 10px, `.mono` 10px, span 9–10px, strong 11px — raise all to ≥ 12 px (scope to #rotations/studio CSS; don't shrink layout).
3. Tap targets < 44 px: surface-layer radios (16×16), `#studio-surroundings-chk`, `#chk-show-roots`, `#chk-show-bunds` (13×13) → make the whole label row the hit target with min-height 44 px; `#btn-callout-soil-test` (15 px tall) → padding to ≥ 44 px hit area (can be invisible padding); `button.text-link` "How scoring works" (20 px) → ≥ 44 px hit area.
4. Nutrient chip "Nitrogen" shows "Enter soil test" although `soil-nutrients.json` has SoilGrids `totalN` (and `ph`, `om`, `cec` keys are lowercase) — map keys correctly (N ← totalN g/kg, show %, class); add CEC chip if room.
5. Root Slice view: the depth ruler (0/15/30/60/100 cm) overlaps the controls stack — move it to the right side of the block or start it below the controls; in 3D field view the soil callout column must not touch the point-probe card (min 8 px gap; if no room, move probe card right of callouts).
**#clinic**
6. 12 checkboxes 20×20 → label rows ≥ 44 px hit area; `#clinic-photo` file input 20 px tall → styled button ≥ 44 px (keep the native input accessible).
**#planner**: one text node < 12 px — find and fix.
Re-run your own check (script in this brief's spirit: no element right edge > viewport, no visible interactive < 44 px except the skip link, no text < 12 px) at 360/390/768/1280 for all routes in EN and BN and paste the summary in the commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/*.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
