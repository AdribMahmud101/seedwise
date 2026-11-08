# Ropon Radar — Structured Specification

NASA Space Apps Challenge 2026 · Rangpur pilot (Mithapukur · Pirganj · Gangachara)

**Status: FINAL (8 Nov 2026).** All conflicts resolved and decisions applied.

This folder reorganizes every spec, doc and prototype in the project into one structured specification. **Nothing here is new scope.** Each statement carries a source key pointing to the file it came from. Where sources disagreed, the disagreement is recorded in [12](12-conflicts-and-open-questions.md), and the approved resolution in [14](14-decision-recommendations.md) is applied throughout. Applied decisions are marked **[D-Cx]** or **[D-Qx]**.

## Reading order

| # | File | Answers |
|---|---|---|
| 00 | [source-inventory](00-source-inventory.md) | What files exist, what each one is, how authoritative it is |
| 01 | [product-overview](01-product-overview.md) | What Ropon Radar is, for whom, and what it must never claim |
| 02 | [core-views](02-core-views.md) | The 8 hash routes of the core Next.js app and what each does |
| 03 | [feature-catalogue](03-feature-catalogue.md) | All 18 planned features + Soil Fertility mode, mapped to views and build status |
| 04 | [data-sources](04-data-sources.md) | Every satellite, model and Bangladesh dataset: resolution, use, restriction |
| 05 | [ground-truth-and-farmer-inputs](05-ground-truth-and-farmer-inputs.md) | Low-cost field tools and what the farmer/officer enters |
| 06 | [methods-and-equations](06-methods-and-equations.md) | Every formula and calculation rule |
| 07 | [architecture](07-architecture.md) | Layers A–F, data-fusion pipeline, current tech stack, data contracts |
| 08 | [evidence-safety-and-privacy](08-evidence-safety-and-privacy.md) | Provenance labels, decision output contract, guardrails, consent |
| 09 | [validation-and-tests](09-validation-and-tests.md) | Release gates, mandatory agent tests, existing test suite |
| 10 | [roadmap](10-roadmap.md) | P0/P1/P2 priorities, M1–M6 increments, integration backlog |
| 11 | [ux-and-demo](11-ux-and-demo.md) | Farmer interface rules, Banglish messages, judging walkthrough |
| 12 | [conflicts-and-open-questions](12-conflicts-and-open-questions.md) | Contradictions found between sources (all resolved) |
| 13 | [source-register](13-source-register.md) | External references S1–S25 and evidence used by the app |
| 14 | [decision-recommendations](14-decision-recommendations.md) | **Final decisions** — override any conflicting source statement |
| 15 | [ui-ux-spec](15-ui-ux-spec.md) | **UI/UX rules every agent follows** — base UI kept, done checklist |
| 16 | [nasa-data-by-route](16-nasa-data-by-route.md) | Which NASA data each screen uses, in easy words |

## Source keys

| Key | Original file | Type |
|---|---|---|
| **BP** | `specs/Ropon_Radar_Blueprint.zip` → `Ropon_Radar_Blueprint.docx` (edition 05 Nov 2026) | Master research & architecture blueprint |
| **F18** | `specs/Shob plan aar features Banglish-e sohoj bhabhe niche bujhie dewa holo_.txt` | 18-feature plan (Banglish) + soil-fertility note |
| **DS** | `specs/ropon_radar_task_integration_data_strategy.md` | Data strategy & field-tool task |
| **DS-H** | `specs/ropon_radar_task_integration_data_strategy_impact_analysis.html` | Interactive version of DS (+ fusion simulator, link audit) |
| **3D-R** | `specs/ropon_radar_3d_field_soil_rotation_decision_support.html` | 3D prototype: rotation, slope/drainage, soil cutaway |
| **3D-F** | `visuals/ropon_radar_3d_field_water_soil_explorer_for_farmers.html` | 3D prototype: 5-tab farmer explorer of all 18 features |
| **VIS** | `visuals/interactive_visual_im_ea5a3be159572e9d.html` | Generic 3D parcel-mesh viewer (UI reference only) |
| **CORE** | `src/Ropon-Radar-Rangpur_core.zip` (Next.js, v1.2.0) | **Implemented system** — code, data pack, docs |
| CORE/M | `docs/method.md` | Methods and limitations (3 Nov 2026) |
| CORE/AG | `docs/agronomy-notes.md` | Agronomy evidence & model boundaries |
| CORE/DR | `docs/disaster-recovery.md` | Disaster recovery v1.1 |
| CORE/JW | `docs/judging-walkthrough.md` | 2-minute demo script |
| CORE/CR | `docs/credits.md` | Data & software credits |
| **V1** | `src/Ropon-Radar-Rangpur-v1.zip` | Pre-migration static build (superseded by CORE) |

Section references look like `BP §3.1`, `F18 #4`, `CORE/M "Rotation fit"`.

## Precedence rule

0. **Final decisions (14)** override everything below.
1. **CORE** describes what *is built*.
2. **BP** is the most complete statement of *what should be built* and of the scientific guardrails.
3. **F18** is the feature list and farmer-UX intent.
4. **DS / DS-H** define the ground-truth field-kit task and data-fusion idea.
5. **3D-R / 3D-F / VIS** are visual/interaction prototypes; their numbers are illustrative unless sourced.

## Decisions at a glance

- **Pilot:** Mithapukur · Pirganj · Gangachara; 3D demo field in Mithapukur. [D-C2]
- **Advice:** tiered; numbers only from official tables or lab/officer targets; no mm irrigation amounts. [D-C1]
- **IA:** 8 routes grouped into 5 farmer areas; 3D is a toggle in `#field` and `#water`; three.js self-hosted. [D-C4]
- **Labels:** 6 schema tags → 4 farmer labels; review status separate. [D-C5]
- **Data:** SMAP via POWER is the first new data card; no unsourced prototype numbers. [D-C11, D-C7]
- **Build:** offline static export, no live forecast, no IVR/SMS. [D-Q1, D-Q4, D-Q5]
