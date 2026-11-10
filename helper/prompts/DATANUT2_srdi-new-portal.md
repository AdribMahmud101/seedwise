# DATANUT2 · P, K, S, Zn, B from SRDI's NEW portal

DATANUT (merged) filled pH/SOC/OM/N/CEC from SoilGrids — good. P/K/S/Zn/B are still null because it guessed PDF URLs on `srdi.portal.gov.bd`, which is DEAD ("Domain is not available"). SRDI moved to **https://srdi.gov.bd/** (works, Bengali). Leads found by the supervisor on its home page:
- `/pages/publications/6922d9cc81fc96cef9eb3e5a` (publications)
- `/pages/static-pages/6922de3b933eb65569e19310` (নির্দেশিকা/সহায়িকা)
- notice about printing 50 renewed Upazila Nirdeshika (উপজেলা নির্দেশিকা), 2026–27.
Crawl these (follow links, use a browser User-Agent, `verify=False` if TLS fails), find the Upazila Nirdeshika / Land & Soil Resource Utilization Guide for **Mithapukur, Pirganj, Gangachara (Rangpur)** or the Rangpur district soil fertility data. Download to `data-raw/srdi/`, record url + sha256, extract the "soil fertility status" tables (pdfplumber; scanned → `pytesseract` lang ben+eng; print the raw extracted rows). Map the classes (Very low…Very high) and any numeric ranges to P, K, S, Zn, B per upazila/land type (use the land type that matches each field: medium highland if unclear, say so).
If the guides for these 3 upazilas truly are not online, try: BARC "Fertilizer Recommendation Guide 2018" PDF (AEZ-3 Tista Meander Floodplain nutrient status tables) on barc.gov.bd, and SRDI "Soil Fertility" district reports. Record every URL tried with HTTP status in `searched`.
Update only P/K/S/Zn/B entries in `public/data/soil-nutrients.json` via `scripts/fetch-soil-nutrients.py` (keep the SoilGrids entries). Invented or typed-in numbers = rejection; values must come from extracted file content.
Acceptance: script runs end-to-end; tests (every non-null value has url + sha256 + page/table); `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit with the extracted rows in the message.
