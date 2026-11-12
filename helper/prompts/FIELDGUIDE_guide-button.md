# FIELDGUIDE — "Guide me" button on My field (≤10 min, small)
Page `#field` (`src/legacy/fields.js`). Add a clear "Guide me" button (Planty icon + text, bilingual) at a natural spot: in the slim welcome row next to "Plan my season / Watch Rahim's journey / Continue later", or the page header. It starts the existing Planty guide / how-to for the field page (see `planty-guide.js`, `howto-field.js`, `howto-registry.js` — reuse their start function, do not build a new tour). Must fit the FIELDFOLD first-screen layout (no new scrolling at 1366×768) and 412 px.
## Rules (owner)
- Real data only: no mock data, placeholders, invented numbers or "coming soon". Missing data → hide the element or say "Unknown", never fake.
- NASA badges (`nasaBadge`) only on real NASA data; bilingual `t(en, bn)`; mobile first (412 px), then 1366 / 1882×906.
- Keep existing ids/actions/tests; update a test only where old behaviour was removed on purpose.
- Done when: `node --check` edited JS, `npm test` fail 0, `npm run build` passes. One commit (more if you split). Report what changed.
