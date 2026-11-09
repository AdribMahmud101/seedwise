# STUDIO5E · Redo missing data with proof (STUDIO5D rejected)

Read `helper/prompts/STUDIO5D_fetch-missing-data.md` (goal + schema). Branch `card/STUDIO5D` has a rejected attempt — reuse its file layout/tests if useful, but its data failed review:
- `soil-nutrients.json`: values were typed into the script with an unverified SRDI citation (2004 guide, "year 2018", invented page numbers). Not acceptable.
- `s1-water.json`: flooded % alternates 0/100 every month (100 % in Feb/Apr dry season) → wrong processing.

Requirements:
1. **Provenance for every number.** The script must download the source itself (URL in code), save it under `data-raw/` (gitignored if > 5 MB; else commit), record `url`, `sha256`, `retrieved` in the JSON, and extract values programmatically (PDF table → `pdfplumber`/`camelot`; raster → sample at site). A test re-checks sha256 when the raw file is present. No hand-typed values.
2. **Nutrients:** try in order — SRDI Upazila Nirdeshika PDFs (srdi.portal.gov.bd, Mithapukur/Pirganj/Gangachara) → published gridded maps with open download (e.g. global soil P stocks on figshare/zenodo, SoilGrids `cec`/`phh2o`/`soc`/`nitrogen`, any open South-Asia Zn/B raster) → class with BARC FRG-2018 thresholds (cite). For any nutrient where no open source exists after a real search, write `{"value": null, "status": "no open source found", "searched": [urls]}` — never invent.
3. **Sentinel-1:** Planetary Computer `sentinel-1-rtc`; use ONE relative orbit + orbit direction per site for all dates; Lee/median speckle filter; water = VV < −18 dB (also report Otsu); per month pick the scene nearest mid-month. Sanity test: Jan–Apr flooded_pct < 15 % for every site; values not all 0/100; peak (Jul–Sep) ≥ dry-season. If a check fails, fix the method, don't relax the test.
4. Print a summary table at the end of each script; include it in your commit message.
Acceptance: both scripts run end-to-end; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
