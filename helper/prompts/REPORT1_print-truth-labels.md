# REPORT1 · Truth labels and sources in the printable field report

## Goal
The printed or previewed field report (`src/legacy/report.js`) must keep truth labels and sources (spec 15 §11 "Print: the report keeps truth labels and sources"; spec 08 §2 decision output contract). DATA1 added `truth(tag, opts)` in `src/legacy/ui.js`; the report doesn't use it yet.

## Do
1. In `report.js`, put a truth badge next to every number (IMERG rain → `REMOTE_OBSERVED`; POWER wetness index → `MODELED`, labelled "index 0–1" and never %; ETo → `MODELED`; area from the user's boundary → `FARMER_REPORTED`; trial-based harvest → `SCENARIO`; missing → `UNKNOWN`).
2. Add a short "Sources" line at the end of the report with source, date and cell size, and the line "This plan supports, and does not replace, local extension advice."
3. Check print styles: badges must print in black and white with their **word** visible (icon + word, not colour alone). Put any print CSS in `app/labels.css` inside `@media print`.
4. A test in `tests/views.test.mjs`: the report HTML contains ≥ 1 truth badge, the word "index", no "%" after wetness, and the Sources line.

## Files in scope
`src/legacy/report.js`, `app/labels.css`, `tests/views.test.mjs`.

## Out of scope
`fields.js` (MAP3B is editing it), `app/style.css`, data.

## Acceptance
- `npm ci && npm test && npm run build` exit 0 (no `node_modules` symlink)
- `git add -A && git commit -m "REPORT1: truth labels + sources in printable report"`
