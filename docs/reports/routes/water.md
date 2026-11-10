# Route Data Audit: Water & resilience (`#water`)

## 1. Overview
- **Route / Hash:** `#water` ([`src/legacy/app.js:68`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L68))
- **View Name:** "Water & resilience" / "পানি ও সহনশীলতা"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L68) (Lifecycle: `initLandscapeObserver()`, `disposeLandscape()` lines 107–111)
  - [`src/legacy/water.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js) (View rendering `water()`, annual groundwater pumping balance, monthly crop water deficit calculator, 3D landscape embed)
  - [`src/legacy/landscape3d.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/landscape3d.js) (MapLibre GL 3D terrain viewer over Rangpur division, Terrarium DEM decoding, hillshading)
  - [`src/legacy/ui.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js) (Provides `smap`, `earth`, `agronomy`, truth functions)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/smap.json` | 269,793 bytes (264 KB) | 9 km daily and monthly surface (SFMC) and root-zone (RZMC) soil moisture, plus percentile ranks | 2021-01-01 to 2025-12-31 | [`scripts/fetch-smap.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-smap.py) |
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | 2024 monthly precipitation (`rainGpm`) and FAO-56 `et0` | 2024-01-01 to 2024-12-31 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |
| `public/data/rangpur_upazilas.geojson` | 52,216 bytes (52 KB) | GeoBoundaries administrative boundaries for Rangpur upazilas, fetched by `landscape3d.js` line 215 | Release 9469f09 | [`scripts/build-landscape.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/build-landscape.py) |
| `public/data/landscape-rivers.geojson` | 36,651 bytes (36 KB) | Vector lines of Teesta, Ghaghat, Jamuneswari rivers, fetched by `landscape3d.js` line 229 | Current OSM dump | [`scripts/build-landscape.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/build-landscape.py) |
| `public/landscape/dem/{z}/{x}/{y}.png` | ~1.1 MB (in `public/landscape` total 1.7 MB) | Mapzen Terrarium PNG tiles encoding NASADEM elevations (z8 to z12) | Static NASADEM | [`scripts/build-landscape.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/build-landscape.py) |
| `public/landscape/color/{z}/{x}/{y}.webp` | ~600 KB | Pre-rendered hypsometric and hillshaded WebP tiles (z8 to z12) | Static | [`scripts/build-landscape.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/build-landscape.py) |

## 3. Upstream Datasets & Provenance
1. **NASA SMAP L4 (Soil Moisture Active Passive Level 4 Global Daily 9 km):**
   - *Resolution:* 9 km grid.
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Visual bar labeled `REMOTE_OBSERVED` with `source: NASA SMAP, cell: ~9 km` ([`src/legacy/water.js:123, 127`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L123)), with explicit explanatory note: `NASA SMAP L4 · model + satellite` ([`line 132`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L132)).
2. **NASA POWER / MERRA-2 & GPM IMERG:**
   - *Resolution:* 50 km and 10 km.
   - *Truth Label in UI:* Monthly rain labeled `REMOTE_OBSERVED` (`source: NASA IMERG`), ETo labeled `REMOTE_OBSERVED` (`source: NASA POWER`) ([`src/legacy/water.js:211`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L211)).
3. **NASA JPL NASADEM:**
   - *Resolution:* 30 m elevation (`NASADEM_HGT_n25e089`).
   - *License:* Public domain.
   - *Truth Label in UI:* Documented in 3D landscape attribution header.
4. **Hardcoded / Literal Data Arrays in JS:**
   - Regional bounding box constants in [`src/legacy/landscape3d.js:38, 54, 235`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/landscape3d.js#L38) (`LAND_BOX`, `UPAZILA_BBOX`).
   - Aquifer scenario input defaults in [`src/legacy/water.js:227`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L227).

## 4. Data Use Quality & Integrity Issues
1. **Misattributed Truth Tag for POWER ETo:** In [`src/legacy/water.js:211`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L211), the UI renders `${num(m.et0, 1)} mm ${truth('REMOTE_OBSERVED', { source: 'NASA POWER' })}`. NASA POWER reference evapotranspiration is calculated from Penman-Monteith MERRA-2 meteorological parameters — it is **NOT** a remote observation. In [`src/legacy/fields.js:538`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L538), it is correctly labeled `MODELED`. This is a direct truth tag inconsistency within the app. (Severity: High).
2. **SMAP L4 Dual Labeling:** While the card headline uses `REMOTE_OBSERVED`, the footnote in line 132 honest clarifies `model + satellite`.
3. **Realistic Aquifer Framing:** The app refuses to guess unmeasured groundwater table depths, requiring the user to explicitly enter recharge and farm allocation parameters.

## 5. Gaps & NASA Open Data Opportunities
1. **NASA GRACE / GRACE-FO Groundwater Storage Anomalies (GRACE-REC / JPL Mascons):**
   - *Impact:* Long-term regional groundwater depletion rates in northwest Bangladesh. Show true multi-year aquifer deficit trends (0.5–1.0 cm/year loss in northern Rajshahi/Rangpur) directly beside the local pumping budget.
   - *Effort:* M (Available via PO.DAAC / NASA GRACE Tellus).
2. **NASA ECOSTRESS Actual Evapotranspiration (PT-JPL, 70 m):**
   - *Impact:* Replace empirical $K_c$ crop coefficient assumptions with actual measured evapotranspiration for Boro rice vs. dry winter rotations.
   - *Effort:* M (Via LP DAAC).
3. **NASA GPM IMERG Daily 0.1° Precipitation Rate:**
   - *Impact:* Inundation threshold detection during Teesta river monsoon spillover.
   - *Effort:* S.
