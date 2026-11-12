# SOILINFO — fix soil-card ⓘ buttons; remove Point probe / Cross-section (≤10 min, small)
Page `#rotations`, soil layer cards from `soilDetailHtml()` in `src/legacy/studio3d.js` (`<details class="soil-info"><summary>ⓘ</summary>`), CSS in `app/studio.css`.
1. The ⓘ renders as a big stretched oval. Make it a 22 px circle aligned at the card header's right end, and its content an absolutely-positioned popover (max-width 280 px, small text, close on outside click / Esc, stays inside the viewport on 412 px). Same for all three cards (Topsoil, Root zone, Deep soil).
2. Remove the "Point probe / Cross-section A–A′" tab bar and the Point probe panel below the soil layers (owner request). Delete their HTML, handlers and now-unused CSS cleanly; update tests that only checked them.
## Rules (owner)
- Real data only: no mock data, placeholders, invented numbers or "coming soon". Missing data → hide the element or say "Unknown", never fake.
- NASA badges (`nasaBadge`) only on real NASA data; bilingual `t(en, bn)`; mobile first (412 px), then 1366 / 1882×906.
- Keep existing ids/actions/tests; update a test only where old behaviour was removed on purpose.
- Done when: `node --check` edited JS, `npm test` fail 0, `npm run build` passes. One commit (more if you split). Report what changed.
