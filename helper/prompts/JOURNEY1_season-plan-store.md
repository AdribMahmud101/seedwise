# JOURNEY1 · Shared "Season plan" store (foundation for the Field → Rotation → Planting → Your plan journey)

Owner's winning feature: one season plan that the My field (#field), Rotation studio (#rotations) and Planting planner (#planner) pages all read/write, later rendered as an interactive "Your plan" page. This card = the DATA LAYER ONLY (no new UI beyond minimal wiring). Code: `src/legacy/` (ui.js holds `state`, `persist`, `field()`, `polygon()`; rotations.js has priorities/ranked rotations/`getSelectedRotationId`; planner.js + planner-controls.js have crop/spacing/usable %; rotation data has season crops per rotation).

1. New module `src/legacy/journey.js`: a versioned plan object persisted in localStorage (`ropon_season_plan_v1`), e.g.
   `{ version, id, mode: 'own'|'demo', createdAt, updatedAt,
      field: { id, name, areaHa, outlineHash, constraints{...}, confirmedAt },
      rotation: { id, name, priorities{...}, seasons:[{ key, crop, cropBn, sowMonth, harvestMonth }], confirmedAt },
      planting: { [seasonKey]: { crop, rowSpacingCm, withinRowCm, usableAreaPct, variety?, counts{plants, seedKg}, confirmedAt } },
      plan: { generatedAt, summary?, version } ,
      steps: { field:'todo|done|review', rotation:..., planting:..., plan:... } }`
   API: `getPlan()`, `startPlan({mode})`, `confirmField(fieldSnapshot)`, `confirmRotation(rotationSnapshot)`, `setPlanting(seasonKey, settings)`, `confirmPlanting()`, `markPlanGenerated(meta)`, `stepStatus()`, `nextStep()`, `reviewReasons()`, `subscribe(fn)` (simple event emitter; also fire a `ropon:plan` CustomEvent on window), `exportPlanJSON()`, `importPlanJSON(json)` (validate schema/version; reject malformed), `resetPlan()`.
2. **Logical invalidation** (pure, tested): changing the confirmed field (different id or outlineHash or area beyond 1 %) → rotation 'review' (reason "field changed") and planting 'review'; changing the confirmed rotation → planting reset to the new rotation's seasons with recommended defaults and status 'review' (reason "rotation changed: Aman → Potato → Mungbean"); changing a season's settings after the plan was generated → plan 'review'. Keep human-readable bilingual reasons (t(en,bn)) for Planty to say.
3. **Recommended defaults per crop** for planting seeds: reuse the planner's existing crop defaults (do not invent new agronomy numbers); counts computed with the planner's existing count function (export/reuse it, no duplication).
4. **Demo plan** `demoPlan()` = "Rahim's field": Mithapukur prepared site, top-ranked rotation for default priorities, recommended planting per season — built by calling the same functions on real repo data (no hand-typed numbers).
5. Minimal wiring only: when the user changes field on #field, rotation selection on #rotations, or planner settings on #planner, call the store (so it stays in sync). No journey bar / no visual changes (another card does UI). Do not break existing per-page state.
Tests (node --test): schema, persistence round-trip, invalidation rules (each reason), demo plan built from real data, import rejects bad JSON, counts match planner function.
Acceptance: eslint no-undef clean on changed src (`npx eslint@8 --no-eslintrc --env browser,es2022 --parser-options=sourceType:module --parser-options=ecmaVersion:latest --rule 'no-undef:error' <files>`); `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
