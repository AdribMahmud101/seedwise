# CALENDAR — new "Calendar" page (#calendar), super interactive, shared context with Planty and the planner

Owner: "add another option in nav called Calendar, connected, shared context with AI and planner, todos; it has to be super interactive."
Spec (agreed): team_handover/01-feature-list.md → "Planned: Calendar". Real data only — no mock events, no placeholder text.

## Where it plugs in (read these first)
- Routes / nav: `src/legacy/app.js` `pages` array (~line 80) + nav render (~line 255, numbering `0${i+1}`), `icon(name)` in `src/legacy/ui.js:475`
  (add a calendar icon). Insert **Calendar between My plans and Past seasons**. Route parser `src/legacy/routes.js` supports `#calendar/<planId>`.
- Plans: `src/legacy/journey.js` — `getPlan()` (active journey), `getReadyPlan()`, `listPlans()`, `getSavedPlan(id)`,
  `savePlan(plan,{status, keepPrevious})`, `restorePreviousPlan(id)` (undo). Plan shape: `plan.rotation.seasons[]`
  (`key`, `crop`, `cropBn`, `sowMonth`, `harvestMonth` 1-12, across New Year), `plan.planting[seasonKey]` (crop, rowSpacingCm, withinRowCm,
  usableAreaPct), `plan.checklist` ({id: true}), `plan.rotation.customPlan` (AI plans: calendar[], planting[]).
- Plan helpers: `src/legacy/plan.js` `planMonths(season)`, `deriveChecklist(plan, outlookHint)` (task ids/en/bn), `calendarSVG`.
  Checklist ticks are saved by `planChange` for `[data-check]` (ready plans via savePlan status 'ready') — reuse that logic.
- Risk/forecast: `GET /api/daily-brief?field=<id>` (flood + outlook months p10/p50/p90 + climatology) and the pure
  `riskStatus(brief)` in `src/legacy/recovery-risk.js`; `outlookPlanHint`/`outlookSummaryLine` in `src/legacy/outlook-flood.js`.
- Planty: `src/legacy/planty.js` (`mountPlanty(getContext)`; chat sends `context` incl. `plan` summary to `/api/planty-chat`).
  Suggestion approve/undo path: `src/legacy/app.js` notification `approve` (→ `approveRefinement`, `requestReplay`, `offerUndo`).
- Notifications: `src/legacy/notifications.js` + `refreshNotifications()` in app.js (task items), toasts `src/legacy/notify-toast.js`.
- Agronomy windows: `public/data/agronomy.json` crops[].sowingWindow / durationDays (cite source ids).

## Build
1. **Calendar page** (`src/legacy/calendar.js`, CSS in its own file or style.css block):
   - Plan picker (active/ready plan first; all saved plans) and field name.
   - **Month view** (default): grid with today highlighted; colour-coded crop season bars (sow → grow → harvest) derived from the plan;
     task chips on days (sow, transplant/nursery if in agronomy data, checklist tasks, harvest). **Week view** and **Agenda list view**
     (phones default to Agenda). Smooth view switch + month swipe/arrow navigation with animation; keyboard accessible.
   - **Year ribbon** on top: Jan–Dec strip of the rotation with a "Now" marker (reuse the plan report's rotation overview look).
   - **Click a day / task → side drawer** (bottom sheet on mobile): what to do, why (source), spacing, linked checklist tick, "Ask Planty".
2. **To-dos shared with the plan**: ticking a task here ticks it in the plan checklist (same storage) and vice versa; the bell's
   "next task" reflects it. Overdue tasks flagged; "This week" focus card at the top.
3. **Two-way with the planner**: drag a season's **sow date** on the month grid (or use the drawer's date stepper) to shift the season;
   validate against agronomy sowing windows (warn when outside, never silently accept impossible windows); save via `savePlan`
   (keep previous version for Undo, 10 s toast like `offerUndo`). Planner/plan report reflect the change. Custom (AI) plans: update
   `customPlan.calendar` consistently.
4. **Risk overlay** (toggle): shade months/days from the daily brief + outlook — e.g. "Soil 19% drier than normal (Nov)" — using
   `riskStatus` levels (green/amber/red), with NASA badges (POWER / Prithvi) per the existing badge rules. Real values only.
5. **Planty in context**: "Ask Planty about this week" opens the Planty chat with the visible week's tasks + risk lines attached
   (extend the chat context; no new AI endpoint needed). Planty may return a `suggestion` to shift a date → render as an Approve / Not now
   card in the calendar using the existing approve + undo path.
6. **Reminders**: tasks due in ≤ 7 days become notification items (type `task`, deterministic ids) so the bell + toasts pick them up.
7. Bilingual (t()), mobile-first (360/412), desktop (1366/1920), no horizontal scrollbars, prefers-reduced-motion respected,
   works offline from saved plan data (risk overlay hides gracefully offline). Empty state when no plan: friendly Planty line +
   button to start a plan (`#field`).

## Do NOT
- No mock events/dates/tasks. Every date comes from the plan, agronomy windows or the checklist; every risk value from the daily brief.
- Don't break existing routes, plan storage (`ropon_*` keys), checklist persistence, notifications, Planty chat, or tests.
- Don't touch unrelated pages' layouts.

## Done when
- `npm test` fail 0 with new unit tests (date/season math across New Year, task derivation, sow-date shift + validation, tick sync,
  reminder ids); `npm run build` passes.
- Commit on the card branch with a clear message listing features.
