# Route Data Audit: Evidence register (`evidence` modal)

## 1. Overview
- **Route / Modal Action:** Action `data-action="evidence"` / `evidence()` ([`src/legacy/app.js:75-80, 95`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L75-L80))
- **View Name:** "Evidence register" / "তথ্যসূত্র" / "তথ্যসূত্রের খাতা"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L75-L80) (Triggered via sidebar footer button `data-action="evidence"`, renders in `modal()`)
  - [`src/legacy/ui.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js#L14) (Provides `modal()`, `earth.sources`, `agronomy.sources`)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | `earth.sources` array (7 NASA/Copernicus/FAO citations: POWER, GPM, FAO-56, Landsat, Landsat QA, Landsat SR, Sentinel-2) | 2024 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | `agronomy.sources` array (23 peer-reviewed agronomy papers, BARC FRG 2024, BRRI, IRRI, BAMIS, FAO guidelines) | Reviewed 2024–2026 | Static agronomy |

## 3. Upstream Datasets & Provenance
1. **NASA & Earth Observation Sources:**
   - NASA POWER / MERRA-2, NASA GPM IMERG, FAO-56 ETo, NASA/USGS Landsat Collection 2 Level 2, USGS QA bands, USGS Surface Reflectance, Copernicus Sentinel-2 L2A.
2. **National Agronomy Sources:**
   - BARC Fertilizer Recommendation Guide 2024, BRRI variety profiles, BAMIS agro-meteorological advisories, Hossain et al. (2022), Islam et al. (2014).
3. **Truth Label in UI:**
   - Outlines data limitations and assumptions: *"Weather values are frozen to 2024. Each prepared field has a dated image and a boundary traced from the satellite photo. The rotation scores combine these data with stated planning assumptions."* ([`src/legacy/app.js:78`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L78)).

## 4. Data Use Quality & Integrity Issues
1. **Omission of SMAP, SoilGrids, and NASADEM from the Register:** In [`src/legacy/app.js:78`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L78), the modal iterates solely through `[...earth.sources, ...agronomy.sources]`. However:
   - NASA SMAP L4 is stored in `public/data/smap.json` and has its own `source` block (`smap.source`), which is **omitted** from the Evidence Register!
   - ISRIC SoilGrids 2.0 is stored in `public/data/soil-profile.json` and is **omitted** from the Evidence Register!
   - NASA NASADEM is stored in `public/data/low-ground.json` and is **omitted** from the Evidence Register!
   *(Severity: High — Major documentation and audit gap in the UI)*.
2. **Missing License Attribution in Modal:** While `earth.sources` contains URLs, it lacks license strings (e.g. CC BY 4.0, NASA Open Data, ODbL).

## 5. Gaps & NASA Open Data Opportunities
1. **Consolidated Provenance Registry:**
   - *Impact:* Merge all active dataset metadata blocks (`earth.sources`, `agronomy.sources`, `smap.source`, `soilProfile.source`, `lowGround.source`) into a single unified Evidence Register table showing upstream URL, spatial resolution, temporal frequency, and license.
   - *Effort:* S (Small UI update).
2. **NASA Open Data Citation Standard (DOI):**
   - *Impact:* Include official NASA DOIs (e.g. `10.5067/TXBBAXPASSL7` for SMAP L4, `10.5067/GPM/IMERG/3B-DAY/07` for IMERG) so research evaluators can link directly to NASA Earthdata search records.
   - *Effort:* S.
