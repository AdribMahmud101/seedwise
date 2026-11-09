# STUDIO5B · Rotation tool side panels (decision side)

Target design: `helper/reference/rotation-tool/reference.html` (read README there). Rebuild the #rotations side panels in `src/legacy/rotations.js` + new `app/rotation-tool.css` to match its three question panels and the comparison, using OUR engine and data — never the reference's numbers.
1. **"When is the field bare or stressed?"** — priority sliders Water · Soil health · Income · Stability that re-rank the 4 rotations live. Reuse the existing ranking/agronomy engine and its weights (find it; do not invent scores). Planting layout buttons Line rows · Raised beds · Bund drains → call `studio.setPlantingLayout()`.
2. **"Where will water collect?"** — drain/block toggles and the low-ground summary from `low-ground.json`; call `studio.setSurfaceMode('ponding')` when opened.
3. **"What is under my field?"** — chips Moisture, pH, OM, N, P, K, Zinc, Boron. Fill pH/OM/N from `soil-profile.json` (SoilGrids, Estimated); P/K/Zn/B show "Unknown — enter soil test". Button "+ Enter local soil test or tubewell depth" opens an accessible dialog (gw depth m, pH, OM %, P mg/kg; reset to regional default) → saved per field in localStorage → `studio.setSoilOverrides()`; those values then show "Measured · by farmer".
4. **"Compare 4 rotation strategies"** — card/table per rotation with the engine's metrics; pump tariff select (Diesel STW / Electric / BMDA-Solar ৳/hr) as an editable SCENARIO input feeding irrigation cost from our litres shortfall.
5. **"NASA data & sources"** dialog listing each layer, source, resolution, date, truth label (from spec 18 table).
6. Area unit select (Bigha 33 shotok / Shotok / Hectare / Acre) reusing existing area helpers.
STUDIO5A (parallel, `studio3d.js`) provides: `setSoilOverrides`, `setPlantingLayout`, `setSurfaceMode`, `studio:probe` event. Call them guarded (`studio?.fn?.()`) so either card can land first.
Rules: every string `t(en,bn)`; truth labels; dialogs with focus trap + Esc; ≥44 px targets; phone 390 px stacks panels below the 3D with no sideways scroll; existing tests stay green.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/rotations.js` clean; `npm test` with new tests (ranking reweight, soil override storage, tariff cost); `npm run build`. Never touch package-lock.json/node_modules. Commit.
Out of scope: `studio3d.js`, other views, deploy.
