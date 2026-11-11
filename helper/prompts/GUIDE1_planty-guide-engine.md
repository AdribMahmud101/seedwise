# GUIDE1 · Planty guide engine: focus ripple, spotlight, speech bubble (reusable, data-agnostic)

For the upcoming Field → Rotation → Planting → Your plan journey, build a REUSABLE guide engine (another card builds the plan data store in parallel — do not depend on it; expose an API it can call). Mobile is the main screen.

1. New module `src/legacy/planty-guide.js` (+ CSS in `app/style.css` under a `.planty-guide` namespace): 
   - `guide.show({ target: selector|Element, text: {en,bn}|string, pose: 'idle'|'thinking'|'happy'|'pointing', placement:'auto', action: 'click'|'input'|'none', onDone })` → dims the page slightly (soft scrim with a cut-out "spotlight" around the target, rounded, animated), draws a **focus ripple** (2–3 expanding soft rings, NASA-green/brand, ~1.6 s loop) on the target, and a speech bubble with Planty (`plantyMascot(pose)` from `src/legacy/planty.js`, uses `/assets/planty/*.webp`) placed beside the target (auto-flip to stay on screen; on phones a bottom bubble). Buttons: Next / Back / Skip guide; if `action` is click/input, wait for that real action on the target, then call onDone.
   - `guide.sequence(steps)` runs steps in order across scroll positions (smooth scroll target into view first; handle targets that appear later via MutationObserver with timeout → skip gracefully).
   - `guide.celebrate(text)` → Planty happy pose + small confetti/sparkle burst (CSS/canvas, tiny, ≤1 s).
   - `guide.hint(target, text)` → non-blocking ripple + small tooltip (no scrim) for subtle nudges.
   - `guide.stop()`; never traps the user; Esc closes; focus management + aria-live for the bubble; respects prefers-reduced-motion (no ripple animation, instant moves); Bengali + English via existing `t()`.
   - Pure helpers (placement maths, step state machine) in a testable module.
2. Demo/proof: add a small "Guide me" button on #planner that runs a 3-step sequence (crop cards → row spacing slider → Ask Planty) — proves the engine end to end; keep it minimal.
Tests: placement maths (flip/clamp at 412×915 and 1366×768), sequence state machine (next/back/skip/action-wait/missing target), reduced-motion path.
Verify screenshots at 1366×768 and 412×915@2.625 of a spotlight step and the celebrate burst. Commit as soon as it works.
Acceptance: eslint no-undef clean (`npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --parser-options=ecmaVersion:latest --rule 'no-undef:error' <files>`); `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
