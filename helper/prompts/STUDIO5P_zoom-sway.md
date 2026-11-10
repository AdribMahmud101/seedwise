# STUDIO5P · Closer default zoom + subtle horizontal idle motion

Owner: "make the 3D more zoomed initially and it should show subtle movements horizontally". Files: `src/legacy/studio3d.js` and `src/legacy/planner3d.js` — ONLY the default camera fit (`fitPerspective` / end state of the intro) and the idle-motion code (`applyIdleFloat` or equivalent). Another card (RESP1) edits overlay positions/CSS in studio3d.js — do not touch overlay/callout/ruler code.
1. **Closer default:** in "3D field" view, after the intro, the field block fills ~70–75 % of the canvas width (desktop) and ~90 % (phone), still fully visible and not under the top-left controls or bottom cards (keep the existing free-region view offset). Close-up/Top view unchanged. The intro (STUDIO5M) must end exactly on this new framing.
2. **Subtle horizontal motion:** replace the vertical bob as the main idle motion with a slow horizontal yaw sway of the camera around the field centre: ±6–8°, sinusoidal, period ~14 s, plus a tiny ±1 % dolly breathing. Keep a very small vertical float (≤ 25 % of today's).
3. **Rules:** motion pauses instantly on pointer down/wheel/key/control click and resumes, easing in over 1.5 s, after 6 s without input. Off under `prefers-reduced-motion` and when the tab is hidden. Never fights OrbitControls (apply as an offset on top of the user's camera, not by resetting it).
4. Planner: same sway, ±5°.
5. Test the pure helper (time → yaw/dolly offset; pause/resume easing).
Acceptance: `npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --rule 'no-undef:error' src/legacy/studio3d.js src/legacy/planner3d.js` clean; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
