# STATE1 · Loading, empty, unknown, error and example states (6 views)

## Goal
Every view handles all five states (spec 15 §10, binding): **Loading** (space reserved, one short line), **Empty** (what's missing + one action), **Unknown** (the ⊘ truth badge from `truth('UNKNOWN')` in `ui.js` + link to the entry form), **Error** (plain sentence + retry; no raw error text on farmer screens), **Example** (a visible "Example — not your field" banner, also in print/export). Apply to `#rotations #planner #clinic #water #recovery #research`.

## Do
1. Add small shared helpers in `src/legacy/ui.js`: `stateEmpty(msg, actionLabel, action)`, `stateError(msg, retryAction)`, `exampleBanner()`. Bilingual via `t`. Reuse existing classes (`.empty`, `.notice`, `.button`); put any new CSS in `app/labels.css` (not `style.css`).
2. In each of the 6 views, find the places where data can be missing, a list can be empty, a fetch can fail, or an example is shown, and use the helpers. Recovery already labels examples: make sure the banner style is the shared one and it appears in its print/export.
3. Data load failure: if `loadData()` fails, the app shows `stateError` with a Retry button instead of a blank screen (`app.js`).
4. Tests in `tests/views.test.mjs`: (a) with an empty research log the view shows the empty state and an action; (b) a forced data error renders the error state, not a stack trace; (c) the recovery example shows "Example — not your field" in EN and BN.

## Files in scope
`src/legacy/ui.js`, `src/legacy/app.js`, `src/legacy/{rotations,planner,clinic,water,recovery,research}.js`, `app/labels.css`, `tests/views.test.mjs`.

## Out of scope
`src/legacy/fields.js` and `app/style.css` (MAP4B is editing them), data, new colours/fonts/libraries.

## Acceptance
- `npm ci && npm test && npm run build` exit 0 (no `node_modules` symlink)
- `git add -A && git commit -m "STATE1: five UI states in 6 views + data-load error screen"`
