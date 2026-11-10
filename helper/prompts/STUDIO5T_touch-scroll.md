# STUDIO5T · Phone touch: page scroll vs 3D control + centre the field

Problem: on phones the 3D stage fills the screen and OrbitControls captures every touch, so users cannot scroll the page when their finger lands on the 3D. Decision (owner asked for a "scroller helper"; supervisor chose the map-style gesture split instead of an extra scrollbar). Files: `src/legacy/studio3d.js` (controls/touch only + framing), `app/studio.css`. Don't touch other routes.
At touch devices / canvas width < 600 px (outside fullscreen):
1. Canvas `touch-action: pan-y` so vertical one-finger drags scroll the page natively.
2. One-finger HORIZONTAL drag rotates the field (azimuth only): detect intent from the first ~10 px of movement (|dx| > |dy| → rotate; else let the browser scroll; never both).
3. Two fingers: pinch zoom + vertical two-finger drag tilts (polar), within existing limits.
4. Tap still probes/opens pins.
5. One-time hint (sessionStorage) on first touch: "Swipe sideways to turn · two fingers to zoom" / Bengali; fades after 2.5 s; respects reduced motion.
6. Fullscreen mode (⛶): restore full one-finger orbit (`touch-action: none`) since there is no page to scroll; exiting restores the split.
7. Desktop/mouse unchanged.
8. Also fix: on phone the field sits low with empty space above — centre the block vertically in the free area between the top bar and the bottom edge (keep ~85–90 % width).
Verify with Playwright touch emulation (Pixel 7): vertical swipe on the canvas changes `window.scrollY`; horizontal swipe changes camera azimuth but not scrollY; screenshot shows field centred. Describe results in the commit message.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js` clean; `npm test` (+ test for the gesture-intent helper); `npm run build`. Never touch package-lock.json/node_modules. Commit.
