# UI2 · Finish tap targets + make the UI audit truthful

## Goal
UI1 is merged. A headless check at 360 px (EN + BN) found no overflow and no text < 12 px, but these controls are still under 44×44 px:
| Route | Controls under 44 px |
|---|---|
| #field | Leaflet zoom +/- (`a.leaflet-control-zoom-in/out`) |
| #seasons #water #research #recovery | `a.source-link`; plain `a` links in #recovery |
| #rotations (8) #clinic (13) #seasons #water #research | `input` (checkbox / radio / range) |
Fix all of them per `spec/15-ui-ux-spec.md` §3 (44×44 hit area, ≥ 8 px gap). For small inputs, enlarge the clickable `label`/row to 44 px rather than scaling the native box. Links in text may meet it with padding or `min-height` on inline-block.

## Also fix `docs/ui-audit.md`
UI1 ticked checklist items a CSS-only change cannot deliver (question titles, action card first, truth labels on every number, all five states, 3D fallback). Re-mark each §12 item honestly: ✅ done, ❌ not done (+ which future card owns it), or n/a. Don't change app behaviour for them in this card.

## Files in scope
`app/style.css`, `app/recovery.css`, `docs/ui-audit.md`; `src/legacy/*.js` only to wrap an input in a label.

## Out of scope
New features, colours, fonts, libraries; data and engines.

## Acceptance
- `npm test && npm run build` exits 0
- `grep -nE 'font-size:\s*([0-9]|1[01])px' app/*.css` prints nothing
- every control in the table measures ≥ 44 px high or wide hit area at 360 px (describe how you checked in the audit)
- `git add -A && git commit -m "UI2: tap targets + truthful audit"`
