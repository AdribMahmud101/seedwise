# NETAREA2B verification

Bund and drain use a six-CSS-pixel display target, capped at six times their real widths. The path retains its real width. Physical lengths, areas and field shares remain independent of display enlargement. The bund has a rounded 0.3 m ridge; the drain cuts through the terrain surface and exposes water between muddy banks.

Selection adds cyan emissive emphasis and dims other infrastructure. Closing restores materials. Existing feature raycasts and soil-card interactions share the same details. Desktop cards sit beside the field; phone cards use a bottom sheet. Both clamp to the visible stage and allow internal scrolling when space is limited.

Measurements default on. SVG lines span drawn widths and label the real widths in metres. An overall edge dimension uses the actual edge length. Projection uses the soil-pin 0.5 px stability threshold, camera occlusion checks and label collision avoidance. Top view preserves exact plan coordinates.

Validation:

- `npm test`: 467 passed, zero failures or skips.
- ESLint `no-undef`: clean for both changed JavaScript source files.
- `npm run build`: passed with Next.js 16.4.5.
- Chrome headless 158.0.8127.18: 1366×768 and 412×915 at device scale factor 2.625, with widths 0.4/0.1/0.5 m.
- Both normal 3D cards show every row without scrolling. Browser checks also exercise internal scrolling, selection clearing, direct picking of all three features, four Top-view dimensions, measurement toggling, Escape and partially scrolled stages.
- Zero browser console errors or uncaught page errors. Screenshots use reduced motion for reproducibility.

This checkout has no installed dependencies. Node tests used an external resolver; the production build used an external verification copy with the existing installed dependencies. SHA-256 checks confirmed identical changed source and CSS. No dependency installation, lockfile change or deployment was performed.

Run the browser check against a served static export:

```sh
STUDIO_BASE_URL=http://127.0.0.1:8274 python3 tests/studio-netarea.browser.py
```

Evidence:

- [Desktop: selected drain and complete popover](desktop-3d-selected.png)
- [Desktop: Top-view measurements](desktop-top-measurements.png)
- [Phone: selected drain and complete popover](phone-3d-selected.png)
- [Phone: Top-view measurements](phone-top-measurements.png)
- [Browser assertions and viewport bounds](browser-results.json)
