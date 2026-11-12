# PLANUI3 — modernize the "Your plan" REPORT page (#plan)

**TARGET FILE: `src/legacy/plan.js` (the "Your plan / 04" report page, URL hash `#plan`) and its CSS.**
**NOT `src/legacy/planner.js` / NOT the "Planting planner" (#planner) page — a previous attempt edited the wrong page and was rejected. Do not edit planner.js or #planner CSS.**

Already done on main (keep): `.plan-back-bar` spacing (back link left, Regenerate + Edit right).
Already done (keep): checklist ticks save on saved plans (planChange `[data-check]`), 3D preview mount args in plan.js.

To check your work, open `#plan` after saving a plan (Rotation studio → tap a recommended preset → Use in planner → Save as my plan).

## Scope
Page: `#plan` (src/legacy/plan.js render + its CSS: app/style.css plan rules, app/plangen.css).
Sections today: back bar, page head, Planty pipeline (plan-pipeline.js / plangen.css), plan report cards
("Your numbers", "What to do, step by step" checklist, "Planty's summary", calendar, 3D preview, export).
They are plain stacked `.panel`s with uneven gaps, bare checkbox rows, weak hierarchy.

## Do
1. Consistent vertical rhythm: one spacing scale (8/12/16/24/32) between and inside cards; cards max-width and aligned.
2. Clear hierarchy: a hero/summary band at the top (plan name, field, rotation, verdict/status, key numbers),
   then a 2-column grid on desktop (≥1100px) for the report cards, single column on mobile (mobile is the main screen).
3. Modern card style matching the rest of SeedWise (rounded 14px, soft border, subtle shadow, section eyebrow + title).
4. Checklist ("What to do, step by step"): modern task rows — custom round/rounded checkbox with animated tick,
   done rows muted with strike/check, month chip on the left (e.g. "Jun"), progress "x of y done" bar in the header.
   Keep `<input type="checkbox" data-check=...>` inside `#plan-checklist` (journey-story.js and tests select it).
5. Numbers tiles: larger values, unit labels, keep truth/NASA badges exactly as they are.
6. Smooth, subtle entrance (fade/translate) after the pipeline finishes; respect prefers-reduced-motion.
7. No horizontal scrollbars at 360, 412, 1024, 1280, 1366, 1920 widths.

## Do NOT
- No mock data, no placeholder text, no invented numbers. Only restyle/re-layout what plan.js already renders from real data.
- Do not change the pipeline logic, Modal API calls, saving/CRUD, checklist persistence (planChange [data-check]) or ids/classes tests use.
- Do not rename storage keys. Do not touch other pages.

## Done when
- `npm test` → fail 0 (update only assertions about pure markup you deliberately changed, keep behaviour tests).
- `npm run build` passes.
- Commit on your card branch with a clear message. Short note in the commit body listing the visual changes.

## ALSO ADD (owner request): simplified rotation overview
The plan report is missing a simple, at-a-glance **rotation overview**. Add a card near the top (right after the summary band):
- One horizontal 12-month strip (Jan→Dec, mobile: scrolls inside the card or wraps into 2 rows of 6 — no page scrollbar)
  showing each season of `plan.rotation.seasons` as a coloured segment (sow → harvest, across New Year), fallow/gap months muted.
- Under it, one compact row per season: crop name (full name, bilingual via existing cropLabel/cropBn), sow month → harvest month,
  spacing (row × within-row cm from plan.planting[season.key]), and a small "now" marker on the current month.
- Works for standard rotations AND custom (AI) plans (`plan.rotation.customPlan`, crop names like "Aman rice").
- Reuse existing helpers in plan.js (`planMonths`, the calendar row data used by the existing calendar SVG) — real plan data only.
- Keep the existing detailed calendar; the overview is the simplified summary.
