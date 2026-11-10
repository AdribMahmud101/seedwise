# Route Data Audit: Crop clinic (`#clinic`)

## 1. Overview
- **Route / Hash:** `#clinic` ([`src/legacy/app.js:67`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L67))
- **View Name:** "Crop clinic" / "ফসলের চিকিৎসাঘর"
- **Primary JS Modules:**
  - [`src/legacy/app.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/app.js#L67) (Route mapping)
  - [`src/legacy/clinic.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/clinic.js) (Symptom diagnostic tree, BARC 2024 elemental fertilizer calculator, product dose converter)
  - [`src/legacy/ui.js`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/ui.js) (Supplies `agronomy`, modal popups, unit formatters)

## 2. Data Files Fetched & Loaded
All paths verified with `ls -la` and `wc -c`:

| File Path | Size (Bytes / Disk) | Content & Structure | Date Range | Build Script |
|:---|:---|:---|:---|:---|
| `public/data/agronomy.json` | 61,054 bytes (60 KB) | Symptom database (`symptoms` array: rice blast, brown spot, stem borer, nitrogen deficiency, mustard aphids, potato late blight, cutworm), BARC FRG 2024 fertilizer conversion factors, AEZ-3 soil guidelines | Reviewed 2024–2026 | Curated from BARC FRG 2024, IRRI, BRRI, BAMIS |
| `public/data/earth-data.json` | 286,603 bytes (280 KB) | Field area and cultivable area used as default calculator input | 2024 | [`scripts/fetch-earth-data.py`](file:///root/projects/ropon-radar-wt/DATAAUDIT/scripts/fetch-earth-data.py) |

## 3. Upstream Datasets & Provenance
1. **BARC Fertilizer Recommendation Guide 2024 (FRG 2024):**
   - *Resolution:* AEZ-3 (Tista Meander Floodplain) specific recommendations.
   - *License:* Government of Bangladesh open publication.
   - *Truth Label in UI:* Elemental to product calculations labeled `MODELED` (`source: BARC 2024 calculator`) and `SCENARIO` (`source: BARC fractions`) ([`src/legacy/clinic.js:109, 217, 222`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/clinic.js#L109)).
2. **IRRI / BRRI / BAMIS Diagnostic Literature:**
   - *Resolution:* Visual symptom keys.
   - *Truth Label in UI:* Farmer observations labeled `FARMER_REPORTED` (`source: Symptom checklist`) ([`src/legacy/clinic.js:62`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/clinic.js#L62)).
3. **Hardcoded / Literal Data Arrays in JS:**
   - Elemental nutrient fractions in [`src/legacy/clinic.js:109`](file:///root/projects/ropon-radar-wt/DATAAUDIT/src/legacy/clinic.js#L109): Urea 46% N, TSP 20% elemental P ($46\% \text{ P}_2\text{O}_5 \times 0.4364$), MOP 50% elemental K ($60\% \text{ K}_2\text{O} \times 0.8302$).
   - Fertilizer conversion formulas strictly adhere to BARC FRG 2024 Appendix 10.

## 4. Data Use Quality & Integrity Issues
1. **Zero NASA Open Data Utilized in Diagnostic Loop:** Despite disease pathogens (like *Phytophthora infestans* / Potato Late Blight and *Magnaporthe oryzae* / Rice Blast) having documented epidemiological correlations with microclimate (relative humidity > 90%, temperature 15–22°C, and leaf wetness duration), the Clinic does not consult NASA POWER daily RH2M/T2M or SMAP moisture to compute disease risk indices!
2. **Truth Label Rigor:** Excellent truth distinction between `FARMER_REPORTED` (farmer checklist) and `MODELED` (stoichiometric fertilizer conversion).
3. **No Blanket Chemical Prescriptions:** Responsibly omits chemical pesticides/fungicides that expire or promote pesticide resistance, adhering to BRRI IPM protocols.

## 5. Gaps & NASA Open Data Opportunities
1. **NASA POWER Daily Relative Humidity & Temperature (RH2M, T2M, PRECTOTCORR):**
   - *Impact:* Create a real-time/recent "Late Blight Weather Alert" (Wallin / Hyre model criteria: 2 consecutive days with min temp $\ge 10^\circ$C and 10-day rainfall > 30 mm, RH > 90%).
   - *Effort:* S (POWER daily variables already in `earth-data.json`).
2. **NASA ECOSTRESS Land Surface Temperature (LST, 70 m):**
   - *Impact:* Detect canopy thermal anomalies indicating vascular wilt or severe root damage before visible foliar chlorosis.
   - *Effort:* M (Via LP DAAC).
3. **Landsat 8/9 & Sentinel-2 RedEdge / NDRE (Normalized Difference Red Edge):**
   - *Impact:* Detect early nitrogen chlorosis across the plot before broad-band NDVI drops.
   - *Effort:* M (Derivable from Sentinel-2 Band 5 & Band 8).
