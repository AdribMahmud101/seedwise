# Route Data Audit: My field (`#field`)

## 1. Overview
- **Route / Hash:** `#field` (Default route in [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L63))
- **View Name:** "My field" / "আমার জমি"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L63) (Routing & topbar lifecycle, `mountMap()` at line 99)
  - [`src/legacy/fields.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L464) (View markup `home()`, weather cards, Leaflet map initialization, coordinate search, layer switcher, optical history table, custom field creation)
  - [`src/legacy/ui.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js#L43) (Data bootstrap `loadData()`, truth badge renderer `truth()`)
  - [`src/legacy/boundary.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/boundary.js) (Farmer boundary editor / polygon geo-arithmetic)
  - [`src/legacy/netarea.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/netarea.js) (Bund deductions and cultivable area computation)
  - [`src/legacy/report.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/report.js) (Field summary report drawer)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | 3 prepared fields (Mithapukur, Pirganj, Gangachara): daily weather, 2024 monthly summaries, optical QA samples, Landsat scene IDs | 2024-01-01 to 2024-12-31 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py), [`scripts/extract-optical.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/extract-optical.py), [`scripts/fetch-optical-history.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-optical-history.py) |
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | BARC FRG 2024 fertilizer rates, AEZ-3 definitions, crop calendars, rotation definitions, symptom database | Static reviewed 2024–2026 | Curated from BARC, BRRI, FAO-56 literature |
| `public/data/history.json` | 53,044 bytes (52 KB) | 5-year monthly historical archive (precipitation, temperature, solar radiation, ETo) | 2021-01 to 2025-12 | [`scripts/fetch-history.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-history.py) |
| `public/data/smap.json` | 269,793 bytes (264 KB) | NASA SMAP L4 daily surface & root-zone soil moisture (SFMC, RZMC, percentiles) and monthly aggregates | 2021-01-01 to 2025-12-31 | [`scripts/fetch-smap.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-smap.py) |
| `public/data/map-layers.json` | 15,049 bytes (16 KB) | Layer metadata, tile manifests, tile scheme specifications for high-detail, natural, and NDVI layers | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/ndvi-grid.json` | 3,858,541 bytes (3.7 MB) | 20 m Sentinel-2 L2A NDVI grids (306×305 / 307×305 cells) for map tap inspection | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/moisture-grid.json` | 848,409 bytes (832 KB) | Gzipped 20 m Sentinel-2 L2A NDMI moisture grids matching ndvi-grid dimensions | 2024-03-09, 2024-11-09 | [`scripts/fetch-moisture-grid.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-moisture-grid.py) |
| `public/data/context-osm.geojson` | 1,139,155 bytes (1.1 MB) | Vector waterways, highways, drainage ditches around prepared sites | Current OSM dump | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/data/places-rangpur.json` | 21,666 bytes (24 KB) | 127 Rangpur division towns, upazilas, unions for location search | Static seed | [`scripts/fetch-places.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-places.py) |
| `public/data/low-ground.json` | 124,112 bytes (124 KB) | NASADEM 30 m relative low-ground depression classifications and thresholds | Fixed DEM | [`scripts/fetch-low-ground.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-low-ground.py) |
| `public/overlays/low-ground-*.png` | ~72 KB total (Gangachara 22,311 B, Mithapukur 25,344 B, Pirganj 24,556 B) | RGBA feathered low-ground water-accumulation overlay tiles | Static DEM raster | [`scripts/fetch-low-ground.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-low-ground.py) |
| `public/tiles/{natural,ndvi}/*` | 18,878,941 bytes (~18.0 MB) | Sentinel-2 XYZ raster tiles (z9 to z16) | 2024-03-09, 2024-11-09 | [`scripts/fetch-map-tiles.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-map-tiles.py) |
| `public/assets/satellite-*.jpg` | ~96 KB total (~32 KB each) | ESRI World Imagery Maxar context crops | 2022-11-28 | Static asset |
| `public/assets/sentinel-*.jpg` | ~260 KB total (~88 KB each) | Copernicus Sentinel-2 L2A 10 m true-color context crops | 2024-03-09 | [`scripts/fetch-context.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-context.py) |

## 3. Upstream Datasets & Provenance
1. **NASA POWER / MERRA-2:**
   - *Resolution:* Native ~0.5° lat × 0.625° lon (~50 km).
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Rendered as `MODELED` with `source: NASA POWER, cell: 50km` ([`src/legacy/fields.js:480`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L480), [`530`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L530)).
2. **NASA GPM IMERG via POWER:**
   - *Resolution:* Nominal 0.1° (~10 km) daily rainfall grid.
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Rendered as `REMOTE_OBSERVED` with `source: NASA GPM IMERG, cell: 10km` ([`src/legacy/fields.js:522`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L522)).
3. **NASA SMAP L4 (via POWER Zarr store):**
   - *Resolution:* 9 km global EASE-Grid 2.0 (surface SFMC 0–5 cm, root-zone RZMC 0–100 cm).
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Rendered as `REMOTE_OBSERVED` with `source: NASA SMAP L4, cell: 9 km` ([`src/legacy/fields.js:500`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L500)). Note: SMAP L4 is a model assimilation product (Catchment Land Surface Model driven by GEOS FP with SMAP brightness temperatures).
4. **NASA/USGS Landsat Collection 2 Level-2:**
   - *Resolution:* 30 m optical multispectral (SR & QA pixel).
   - *License:* Public domain / USGS Open Data Policy.
   - *Truth Label in UI:* Rendered as `REMOTE_OBSERVED` with `source: Landsat 8/9, cell: 30m` ([`src/legacy/fields.js:824`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L824)).
5. **NASA JPL NASADEM (SRTM reprocessed):**
   - *Resolution:* 30 m elevation grid (`NASADEM_HGT_n25e089`).
   - *License:* NASA Open Data Policy.
   - *Truth Label in UI:* Rendered as `REMOTE_OBSERVED` or `MODELED` in low ground overlay toggle ([`src/legacy/fields.js:612`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L612)).
6. **Copernicus Sentinel-2 Level-2A:**
   - *Resolution:* 10 m / 20 m surface reflectance.
   - *License:* Open Access (CC BY-SA 3.0 IGO / Copernicus Open Access).
   - *Truth Label in UI:* Rendered as `REMOTE_OBSERVED` in map chips ([`src/legacy/fields.js:625`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L625)).
7. **Hardcoded / Literal Data Arrays in JS:**
   - Prepared site coordinates in [`src/legacy/ui.js:130-147`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js#L130-L147) (sample polygon boundary vertices for Mithapukur, Pirganj, Gangachara).
   - Zoom level ladder in [`src/legacy/fields.js:155`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L155) (`[20, 19, 18, 17]`).

## 4. Data Use Quality & Integrity Issues
1. **SMAP L4 Truth Labeling Inconsistency:** SMAP L4 is labeled `REMOTE_OBSERVED` in [`src/legacy/fields.js:500`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L500) and [`src/legacy/water.js:123`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/water.js#L123), yet SMAP Level 4 is an ensemble Kalman filter land surface model assimilation (Catchment model). Calling it pure remote observation conceals the model component. (Severity: Medium).
2. **Missing Daily Time-Series in Map:** Map shows frozen 2024 monthly summaries or single snapshot dates (2024-03-09, 2024-11-09) despite 5-year daily SMAP and daily POWER existing in `smap.json` and `earth-data.json`.
3. **Scale Mismatch in Field Dossier:** Field boundaries are ~0.2–0.5 hectares (~40–70 m across), but POWER/MERRA-2 weather tiles show a single 50 km cell value without downscaling or elevation lapse adjustments.
4. **Tile Fallback to Empty:** Custom user fields cannot load local XYZ tiles or Sentinel grids, falling back to empty states cleanly, but lack on-demand satellite coverage indicators.

## 5. Gaps & NASA Open Data Opportunities
1. **Harmonized Landsat-Sentinel (HLS) 30 m (HLSL30 / HLSS30):**
   - *Impact:* Bridges 5-day revisit optical gap, providing 30 m cloud-masked surface reflectance across the entire crop growing season instead of just 2 dates.
   - *Effort:* M (Fetch via NASA CMR / Earthdata Cloud STAC; no key required for SpatioTemporal Asset Catalog).
2. **MODIS / VIIRS Daily 250 m NDVI / LST (VNP13A1 / MOD13Q1):**
   - *Impact:* Provides high-temporal dynamic vegetation and temperature curves between cloudy monsoon days where Sentinel-2 is blinded.
   - *Effort:* S (Available in LP DAAC).
3. **OPERA Dynamic Surface Water Extent (DSWx-HLS / DSWx-S1):**
   - *Impact:* 30 m surface inundation and ponding mapping to replace static NASADEM depression model with actual seasonal waterlogging observations.
   - *Effort:* M.
