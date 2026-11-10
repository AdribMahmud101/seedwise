# Route Data Audit: Past seasons (`#seasons`)

## 1. Overview
- **Route / Hash:** `#seasons` ([`src/legacy/app.js:64`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L64))
- **View Name:** "Past seasons" / "পুরনো মৌসুম"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L64) (Route entry point, dispatches to `seasonView()`)
  - [`src/legacy/fields.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L847) (Implements `seasonView()`, year selector, multi-year rainfall comparison, wettest/driest month ranking, seasonal water deficit calculation)
  - [`src/legacy/ui.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js#L42) (Supplies `archive` from `history.json` and `earth` from `earth-data.json`)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/history.json` | 53,044 bytes (52 KB) | 5-year monthly weather archive per site (2021–2025): monthly totals for precipitation (`rainGpm`), average temperature (`tmean`), solar radiation, FAO-56 `et0` | 2021-01 to 2025-12 | [`scripts/fetch-history.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-history.py) |
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | 2024 baseline year detailed monthly meteorology and site metadata | 2024-01-01 to 2024-12-31 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | General metadata and citations | Curated static | — |
| `public/data/smap.json` | 269,793 bytes (264 KB) | Loaded into global state on boot, though `#seasons` primarily queries `history.json` | 2021-01-01 to 2025-12-31 | [`scripts/fetch-smap.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-smap.py) |

## 3. Upstream Datasets & Provenance
1. **NASA GPM IMERG (Integrated Multi-satellitE Retrievals for GPM):**
   - *Resolution:* 0.1° (~10 km) gridded precipitation estimates.
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Rendered as `REMOTE_OBSERVED` with `source: NASA GPM IMERG, date: 2024, cell: 10km` ([`src/legacy/fields.js:860`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L860), [`882`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L882)).
2. **NASA POWER / MERRA-2 (Modern-Era Retrospective analysis for Research and Applications, Version 2):**
   - *Resolution:* ~0.5° × 0.625° (~50 km).
   - *License:* Public domain / NASA Open Data Policy.
   - *Truth Label in UI:* Rendered as `MODELED` with `source: NASA POWER, date: 2024, cell: 50km` ([`src/legacy/fields.js:882`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L882), [`906`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L906)).
3. **Hardcoded / Literal Data Arrays in JS:**
   - Static year list in [`src/legacy/fields.js:854`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L854): `[2021, 2022, 2023, 2024, 2025].map((y) => [y, String(y)])`.

## 4. Data Use Quality & Integrity Issues
1. **Stale Hardcoded Truth Badge Date:** In [`src/legacy/fields.js:860`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L860) and [`882`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L882), when a user selects year 2021, 2022, 2023, or 2025 from the year selector, the truth badge metadata is hard-coded to `date: '2024'`! This mislabels multi-year historical data as 2024 observations. (Severity: High).
2. **SMAP Soil Moisture Unused in History View:** Even though `public/data/smap.json` contains full daily and monthly surface and root-zone soil moisture from 2021 through 2025, `#seasons` only renders precipitation and ETo, ignoring the historical drought and soil moisture trajectories.
3. **Sparse Historical Comparison:** Compares selected year against the 4-year mean of the remaining years (`comparisonMean` in [`src/legacy/fields.js:860`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/fields.js#L860)). With only 5 years of archive (2021–2025), climate normals cannot be rigorously determined (WMO requires 30 years). The UI does note this is a short comparison, but lacks historical context bounds.

## 5. Gaps & NASA Open Data Opportunities
1. **NASA GPM IMERG Final Run 25-Year Climatology (2000–present):**
   - *Impact:* Expand historical rainfall to 2000–2025 (available freely via GES DISC), allowing authentic 20+ year return-period drought/flood frequency and monsoon onset variation instead of a 4-year baseline.
   - *Effort:* S (Direct download or NASA POWER precipitation archive).
2. **MODIS Terra/Aqua 24-Year NDVI Archive (MOD13Q1 / MYD13Q1 250 m, 16-day):**
   - *Impact:* Add historical vegetation greenness curves for past Aman and Boro seasons from 2002 to 2024 to show multi-year crop health anomalies.
   - *Effort:* M (Via LP DAAC or NASA Earthdata Cloud).
3. **NASA CHIRPS / IMERG Drought Indices (SPI / SPEI):**
   - *Impact:* Compute Standardized Precipitation Evapotranspiration Index directly from the monthly IMERG and FAO-56 ETo data already in `history.json` to categorize seasons into Extreme/Severe/Moderate drought.
   - *Effort:* S (Pure client-side or preprocessing calculation).
