# ADVANIM — animated "Planty is working" reveal for the AI decision helper (SMALL, do it fast: ≤15 min)

File: `src/legacy/advisor.js` (+ CSS in `app/rotation-tool.css`). Do not touch other pages.

Today the verdict card (`resultHtml`) appears instantly. For judging, show a short staged sequence first, then stream the result in.

## 1. Planty steps (in `#advisor-card`, replacing the plain skeleton)
Animated Planty mascot (`plantyMascot('thinking')`) + a vertical list of 3 steps. Each step: spinner → green ✓ tick, then the next step starts. Steps must name the REAL sources this check uses (they are real — see `fieldContext()`):
1. "Reading NASA POWER seasonal outlook" + `nasaBadge('outlook')` (or the existing outlook badge key — grep `nasaBadge(` in ui.js)
2. "Checking satellite flood history (NASA HLS · Prithvi)" + the flood badge key
3. "Matching Rangpur research & rotations" (agronomy.json — no NASA badge)
Only show step 1/2 if `fieldContext()` actually has `outlook` / `flood` for this field; skip a step that has no data (no fake steps).
Timing: steps advance ~700 ms each while the real fetch runs; the last tick waits for the response. Presets (`adv-preset`, instant) still play the full sequence (~2.2 s total). On error, the current step shows ✕ and the existing error text.

## 2. Streamed result
After the last tick, render the result progressively, like a chat/generative-UI answer:
verdict header fades/slides in → summary text streams word-by-word (~25 ms/word, blinking caret) → the 12 calendar cells pop in left-to-right (40 ms stagger) → Why / Risks / What you'd need lists reveal item by item → evidence + buttons fade in. Total ≈ 3–4 s. Text content must be exactly the API/preset result (no invented text).
- A "Skip ▸" text button during the stream shows everything at once.
- `prefers-reduced-motion: reduce` → no animation, show instantly.
- Re-renders (`rerender()` replaces outerHTML) must not replay the animation for an already-shown result — track a flag on `ui`.
- Keep all existing actions/ids (`adv-use`, `adv-try`, `adv-exit`, `show-rotations`, `.adv-drop`, suggestions). Bilingual via `t()`.

## Done when
`node --check src/legacy/advisor.js`, `npm test` fail 0, `npm run build` passes. One commit.
