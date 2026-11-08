# UI1 · Polish UI/UX and make every view mobile friendly

## Goal
Find and fix UI/UX and mobile problems in all 8 views (#field #seasons #rotations #planner #clinic #water #recovery #research) and the Evidence register, keeping the existing look.
Rules: `spec/15-ui-ux-spec.md` (binding). Decisions: `spec/14-decision-recommendations.md`.

## Do
1. Audit each view at 360 px, 768 px and 1280 px, in EN and BN. Write the findings to `docs/ui-audit.md` (view · issue · fix · done?).
2. Apply spec 15 §3 sizes: body 16 px; nothing below 12 px; buttons 14 px; every tappable control ≥ 44×44 px with ≥ 8 px gap.
3. Apply §2 colour limits: no text in `--gold`; `--blue` text only ≥ 24 px; no `--muted` text on `--light`.
4. Mobile: no horizontal page scroll at 360 px; wide tables in `.table-wrap` or stacked; maps/canvas fit the width; the mobile menu works; controls don't cover legends.
5. Keep a visible focus ring; labels on icon-only buttons; nothing conveyed by colour alone.
6. Fix the other real bugs you find (overflow, overlap, clipped Bengali text, broken spacing) in the same style.

## Files in scope
`app/style.css`, `app/recovery.css`, and markup/class changes in `src/legacy/*.js` only where CSS alone can't fix the issue. Add `docs/ui-audit.md`.

## Out of scope
No new features, routes, 3D, libraries, fonts, CDNs or colours. No changes to `public/data/`, engines or calculations. Don't restyle the brand.

## Acceptance (all must pass)
- `npm ci && npm test && npm run build` exits 0
- `grep -nE 'font-size:\s*([0-9]|1[01])px' app/*.css` prints nothing
- `docs/ui-audit.md` lists every fixed issue, plus anything left with a reason
- spec 15 §12 checklist pasted at the end of `docs/ui-audit.md` with each box ticked or explained
- Commit on this branch: `git add -A && git commit -m "UI1: mobile-friendly UI polish per spec 15"`
