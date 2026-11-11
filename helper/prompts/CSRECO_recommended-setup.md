# CSRECO — "Recommended setup" button in Planting settings (SMALL, ≤15 min)

Where: `customSettingsPanel()` / `customInput()` in `src/legacy/advisor.js` (Planner page, custom plan from the Rotation studio). CSS in `app/style.css` (`.cs-*`). Do not change other pages.

## What to build — 2-click flow
1. **Click 1:** a button at the top of the panel: "✦ Use recommended setup". It opens a small inline preview (smooth height/fade transition) listing only the values that would change, e.g. `Potato · row 45 → 60 cm · within 20 → 25 cm`, `Land split 70/30 → 50/50`, each with its source chip.
2. **Click 2:** "Apply" → the sliders glide to the new values (animate slider value + number over ~600 ms with easing via requestAnimationFrame), the changed crop rows flash a soft highlight, then save to the custom plan exactly as manual slider changes do (reuse the `customInput` save path) and re-render the 3D **once** at the end (`schedulePlanner3d` path already used). "Cancel" closes the preview.
- If everything already matches: the button shows "✓ Recommended setup in use" (disabled), no preview.
- `prefers-reduced-motion` → jump to values, no glide.

## Where "recommended" comes from (REAL data only, no invented numbers)
1. `public/data/agronomy.json` → `crops[].spacingCm` `[row, within]` when the custom crop matches a crop id/label (e.g. Aman/Boro rice 20×20 rice hills, Potato 60×25). Chip: "Research · <source title>" from `sourceIds` → `sources[]`.
2. Otherwise the spacing Planty originally suggested for that crop in the saved plan (store the original AI values when the plan is first saved if not already stored). Chip: "AI · general guidance".
3. Land split (hybrid/together plans only): the AI's original `sharePct`. Rotations (seasons) have no land split — don't show it.
Never make up spacing for a crop that has neither.

Bilingual via `t(en, bn)`. Keep `#plant-controls` form, existing ids, and current slider behaviour.

## Done when
`node --check`, `npm test` fail 0 (add one small test for the "what changes" diff function), `npm run build` passes. One commit.
