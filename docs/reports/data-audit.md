# Data Audit: Route-by-Route NASA & Earth Observation Usage

**Audit Date:** 2026-11-10  
**Scope:** Complete codebase audit of data assets, client modules, upstream sources, licenses, and truth attribution across all application routes and views in Ropon Radar.  
**Repository Branch:** `card/DATAAUDIT`  
**Application Code Base:** Read-only inspection of `src/legacy/` and `public/data/`.

---

## 1. Executive Summary & Audit Matrix

| Route / View | Primary JS Modules | Fetched Data Files & Assets | Upstream Datasets (NASA & Partners) | Issues Found (Count) | Top Fix |
|:---|:---|:---|:---|:---:|:---|
| **My field** (`#field`) | `app.js`, `fields.js`, `boundary.js`, `netarea.js`, `report.js`, `ui.js` | `earth-data.json`, `smap.json`, `map-layers.json`, `ndvi-grid.json`, `moisture-grid.json`, `context-osm.geojson`, `places-rangpur.json`, `low-ground.json`, tiles & overlays | NASA POWER (MERRA-2), NASA GPM IMERG, NASA SMAP L4, Landsat C2 L2, NASADEM, Sentinel-2 L2A | **3** | Clarify SMAP L4 as model assimilation rather than pure `REMOTE_OBSERVED`. |
| **Past seasons** (`#seasons`) | `app.js`, `fields.js`, `ui.js` | `history.json`, `earth-data.json`, `agronomy.json`, `smap.json` | NASA GPM IMERG, NASA POWER (MERRA-2), FAO-56 ETo | **2** | Fix hardcoded `date: '2024'` in multi-year truth badges when viewing 2021, 2022, 2023, or 2025. |
| **Rotation studio** (`#rotations`) | `app.js`, `rotations.js`, `rotation-tool.js`, `engine.js`, `studio3d.js`, `studiodata.js` | `agronomy.json`, `earth-data.json`, `soil-profile.json`, `low-ground.json`, `ndvi-grid.json`, `moisture-grid.json` *(phantom: `soil-nutrients.json`, `s1-water.json`)* | NASA GPM IMERG, NASA POWER, NASADEM, Sentinel-2 L2A, ISRIC SoilGrids 2.0 | **3** | Eliminate 404 network requests for missing unbuilt JSON assets (`soil-nutrients.json`, `s1-water.json`). |
| **Planting planner** (`#planner`) | `app.js`, `planner.js`, `planner3d.js`, `planner3d-helpers.js`, `netarea.js` | `agronomy.json`, `earth-data.json`, `soil-profile.json`, `low-ground.json` | ISRIC SoilGrids 2.0, BARC FRG 2024, BRRI, NASADEM | **1** | Integrate SMAP surface moisture (SFMC) to alert against sowing in dry seedbeds. |
| **Crop clinic** (`#clinic`) | `app.js`, `clinic.js`, `ui.js` | `agronomy.json`, `earth-data.json` | BARC FRG 2024, IRRI, BRRI, BAMIS | **1** | Connect NASA POWER daily temperature and relative humidity to compute potato late blight risk alerts. |
| **Water & resilience** (`#water`) | `app.js`, `water.js`, `landscape3d.js`, `ui.js` | `smap.json`, `earth-data.json`, `rangpur_upazilas.geojson`, `landscape-rivers.geojson`, Terrarium DEM tiles, WebP hillshades | NASA SMAP L4, NASA POWER, NASA GPM IMERG, NASADEM, OSM | **2** | Correct POWER ETo truth badge from `REMOTE_OBSERVED` to `MODELED`. |
| **Disaster recovery** (`#recovery`) | `app.js`, `recovery.js`, `recovery-engine.js`, `recovery-data.js` | `agronomy.json`, `earth-data.json` | DAE BAMIS, BRRI, IFRC, FAO | **2** | Ingest NASA FIRMS active fire alerts and satellite flood recession indicators instead of relying purely on farmer memory. |
| **Research lab** (`#research`) | `app.js`, `research.js`, `ui.js` | `earth-data.json`, `agronomy.json` | NASA GPM IMERG, NASA POWER, Landsat C2 L2 (SR & QA) | **1** | Broaden daily precipitation disagreement statistics beyond 2024 to cover the full 2021–2025 archive. |
| **Evidence register** (`evidence`) | `app.js`, `ui.js` | `earth-data.json`, `agronomy.json` *(missing `smap.json`, `soil-profile.json`, `low-ground.json`)* | NASA POWER, NASA GPM IMERG, Landsat, Sentinel-2, FAO, BARC | **2** | Add missing datasets (SMAP, SoilGrids, NASADEM) to the modal source list. |

---

## 2. Complete Inventory of Data Files & Assets
Measured precisely using `wc -c`, `du -h`, and python file stat utilities:

| Relative Path | Exact Bytes | Human Size | Role & Content | Date Range | Generating Script |
|:---|---:|:---|:---|:---|:---|
| `public/data/agronomy.json` | 61,054 B | 60 KB | Fertilizer equations, AEZ-3 parameters, crop rotations, disease symptoms | 2024–2026 | Curated literature |
| `public/data/context-osm.geojson` | 1,139,155 B | 1.1 MB | Vector water channels, roads, and village features | Current | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/earth-data.json` | 286,603 B | 280 KB | Daily paired weather, 2024 monthly summaries, Landsat QA | 2024-01-01 to 2024-12-31 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |
| `public/data/history.json` | 53,044 B | 52 KB | 5-year historical monthly precipitation, temperature, ETo | 2021-01 to 2025-12 | [`scripts/fetch-history.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-history.py) |
| `public/data/landscape-rivers.geojson` | 36,651 B | 36 KB | Vector river centerlines for 3D landscape | Current | [`scripts/build-landscape.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/build-landscape.py) |
| `public/data/low-ground.json` | 124,112 B | 124 KB | NASADEM relative depression classifications and pixel matrices | Static DEM | [`scripts/fetch-low-ground.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-low-ground.py) |
| `public/data/map-layers.json` | 15,049 B | 16 KB | Sentinel-2 XYZ tile metadata and selection criteria | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/moisture-grid.json` | 848,409 B | 832 KB | Gzipped 20 m Sentinel-2 NDMI moisture raster grid | 2024-03-09, 2024-11-09 | [`scripts/fetch-moisture-grid.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-moisture-grid.py) |
| `public/data/ndvi-grid.json` | 3,858,541 B | 3.7 MB | 20 m Sentinel-2 NDVI matrix for pixel inspector | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/places-rangpur.json` | 21,666 B | 24 KB | 127 Rangpur division place names, types, and coordinates | Current | [`scripts/fetch-places.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-places.py) |
| `public/data/rangpur_district.geojson` | 17,591 B | 20 KB | ADM2 Rangpur district boundary | 2023 | GeoBoundaries release 9469f09 |
| `public/data/rangpur_upazilas.geojson` | 52,216 B | 52 KB | ADM3 Rangpur upazila boundaries | 2023 | GeoBoundaries release 9469f09 |
| `public/data/smap.json` | 269,793 B | 264 KB | Daily SMAP L4 soil moisture (SFMC, RZMC) and percentiles | 2021-01-01 to 2025-12-31 | [`scripts/fetch-smap.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-smap.py) |
| `public/data/soil-profile.json` | 5,405 B | 5.3 KB | SoilGrids 2.0 clay, sand, silt, SOC, pH, bulk density | Retrieved 2026-11-09 | [`scripts/fetch-soilgrids.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-soilgrids.py) |
| `public/overlays/low-ground-*.png` | 72,211 B | 72 KB | 3 RGBA PNG overlays for low-ground water accumulation | Static DEM | [`scripts/fetch-low-ground.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-low-ground.py) |
| `public/tiles/` (directory) | 18,878,941 B | 18.0 MB | 2,904 PNG tiles (z9–z16) for Sentinel-2 natural & NDVI | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/landscape/` (directory) | 1,789,364 B | 1.7 MB | Terrarium DEM PNG tiles and WebP color hillshades (z8–z12) | Static NASADEM | [`scripts/build-landscape.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/build-landscape.py) |
| `public/assets/satellite-*.jpg` | 98,304 B | 96 KB | 3 Maxar / ESRI World Imagery satellite crops | 2022-11-28 | Static asset |
| `public/assets/sentinel-*.jpg` | 266,240 B | 260 KB | 3 Copernicus Sentinel-2 L2A 10 m true-color crops | 2024-03-09 | [`scripts/fetch-context.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-context.py) |

---

## 3. Upstream Datasets, Licenses & Truth Attribution Quality

### 3.1 Upstream Dataset Profiles
1. **NASA POWER / MERRA-2:**
   - *Parameters:* `T2M`, `T2M_MAX`, `T2M_MIN`, `RH2M`, `ALLSKY_SFC_SW_DWN`, `PS`, `WS2M`.
   - *Resolution:* ~0.5° latitude × 0.625° longitude (~50 km regional grid).
   - *License:* Public Domain / NASA Open Data Policy.
   - *Audit Assessment:* In `#field` ([`src/legacy/fields.js:480, 530`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L480)) it is correctly tagged `MODELED`. In `#water` ([`src/legacy/water.js:211`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L211)), it is erroneously labeled `REMOTE_OBSERVED`.
2. **NASA GPM IMERG (Integrated Multi-satellitE Retrievals for GPM):**
   - *Parameters:* `PRECTOTCORR` via POWER API.
   - *Resolution:* 0.1° × 0.1° (~10 km).
   - *License:* Public Domain / NASA Open Data Policy.
   - *Audit Assessment:* Appropriately labeled `REMOTE_OBSERVED` with explicit cell resolution warnings.
3. **NASA SMAP L4 (Soil Moisture Active Passive Level 4 Global Daily 9 km):**
   - *Parameters:* `SFMC` (0–5 cm), `RZMC` (0–100 cm), `RZMC_PRCNTL`.
   - *Resolution:* 9 km global cylindrical EASE-Grid 2.0.
   - *License:* Public Domain / NASA Open Data Policy.
   - *Audit Assessment:* SMAP L4 is an ensemble Kalman filter land surface model assimilation product (NASA GMAO GEOS FP + Catchment model). UI labels it `REMOTE_OBSERVED` on top badges, though the card footnote honestly states `model + satellite` ([`src/legacy/water.js:132`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L132)).
4. **NASA/USGS Landsat Collection 2 Level 2:**
   - *Parameters:* Surface Reflectance (Red, NIR) and Pixel QA (`qa_pixel`, `qa_radsat`).
   - *Resolution:* 30 m UTM Zone 45N.
   - *License:* Public Domain / USGS.
   - *Audit Assessment:* Labeled `REMOTE_OBSERVED` with rigorous cloud masking exclusions.
5. **NASA JPL NASADEM (SRTM Reprocessed 30 m):**
   - *Parameters:* Elevation `HGT`.
   - *Resolution:* 1 arc-second (~30 m).
   - *License:* Public Domain.
   - *Audit Assessment:* Used for both 2D low-ground waterlogging depression models and 3D terrain mesh. Labeled `MODELED` in low ground UI.
6. **Copernicus Sentinel-2 Level-2A:**
   - *Parameters:* Bands 4, 8, 8A, 11 (NDVI & NDMI), SCL (Scene Classification Layer).
   - *Resolution:* 10 m / 20 m.
   - *License:* CC BY-SA 3.0 IGO / Copernicus Open Access.
   - *Audit Assessment:* High fidelity 20 m grid values; masked for clouds/water/shadows.

### 3.2 Hardcoded and Illustrative Number Arrays in Code
Audited via pattern grep across all client JS files:
- **Sample Field Coordinates:** [`src/legacy/ui.js:130-147`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js#L130-L147) (Vertex coordinates for Mithapukur, Pirganj, Gangachara reference plots).
- **Hardcoded Years List:** [`src/legacy/fields.js:854`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L854) (`[2021, 2022, 2023, 2024, 2025]`).
- **Default Spacing Fallbacks:** Rice 20×15 cm, Potato 60×25 cm, Mustard 7 kg/ha ([`src/legacy/agronomy.json`](file:///root/projects/ropon-radar-wt/DATAAUDIT/public/data/agronomy.json)).
- **Station Baseline Soil Nutrients:** [`src/legacy/rotation-tool.js:61-68`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotation-tool.js#L61-L68) (RARS Burirhat: pH 5.61, OM 1.83%).
- **Crop Durations & Yield Scenarios:** [`src/legacy/engine.js:313-345`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/engine.js#L313-L345) and [`src/legacy/recovery-data.js:147, 170, 193`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery-data.js#L147) (Literature values from Hossain et al. 2022 and BRRI releases).
- **Procedural 3D Plant Meshes:** [`src/legacy/studio3d.js:907-909, 954-955, 967`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js#L907-L909) and [`src/legacy/planner3d.js:314`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner3d.js#L314).

---

## 4. Key Findings & Cross-Route Issues

### Finding 1: Stale / Incorrect Truth Badge Dates in `#seasons`
- **Location:** [`src/legacy/fields.js:860, 882`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L860)
- **Problem:** When toggling through years 2021, 2022, 2023, or 2025, the truth badge string retains a hardcoded `{ date: '2024' }`.
- **Remedy:** Pass dynamic `String(year)` into `truth()` options.

### Finding 2: Truth Category Mismatch for NASA POWER ETo in `#water`
- **Location:** [`src/legacy/water.js:211`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L211)
- **Problem:** Displays `${num(m.et0, 1)} mm ${truth('REMOTE_OBSERVED', { source: 'NASA POWER' })}`. In `#field` ([`src/legacy/fields.js:538`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L538)), ETo is correctly classified as `MODELED` (`source: FAO-56 ETo`).
- **Remedy:** Update truth category to `MODELED`.

### Finding 3: Omission of Core Datasets from the Evidence Register
- **Location:** [`src/legacy/app.js:78`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L78)
- **Problem:** Only loops over `[...earth.sources, ...agronomy.sources]`. NASA SMAP L4, ISRIC SoilGrids 2.0, and NASA NASADEM are completely absent from the modal register.
- **Remedy:** Merge `smap.source`, `soilProfile.source`, and `lowGround.source` into the modal render loop.

### Finding 4: Phantom Fetches for Missing Files in Rotation Studio
- **Location:** [`src/legacy/rotation-tool.js:106`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/rotation-tool.js#L106), [`src/legacy/studio3d.js:5, 17`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/studio3d.js#L5)
- **Problem:** Requests `/data/soil-nutrients.json` and `/data/s1-water.json`, which return 404.
- **Remedy:** Pre-populate static fallback data or build offline datasets.

---

## 5. High-Impact NASA Open Data Opportunities

| Proposed Dataset | Target Route(s) | Concrete Benefit to Smallholder Farmers | Effort |
|:---|:---|:---|:---:|
| **Harmonized Landsat-Sentinel (HLS) 30 m** (`HLSL30` / `HLSS30`) | `#field`, `#rotations`, `#research` | 2–3 day revisit 30 m cloud-masked vegetation index curves across the entire crop season, eliminating reliance on only 2 static dates. | **M** |
| **NASA FIRMS Active Fire / Thermal Anomalies** (VIIRS 375 m / MODIS 1 km) | `#recovery` | Automated neighborhood fire warning within 10 km, providing real-time data for the disaster recovery fire module. | **S** |
| **NASA OPERA Dynamic Surface Water Extent** (`DSWx-HLS` / `DSWx-S1`, 30 m) | `#water`, `#recovery`, `#rotations` | Direct satellite-detected surface water extent during monsoon flood recession; resolves missing `s1-water.json` requirement. | **M** |
| **NASA ECOSTRESS Evapotranspiration** (`ECO3ETPTJPL`, 70 m) | `#water`, `#rotations` | Real thermal field-scale crop evapotranspiration during the dry winter Rabi season, replacing static theoretical FAO-56 $K_c$ crop coefficients. | **M** |
| **NASA GRACE / GRACE-FO Groundwater Anomalies** (JPL Mascons) | `#water` | Multi-year regional groundwater depletion trends in Rangpur/Rajshahi to contextualize local tubewell pumping balances. | **M** |
| **NASA POWER Daily Relative Humidity & Temp** (`RH2M`, `T2M`) | `#clinic` | Agro-meteorological disease forecaster (Wallin Potato Late Blight model) to warn farmers before pathogen sporulation occurs. | **S** |

---

## 6. Route-Specific Sub-Audits
Detailed per-route analysis files are maintained in `docs/reports/routes/`:
- [My field (`#field`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/field.md)
- [Past seasons (`#seasons`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/seasons.md)
- [Rotation studio (`#rotations`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/rotations.md)
- [Planting planner (`#planner`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/planner.md)
- [Crop clinic (`#clinic`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/clinic.md)
- [Water & resilience (`#water`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/water.md)
- [Disaster recovery (`#recovery`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/recovery.md)
- [Research lab (`#research`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/research.md)
- [Evidence register (`evidence`)](file:///root/projects/ropon-radar-wt/DATAAUDIT/docs/reports/routes/evidence.md)
