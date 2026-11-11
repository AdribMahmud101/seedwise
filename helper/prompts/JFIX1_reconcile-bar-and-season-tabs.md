# JFIX1 · Reconcile JOURNEY2 (journey bar/hand-offs) with PLANSEASON (season tabs) after merge

main now contains both (merge commit resolved planner.js: season tabs + `<div id="journey-finish-slot">${journeyFinishCTA()}</div>`; the old `planner-journey-slot` was dropped). 3 tests fail:
- tests/journey-bar.test.mjs "finish requires a chosen rotation and valid settings for every season"
- tests/journey-bar.test.mjs "hand-offs confirm snapshots, celebrate, and show hints after the destination mounts"
- tests/planner-season.test.mjs "three season tabs follow rotation labels, dates and locked crops in both languages"

Decision (owner logic): **"Finish my plan" requires every season of the chosen rotation to be reviewed** (its "Looks good ✓" → `confirmedAt` set, valid crop/spacing/usable) — fallow seasons excluded. Update `canFinishPlanting` in `src/legacy/journey-bar.js` to use the store's season-confirmed state (single source of truth in journey.js; add a small exported helper there if needed, e.g. `allSeasonsReviewed(plan)`), keep the disabled note text but make it say "Mark each season ‘Looks good ✓’ to finish" (bn too). The finish CTA must re-render live when a season is confirmed (subscribe to the store). Fix the hand-off hint target so after "Choose this rotation" the Planty hint points at the season tabs (`#plan-seasons`) once mounted. Make the season-tab test pass with the merged markup (journey slot changes) without weakening what it checks. Update tests to the decided semantics; add one for live CTA enable after confirming the last season.
Verify the full flow in a browser: #field start → Plan my season → Use this field → Choose this rotation → planner tabs → Looks good ✓ on each season → Finish enabled → click (route #plan may not exist yet → toast). 1366×768 and 412×915@2.625.
Acceptance: eslint no-undef clean on changed src; `npm test` all pass; `npm run build`. Never touch package-lock.json/node_modules. Commit.
