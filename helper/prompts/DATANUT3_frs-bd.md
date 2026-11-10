# DATANUT3 · P, K, S, Zn, B from SRDI's Online Fertilizer Recommendation System

DATANUT2 failed again by GUESSING PDF URLs. Do not guess URLs. The real source: **http://frs-bd.com/** (SRDI Online Fertilizer Recommendation System; HTTP only, HTTPS fails). It is an ASP.NET WebForms site: cascading dropdowns Division → District → Upazila → Union (→ land type), driven by `__doPostBack` with `__VIEWSTATE`/`__EVENTVALIDATION`; `LandtypeDetails.aspx` and `Help.aspx` exist.
Procedure (requests + BeautifulSoup, or Playwright if postbacks are JS-heavy — `npx playwright` / python playwright are OK):
1. GET the page, parse the form, select Rangpur division → Rangpur district → Mithapukur / Pirganj / Gangachara upazila, posting back each step with the hidden fields. For each upazila pick the union that contains the field centroid (union names from the dropdown; centroid lat/lon in the app data; if you cannot map, use the upazila's first listed union AND say so).
2. Reach the page that shows soil nutrient status / soil-test interpretation for that union & land type (medium highland unless the data says otherwise): P, K, S, Zn, B (and pH/OM if shown). Save each final HTML to `data-raw/frs/<upazila>-<union>.html`, record url + form selections + sha256.
3. Parse values/classes from that saved HTML (print the parsed rows). Update ONLY P/K/S/Zn/B in `public/data/soil-nutrients.json` via `scripts/fetch-soil-nutrients.py` (keep SoilGrids entries) with `source: "SRDI Online Fertilizer Recommendation System (frs-bd.com)"`, `truth: "MODELED"`, union + land type.
4. If the site truly has no nutrient values for these unions, keep nulls and list each page reached in `searched` with what it showed.
Typed-in or invented numbers = rejection. Commit message: the parsed rows per upazila.
Acceptance: script runs end-to-end; tests (non-null values have url + sha256 + union); `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Commit.
