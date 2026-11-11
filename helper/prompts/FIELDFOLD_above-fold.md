# FIELDFOLD — My field: map + side boxes + "Explore rotations" visible without scrolling (≤25 min)

Page: `#field` (`src/legacy/fields.js`, CSS `app/style.css`). The owner's screenshot at 1882×906: the welcome banner ("Your field. Your next season." + Plan my season / Watch Rahim's journey / Continue later), the big "My field notebook" title block and the field chips push the map and the Plot dossier below the fold; the "Explore rotations →" button (`.field-recommend`, bottom of the dossier) is never seen without scrolling, and its ripple is too subtle.

## 1. Fit the first screen (desktop/laptop ≥ 1024 px wide, heights 700–1000 px)
- Compress the welcome banner into one slim row (Planty icon + one-line title + the 3 buttons inline, small) — keep all 3 actions.
- Put the page title, subtitle, field chips (Mithapukur/Pirganj/Gangachara) and the Disaster recovery / Find a field buttons into a compact header (1–2 rows max, smaller title).
- Map card + Plot dossier side by side, together sized to the remaining viewport height (`height: calc(100dvh - <header stack>)`, min ~520 px). The map fills its card; the map layer toggles/opacity stay in one compact row.
- The dossier scrolls internally if long, and the **"Next decision / Explore rotations" block is pinned to the bottom of the dossier** (sticky, always visible).
- Mobile (< 1024 px) keeps the normal stacked flow, but add a **sticky bottom CTA bar** "Next: Rotation studio → Explore rotations" that appears once the map is on screen and hides when the original `.field-recommend` block is visible (IntersectionObserver). Must not cover the "Ask Planty" button — shift one of them.
- Don't remove any content or data; only re-layout. No horizontal scroll at 412 px or 1366 px.

## 2. Make the CTA eye-catching (restyle completely, allowed)
Replace the faint ripple with something clearly visible but tasteful: e.g. animated conic-gradient glowing border (green → lime → green, rotating ~3 s), a light shimmer sweep across the button every ~4 s, a soft outer glow pulse, and the → arrow nudging. Larger button, high contrast. Keep the "Next step 2 of 4 · Rotation studio — pick crops for this field" line directly above it. Pause on hover/focus; `prefers-reduced-motion` → static glow border only.

Keep ids/actions/classes used by tests and other modules (`.field-recommend`, `goButton(... "rotations" ...)`, journey/Planty guide hooks). Bilingual `t()`.

## Done when
`node --check`, `npm test` fail 0, `npm run build` passes. Self-check with a quick screenshot at 1366×768 and 1882×906 that the Explore rotations button is inside the first viewport, and at 412×915 that the sticky bar shows. One commit.
