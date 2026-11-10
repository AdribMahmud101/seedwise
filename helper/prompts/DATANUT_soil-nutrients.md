# DATANUT · Real soil nutrients for the 3 pilot fields

STUDIO5D was REJECTED (hand-typed values, fake citation). STUDIO5E gave up wrongly ("APIs inaccessible") — they ARE reachable. Invented, typed-in, synthetic or placeholder values = automatic rejection.

Build `scripts/fetch-soil-nutrients.py` → `public/data/soil-nutrients.json` (schema in `helper/prompts/STUDIO5D_fetch-missing-data.md` §2) for Mithapukur, Pirganj, Gangachara (Rangpur):
1. **pH, OM (from SOC ×1.724), total N, CEC** — SoilGrids 2.0 WCS (`https://maps.isric.org/mapserv?map=/map/<prop>.map`, reachable; see working `scripts/fetch-soilgrids.py`, reuse it), 0–15 cm, sampled at each field. Truth MODELED.
2. **P, K, S, Zn, B** — SRDI Upazila Nirdeshika (Land & Soil Resource Utilization Guide) for each upazila. `srdi.portal.gov.bd` works but has a BROKEN TLS certificate: use `verify=False` (requests) / `curl -k`. Find the upazila guide pages/PDFs (site search, the "Upazila Nirdeshika" / "উপজেলা নির্দেশিকা" sections, Rangpur district). Download the PDF to `data-raw/srdi/` (gitignore if > 5 MB), record url + sha256, extract the soil-fertility-status table with `pdfplumber`; if scanned, OCR with `pytesseract` (ben+eng) — print the extracted table rows so they can be checked. Also try BARC/SRDI open soil-fertility rasters or datasets (e.g. data.gov.bd, BARC LRMIS/Crop Zoning) if PDFs fail.
3. Classes via BARC FRG-2018 interpretation thresholds (cite).
4. A nutrient with genuinely no source after (2) → `value: null, status: "no open source found", searched: [real urls tried with HTTP codes]`.
Every value: `url`, `sha256` of the raw file, `page`/`table` or raster coords, `retrieved`. Tests: schema, ranges, every non-null value has sha256.
Commit message: the printed per-site table + extracted SRDI rows.
Acceptance: script runs end-to-end on this machine; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Only `scripts/fetch-soil-nutrients.py`, `public/data/soil-nutrients.json`, `tests/soil-nutrients.test.mjs`, `docs/credits.md`, `.gitignore`, `data-raw/srdi/`.
