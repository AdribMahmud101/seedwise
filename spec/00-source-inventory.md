# 00 · Source Inventory and Categorization

Every file in the project folder, classified by category and role.

## Category map

| Category | Files |
|---|---|
| **A. Implemented system** | CORE (`src/Ropon-Radar-Rangpur_core.zip`), V1 (`src/Ropon-Radar-Rangpur-v1.zip`, superseded) |
| **B. Product & research specification** | BP (Blueprint docx), F18 (18-feature Banglish plan) |
| **C. Data strategy / field-kit task** | DS (markdown), DS-H (interactive HTML of same task) |
| **D. Interactive prototypes (visual / UX reference)** | 3D-F, 3D-R, VIS |
| **E. In-repo technical docs (inside CORE)** | CORE/M, CORE/AG, CORE/DR, CORE/JW, CORE/CR, `README.md` |

## File-by-file

| Key | Current location | Size | What it is | Status / authority |
|---|---|---|---|---|
| CORE | `src/Ropon-Radar-Rangpur_core.zip` | 118 MB (incl. `node_modules`, `out/`) | Next.js 16 App-Router project, `output: "export"` static offline site. 8 workspace views in `src/legacy/*.js` mounted by `app/AppLoader.js`; hash routes. Data pack in `public/data/`, raw POWER/Landsat in `data-raw/`, fetch scripts in `scripts/`, Node tests in `tests/`. `package.json` v1.2.0. | **Source of truth for what exists.** |
| V1 | `src/Ropon-Radar-Rangpur-v1.zip` | 1.1 MB | Same app as static `dist/` build (pre-Next.js). Code differs from CORE mainly in asset paths (`assets/` → `/assets/`). Has no `app/`, tests or extra fetch scripts. | Superseded by CORE; keep as archive. |
| BP | `specs/Ropon_Radar_Blueprint.zip` | 54 KB | "Earth Observation + Soil Intelligence" blueprint, edition 05 Nov 2026, ~5,000 words: evidence types, mission catalogue, six farmer questions, soil/NPK, disaster/clinic, architecture A–F, equations, output contract, backlog, validation, M1–M6 plan, source register S1–S25. States it did **not** re-audit project files. | Primary spec + guardrails. |
| F18 | `specs/Shob plan aar features…txt` | 7 KB | Banglish explanation of core concept, **18 features** (what + data), farmer interface (5 views, action cards, truth labels, local units, phone/offline), plus an English note proposing a **Soil Fertility & Nutrient Intelligence** mode. References a Google Doc "Ropon Radar 18-Feature Spec Doc" (linked from 3D-F). | Feature list + UX intent. |
| DS | `specs/ropon_radar_task_integration_data_strategy.md` | 11 KB | Task brief: resolution paradox (9 km → 250 m → 809 m²), online datasets table, five low-budget offline tools, 3-step data-fusion pipeline, presentation checklist. | Data/ground-truth task spec. |
| DS-H | `specs/ropon_radar_task_integration_data_strategy_impact_analysis.html` | 100 KB | Tailwind single page of DS plus: interactive resolution visualizer, dataset filter, **3-step fusion simulator** with concrete prescriptions, and an **11-link verification table** (updated URLs). | Same content as DS + link audit; simulator outputs conflict with BP (see 12). |
| 3D-R | `specs/ropon_radar_3d_field_soil_rotation_decision_support.html` | 370 KB | three.js r128 prototype "3D Field, Soil & Rotation Atlas": seasonal bare-field window, farm priorities weights, layout geometry, NASADEM slope/drainage with proposed trench, subsurface cutaway with NPK lens, local-test modal, pump calculator, 4-rotation comparison, data-fusion citation table. Site: **Burirhat, Rangpur** (RARS trial). | Prototype — misfiled under `specs/`; belongs with visuals. |
| 3D-F | `visuals/ropon_radar_3d_field_water_soil_explorer_for_farmers.html` | 441 KB | three.js r128 prototype "3D Field, Water & Soil Explorer": 5 tabs (My Field · Water & Drainage · Soil/Roots/NPK · Layout/Stress/Rotation · Flood & Recovery) explicitly mapping **all 18 F18 features** + soil-fertility mode; data-truth labels; 5 local units; disaster replay; pump & rotation comparison; local-test modal. Site: Burirhat. | Most complete UX prototype of F18. |
| VIS | `visuals/interactive_visual_im_ea5a3be159572e9d.html` | 163 KB | three.js 0.146 generic "Agricultural Terrain & Parcel Mesh Viewer" (64×64 DEM grid, overlay switch, probe, exaggeration). Values (142.4 m elevation, 4.8° slope) do not match Rangpur. File begins with a stray Markdown ```` ```html ```` fence. | **Final [D-C13]:** UI/interaction reference only; values never cited. |

## Contents of CORE worth knowing

| Path | Contents |
|---|---|
| `app/page.js`, `app/layout.js`, `app/AppLoader.js` | Next.js shell; loads Leaflet then imports `src/legacy/app.js`, which owns `#app` |
| `src/legacy/app.js` | Route table (8 pages) + Evidence register modal + hashchange render loop |
| `src/legacy/{fields,rotations,planner,clinic,water,recovery,research,report,boundary,engine,recovery-engine,recovery-data,ui}.js` | View modules and engines |
| `public/data/earth-data.json` | 366 daily records/site (2024), monthly aggregation, paired rain QA, optical masks, request URLs (fields: mithapukur, pirganj, gangachara) |
| `public/data/history.json` | 60 monthly records/site, 2021–2025 |
| `public/data/agronomy.json` | 33 sources, 5 crops, 4 rotations, 25 symptoms, 10 clinic conditions, AEZ, fertilizer, water, groundTruth, qa, resilience, modellingRules |
| `public/data/rangpur_{district,upazilas}.geojson` | Admin boundaries (geoBoundaries ADM3) |
| `data-raw/` | Original POWER/IMERG JSON (2021–2025 archive + 2024) and Landsat GeoTIFF windows |
| `scripts/` | `fetch-earth-data.py`, `extract-optical.py`, `fetch-context.py`, `fetch-optical-history.py`, `fetch-history.py`, `prepare-offline.py` |
| `tests/` | `planning.test.mjs`, `recovery.test.mjs`, `views.test.mjs` (`node --test`) |

## Recommended physical layout (not applied)

The originals were left in place. If the team wants the folder itself categorized:

```
nsac/
  spec/                  ← this structured spec (new)
  sources/specs/         ← BP, F18, DS, DS-H
  sources/prototypes/    ← 3D-R, 3D-F, VIS
  src/                   ← CORE (active), V1 → src/archive/
```
