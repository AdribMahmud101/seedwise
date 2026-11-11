# Planty guide engine

Import the singleton without depending on a plan store:

```js
import { guide } from '../../../src/legacy/planty-guide.js';

guide.show({
  target: '#a-control', // CSS selector or connected Element
  text: { en: 'Try this control.', bn: 'এই মাপটি বদলে দেখুন।' }, // or a string
  pose: 'pointing', // idle | thinking | happy | pointing
  placement: 'auto',
  action: 'input', // click | input | none (default)
  onDone: () => {},
});
guide.sequence([/* same step objects */]);
guide.hint('#a-control', 'A small nudge.');
guide.celebrate({ en: 'Ready!', bn: 'প্রস্তুত!' });
guide.stop();
```

Every call replaces the active guide. Selectors survive application rerenders; use selectors for controls that get replaced.
Steps wait up to 4 seconds for a visible target, then skip it. Optional `timeout` overrides this duration in milliseconds.
Next is disabled while a step requires a real click/input. Synthetic events do not complete a step.
Back revisits the previous step and requires its action again. `onDone` runs on each successful visit, never on missing targets or Skip.
Hint leaves focus and scroll unchanged, has no scrim, and closes after 6 seconds. Celebration closes after 3 seconds; its burst lasts 850 ms.
Escape and `stop()` cancel waits, observers, listeners, and effects. Focus returns to the origin when the bubble held focus.

The planner's **Guide me** button demonstrates crop selection, the row-spacing slider, and Ask Planty.
Broadcast mustard has no row-spacing control, so that step skips after 1.2 seconds.

## Verification

- ESLint 8 `no-undef` passed for the engine, helpers, planner, and unit tests.
- `npm test`: 374 passed, zero failures. Pure tests cover placement, flip/clamp, next/back/skip, action waits, missing targets, and reduced motion.
- `npm run build`: passed with shared dependencies and webpack. This worktree has no `node_modules`; the default Turbopack build could not resolve Next. Temporary external runner/resolver files supplied shared dependencies without changing repository configuration, lockfiles, or `node_modules`.
- `python tests/planty-guide.browser.py`: passed in Chromium. Requires Python Playwright and an existing `out/` build.
- Browser checks cover real input, crop rerenders, missing/late targets, synthetic-event rejection, Bengali, plain text, reduced motion CSS/scrolling, hint focus, focus restoration, Escape, and cancellation.

Screenshots use the production build at 1366×768 and 412×915 with device scale 2.625. Celebration captures pause the test clock and freeze the burst at 180 ms so software-rendered screenshot latency cannot hide it.

| Viewport | Spotlight | Celebration |
| --- | --- | --- |
| 1366×768 | [Spotlight](desktop-spotlight.png) | [Burst](desktop-celebrate.png) |
| 412×915 @2.625 | [Spotlight](phone-spotlight.png) | [Burst](phone-celebrate.png) |
