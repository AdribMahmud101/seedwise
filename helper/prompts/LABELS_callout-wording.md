# LABELS · Honest, farmer-friendly soil callout wording

Change ONLY the callout text builder (where "GWETROOT" / "ROOT ZONE" strings are built in `src/legacy/studio3d*.js`) and its tests. Another card (STUDIO5N) edits other parts of studio3d.js — keep the diff minimal.
- Root zone line: `Root zone: wet (80 % of saturation)` — word from GWETROOT (<0.3 dry, 0.3–0.6 moist, 0.6–0.85 wet, >0.85 saturated) + %; small truth tag "Estimated · NASA POWER ~50 km, top ~1 m". Never show the raw code "GWETROOT".
- Crop line: `Planned: Potato (Rotation 01) · roots ~0.1 m` + truth tag "Scenario" (crop comes from the previewed rotation, not observed).
- Topsoil line keeps texture/pH/OM + truth tag "Estimated · SoilGrids 250 m".
- Bengali for all via `t(en,bn)`.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/studio3d-helpers.js` clean; `npm test` (update/add callout-builder tests); `npm run build`. Never touch package-lock.json/node_modules. Commit.
