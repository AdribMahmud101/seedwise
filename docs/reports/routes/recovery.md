# Route Data Audit: Disaster recovery (`#recovery`)

## 1. Overview
- **Route / Hash:** `#recovery` ([`src/legacy/app.js:69`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L69))
- **View Name:** "Disaster recovery" / "দুর্যোগের পর করণীয়"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L69) (Route navigation to `recovery()`)
  - [`src/legacy/recovery.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery.js) (View rendering `recovery()`, hazard tabs: Flood, Drought, Fire; checklist, alternative crop window calendar)
  - [`src/legacy/recovery-engine.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery-engine.js) (Date arithmetic for seedbed establishment, land readiness offset, harvest feasibility)
  - [`src/legacy/recovery-data.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery-data.js) (Emergency agronomy guidance, safety checklists, emergency hotline 102, crop alternative specifications)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | Citations for disaster recovery literature (BAMIS advisories, BRRI post-flood Aman varieties, FAO fire recovery) | Reviewed 2024–2026 | Static agronomy |
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | Field geometry and 2024 baseline weather | 2024 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |

## 3. Upstream Datasets & Provenance
1. **Bangladesh Agro-Meteorological Information Service (DAE BAMIS) & BRRI:**
   - *Resolution:* Extension advisories and variety bulletins (BRRI dhan71, mung bean BARImung-6).
   - *Truth Label in UI:* Reference planting windows labeled `MODELED` (`source: Archived advisories`) ([`src/legacy/recovery.js:221`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery.js#L221)).
2. **Farmer Input & Arithmetic Calculations:**
   - *Truth Label in UI:* Farmer conditions labeled `SCENARIO` (`source: Recovery model`) and harvest dates labeled `SCENARIO` (`source: Arithmetic estimate`) ([`src/legacy/recovery.js:222-223`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery.js#L222-L223)).
3. **Hardcoded / Literal Data Arrays in JS:**
   - Growth durations in [`src/legacy/recovery-data.js:147, 170, 193`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/recovery-data.js#L147): Mustard `days: [75, 80]`, Mung `days: [55, 58]`, BRRI dhan71 `days: [90, 95]` (post-transplant).
   - Safety rules for post-fire and post-flood contamination (IFRC, FAO, UC ANR).

## 4. Data Use Quality & Integrity Issues
1. **Complete Absence of NASA Earth Observations:** While `#recovery` provides exceptional agronomic and safety heuristics for floods, droughts, and fires, it is completely disconnected from real-time or recent satellite hazard datasets!
2. **Fire Module Has No FIRMS Fire Data:** The fire recovery module gives advice on ash safety and seedbed rehabilitation, but does not pull active fire detections or burn severity.
3. **Flood Module Has No Satellite Flood Extent:** Flood recession days are input manually by the farmer, rather than consulting Sentinel-1 SAR or MODIS/VIIRS flood maps.
4. **Honest Date Arithmetic:** The view explicitly reminds the farmer that harvest dates are arithmetic estimates, not forecasts, preventing overconfidence.

## 5. Gaps & NASA Open Data Opportunities
1. **NASA FIRMS (Fire Information for Resource Management System - VIIRS 375 m / MODIS 1 km):**
   - *Impact:* Query active fire detections and thermal anomalies within 10 km of the field. Alert farmers if crop residue burning or village fires are detected.
   - *Effort:* S (FIRMS API provides free CSV/GeoJSON with a map key or open WMS).
2. **NASA / USGS Landsat & Sentinel-2 Burned Area / NBR (Normalized Burn Ratio):**
   - *Impact:* 30 m NBR index ($(\text{NIR} - \text{SWIR}) / (\text{NIR} + \text{SWIR})$) to map scorch perimeter and topsoil damage.
   - *Effort:* M.
3. **NASA OPERA Dynamic Surface Water Extent (DSWx-S1 / DSWx-HLS, 30 m):**
   - *Impact:* Automatically detect water recession dates after Teesta river flash floods, calculating exact days since standing water receded without guessing.
   - *Effort:* M (Via Earthdata Cloud STAC).
4. **NASA GPM IMERG 7-Day Cumulative Rain:**
   - *Impact:* Detect excessive pre-monsoon precipitation triggering drainage hazards.
   - *Effort:* S.
