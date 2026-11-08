# DATA1 · Truth labels on every number (6 views)

## Goal
Every number a farmer sees must say how sure it is (decision D-C5, `spec/08-evidence-safety-and-privacy.md` §1, `spec/15-ui-ux-spec.md` §5 — binding). Build one label component and apply it to: `#rotations #planner #clinic #water #recovery #research`.

## Do
1. In `src/legacy/ui.js` add `truth(tag, opts)` returning a small `.truth` badge. Tags (the canonical enum): `MEASURED`, `FARMER_REPORTED`, `REMOTE_OBSERVED`, `MODELED`, `SCENARIO`, `UNKNOWN`. Farmer labels (EN/BN via `t`):
   ✓ Measured · জমি থেকে মাপা — `FARMER_REPORTED` shows "✓ Measured · by farmer"
   ◈ Estimated · স্যাটেলাইট অনুমান (REMOTE_OBSERVED, MODELED)
   ⬡ Scenario · কাল্পনিক পরিকল্পনা
   ⊘ Unknown — add data · অজানা — তথ্য দিন (links to the right entry form when one exists)
   Optional `opts.source`, `opts.date`, `opts.cell` go in the badge `title` and an `aria-label` (no hover-only info: also expose them via a `<details>` or the existing evidence drawer).
2. New file `app/labels.css` (import it in `app/layout.js` next to the others): styles per spec 15 §5 using existing tokens only. Icon + word + colour, never colour alone. Min font 12 px; badge hit area ≥ 44 px only if it's tappable.
3. Apply it to every displayed number or value in the 6 views. Pick the tag honestly:
   - trial yields, rotation scores, planting counts, pump/aquifer scenario results → `SCENARIO` or `MODELED` (say which and why in a code comment)
   - IMERG/POWER/SMAP/Landsat values → `REMOTE_OBSERVED` or `MODELED`
   - research-lab entries → `FARMER_REPORTED` (review status kept separately, as now)
   - missing → `UNKNOWN`, never blank or 0
4. Tests in `tests/views.test.mjs`: each of the 6 views renders ≥ 1 truth badge in EN and BN; a null value renders the Unknown badge; no badge uses colour without its word.

## Files in scope
`src/legacy/ui.js`, `src/legacy/{rotations,planner,clinic,water,recovery,research,report}.js`, new `app/labels.css`, `app/layout.js` (one import line), `tests/views.test.mjs`.

## Out of scope
`src/legacy/fields.js` and `app/style.css` (MAP3 is editing them), data files, new colours/fonts/libraries.

## Acceptance
- `npm test` and `npm run build` exit 0 (run `npm ci` in the worktree; don't symlink `node_modules`)
- `git add -A && git commit -m "DATA1: truth labels on every number (6 views)"`
