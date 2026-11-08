# DATA1B · Truth labels on My field and Past seasons

## Goal
DATA1 put truth badges on 6 views. Finish `#field` and `#seasons` (both in `src/legacy/fields.js`), using `truth(tag, opts)` from `src/legacy/ui.js`. Rules: `spec/15-ui-ux-spec.md` §5, `spec/08` §1, `spec/16-nasa-data-by-route.md` (which source feeds which number).

## Do
1. `#field` climate tiles and plot dossier: wetness (POWER, `MODELED`, "index 0–1", never %), IMERG rain (`REMOTE_OBSERVED`), temperature (`MODELED`), ETo (`MODELED`), boundary area (`FARMER_REPORTED` if drawn, else `SCENARIO` for the demo outline), expected harvest (`SCENARIO`). Pass `source`, `date`, `cell` in opts.
2. `#seasons`: monthly values (same tags as above), Landsat greenness samples (`REMOTE_OBSERVED`; below 25 % valid coverage → `UNKNOWN` "No reliable observation").
3. Don't change the map layers, tap card or 3D code (just badges in the panels/tiles).
4. Tests in `tests/views.test.mjs` (append new `test(...)` blocks only): `#field` and `#seasons` render ≥ 3 truth badges each in EN and BN; no "%" after a wetness value.

## Files in scope
`src/legacy/fields.js`, `tests/views.test.mjs` (append only).

## Out of scope
`terrain3d.js` (MAP4C is editing it), CSS files (use the existing `.truth` styles in `app/labels.css`), data.

## Acceptance
- `npm ci && npm test && npm run build` exit 0 (no `node_modules` symlink)
- `git add -A && git commit -m "DATA1B: truth labels on My field and Past seasons"`
