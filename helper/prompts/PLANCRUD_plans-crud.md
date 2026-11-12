# PLANCRUD — custom plans in My plans: proper CRUD + re-evaluation (≤30 min)
Files: `src/legacy/journey.js` (savePlan, listPlans, openPlan, editReadyPlan, renamePlan, duplicatePlan, deletePlan, validatePlan), `src/legacy/plans.js` (My plans list), `src/legacy/planner.js` (`plan-save`, `savePlannerPlan` from PLANANY). Custom AI plans (localStorage `ropon_custom_plan_v1`, `getCustomPlan()` in advisor.js) can now be saved from the planner; make the whole lifecycle solid:
1. **Create**: saving the same plan twice updates it (no duplicates) unless the user picks Duplicate.
2. **Read**: Open plan restores field, crops, months, spacing, land split and the custom 3D in the planner exactly.
3. **Update**: Edit → change crops/spacing/split → Save updates the same saved plan (status back to draft until re-checked). Rename works.
4. **Delete** with an inline confirm (no browser confirm dialog). Duplicate works.
5. **Re-evaluate**: a "Re-check with Planty" action on a saved custom plan re-runs `/api/rotation-advisor` with the plan's crops + current field context, stores the new verdict/summary/date on the plan, and shows "Re-checked <date> · <verdict>" (and what changed vs the previous verdict). Offline → clear message, keep old verdict.
6. Migration-safe: existing saved plans (guided flow and PLANANY) still load.
Add tests for update-not-duplicate, rename, delete, duplicate, re-evaluation storing verdict (mock fetch in test only).
Avoid editing `src/legacy/plan.js` page rendering (another job) and planner layout CSS.
## Rules (owner)
- Real data only: no mock data, placeholders, invented numbers or "coming soon". Missing data → hide the element or say "Unknown", never fake.
- NASA badges (`nasaBadge`) only on real NASA data; bilingual `t(en, bn)`; mobile first (412 px), then 1366 / 1882×906.
- Keep existing ids/actions/tests; update a test only where old behaviour was removed on purpose.
- Done when: `node --check` edited JS, `npm test` fail 0, `npm run build` passes. One commit (more if you split). Report what changed.
