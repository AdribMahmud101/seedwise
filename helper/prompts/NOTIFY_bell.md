# NOTIFY — notification bell in the top nav (+ routing fix)

Owner: "at the top nav create a notification alert system that will frequently notify (a bell or message box with a numeric
badge and proper state management):
- urge the user to check the latest disaster-prediction analytics, crafted for the user's info (precomputed once every day)
- or the next high-impact task according to their plan
- smart AI recommendation if other crops/fruits suit better in that situation — an auto-refinement suggestion for the existing
  plan (this is the WOW factor, craft it cleanly) and ask the user to approve.
Also fix the routing."

## 0. Routing fix (do first)
`src/legacy/app.js:83` matches `location.hash.slice(1)` exactly against the page ids, so any hash with a parameter
(e.g. `#plan/abc123`, `#recovery/flood`) falls back to page 0 (My field).
- Parse `#<page>[/<param>]`: page = first segment; pass the param to the page (e.g. `#plan/<savedPlanId>` opens THAT saved plan:
  set the ready-plan session key the plan page already uses (journey.js READY_PLAN_KEY / getReadyPlan) before rendering).
- Hidden routes keep working by URL (research, plan, water). Unknown pages still go to My field.
- Back/forward must re-render correctly (the existing `hashchange` listener at app.js:291).
- Unit-test the parser.

## 1. Bell UI (top bar, app.js:110 `.top-actions`, before the language toggle)
- Bell icon button with a numeric unread badge (hidden at 0, "9+" cap), aria-label "Notifications, N unread".
- Click → dropdown panel (desktop: anchored popover ~380px; mobile ≤ 640px: bottom sheet). Esc / outside click closes, focus trap,
  keyboard reachable. Smooth open animation; respect prefers-reduced-motion.
- Each item: icon by type, title, one-line body, relative time, unread dot, primary CTA (deep link via the routing above), dismiss ✕.
  Header: "Mark all read". Empty state: friendly Planty line (no fake items).
- State module `src/legacy/notifications.js`: pure functions (build list, merge, unread count) + localStorage
  `ropon_notifications_v1` = { read: {id:true}, dismissed: {id:true}, cache: {...} }. Ids are deterministic
  (type + date + plan id) so the same daily item is not duplicated and read state survives reloads. Refresh on app start,
  on hashchange, when a plan is saved, and every 30 min while the tab is open (visibilitychange-aware).
- Bilingual via t(). Badge update without re-rendering the whole page.

## 2. Daily disaster brief (type: "disaster") — precomputed once a day, REAL data
- Worker (`worker/index.js`, `export default` at ~401): add a `scheduled` handler + `"triggers": { "crons": ["0 0 * * *"] }`
  in wrangler.jsonc (00:00 UTC = 06:00 BDT). It calls the owner's Modal endpoints
  (FLOOD_MODEL_URL `?field=<id>` and OUTLOOK_MODEL_URL `?site=<id>` — see src/legacy/plan-pipeline.js:12-13 for the exact
  call format used in the browser) for the 3 fields and stores one JSON per day.
  Storage: create a KV namespace with wrangler (`npx wrangler kv namespace create DAILY_BRIEF`, wrangler is logged in on this
  device) and bind it; if that fails, use the Cache API keyed by date. Never print/commit secrets.
- `GET /api/daily-brief?field=<id>` → { date, field, flood: {...}, outlook: {...}, headline, level } computed from the model
  outputs only (no invented numbers). If the cron has not run yet, compute on first request and store (still once per day).
  If Modal is down, fall back to the static files the app already ships (outlook.json / flood-fields.json) and say so in the item.
- Notification: "Today's disaster outlook for <field>: <headline>" → CTA "See analytics" → `#recovery` (or the plan report
  disaster step if a plan exists). NASA badge rules: badge only real NASA-derived values.

## 3. Next high-impact task (type: "task")
- From the user's saved/ready plan(s): `deriveChecklist(plan, hint)` (src/legacy/plan.js:126) items not yet ticked
  (`plan.checklist`), ranked by month proximity to today (this month/next month first, overdue flagged).
- "Next: Dec — sow Boro rice at 20×20 cm (in 18 days)" → CTA "Open plan" → `#plan/<id>` (scroll to #plan-checklist).
- No plan → one gentle item "Make your first plan" → `#field`.

## 4. Smart refinement suggestion (type: "refine") — WOW factor, approve flow
- Once per day per saved plan (cached in ropon_notifications_v1.cache), call the existing worker AI endpoint
  `/api/rotation-advisor` (worker/index.js; Muse model, grounded in public/data/agronomy.json + tolerant-varieties.json) with a
  new `mode: "refine"`: send the plan's crops/calendar/spacing + field context (outlook/flood summary lines as plan.js /
  advisor.js already build) and ask: keep, or a better crop/fruit/variety/spacing for THIS situation? Response schema:
  { verdict: "keep"|"refine", changes: [{ season, from, to, why }], newPlanting?, evidence: [source ids], confidence }.
  Validate like normaliseAdvice (evidence only known source ids; no invented yields/prices/doses). Rate-limited as today.
- Only "refine" verdicts become notifications: "Planty suggests a better plan for <field>".
- Opening it shows a clean review card (in the panel or a modal): side-by-side current vs suggested per season
  (crop, months, spacing), the reasons, evidence links, confidence, and buttons **Approve** / **Not now**.
  Approve → apply via the existing save path (journey.js savePlan / custom plan update), mark needsRecheck=false only if the
  suggestion came from the checker, then route to `#plan/<id>` so the report regenerates (pipeline plays). Keep the previous
  version restorable (store `previousVersion` on the saved entry) and show "Undo" toast for 10 s.
  Not now → dismiss for 7 days.
- Offline / API failure → no item (never a fake suggestion).

## Constraints
- Real data only. No mock/placeholder notifications. Mobile is the main screen. Don't touch unrelated pages.
- Keep storage keys `ropon_*`. Don't print or commit secrets (MUSE_API_KEY is a worker secret, already set).
- `npm test` fail 0 with new unit tests (route parser, notification list/ids/unread logic, refine response validation,
  approve/undo); `npm run build` passes. Commit on the card branch with a clear message.
