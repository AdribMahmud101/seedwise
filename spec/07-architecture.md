# 07 · Architecture

## Target architecture: Layers A–F [BP §6.1]

| Layer | Name | Responsibility |
|---|---|---|
| A | Acquisition | NASA POWER (meteorology/IMERG/SMAP), GES DISC, NSIDC, ASF/NISAR, USGS/Landsat, HLS, ECOSTRESS, FIRMS; ESA Sentinel-1/2; Bangladesh FFWC/BARC/SRDI; ISRIC SoilGrids |
| B | Geospatial ETL | Catalogue imagery by scene/time/version; cutouts; cloud/water/radar QA masks; reproject consistently; **preserve native spatial support**; never fabricate higher resolution |
| C | Farm registry | Boundary geometry, acreage, crop, stage, field observations, optional lab results, irrigation logs, roles, consent |
| D | Derived science | NDVI, NDMI, thermal anomalies, rain/soil-moisture anomalies, FAO-56 ET₀, ETc, soil-water balance, flood exposure, regional groundwater signals, crop suitability and economics |
| E | Decision engine | Hard agronomic constraints, uncertainty checks, human-review triggers, trusted-source citations, actionable wording; safety guardrails (e.g. FFWC thresholds) [DS-H] |
| F | Farmer UI + researcher QA | Bangla/Banglish guidance, confidence and data-age labels, side-by-side sensor-discrepancy inspection, ground-truth surveys, evaluation dashboard |

Offline ground-truth data (05) feeds Layer C and calibrates Layer D's FAO-56 water balance and fertilizer models. [DS §1]

## Data-fusion pipeline [DS §4, DS-H §4]

| Step | Name | Content |
|---|---|---|
| 1 | Initialize — online background (default) | SoilGrids pH, POWER ET₀, Sentinel-2 NDVI fetched for the upazila |
| 2 | Local override — offline calibration | Farmer/officer enters pH strip, LCC shade, AWD pipe level, rotation history |
| 3 | Advisory | Engine merges both and tags output with a provenance badge (e.g. `[MEASURED + MODELED FUSION]`); Banglish guidance (IVR/SMS-ready per DS-H) |

Step 3 follows the **tiered advisory rule** [D-C1] (see 05): readings produce check-and-act advice, numbers come only from cited official tables or lab/officer targets, and AWD gives "time to re-irrigate" without an amount. The output's provenance is the set of input tags (08 §1). Delivery is on-screen action cards only; IVR/SMS is out of scope [D-Q5].

## Current implementation [CORE]

| Aspect | Current state |
|---|---|
| Framework | Next.js ^16.4.5 (App Router), React 19, `output: "export"` static site; `trailingSlash: false`; unoptimized images |
| App shell | `app/page.js` renders boot screen + `AppLoader` (client) → loads `/assets/leaflet.js` (window.L) → dynamic `import("../src/legacy/app.js")`, which owns `#app` imperatively |
| Views | Native JS modules in `src/legacy/`, rendered as HTML strings; routing via `location.hash` + `hashchange` |
| Maps / graphics | Leaflet 1.9.4, Canvas, SVG |
| i18n | `t(en, bn)` helper; `state.lang`; `lang-bn` body class |
| Persistence | Browser `localStorage` (`ui.js` → `persist`, one JSON state object); no server |
| Offline | `scripts/prepare-offline.py` + service worker `sw.js` after build |
| Serve | `python serve.py` serves `out/` |
| Data | Static JSON/GeoJSON in `public/data/`; raw snapshots in `data-raw/` (not served) |
| Tests | `node --test tests/*.test.mjs` (Node ≥ 20) |
| Fonts | IBM Plex Sans/Mono, Fraunces, Noto Sans Bengali (self-hosted, OFL) |
| Theme | `themeColor #233d2b` |

Prototype stack (3D-R, 3D-F, VIS): three.js r128/0.146 + OrbitControls from CDN, Tailwind CDN, Google Fonts. These are not offline and not integrated with CORE.

### Final integration decisions

| Topic | Decision |
|---|---|
| Deployment | Offline static export stays the target; auth/server is post-hackathon [D-Q4] |
| 3D | three.js + OrbitControls vendored to `public/assets/`, loaded like Leaflet; 3D is a toggle inside `#field` and `#water` [D-C4] |
| Styling | CORE identity (Fraunces, IBM Plex, Noto Sans Bengali, `#233d2b`); no Tailwind/Google Fonts CDN |
| Forecast | No live forecast; frozen data only [D-Q1] |
| New data | SMAP L4 via POWER, fetched by a script like `fetch-earth-data.py` and frozen into `public/data/` [D-C11] |
| BARC/SRDI | Published documents with page-level citations only; no bulk scraping [D-Q3] |
| FFWC | Link to the official bulletin; API after a team member registers [D-Q2] |

## Data contract: `agronomy.json` [CORE/AG]

| Key | Contents | UI use |
|---|---|---|
| `sources[]` | Stable ID, publisher, URL, verified publication date, access date, page/section locator | Clickable evidence drawer |
| `crops[]` | Crop/variety, historical reference yield, spacing or verified seed rate, FAO coefficients | Editable planning estimates |
| `conditions[]` | Crop IDs, symptom IDs, possible cause, field checks, non-chemical next steps | Symptom triage; no probability, no photo classifier |
| `rotations[]` | Existing rotation + three alternatives, evidence, constraints | Preference-based comparison |
| `aez` | BARC AEZ-3 matrix, source page, separate study context | Research context chosen by the user |
| `fertilizer` | Elemental nutrient-to-product calculation and gates | Convert an existing approved target |
| `water` | Explicit scenario inputs and formulas | Explore assumed withdrawal/recharge balance |
| `groundTruth`, `qa` | Record fields and quality rules | Researcher logger and inspector |

Also present in the file: `symptoms`, `resilience` (candidates, context, fieldChecks, scenarios), `modellingRules`, `schemaVersion`, `scope`, `reviewedAt`.

## Data contract: `earth-data.json` / `history.json` [CORE]

- `earth-data.json` keys: `fields` (mithapukur, pirganj, gangachara), `limitations`, `period`, `retrievedAt`, `scope`, `sources`, `version`. Each field holds daily 2024 records, monthly aggregates, paired rain QA, optical masks, original request URLs, and `contextImage`.
- `history.json` keys: `fields`, `period`, `scope` — 60 monthly records per site.

## Planned schema additions [BP §9.1 M1]

The farm-registration schema must carry **units, spatial support, acquisition time, ingest time and provenance** for every value. Provenance uses the canonical enum `MEASURED | FARMER_REPORTED | REMOTE_OBSERVED | MODELED | SCENARIO | UNKNOWN`, plus a separate review status `farmer | extension | lab` [D-C5].

## Output contract

See 08 §2 (decision output contract). Audit requirement: one-click trace from any output to raw data/version, farmer inputs and agronomy rule. [BP §8.2]
