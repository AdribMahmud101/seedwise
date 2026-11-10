# RESP2 · Clinic tap targets, planner text, nitrogen chip

Part 2 of the final responsive pass. Files: `src/legacy/clinic.js`, `src/legacy/planner.js`, `src/legacy/rotations.js`, `app/style.css` (clinic/planner rules only). Do NOT edit studio3d.js, rotation-tool.css or studio.css (RESP1 owns them).
1. **#clinic:** 12 checkboxes render 20×20 → make each label row the hit target, min-height 44 px, comfortable spacing; `#clinic-photo` native file input (20 px tall) → visible styled button ≥ 44 px that triggers the input (keep it keyboard/screen-reader accessible).
2. **#planner:** one text node under 12 px — find it (computed font-size < 12) and raise to ≥ 12 px.
3. **#rotations nutrient chips (rotations.js):** "Nitrogen" shows "Enter soil test" but `public/data/soil-nutrients.json` has SoilGrids keys in lowercase: `ph`, `om` (g/kg), `soc`, `totalN` (g/kg), `cec`. Map: pH ← ph; OM % ← om/10; N % ← totalN/10 with class from the file; add a CEC chip (cmol+/kg). Keep P/K/S/Zn/B as "Enter soil test" (no open source found). Truth label "Estimated · SoilGrids 250 m".
Check #clinic, #planner at 360/390/768/1280 EN+BN: no interactive < 44 px (skip link excepted), no text < 12 px. Paste summary in commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/clinic.js src/legacy/planner.js src/legacy/rotations.js` clean; `npm test` (+ a test for the nutrient chip mapping); `npm run build`. Never touch package-lock.json/node_modules. Commit.
