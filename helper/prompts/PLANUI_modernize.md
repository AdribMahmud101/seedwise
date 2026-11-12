# PLANUI — modernize the #plan page (spacing + visual polish)

Owner: "the plan UI is at a bad state; fix the spacing and do a proper modernization."

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
