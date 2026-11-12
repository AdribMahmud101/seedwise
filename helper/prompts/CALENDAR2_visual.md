# CALENDAR2 — make the Calendar (#calendar) visibly alive and correct

The first pass (src/legacy/calendar.js, merged) works but looks empty: with a normal saved plan (e.g. "Aman then Boro rice
rotation", seasons with sowMonth/harvestMonth but NO sowDate) the month grid shows nothing — every task falls into
"Season tasks without a chosen day" — and the year ribbon is the same plain green line in every month. Owner wants it
"super interactive". Fix and upgrade, real data only.

## Facts about the data (use them, don't invent)
- Plans give month-level timing: `season.sowMonth`, `season.harvestMonth` (1–12, may wrap across New Year). There is no sowing day
  unless the user picks one (`season.sowDate`, added by the first pass).
- `public/data/agronomy.json` crops have `durationDays` [min,max] (aman 135, boro 150–160, mustard 75–80, potato 90–95,
  mungbean 55–58), `kc` stages (initial/mid/end), `spacingCm`, `sourceIds`; **no sowingWindow field** — so the first pass's
  sowingWindow check is a no-op. Custom (AI) plans also carry `rotation.customPlan.calendar` (month → crop, stage) and planting colours.

## Do
1. **Season bands on the grid (main fix).** Every day belongs to a crop stage. Render multi-day bands (Google-Calendar style, one row per
   season, label on the first visible day of each week row): **Sowing window** = whole sowMonth (or the exact sowDate once chosen),
   **Growing**, **Harvest window** = sow + durationDays [min,max] when the crop is in agronomy, else the plan's harvestMonth. Distinct
   colour per crop (use plan/customPlan colours or a fixed palette), stage shading (sow / grow / harvest), fallow days plain.
   Month, week and agenda views all show them. Explicit task chips (sow / harvest / checklist) sit on top of the bands.
2. **Undated tasks get a home:** sowing tasks appear as a "Sow in June" window chip across the sowing month (no fake day). Checklist
   prep tasks without a month (e.g. "Add a well water reading") go to the **This week** card as due now. Remove the separate
   "Season tasks without a chosen day" box (or keep only for truly undatable items).
3. **Pick / drag a sowing day:** drag a sowing-window chip or band edge onto a day, or "Pick a day" in the drawer → sets sowDate;
   the season's grow/harvest bands move with it (durationDays). **Validation with real data:** block (with a clear message) if the
   new harvest window would overlap the next season's sowing in the rotation, or if the day is outside the plan's sowMonth by more
   than one month; keep Undo (10 s). Drop the no-op sowingWindow check.
4. **Year ribbon:** per-crop colours with crop names (Aman / Boro…), sow ▼ and harvest ✂ markers, the current month ringed, clicking a
   month jumps the grid there.
5. **Drawer content (real):** crop, stage, day N of the season, expected harvest range from durationDays, spacing (plan), crop water
   need from the Kc stage (initial/mid/end), linked checklist tick, sources (agronomy sourceIds → titles/links), "Ask Planty about this".
6. **This week card:** today's/this week's tasks as tickable chips with a small progress ring; overdue in amber.
7. **Visual polish:** modern cards, rounded cells, today ring, hover lift, smooth slide animation between months/weeks, colour legend,
   empty-state quality, consistent with SeedWise style (see the plan report and Disaster recovery analytics box). Risk overlay: shade
   the forecast month(s) with the riskStatus colour and show the line ("Soil 19% drier than normal") with a NASA POWER badge.
8. Mobile (360/412: agenda default, bands become a vertical timeline), desktop 1366/1920; no horizontal scrollbars; reduced motion.

## Do NOT
- No invented sowing days, yields or dates — windows come from the plan months and research durations; picked days come from the user.
- Keep ids/handlers the first pass and tests rely on; keep plan storage, checklist sync, notifications, Planty chat context.

## Done when
- `npm test` fail 0 with tests for band derivation across New Year, harvest window from durationDays, overlap validation, undated
  tasks placement; `npm run build` passes. Commit on the card branch.
