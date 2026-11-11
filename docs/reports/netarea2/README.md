# Studio field infrastructure verification

Verified with headless Chrome 158.0.8127.18 using SwiftShader on 2026-11-11.

Saved field inputs: bund **0.4 m**, drain **0.1 m**, path **0.5 m**, other **0.5 decimals**.

| Viewport | 3D | Top | Console errors |
| --- | --- | --- | --- |
| 1366 × 768, DPR 1 | [Desktop 3D](desktop-3d.png) | [Desktop Top](desktop-top.png) | 0 |
| 412 × 915, DPR 2.625, touch enabled | [Phone 3D](phone-3d.png) | [Phone Top](phone-top.png) | 0 |

Captures use the studio's full-screen view with a pinned Drain parameter card. Desktop 3D uses four zoom-in clicks. Animation frames were paused during PNG capture and resumed for interactions.

Both viewport runs passed direct field-path mesh clicks/taps, feature-chip selection, pin persistence after rebuilding the block, Slice mode, pointer departure while pinned, close button, Escape, and outside-click dismissal. Phone feature selection used touch taps. Cards stayed within the viewport and above the chip row.

Validation:

- `npm test`: **453 passed, 0 failed**.
- ESLint `no-undef`: clean on `src/legacy/studio3d.js` and `src/legacy/studio3d-helpers.js`.
- `npm run build`: passed, including offline preparation.
- Focused geometry tests cover elevation-based lowest edges, strip areas, zero widths, crop clearance, rotated and subdivided boundaries, and rounded terrain. Popover tests cover units, percentages, truth labels, and the My field link.

The source worktree has no installed dependencies. Tests used an external module resolver; the build used a copy in `/tmp/netarea2-verify` and existing dependencies through a read-only symlink. Only that copy's Turbopack root was adjusted for dependency resolution. Repository dependencies, lockfile, planner files, and secrets were not modified.

Placement remains illustrative. Popovers distinguish physical zone areas from My field's perimeter-based cultivable-area estimate. Physical devices were not tested.
