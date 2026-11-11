# DISREC2 — modernize the Disaster recovery page

Reference design: `helper/prompts/design/disaster-recovery-reference.html` (owner's mockup "Disaster recovery"; large file, mostly embedded assets — read the HTML/CSS structure, skip base64 blobs).
Page: nav id `recovery` → `recovery()` in `src/legacy/recovery.js`, with `recovery-data.js` and `recovery-engine.js`. Real data available includes `public/data/flood-fields.json` (Prithvi flood model on NASA HLS), `s1-water.json` (Sentinel-1, ESA), `low-ground.json`, `agronomy.json`, and the existing recovery data/engine. Keep the existing recovery logic and advice; restyle and declutter it.

## Hard rules (owner, non-negotiable)
- **Real data only.** Every number, date, chart point and label must come from data the app already loads (`public/data/*.json`, the existing engine/data modules, `state`) or from a real public source you fetch and commit with its URL. **No mock data, no placeholders, no lorem, no made-up numbers, no "coming soon".** If the reference shows a widget we have no real data for, drop that widget — do not fake it.
- Keep truth labels (Measured / Estimated / Scenario / Unknown) and `nasaBadge(key)` badges on real NASA data only; ESA/other sources get no NASA badge.
- Bilingual: every string through `t(en, bn)`.
- Mobile first (412 px is the main screen), then 1366 px. Low clutter: big values, short labels, details behind ⓘ/`<details>`.
- Port the reference's design choices (tokens, card/fact-tile/chip patterns, spacing, hierarchy) into our CSS; do not paste the reference wholesale or add a framework/dependency. Do not change other pages.
- Keep existing actions/ids that tests or other modules use. Update tests only where the old wording was removed on purpose.

## Done when (commit within ~25 minutes)
- `node --check` on edited JS, `npm test` shows **fail 0**, `npm run build` passes.
- One commit on this branch with a short message. Report what each section now shows and which data file feeds it.
