# PLANFOLD — Planting planner: main content fits the viewport (≤25 min)
Page `#planner` (`src/legacy/planner.js`, planner3d, `customSettingsPanel` in advisor.js, CSS app/style.css + app/planner*.css). At 1882×906 and 1366×768 the 3D "Field preview" and the "Planting settings" panel must both be fully visible without page scrolling, like the My field page now does (see FIELDFOLD commit for the pattern: `calc(100dvh - header)` grid, inner scroll).
- 3D card left fills the remaining height; settings panel right scrolls internally; compact header rows (season toggle, 3D/Top, zoom) into one row.
- Make the settings panel compact: each crop as a small card with two inline sliders (label + value on one line, slider below, no extra spacing); total plants + source note as one footer line.
- Summary cards (Usable area / Spacing / Rows × plants, harvest illustration) move below the fold or into a collapsible row — not removed.
- Mobile: normal stacked flow, 3D ~55vh.
Do not move the "Save as my plan" button (another task will). Avoid editing journey.js/plans.js/plan.js (other jobs).
## Rules (owner)
- Real data only: no mock data, placeholders, invented numbers or "coming soon". Missing data → hide the element or say "Unknown", never fake.
- NASA badges (`nasaBadge`) only on real NASA data; bilingual `t(en, bn)`; mobile first (412 px), then 1366 / 1882×906.
- Keep existing ids/actions/tests; update a test only where old behaviour was removed on purpose.
- Done when: `node --check` edited JS, `npm test` fail 0, `npm run build` passes. One commit (more if you split). Report what changed.
