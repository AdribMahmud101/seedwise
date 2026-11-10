# STUDIO5M · Bigger default framing + short intro animation

Owner (screenshot `helper/prompts/STUDIO5M_now.png`, #rotations 1280 px): "initially it stays small, and on first load it should show some automated motion for a short time — make this animated".
Work only in the camera/animation parts of `src/legacy/studio3d.js` (+ `planner3d.js` for item 4). Another card (RESPONSIVE) is editing the depth ruler and CSS — don't touch those.
1. **Bigger default:** in "3D field" view the block should fill ~55–60 % of the canvas width, centred in the free area to the right of the soil-callout column and above the probe/transect cards (today it is ~25 %). Keep the free-region view offset logic; adjust distance/target. Phone: block ~85 % of canvas width.
2. **Intro (first load only, ~3.5 s total, ease-out-cubic):**
   - camera starts higher and farther, swings ~70–90° around the field while descending into the default view;
   - land rises in (scale-y or translate-y from below, 0→1 over the first 1 s);
   - crops grow up (instance scale 0→1, staggered by row) during 0.6–2.2 s;
   - soil bands/water table reveal top→bottom;
   - soil callouts + leader lines fade/slide in after 2.6 s; A/A′ pins pop in last.
   - Then a gentle idle sway/float continues (existing).
3. **Rules:** any user input (pointer down, wheel, key, control click) instantly ends the intro at its final state. Skip entirely under `prefers-reduced-motion` and when the tab is hidden. Play once per session per view (`sessionStorage`); the ↺ reset button replays it. No layout shift; 60 fps target (animate camera + uniforms/instance matrices only, no geometry rebuilds).
4. **Planner:** same idea, shorter (2 s): camera swing + crops growing.
5. Tests for the pure easing/timeline helper (progress → camera params; skip logic).
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/planner3d.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
