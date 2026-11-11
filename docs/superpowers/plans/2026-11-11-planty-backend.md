# Planty backend implementation plan

**Goal:** Connect the existing planner chat to Muse Ember through a same-origin Cloudflare Worker.

**Architecture:** Keep the static export and PWA unchanged. Route `/api/*` through a module Worker, forward other requests to ASSETS, and use the existing `askPlanty` browser boundary.

**Tech stack:** Fetch, AbortController, Cloudflare Workers, existing JavaScript UI, and `node --test`. No new dependencies.

**Spec:** The operator's Planty backend request in this session.

## Constraints and scope

- No API credentials in files, logs, or fixtures. Only the owner configures the Worker secret.
- No deployment, secret commands, package lock changes, or dependency directory changes.
- Keep planner calculations and offline asset handling unchanged.
- Flatten existing planner spacing/counts into the requested context whitelist; retain provenance labels. Do not send yield estimates or unrelated workspace data.
- Reject cross-origin browser requests without CORS grants. Limit JSON bodies to 8 KiB and questions to 600 characters.
- Limit each IP to 20 requests per ten minutes per isolate. Expire idle records.
- Upstream timeout: 20 seconds. Browser timeout: 25 seconds. Keep errors generic.

## Tasks

- [x] Write failing Worker tests for routing, methods, origin, body validation, context sanitization, rate limiting, upstream request shape, timeout, errors, and missing configuration.
- [x] Implement `worker/index.js` and update `wrangler.jsonc` with the requested ASSETS binding and routing.
- [x] Write failing browser tests for request payload, successful text, offline/error fallbacks, timeout, escaping, pending pose, and connection status.
- [x] Update `src/legacy/planty.js`, `planner-controls.js`, the caller in `planner.js`, and message whitespace in `app/style.css`. Update the old preview test.
- [x] Run focused tests, full `npm test`, changed-source no-undef lint, `npm run build`, and `npx wrangler deploy --dry-run`.
- [x] Review the diff for credentials, offline behavior, and scope; commit the completed change.

## Verification environment

This linked worktree has no installed dependencies. Use the main checkout's existing dependencies through temporary external resolution settings. Do not create or modify `node_modules` or `package-lock.json`.

Baseline: all 353 tests pass with the external resolution hook. Without that hook, existing tests cannot resolve `three`.

## Completion evidence

- `npm test`: 370 tests pass using the external dependency resolution hook.
- Changed-source ESLint `no-undef`: passes. Worker lint declares the platform's `AbortController` global.
- `npm run build`: passes in a temporary copy beneath the existing main checkout, with its installed dependencies and unchanged Next config. The resulting static export is copied to this worktree's ignored `out/` for Wrangler validation.
- `npx wrangler deploy --dry-run`: passes with the ASSETS binding; no deployment performed.
- Independent correctness and security review: no actionable findings; 21 focused tests also passed independently.
- Browser smoke check could not run: Chromium crashes before creating a page in this environment. Browser behavior is covered by the mocked-fetch Node tests; visual rendering remains unverified.
- Live Meta connectivity remains unverified. The owner must configure `MUSE_API_KEY` using `wrangler secret put MUSE_API_KEY` before publishing. No secret command was run here.
- No package lock or dependency directory changes.
