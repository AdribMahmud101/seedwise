# SMAP2 · Show NASA SMAP soil moisture on the Water screen

## Goal
`public/data/smap.json` (merged in SMAP1) has real soil moisture in m³/m³ for each site: daily 2024 and monthly 2021–2025, plus percentiles. Show it on `#water` so farmers see how wet the soil is versus normal. Rules: `spec/15-ui-ux-spec.md` (§4 screen recipe, §5 truth labels, §6 words, §9 "soil water by depth", §10 states), `spec/14` D-C6/D-C11, `spec/16`.

## Do
1. In `src/legacy/water.js`, load `smap.json` the same way other data is loaded (see `ui.js` `loadData`); if it's missing → the Unknown state, no crash.
2. Add a **"Soil water (NASA SMAP)" card** for the selected site and month:
   - two depth bars: **Top 0–5 cm** (`SFMC`) and **Root zone 0–100 cm** (`RZMC`), values in **m³/m³** (never %), plus a status word from the percentile: **Dry** (< 30th) · **Normal** (30–70th) · **Wet** (> 70th), always shown with the word, not colour alone
   - one plain sentence, e.g. "July 2024: root zone wetter than usual (71st percentile)."
   - truth label ◈ Estimated · "NASA SMAP L4 · ~9 km cell · model + satellite · 2024 monthly"
   - "This is a regional cell, not your field. A soil probe or AWD pipe gives your field's real value." + link to the Research lab logger
3. Keep the existing POWER wetness **index (0–1)** elsewhere unchanged and clearly different (D-C6).
4. Bilingual via `t(en, bn)`. Use existing classes only (`.panel`, `.data-stat`, `.water-bar`, `.tag`, `.note`); **no CSS file changes**.
5. Add a test in `tests/views.test.mjs`: `#water` renders the SMAP card in EN and BN, shows "m³/m³", never shows "%" next to SFMC/RZMC, and a null value renders "No data".

## Files in scope
`src/legacy/water.js`, `tests/views.test.mjs`.

## Out of scope
CSS files, `fields.js` (MAP3 is editing it), data files, other views.

## Acceptance
- `npm test` exits 0 (no `node_modules` symlinks; use `npm ci` in the worktree if needed)
- `npm run build` exits 0
- `git add -A && git commit -m "SMAP2: NASA SMAP soil water card on Water screen"`
