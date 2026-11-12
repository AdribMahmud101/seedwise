# PLANGEN — generative plan report with a visible Planty pipeline (MAIN wow feature, ≤40 min)
After a plan is saved ("Save as my plan" in the planner, or finishing the guided flow) the app opens the plan page (`src/legacy/plan.js`, route `#plan`; see how `plans.js` "Open plan" routes). Turn that page's first open of a plan into a slow, smooth generative experience for judges, then the full interactive plan report.

## 1. Planty pipeline (visual, step by step, like ADVANIM in advisor.js but richer)
Animated Planty mascot (`plantyMascot`) + a vertical step timeline; each step: shimmering skeleton → spinner → green ✓ with a one-line real result. Steps (skip any with no data for this field; never fake):
1. **Thinking** — "Reading your plan: <crops>, <field>, <area>".
2. **Loading data** — names the real files loaded (outlook, flood, soil, water table…).
3. **Water resilience check** — bring back the Water & resilience content that was removed from Rotation studio (see `src/legacy/water.js`, `waterAction`; nav id "water" is hidden in app.js) as this step's result: irrigation need vs rainfall (FAO-56 ETo in agronomy/outlook data), water-table depth (`water-table.json`, GRACE `grace-groundwater.json`).
4. **Disaster prediction model** — visibly call our real APIs (show "Calling flood model…" with the endpoint host and the response time): `https://adribmahmud101--ropon-flood-flood.us-east.modal.run?field=<id>` (Prithvi-EO-2.0 on NASA HLS) and `https://adribmahmud101--ropon-outlook-outlook.us-east.modal.run?site=<id>` (Chronos-Bolt on NASA POWER). Field ids: mithapukur/pirganj/gangachara. Cold start can take ~20 s: show progress; on failure/timeout fall back to the bundled `public/data/flood-fields.json` / `outlook.json` and say "using saved result".
5. **Disaster-tolerant crops** — from `helper/prompts/design/disaster-tolerant-crops-rag.md` (research report with sources and evidence labels): pick varieties matching the plan's crops and the field's hazards (flood/submergence, drought, cold, etc.). Show variety names, the tolerance, the evidence label and source link. Also pass the relevant excerpt into the AI context (`worker/index.js` /api/plan-summary or rotation-advisor — add a compact JSON of the shortlist to public/data, e.g. `tolerant-varieties.json`, built only from the report).
6. **NASA data check** — list each NASA dataset used for this field with its badge (POWER, SMAP, GRACE-FO, HLS, IMERG…) and a ✓.
7. **Soil quality** (soil-nutrients/SoilGrids, labelled Estimated), 8. **Water**, 9. **Weather/outlook** — one real value each.
10. **Final plan report** — then the full plan page content streams in section by section (skeleton blocks fade into the real sections; text of AI summary streams word by word).
Total ~10–15 s plus API time; a "Skip ▸" button; `prefers-reduced-motion` → no animation. Only the first open of a newly saved plan (or "Regenerate report") plays it; later opens show the report directly.

## 2. Graphics
Make it feel premium: custom inline SVG/CSS animations (orbiting satellite around a field icon for NASA steps, water ripple for water step, radar sweep for the flood model step, sprouting seedling for crops). Create them yourself (SVG/CSS) or use an openly licensed asset with its licence noted in the commit. No heavy libraries.

Avoid editing `journey.js`/`plans.js` CRUD logic and planner layout (other jobs); only read from them.
## Rules (owner)
- Real data only: no mock data, placeholders, invented numbers or "coming soon". Missing data → hide the element or say "Unknown", never fake.
- NASA badges (`nasaBadge`) only on real NASA data; bilingual `t(en, bn)`; mobile first (412 px), then 1366 / 1882×906.
- Keep existing ids/actions/tests; update a test only where old behaviour was removed on purpose.
- Done when: `node --check` edited JS, `npm test` fail 0, `npm run build` passes. One commit (more if you split). Report what changed.
