# RESP1 · #rotations responsive fixes (CSS + 3D overlays only)

Part 1 of the final responsive pass (RESPONSIVE timed out). Files: `app/rotation-tool.css`, `app/studio.css`, `src/legacy/studio3d.js` (overlay positioning only). Do NOT edit `src/legacy/rotations.js` (RESP2 owns it).
1. 768 px sideways scroll: `.ranking-header-bar` and `#rotation-list .rotation-card` reach 966 px → header wraps (tariff select full width below title under 900 px), cards/grids `min-width:0`, `minmax(0,1fr)`.
2. Text < 12 px on #rotations: `.note` 11px, `.eyebrow` 10px, `.callout-eyebrow` 10px, `.callout-dot-num` 11px, `.num-badge` 10px, `.mono` 10px, spans 9–10px, strong 11px → ≥ 12px.
3. Tap targets < 44 px: surface-layer radio rows, `#studio-surroundings-chk`, `#chk-show-roots`, `#chk-show-bunds` → whole label row min-height 44px; `#btn-callout-soil-test` → ≥ 44px hit area.
4. Overlaps in the 3D: the fallow notice chip ("Fallow this month · Next crop …") overlaps the "3D field / Root Slice / Top view" switch top-left → place it top-centre below the switch row or right of it, never covering controls; depth ruler in Root Slice must not overlap the controls stack; soil callout column ≥ 8 px from the probe card.
Check at 360/390/768/1280 EN+BN: no element right edge > viewport, no visible interactive < 44 px (skip link excepted), no text < 12 px on #rotations. Paste the summary in the commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
