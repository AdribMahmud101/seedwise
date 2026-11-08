# 09 · Validation and Tests

## 1. Mandatory tests for coding agents [BP §8.2]

Every fleet task touching the relevant area must keep these green:

| ID | Test |
|---|---|
| T-UNIT | 0.30 GWETROOT must not render as "30% volumetric water content"; 0.30 RZMC renders as 0.30 m³/m³ |
| T-GRID | Coordinates in one 9 km SMAP cell must not get different pseudo-high-resolution moisture values without an independent downscaling model |
| T-SCENE | No valid optical pixels after cloud/shadow masking → "No reliable observation", not NDVI 0 |
| T-TIME | Stale 2024 scenes must not show a November 2026 "today" badge |
| T-RADAR | NISAR 3–10 m amplitude imagery must not be described as 3–10 m moisture retrieval |
| T-SOIL | Missing lab P/K stays UNKNOWN; never filled from total N or a greenness proxy |
| T-SAFETY | An FFWC warning outranks model reassurance; no "safe to stay" recommendation |
| T-MODEL | Crop recommendation applies hard constraints before weighted rank; includes a counterexample scenario |
| T-QA | IMERG Final and Early products keep their run identifiers, date and source metadata |
| T-AUDIT | One-click trace from output to raw data/version, farmer inputs and agronomy rule |

### Decision-derived tests (final)

| ID | Test | Decision |
|---|---|---|
| T-ADVICE | A field-kit reading never yields a fertilizer/lime number unless it comes from a cited official table (label "Regional guideline — not site-tested") or a lab/officer target; AWD < −15 cm yields "time to re-irrigate" with **no mm value** | D-C1 |
| T-LABEL | Every rendered value has one canonical provenance tag and the matching farmer label; review status is stored separately | D-C5 |
| T-INDEX | GWETTOP/GWETROOT never render with a "%" sign | D-C6 |
| T-NOPROTO | No prototype constant (e.g. ৳128,783, −68%, 92% cloud) appears in app output unless it is tagged `SCENARIO` or has a source record | D-C7 |
| T-OFFLINE | The built `out/` makes no network request to a CDN (three.js, fonts, Tailwind) | D-C4 |
| T-EVENT | Every replayed disaster event resolves to a date present in the 2021–2025 archive | D-C17 |

## 2. Existing test suite [CORE `tests/`]

Run with `npm test` (`node --test tests/*.test.mjs`, Node ≥ 20).

| File | Covers (test names / DR doc) |
|---|---|
| `views.test.mjs` | Every workspace renders in English and Bengali using all three data packs |
| `recovery.test.mjs` | Active hazards, unknown access and missing readiness never release a planting option · February drought schedules mung before the next crop with full maturity allowance · post-flood Aman requires pre-raised seedlings and does not invent a harvest duration · missed mustard window rolls to next year without advising off-season sowing · dates, missing values and fractional delays validated before calendar arithmetic · every recovery source resolves to an included evidence record and planting links have real types |
| `planning.test.mjs` | Planning engine (rotation/planting) |

CORE/DR also lists unit checks for dry and waterlogged ground, unresolved contamination, surviving crops, missing water, missed windows, next-crop collisions, unknown rice duration and invalid dates. Rendering checks cover all three fields, both languages and all three examples.

## 3. Module release gates (proposed, not achieved) [BP §8.1]

| Module | Validation measurement | Release gate |
|---|---|---|
| Soil moisture | Calibrated VWC/soil tension and rice standing-water levels; field vs regional | Report bias, MAE, RMSE by crop/soil; no field-precision claim without measured skill |
| Irrigation | Predicted need vs agronomist/probe observations, water saved, stress/yield effect | Conservative thresholds + human override; pilot before recommending quantity |
| Stress | Independent agronomist labels (water / nutrient / disease) | Confusion matrix and abstain rates; no unsupported definitive diagnosis |
| Flood | Held-out flood extents, field flood logs, official river gauge | Precision/recall/IoU; false-reassurance and missed-event tests |
| Crop suitability | Local yield/soil follow-up, expert assessment | Top-choice suitability with yield/profit uncertainty, season-stratified |
| Fertilizer | Lab-tested N/P/K vs BARC FRG recommendation | No automatic precision dosing without tests; expert review |
| Data integrity | Known cloudy scenes, stale inputs, units, boundaries, latency, QA flags | **Fail closed** on stale/invalid data; show UNKNOWN |

## 4. Research transparency [BP §8.3]

The researcher inspector compares IMERG vs POWER MERRA corrected rain, flags large disagreement, inspects scene cloud cover and effective resolution, examines soil-map uncertainty and exports reproducibility metadata. It reports failures and abstentions, not only examples that look correct.

## 5. Demo hygiene [CORE/JW]

Use a clean browser profile for judging. Mark any example observation entered live as a demonstration. The prepared data and imagery run from the local server with no live NASA call.
