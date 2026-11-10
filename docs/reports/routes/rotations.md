# Route Data Audit: Rotation studio (`#rotations`)

## 1. Overview
- **Route / Hash:** `#rotations` ([`src/legacy/app.js:65`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L65))
- **View Name:** "Rotation studio" / "ফসলচক্র বাছাই"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L65) (Routing & lifecycle `mountRotations()`, `disposeRotations()` lines 102–106)
  - [`src/legacy/rotations.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotations.js) (View container, ranked rotation cards, scoring disclosure, preview button)
  - [`src/legacy/rotation-tool.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotation-tool.js) (Side panels, soil nutrient inputs, water tariff calculator, canal simulation)
  - [`src/legacy/engine.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/engine.js) (Core multi-criteria decision engine, scoring benefits, water deficit calculations)
  - [`src/legacy/studio3d.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js) (Lazy-loaded Three.js 3D parcel viewer, terrain cutaway, crop animation)
  - [`src/legacy/studiodata.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studiodata.js) (Data pipeline for 3D studio, interpolating weather and raster values)
  - [`src/legacy/studio3d-helpers.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d-helpers.js) (Geometry helpers, texturing, lighting)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | 4 rotation archetypes (baseline Rice-Fallow-Rice, Mustard-Boro-T.Aman, Potato-Boro-T.Aman, Potato-Mung-T.Aman), trial references, water deficits, gross margins | Curated peer-reviewed trial papers (Hossain 2022, Islam 2014) | Static curated agronomy |
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | 2024 monthly rainfall and FAO-56 ETo driving rotation water deficits in `engine.js` | 2024-01-01 to 2024-12-31 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |
| `public/data/soil-profile.json` | 5,405 bytes (5.3 KB) | ISRIC SoilGrids 2.0 depth-layered sand, clay, silt, SOC, pH, bulk density (0–5, 5–15, 15–30, 30–60, 60–100 cm) | Retrieved 2026-11-09 | [`scripts/fetch-soilgrids.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-soilgrids.py) |
| `public/data/low-ground.json` | 124,112 bytes (124 KB) | NASADEM 30 m low-ground depression grid used by 3D studio to render waterlogging prone patches | Static DEM | [`scripts/fetch-low-ground.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-low-ground.py) |
| `public/data/ndvi-grid.json` | 3,858,541 bytes (3.7 MB) | Sentinel-2 NDVI matrix used by 3D studio for ground canopy shading | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/moisture-grid.json` | 848,409 bytes (832 KB) | Gzipped Sentinel-2 NDMI matrix for 3D ground wetness shader | 2024-03-09, 2024-11-09 | [`scripts/fetch-moisture-grid.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-moisture-grid.py) |
| `public/data/soil-nutrients.json` *(attempted)* | 0 bytes (Does not exist) | Attempted fetch in [`src/legacy/rotation-tool.js:106`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotation-tool.js#L106) and [`src/legacy/studio3d.js:17`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js#L17); falls back cleanly to hardcoded RARS Burirhat defaults | N/A | Missing / Unbuilt |
| `public/data/s1-water.json` *(attempted)* | 0 bytes (Does not exist) | Attempted fetch in [`src/legacy/studio3d.js:5`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js#L5); gracefully catches 404 and disables SAR inundation overlay | N/A | Missing / Unbuilt |

## 3. Upstream Datasets & Provenance
1. **NASA GPM IMERG & NASA POWER:**
   - *Resolution:* 0.1° (~10 km) and 0.5° (~50 km).
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Water gap screening labeled `MODELED` with `source: IMERG/POWER FAO-56, date: 2024` ([`src/legacy/rotations.js:127`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotations.js#L127)).
2. **NASA JPL NASADEM:**
   - *Resolution:* 30 m.
   - *License:* Public domain.
   - *Truth Label in UI:* Low ground layers labeled `MODELED` in 3D studio ([`src/legacy/studio3d.js:2317`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js#L2317)).
3. **ISRIC SoilGrids 2.0:**
   - *Resolution:* 250 m prediction means (CC BY 4.0).
   - *Truth Label in UI:* Shown in Soil Profile tabs with exact citation to ISRIC.
4. **Hardcoded / Literal Data Arrays in JS:**
   - RARS Burirhat research station baseline defaults in [`src/legacy/rotation-tool.js:61-68`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotation-tool.js#L61-L68) (e.g. pH 5.61, OM 1.83%).
   - Pump tariffs in [`src/legacy/rotation-tool.js:48-52`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotation-tool.js#L48-L52) (Diesel 320 BDT/hr, Electric 160 BDT/hr, BMDA 110 BDT/hr).
   - Plant mesh procedural layouts in [`src/legacy/studio3d.js:907-909, 954-955, 967`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js#L907-L909).
   - Rotation crop yield ranges in [`src/legacy/engine.js:313-345`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/engine.js#L313-L345) (Rice: [4.9, 5.7] t/ha, Potato: [16.7, 33.6] t/ha, Mustard: [1.2, 1.5] t/ha, Mung: [1.47, 1.5] t/ha).

## 4. Data Use Quality & Integrity Issues
1. **Unbuilt File Probing (Phantom Fetches):** Both `rotation-tool.js` and `studio3d.js` send runtime network requests for `data/soil-nutrients.json` and `data/s1-water.json` which do not exist in `public/data/` (returning 404). While wrapped in `try/catch`, it triggers silent network errors on every 3D studio mount. (Severity: Low).
2. **Rotation Scoring Is Purely Scenario-Modeled:** The 0–100 score (`r.score` in [`src/legacy/rotations.js:109`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotations.js#L109)) correctly carries the `SCENARIO` truth tag, warning the farmer that it represents weighted optimization against 2024 weather, not guaranteed field profit.
3. **Static Irrigation Gaps:** Irrigation deficit uses 2024 monthly aggregated rainfall vs. crop water need ($K_c \times \text{ETo}$). It does not model soil water storage capacity or capillary rise, which is critical for winter potato/mustard following Aman rice puddled soils.

## 5. Gaps & NASA Open Data Opportunities
1. **ECOSTRESS Evapotranspiration & Water Stress (ECO3ETPTJPL / ECO4ESIPTJPL, 70 m):**
   - *Impact:* High-resolution thermal ET and Evaporative Stress Index (ESI) during the critical dry winter Rabi season (Jan–Mar). Would directly replace theoretical FAO-56 crop coefficient assumptions ($K_c$) with observed parcel-level evapotranspiration.
   - *Effort:* M (Available via LP DAAC / AppEEARS).
2. **NASA SMAP L4 Root-Zone Soil Moisture (RZMC, 0–100 cm):**
   - *Impact:* Incorporate root-zone soil water into rotation feasibility screening. When RZMC is above 0.35 m³/m³ in November, flag waterlogging delay for potato tuber rotting.
   - *Effort:* S (Data already exists in `public/data/smap.json`, just wire into `engine.js` constraints).
3. **OPERA Dynamic Surface Water (DSWx-HLS, 30 m):**
   - *Impact:* Provide genuine satellite-detected surface water extent during October/November recession to resolve the missing `s1-water.json` requirement.
   - *Effort:* M (NASA PO.DAAC / CMR Cloud).
