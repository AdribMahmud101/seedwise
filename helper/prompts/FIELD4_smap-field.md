# FIELD4 — SMAP soil water on My field (spec 16: SMAP on My field + Water)

## Goal
#field "Historical observations" shows only the POWER wetness index. Add the real SMAP L4 soil moisture next to it.
## Do
- In `src/legacy/fields.js` climate tiles: add one tile "Soil water (SMAP)" for the selected month of 2024: surface (0–5 cm)
  m³/m³ with the Dry/Normal/Wet word, from `public/data/smap.json` (already used by water.js — reuse its loader/helpers, do not
  duplicate logic; export a helper from water.js if needed). Truth label REMOTE_OBSERVED/MODELED as water.js does, source
  "NASA SMAP L4 · 9 km".
- Keep the wetness tile but rename to "Wetness index (POWER, 0–1)" so the two are not confused (C6: index never as %).
- Custom/unprepared fields: show the empty state "Not prepared for this field" for SMAP.
- Bilingual, 44 px, 360 px clean; tile grid must still fit at 360 px.
## Files in scope
src/legacy/fields.js (climate tile block only), src/legacy/water.js (export helper only), tests/smap.test.mjs.
## Acceptance
`npm test` green + a test that the #field html contains the SMAP tile with m³/m³ for Mithapukur.
## Out of scope
other tiles, map, search, net area.
