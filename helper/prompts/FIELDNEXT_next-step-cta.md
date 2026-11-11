# FIELDNEXT — make the "Explore rotations" button the obvious next step (TINY, ≤10 min)

Where: `src/legacy/fields.js` ~line 762, the `.field-recommend` block on the My field page (`#field`) — the "Explore rotations →" button. CSS goes in `app/style.css`. Change nothing else.

1. **Highlight effect** on that button only: a soft repeating ripple/pulse ring (e.g. `::after` box-shadow ring expanding and fading, ~2.4 s loop) plus a gentle arrow nudge (→ moves 3 px right and back). Use the button's existing green; no new colours. Stop the animation on hover/focus (keep a clear focus ring). `@media (prefers-reduced-motion: reduce)` → no animation, keep a static highlighted outline.
2. **Name the next step**: add a small line directly above the button, e.g. "Next step 2 of 4 · Rotation studio — pick crops for this field" (bilingual via `t(en, bn)`, Bengali: "পরের ধাপ ২/৪ · ফসলচক্র স্টুডিও — এই জমির জন্য ফসল বাছুন"). Match the nav numbering (My field 01, Rotation studio 02). Keep it one short line, muted text.
3. Do not change the button's action/href or class names other modules/tests use.

Done when: `node --check src/legacy/fields.js`, `npm test` fail 0, `npm run build` passes. One commit.
