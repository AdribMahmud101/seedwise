# POLISH · Mobile-first polish + smart laptop layout (all routes)

Owner: "mobile is our main screen, so we need to polish the mobile UI — and also the laptop UI; smart responsiveness is the key."
Screens of every route today: `helper/prompts/polish/<route>-390.png` (phone, Bengali) and `<route>-1366.png` (laptop, English). Routes: field, seasons, rotations, planner, clinic, water, recovery, research, evidence. Look at ALL of them first and write a short list of issues per route in your commit message.
Scope: CSS (`app/*.css`) and markup in `src/legacy/*.js` EXCEPT the 3D studio internals (`studio3d.js`, `studio.css`) — card STUDIO5R owns those. Keep the existing visual identity (fonts, colours, panels); polish, don't redesign.
**Phone (360–430 px) — primary:**
- One clear column; generous but not wasteful spacing (16 px page gutters, 12–16 px card padding); no cramped side-by-side widgets; sliders and selects full width.
- Thumb-reachable primary actions; sticky bottom action bar only where a page has one main action (e.g. Save plan); tap targets ≥ 44 px; inputs ≥ 16 px font (no iOS zoom).
- Typography: body ≥ 15 px, labels ≥ 13 px, headings scale with `clamp()`; Bengali lines get +0.1 line-height; nothing truncated mid-word.
- Long tables/strips scroll horizontally inside their card with a visible fade cue — never the page.
- Top bar + menu: compact; current route clearly marked.
**Laptop (1280–1440 px):**
- Use the width: max content width ~1240 px centred; two-column layouts where content pairs naturally (controls + result); no giant empty gutters, no 3-px-wide text columns.
- Side panel + main content proportions sensible; cards align to a grid.
**Tablet (768–1024):** sensible intermediate (2 columns where it fits).
Use container queries / `clamp()` / `minmax()` grids — "smart", not many fixed breakpoints.
Verify yourself with headless Chromium screenshots at 360, 390, 768, 1366 (EN+BN) for every route: no sideways scroll, no overlap, no text < 12 px, no interactive < 44 px (skip link excepted). Summarise per route in the commit message.
Acceptance: `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
