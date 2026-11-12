# PLANFOLD2 — Planner first screen still scrolls: compact the header + banner; move "Save as my plan" (≤20 min)
PLANFOLD (commit 121a024) sized the 3D/settings cards, but on #planner at 1366×768 the stack above them pushes the 3D canvas to y≈704 px (measured live). Above the cards: page eyebrow + big "Planting planner" title + subtitle, Guide me / Print buttons, field chips, a "Save as my plan" row, and the full custom-plan banner (`customPlanBanner()` in advisor.js — title, two crop cards, long note).

Do:
1. One compact header row: small title "Planting planner" + field chips + Guide me / Print (icon buttons ok). Subtitle hidden on ≥1024 px or folded into a tooltip.
2. Custom-plan banner → one slim strip: ✓ verdict chip + plan title + crop chips ("● Aman rice Jun–Nov · 20×20", "● Boro rice Dec–May") + "Back to standard planting" link; the long note goes behind an ⓘ/`<details>`.
3. **Move "Save as my plan"** (action `plan-save`, from PLANANY) out of the top row into the Planting settings panel: a primary button pinned to the bottom of the settings panel (sticky footer of `#plant-controls` area, both custom `customSettingsPanel()` and standard settings). Keep the same action/handler.
4. Measurable goal (check with a quick Playwright run of your own at 1366×768 and 1882×906 after loading a custom plan via Rotation studio preset → "Use this plan in the planner"): the 3D canvas host `.planner3d-stage-canvas-host` and `#plant-controls` both have top < 0.35 × innerHeight and the 3D card bottom ≤ innerHeight. Mobile 412 px: stacked, no horizontal scroll.
No content removed. Real data only, bilingual `t()`. `node --check`, `npm test` fail 0, `npm run build`. One commit.
