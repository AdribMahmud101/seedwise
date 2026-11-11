# PLANANY — let users build/save a plan directly from the Planting planner (≤25 min)

## Problem
A plan (journey store in `src/legacy/journey.js`, listed on My plans `src/legacy/plans.js`) can only be built if the user started the guided Field → Rotation → Planner flow. A user who already chose a field, a rotation (or an AI custom plan from the Rotation studio, localStorage `ropon_custom_plan_v1` via `getCustomPlan()` in advisor.js) and planting settings, then opens the Planner directly, cannot save a plan. It must be flexible.

## Build
1. On the Planner page (`src/legacy/planner.js`), when no journey plan is active, show a clear primary button **"Save as my plan"** (bilingual `t()`), near the planting settings / summary (visible without scrolling far on 412 px).
2. Clicking it builds a plan from what the user already has saved — reuse the existing journey functions (`startPlan`, `fieldSnapshot`, `rotationSnapshot`, `transitionPlan`, `savePlan`, `defaultPlanName`), do not write a parallel store:
   - field: current `state.fieldId` + its saved outline/constraints/profile (same sources the field step uses);
   - rotation: the active custom plan (`getCustomPlan()` for this field — crops, calendar, planting/spacing, verdict) **or** the last chosen standard rotation;
   - planting settings: the current planner values (custom panel or standard controls).
   Then save it (status consistent with a finished plan when all parts exist) and route to **My plans** (`#plans`) like the guided flow does after success.
3. If one part is genuinely missing (e.g. no rotation chosen yet), do not block silently: show one short line naming the missing step with a link to it ("Choose crops in Rotation studio →"). Never fill missing parts with invented data.
4. Custom (AI) plans must appear on My plans with their crops/months/spacing (they currently never reach My plans). Extend `validatePlan`/snapshot only as needed; keep existing saved plans valid (migration-safe).
5. Small consistency fix on the same page: when a custom plan is active, the summary card "Spacing … ✓ Measured · by farmer" and "Rows × plants per row" must show the custom plan's spacing (label: Scenario / AI or Research, matching the custom panel), not the standard planner's farmer-measured 30 × 10.

Avoid editing `src/legacy/advisor.js` except importing existing exports (another job is editing it). Keep existing ids/actions and tests.

## Done when
`node --check` edited files, `npm test` fail 0 (add a test: plan built from saved field + custom plan, no journey → valid saved plan), `npm run build` passes. One commit.
