# PASTSEAS — modernize the Past seasons page

Reference design: `helper/prompts/design/past-seasons-reference.html` (owner's mockup "Past Season & Season Prediction").
Page: nav id `seasons` → `seasonView` (find it via `src/legacy/app.js` line ~72). Data already available includes `public/data/history.json`, `outlook.json` (Chronos-Bolt seasonal outlook on NASA POWER), `earth-data.json`, `smap.json`, `hls-field.json`, `flood-fields.json`, `grace-groundwater.json`. "Season prediction" parts may only use `outlook.json` (label it Experimental outlook with p10–p90 range) — never invent forecasts.

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
