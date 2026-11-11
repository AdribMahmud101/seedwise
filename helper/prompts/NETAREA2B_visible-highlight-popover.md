# NETAREA2B · Studio bund/drain/path: make them visible, highlight on select, popover fully on screen

Your NETAREA2 (merged) draws bund/drain/path at true scale in src/legacy/studio3d.js. Browser check at 1366×768 with widths 0.4/0.1/0.5 m: the path strip is visible, but the **bund and drain are practically invisible** (true scale on a ~25–30 m field), and tapping a chip (Bund/Drain/Path) opens a popover that is **clipped by the stage bottom** — only the title "Drain" shows; nothing highlights in 3D.
Fix:
1. **Readable display scale with honesty**: draw bund/drain at a minimum on-screen width (e.g. enlarge so each is ≥ ~6 px at default zoom, cap ×6), raised bund ~0.3 m with rounded profile and darker compacted soil + grass tufts; drain as a recessed channel with visible water (blue-grey, subtle shimmer) and muddy banks following terrain on the lowest edge. Update the legend note: "Bund and drain drawn wider for readability; numbers use your real widths."
2. **Highlight on select**: tapping a chip or the feature itself pulses/outlines that feature (emissive glow or outline pass) and dims others slightly; clears on close.
3. **Popover placement**: position the popover fully inside the visible stage (flip above/aside when near the bottom; on phones use the existing bottom-sheet style); max-height with internal scroll; must show all rows (source label, width, length, area m² + decimals, share %, note, "Edit on My field").
4. Clicking the 3D feature directly (raycast) opens the same popover.
Tests for min-width scaling maths and popover placement clamping. Verify Chrome headless 1366×768 and 412×915@2.625 screenshots: bund + drain clearly visible, one highlighted with its full popover. Zero console errors. Commit as soon as it works.
Acceptance: eslint no-undef clean on changed src; `npm test` ALL pass; `npm run build`. Never touch package-lock.json/node_modules/secrets. Commit.
