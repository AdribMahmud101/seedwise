# MOB1 · #field on phones (360–430 px): map first, nothing overlapping

## Goal
On a 360–412 px phone the map is only 320 px tall and starts ~650 px down the page; the tap popup covers the
map controls and the coordinate box; several rows wrap. Fix all items below. Desktop (≥ 1024 px) must look unchanged.
Files: `src/legacy/fields.js`, `app/style.css`, `scripts/prepare-offline.py`, tests. Use media queries ≤ 600 px.

## Issues to fix (measured at 360×740, 390×844, 412×915)
1. **Map too small / too low.** Map height on phones: `clamp(340px, 62svh, 560px)`. Fullscreen button must fill
   `100dvh` and `invalidateSize()` after.
2. **Layer switcher stacks 3 full-width rows (~150 px).** Phones: one segmented row of 3 equal buttons, icon + short
   label ("Photo"/"ছবি", "Colour 10 m"/"রং ১০ মি", "NDVI"), ≥ 44 px tall; full names stay as `title`/`aria-label`.
3. **Opacity + Context lines + Low ground take 2 rows.** Phones: one row; opacity slider shrinks (flex 1, min 96 px).
4. **Tap popup covers controls, coords box and scale; text clipped ("GROUND" under coords box).** Phones: do not open a
   Leaflet popup; render the same `inspectPopup()` HTML in a card directly under the map (`#inspect-sheet`,
   close button 44 px, `aria-live="polite"`), and drop a small marker at the tapped point. No map auto-pan.
   Desktop keeps the popup. Pick-on-map / Locate popups: same sheet on phones.
5. **Coordinate box "N ↑ 25.54° N 89.27° E" overlaps content.** Hide `.map-bottom` on phones (coords are in the sheet).
6. **Imagery chip on the map wraps to 2–3 lines (66 px).** Phones: one line "Maxar · 28 Nov 2022" + truth tag; ellipsis.
7. **Field chips wrap (Gangachara alone on row 2 at 360 px).** Phones: single horizontally scrollable row
   (`overflow-x:auto; scroll-snap`), no page-level sideways scroll; selected chip scrolled into view.
8. **Page header**: title wraps and "Disaster recovery" wraps beside it. Phones: actions in one row under the title.
9. **Map action buttons (Pick on map, District, Edit boundary) wrap to 2 rows.** Phones: 3 equal columns in one row,
   icon above short label, ≥ 44 px.
10. **Stat tiles**: missing space before truth tag ("Dry◈ Estimated", "decimals⬡ Scenario") — add a gap everywhere.
11. **iOS zoom on focus**: every `input`/`select` in #field ≥ 16 px font on phones (`#boundary-size`, `#lookup`, modals).
12. **Service worker** (`prepare-offline.py`): install precaches all ~3000 files incl. tiles before `skipWaiting`, so on
    mobile data the new version waits ~20 MB and old JS keeps serving. Precache only the app shell + `/data/*.json`;
    cache tile files on first use (cache-first for `/tiles/`), and warm the pilot-site tiles in the background after
    `activate`. Keep the Esri never-cache rule.

## Rules
Bilingual `t(en,bn)` for every new label; text ≥ 12 px; tap targets ≥ 44 px; no horizontal page scroll at 360 px;
reuse existing classes/tokens; no new dependencies.

## Acceptance (must pass)
`npm test` (add tests: phone short labels present in render, `#inspect-sheet` container rendered, SW precache list
contains no `/tiles/` paths but the fetch handler caches `/tiles/`). Out of scope: other views, data, 3D, copy changes.
