# NETAREA1C verification

Planner 3D draws bund/drain with the studio NETAREA2B rule: a six-CSS-pixel
display target at the default zoom, capped at six times each real width. The
path keeps the span rule. Physical lengths, areas and field shares, and every
measurement label, keep the real widths. The bund is a raised rounded earthen
ridge; the drain is a recessed channel with deep-teal water between muddy
banks, dark enough to read against the flooded paddy.

Selection adds emissive glow (gently pulsing unless reduced motion is on) and
dims the other zones; closing restores materials. Tapping a chip or the 3D
feature opens the zone popover, clamped fully inside the visible stage with
internal scrolling on cramped stages. The legend carries the honesty note:
"Bund and drain drawn wider for readability; numbers use your real widths."

The x6 cap binds for the 0.1 m drain on the phone stage (~4 px projected),
where it takes precedence over the 6 px target — the same precedence as the
studio. Desktop projects both features above 6 px.

Validation:

- `npm test`: 512 passed, zero failures or skips.
- ESLint `no-undef`: clean for both changed JavaScript source files.
- `npm run build`: passed with Next.js 16.4.5.
- Chrome headless 158.0.8127.18: 1366×768 and 412×915 at device scale factor
  2.625, with widths 0.4/0.1/0.5 m.
- Browser checks cover legend chips and note, real-width measurement labels,
  drawn-width projection, chip highlight switching, full popover rows and
  containment, Escape clearing, and tapping the 3D drain ribbon itself.
- NETAREA1B browser checks (markers, toggle, sliders, top view) re-run green
  against this build.
- Zero browser console errors or uncaught page errors. Screenshots use reduced
  motion for reproducibility.

This checkout has no installed dependencies. Node tests, the production build
and ESLint ran in an external verification copy with the existing installed
dependencies (three 0.181.2, Next.js 16.4.5). SHA-256 checks confirmed
identical changed source and CSS. No dependency installation, lockfile change
or deployment was performed.

Run the browser check against a served static export:

```sh
NETAREA1C_SERVE=/path/to/out python3 tests/netarea1c.browser.py
```

Evidence:

- [Desktop: overview](desktop-overview.png)
- [Desktop: selected drain and complete popover](desktop-drain-selected.png)
- [Phone: overview](phone-overview.png)
- [Phone: selected drain and complete popover](phone-drain-selected.png)
- [Browser assertions and viewport bounds](verification.json)
