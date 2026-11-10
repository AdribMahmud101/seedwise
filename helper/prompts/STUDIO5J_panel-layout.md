# STUDIO5J · Rotation tool: question-panel layout + text size

Screens: `helper/prompts/STUDIO5J_top.png`, `STUDIO5J_bottom.png` (#rotations at 1280 px after STUDIO5G). The 3 question panels ("When is the field bare or stressed?", "Where will water collect?", "What is under my field?") landed in the narrow left column under "My priorities": headings wrap word-by-word, body text is squeezed into a ~40 px column, month strip unreadable. Page also has ~158 text elements below 12 px.
Fix in `app/rotation-tool.css` (+ minimal markup in `src/legacy/rotations.js`):
1. Put the 3 question panels in their own full-width row directly BELOW the 3D tool block and ABOVE "My priorities / Four rotation scenarios": 3 equal columns ≥ 1100 px, 2+1 at 768–1099, single column < 768. Each panel: eyebrow, heading, short explanation, content; consistent padding with existing `.panel`.
2. Month strip in panel 1: 12 labelled cells, readable (≥ 12 px labels), legend below.
3. Nutrient chips in panel 3: wrap in a grid (2–4 per row), each chip ≥ 44 px tall: name, value + unit, class, truth label.
4. Minimum text size 12 px everywhere on #rotations (labels, captions, chips, 3D overlay cards) — fix the CSS rules producing smaller text.
5. Phone 390 px EN+BN: no sideways scroll, nothing overlaps.
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/rotations.js` clean; `npm test`; `npm run build`. Only rotations.js + rotation-tool.css (+ studio.css for overlay text size). Never touch package-lock.json/node_modules. Commit.
