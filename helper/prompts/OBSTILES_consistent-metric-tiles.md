# OBSTILES · Make the "Historical observations · November 2024" metric tiles consistent

Where: My field page (#field), the 5 tiles under "HISTORICAL OBSERVATIONS / November 2024" (Wetness index, Soil water (SMAP), Rainfall, Mean temperature, Reference water use) — markup in `src/legacy/fields.js` (search "Historical observations" / the tile renderer), styles in `app/style.css`. Owner says it looks inconsistent: labels wrap to 1–3 lines ("Wetness index (POWER, 0–1)"), NASA badges sit at different heights, values start at different heights, footers misaligned, one tile has an extra "Dry" word before the truth tag, icons float.

Make every tile use the SAME structure and alignment (CSS grid rows so rows line up across tiles):
1. **Header row**: short label on ONE line (left) + the existing weather icon (right, same size/colour). Labels: "Soil wetness" (was Wetness index (POWER, 0–1)), "Soil water", "Rainfall", "Temperature", "Water use". Bengali equivalents short too.
2. **Badge row**: the NASA badge (`nasaBadge(...)` from ui.js, keep its popup) directly under the label, left-aligned, same position in every tile.
3. **Value row**: big value + unit, same baseline in all tiles (units: index 0–1, m³/m³, mm, °C, mm).
4. **Sparkline row**: same height, same width, same baseline.
5. **Footer row** pinned to the bottom: one muted line "source · what it is" (e.g. "POWER · index 0–1", "SMAP L4 · 9 km", "IMERG · monthly total", "POWER · monthly average", "FAO-56 ETo · monthly total") then the truth tag on its own line. Any status word like "Dry" goes into the value row as a small class label (same style in every tile that has one), not before the truth tag.
Equal tile heights; same padding; dividers consistent. Responsive: 5 across ≥1200 px, 3+2 / 2-col at tablet, 2-col (or 1-col <360 px) on phones with identical inner structure. No overflow at 412 px.
Don't change data/values. Verify screenshots at 1366×768, 820×1180, 412×915@2.625. Commit as soon as it works.
Acceptance: eslint no-undef clean on changed src (`npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --parser-options=ecmaVersion:latest --rule 'no-undef:error' <files>`); `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
