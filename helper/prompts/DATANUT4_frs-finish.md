# DATANUT4 · Finish the frs-bd.com scrape (DATANUT3 stopped one step short)

First: `git merge card/DATANUT3` (its navigation code + saved union pages in `data-raw/frs/`). DATANUT3 reached Division→District→Upazila→Union→Soil physiography for Mithapukur (ইমাদপুর), Pirganj (কুমেদপুর), Gangachara (কোলকোন্দ) but stopped. The form continues — the supervisor read the saved HTML:
- `ctl00_ContentPlaceHolder1_ddlSeason`: খরিপ - ১ / খরিপ - ২ / রবি
- `ddlCropCategory` (fills after season postback), `ddlCrop` (fills after category postback)
- `ddlLandType`: উঁচু / মাঝারি উঁচু / মাঝারি নিচু / নিচু / অতি নিচু জমি
- `ddlDrainage`: উত্তম / মাঝারি উত্তম / কিঞ্চিত মন্দ / মন্দ / অতি মন্দ / অতি উত্তম
Use **Playwright (python or node) — it is allowed and expected**; "requires JS" is not a reason to stop. For each union: season রবি, a cereal or the first category, crop আলু (potato) or the first crop, land type মাঝারি উঁচু জমি, drainage মাঝারি উত্তম, then click the submit/"সুপারিশ"/"দেখুন" button (LinkButton or input). Save the result page HTML + a screenshot to `data-raw/frs/`. The recommendation page normally shows the union's **soil test values / nutrient status (N, P, K, S, Zn, B, pH, OM)** used for the dose — parse those. Also record the recommended fertilizer doses (kg/ha) for that crop as an extra field.
Update P/K/S/Zn/B (+ keep SoilGrids entries) in `public/data/soil-nutrients.json` via `scripts/fetch-soil-nutrients.py`, `source: "SRDI Online Fertilizer Recommendation System (frs-bd.com)"`, union, land type, crop/season used, url, sha256 of saved HTML, truth MODELED. If the result page truly shows no soil values, keep nulls but store the doses and explain in `searched`. Invented/typed numbers = rejection.
Acceptance: script runs end-to-end; tests; `npm test`; `npm run build`. Commit with parsed rows in the message. Never touch package-lock.json/node_modules.
