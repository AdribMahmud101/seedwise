# Shared Season Plan Implementation Plan

**Goal:** Add the data layer specified in JOURNEY1 without changing page UI or existing page state.

**Architecture:** Keep persistence and pure transitions in `src/legacy/journey.js`. Reuse `capacity`, `recommendedSettings`, real rotation calendars, prepared field geometry, and workspace defaults. Page hooks write snapshots; the shared store remains independent of page rendering.

**Tech stack:** Existing ES modules, localStorage, CustomEvent, node:test, Next.js static export.

**Spec:** User's JOURNEY1 card in this session.

## Constraints and decisions

- Use `ropon_season_plan_v1`, schema version 1. Reject invalid imports before replacing saved data.
- Never modify package-lock.json or node_modules. Use existing dependencies outside this worktree if needed for verification.
- Field, rotation, planting, and generated-plan status changes must propagate downstream with persisted English/Bangla reasons.
- Store getters and notifications return copies. Failed writes preserve the previous in-memory plan.
- Exported field snapshots include an optional outline for restoring geometry and custom fields. Supplied outlines must agree with area and fingerprint.
- Page hydration restores field selection, constraints, priorities, and planting settings. Startup remains usable when storage fails.
- `nextStep()` returns the first unfinished step key, or null. `reviewReasons(t)` returns localized reason strings.
- `demoPlan()` starts and completes a demo plan using the same public mutations; it replaces the current season plan.
- Calendar months are 1–12, ordered from Aman, including crops that cross December. Fallow is not a planting season.
- Legacy planner has no season selector. Bind changes to the matching crop season, retaining the current season when no crop matches.
- Priority changes preserve planting settings; changes to rotation identity or seasons reset them. Reject settings that the existing controls would silently clamp.
- Existing linked worktree is `card/JOURNEY1`; no additional worktree or dependency installation is needed.

## Tasks

- [x] Write failing node:test cases for schema, persistence, invalidation, translated reasons, defaults/counts, demo, malformed import, notifications, and page hooks.
- [x] Implement schema validation, pure transitions, store API, snapshot adapters, and real-data demo.
- [x] Wire field persistence, rotation selection/priorities, and planner edits while preserving legacy state.
- [x] Run focused tests, changed-source no-undef lint, npm test, and npm run build. Review the diff and commit.

## Review focus

- Reject prototype keys, invalid nested records, duplicate season keys, non-finite values, and unsupported versions atomically.
- Repeated saves must not invalidate downstream work or emit redundant events.
- Detect geometry changes at every saved boundary entry point, including custom fields.
- Keep crop aliases and year-crossing calendars consistent with the existing engine.
- Reloads must preserve selection and review reasons; storage failures must not erase prior plans.

## Verification

- `node --test tests/journey.test.mjs`: 16 tests passed.
- Changed-source ESLint 8 `no-undef`: passed.
- `npm test`: 386 tests passed, no failures.
- `npm run build`: static export and offline preparation passed.
- Full tests and build ran from an exact source copy beneath the existing repository dependency tree because this worktree has no node_modules. No dependencies or lockfiles were changed.
- Independent review findings were fixed with regression tests. Opening the rotation page preserves outstanding review status.
- No manual browser interaction was checked. No new UI was added.
