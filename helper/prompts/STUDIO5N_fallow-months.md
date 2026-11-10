# STUDIO5N · Fallow months must not look broken

Owner screenshot `helper/prompts/STUDIO5N_fallow.png`: "no crop showing, it's plain". Cause: the selected month is a fallow month of the rotation (root-zone callout says "Fallow"), so the 3D shows a bare brown slab — correct data, but it reads as a bug. Work in `src/legacy/studio3d.js` (+ `rotations.js` only for the month player hook). Rebase on main first (STUDIO5M intro + RESPONSIVE may have landed).
1. **Fallow look:** stubble/residue of the previous crop (short cut stems in the old rows, straw colour), sparse low weeds, slightly cracked/tilled soil texture — instanced, cheap. Harvest/young-crop months: show the crop at its stage size (seedlings small, not invisible).
2. **Overlay chip on the 3D** (top-centre, bilingual): "Fallow this month · Next crop: <crop> (<month>)" + button "Show next crop" → sets the month player to that month. Same for "Harvested · next: …".
3. **First load:** pick the current calendar month if it has a crop, else the nearest month with a crop in the selected rotation (never start on fallow). Changing rotation keeps this rule.
4. Root-zone callout for fallow: "Fallow · residue of <prev crop>" instead of just "Fallow".
5. Tests: helper `nearestCropMonth(rotation, month)` and `cropStageAt(rotation, month)`.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/rotations.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
