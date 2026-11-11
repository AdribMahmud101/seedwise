# PLANSEASON · Planting planner becomes season-aware (one tab per crop in the chosen rotation)

Data layer merged: `src/legacy/journey.js` (plan.rotation.seasons[{key,crop,cropBn,sowMonth,harvestMonth}], plan.planting[seasonKey], setPlanting, stepStatus…). Currently planner.js has a `shortcut:` that maps crop picks to a season (`plannerSeason`/`syncSeasonPlanting`) — replace it with proper season tabs. ANOTHER CARD (JOURNEY2) mounts a journey bar + "Finish my plan" CTA on #planner — keep a clear slot/hook for it; don't build the bar.

1. When a plan with a confirmed rotation exists: show **season tabs** above the crop/settings: e.g. "① Aman rice · Jul–Nov", "② Potato · Nov–Feb", "③ Mungbean · Mar–May" (from the rotation's seasons; bilingual; fallow seasons shown as a disabled 'Fallow' chip). Selecting a tab loads that season's planting (crop locked to the season's crop by default, with an "Change crop" escape that marks it custom), spacing/usable sliders, 3D preview (planner3d updates crop + spacing with its smooth transitions), and counts. Each tab shows a ✓ when its settings were reviewed/confirmed ("Looks good ✓" button per season, saves via setPlanting with confirmedAt).
2. Without a plan (or rotation not chosen): planner works exactly as today (single crop picker) + a gentle note "Choose a rotation first to plan every season" linking to #rotations.
3. Season summary strip under the tabs: per season plants/seed and status; compact on phones (horizontal scroll chips).
4. Keep counts from the existing count function; recommended defaults from the existing crop defaults; no new agronomy numbers.
5. Remove the old `shortcut:` mapping.
Tests: tabs from a plan with 3 seasons, fallow handling, switching tabs restores settings, setPlanting called with the season key, no-plan fallback. Verify 1366×768 and 412×915@2.625 screenshots (demo plan via demoPlan()). Commit as soon as it works.
Acceptance: eslint no-undef clean on changed src (`npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --parser-options=ecmaVersion:latest --rule 'no-undef:error' <files>`); `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
