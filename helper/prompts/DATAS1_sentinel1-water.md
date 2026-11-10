# DATAS1 · Real Sentinel-1 water for the 3 pilot fields

STUDIO5D and STUDIO5E were REJECTED: 5D gave 0/100 alternation, 5E used "synthetic VV grids" (fabricated). Any synthetic, simulated, random or placeholder value = automatic rejection.

Build `scripts/fetch-s1-water.py` → `public/data/s1-water.json` (schema in `helper/prompts/STUDIO5D_fetch-missing-data.md` §1). Planetary Computer is reachable from this machine (HTTP 200): STAC `https://planetarycomputer.microsoft.com/api/stac/v1`, collection `sentinel-1-rtc`, sign assets with `planetary_computer.sign` (pip install planetary-computer pystac-client rasterio if missing). For each site (polygons/centroids from existing app data) and each month of 2024: pick the scene nearest the 15th from ONE relative orbit + direction per site; read VV over field bbox + 200 m; 3×3 median filter; dB; water = VV < −18 dB; report Otsu too.
**Each date entry must include the real STAC `item_id`** and asset href (unsigned). The supervisor will look up every item_id in the STAC API; a missing one = rejection.
Sanity tests (tests/s1-water.test.mjs): Jan–Apr flooded < 15 % every site; not all 0/100; peak Jul–Sep ≥ Jan–Apr mean; every date has item_id. Fix the method if they fail; never relax them.
Commit message: the printed per-site/month table.
Acceptance: script runs end-to-end on this machine; `npm test`; `npm run build`. Never touch package-lock.json/node_modules. Only `scripts/fetch-s1-water.py`, `public/data/s1-water.json`, `tests/s1-water.test.mjs`, `docs/credits.md`.
