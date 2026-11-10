# Route Data Audit: Planting planner (`#planner`)

## 1. Overview
- **Route / Hash:** `#planner` ([`src/legacy/app.js:66`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L66))
- **View Name:** "Planting planner" / "বপনের পরিকল্পনা"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L66) (Lifecycle: `mountPlanner()`, `disposePlanner()` lines 100–101)
  - [`src/legacy/planner.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner.js) (View rendering `planner()`, planting geometry calculation, seed quantity requirements, canvas layout)
  - [`src/legacy/planner3d.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner3d.js) (3D canvas view of bed/row topography, bunds, instanced crops)
  - [`src/legacy/planner3d-helpers.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner3d-helpers.js) (Mesh geometries for seedlings, bed ridges, furrows)
  - [`src/legacy/netarea.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/netarea.js) (Cultivable area arithmetic taking bund widths into account)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | Crop spacing configurations, reference seed rates (kg/ha), hill spacing rules (row × plant spacing in cm), trial reference yields | Static agronomy database | Curated literature |
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | Centroid lat/lon coordinates and parcel polygon coordinates | 2024 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |
| `public/data/soil-profile.json` | 5,405 bytes (5.3 KB) | Fetched via `soilProfilePromise` in [`src/legacy/planner.js:279`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner.js#L279) for texture-based infiltration and bed recommendation | Retrieved 2026-11-09 | [`scripts/fetch-soilgrids.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-soilgrids.py) |
| `public/data/low-ground.json` | 124,112 bytes (124 KB) | Checked for drainage gradient and slope direction | Static DEM | [`scripts/fetch-low-ground.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-low-ground.py) |

## 3. Upstream Datasets & Provenance
1. **ISRIC SoilGrids 2.0:**
   - *Resolution:* 250 m prediction means.
   - *License:* CC BY 4.0.
   - *Truth Label in UI:* Soil texture classification labeled with ISRIC source citation.
2. **Bangladesh Agricultural Research Council (BARC) & BRRI Trial Reports:**
   - *Resolution:* Plot trial observations (Mithapukur, Pirganj, Gangachara).
   - *Truth Label in UI:* Planting calculations labeled `SCENARIO` (`source: Planner model`) and `MODELED` (`source: Trial reference` / `Trial evidence`) ([`src/legacy/planner.js:51-52`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner.js#L51-L52)).
3. **Hardcoded / Literal Data Arrays in JS:**
   - Default spacing fallbacks: Rice 20×15 cm, Potato 60×25 cm, Mustard broadcast 7 kg/ha ([`src/legacy/agronomy.json`](file:///root/projects/ropon-radar-wt/DATAAUDIT/public/data/agronomy.json)).
   - Procedural bed seed rows in [`src/legacy/planner3d.js:314`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner3d.js#L314): `for (const seedY of [70, 148, 232, 318, 402])`.
   - Fallback coordinate pair `[0, 0]` in [`src/legacy/planner3d.js:203`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/planner3d.js#L203).

## 4. Data Use Quality & Integrity Issues
1. **Accurate Honest Boundaries:** Excellent implementation of cultivable net area vs. gross boundary area. Bund deductions are explicit, preventing farmers from over-ordering seed or fertilizer.
2. **No Direct Micro-Topography:** 3D planting planner renders a flat or idealized ridged surface; while low-ground depression data exists in `low-ground.json`, it is not yet used to alter plant density in waterlogged corners of the field.
3. **Missing Weather Forecast Hook:** Planting planner assumes current season without checking if upcoming 10-day rainfall (GPM IMERG early run / NOAA GFS) will drown freshly transplanted seedlings.

## 5. Gaps & NASA Open Data Opportunities
1. **NASA GPM IMERG Late / Early Run (Near-Real-Time 4-hour rainfall):**
   - *Impact:* Warn farmers before sowing if heavy rainfall (>50 mm within 48h) is imminent, which ruins un-germinated mustard seed or submerges young rice seedlings.
   - *Effort:* M (Via NASA jscon-precip or Global Precipitation Measurement API).
2. **SMAP L4 Surface Soil Moisture (SFMC 0–5 cm):**
   - *Impact:* Check seedbed moisture condition. If SFMC < 0.15 m³/m³, warn that soil is too dry for mustard germination without priming irrigation.
   - *Effort:* S (Read directly from `public/data/smap.json` already present in memory).
3. **NASADEM Slope & Aspect (30 m):**
   - *Impact:* Derive furrow orientation from NASADEM gradient so crop rows run across slope to retard runoff and soil loss.
   - *Effort:* S (Can be derived directly from `NASADEM_HGT_n25e089`).
