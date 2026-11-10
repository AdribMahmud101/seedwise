# Route Data Audit: Research lab (`#research`)

## 1. Overview
- **Route / Hash:** `#research` ([`src/legacy/app.js:70`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L70))
- **View Name:** "Research lab" / "গবেষণাগার"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L70) (Route navigation to `research()`)
  - [`src/legacy/research.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/research.js) (View rendering `research()`, NASA GPM vs POWER daily rainfall comparison, Landsat Collection 2 QA pixel inspector, trial catalogue, ground truth observation logger)
  - [`src/legacy/ui.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js) (Data stores, form inputs, persistent ground truth logging in `state.groundTruth`)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | 366 paired daily rainfall values (POWER MERRA-2 vs GPM IMERG), paired statistical error metrics (MAE, mean difference, 95% CI), Landsat C2 Level-2 pixel QA records (cloud mask %, usable fraction, NDVI) | 2024-01-01 to 2024-12-31 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py), [`scripts/extract-optical.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/extract-optical.py) |
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | Published trial database (Hossain 2022, Islam 2014, BRRI, BARC) with treatment details and reference yields | Static peer-reviewed | Curated |

## 3. Upstream Datasets & Provenance
1. **NASA GPM IMERG vs. NASA POWER (MERRA-2):**
   - *Resolution:* Paired daily comparison (0.1° satellite precipitation vs 0.5° reanalysis).
   - *Truth Label in UI:* Paired QA statistics labeled `MODELED` (`source: Paired daily QA`) ([`src/legacy/research.js:136`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/research.js#L136)).
2. **NASA/USGS Landsat Collection 2 Level 2 QA (Pixel Quality Assessment):**
   - *Resolution:* 30 m native pixels.
   - *License:* Public domain / USGS.
   - *Truth Label in UI:* Optical cloud and shadow coverage labeled `REMOTE_OBSERVED` (`source: Landsat QA`, `source: Landsat NDVI`) ([`src/legacy/research.js:163`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/research.js#L163)). Original STAC / Planetary Computer item request link is provided.
3. **Farmer / Lab Ground Truth:**
   - *Truth Label in UI:* Field observations tagged `FARMER_REPORTED` or `MEASURED` (`source: Laboratory confirmed`) ([`src/legacy/research.js:210-215`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/research.js#L210-L215)).
4. **Hardcoded / Literal Data Arrays in JS:**
   - Pre-calculated annual statistical metrics (paired days, mean diff, MAE, 95% confidence interval) serialized in `earth-data.json`.
   - Form field limits in [`src/legacy/research.js:247`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/research.js#L247).

## 4. Data Use Quality & Integrity Issues
1. **Gold-Standard Truth Tagging:** `#research` is the most scientifically honest view in the entire suite. It explicitly warns that difference between POWER and IMERG measures *product disagreement*, not true error against a reference rain gauge.
2. **Serial Correlation Warning:** The UI acknowledges that assuming independent days in 95% confidence intervals may underestimate uncertainty due to autocorrelation ([`src/legacy/research.js:150`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/research.js#L150)).
3. **Traceability:** Direct link to USGS/Planetary Computer STAC requests (`epoch.opticalQA.dataRequest` in line 163).
4. **Data Isolation:** Only evaluates 2024. Does not compute disagreement metrics over the 5-year archive in `history.json`.

## 5. Gaps & NASA Open Data Opportunities
1. **NASA GPM IMERG Final Run V07 Calibrated Gauge Product:**
   - *Impact:* Compare the satellite-only IMERG Early/Late run with the Ground-Gauge-Calibrated IMERG Final run over Bangladesh (BMD station calibrated) to expose true satellite precipitation bias.
   - *Effort:* M (Via GES DISC).
2. **NASA Harmonized Landsat Sentinel-2 (HLS) S30/L30 QA & Fmask:**
   - *Impact:* Provide a continuous 2024 cloud-cover and shadow timeline across all 73 Sentinel-2 + Landsat acquisitions rather than just 4 static Landsat epochs.
   - *Effort:* M.
3. **CEOS / NASA Earthdata Calibration & Validation (Cal/Val) Network:**
   - *Impact:* Export farmer ground-truth soil moisture and crop cuts in standardized CEOS Land Product Validation (LPV) schema.
   - *Effort:* L.
