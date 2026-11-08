# 17 · How to Get the Open Data (APIs, tested)

Every call below was **run live on 8 Nov 2026** at Mithapukur (lat 25.54, lon 89.27). "Status" shows what actually came back. Copy a URL into a browser or `curl` to try it.

## Quick view

| Data | How you get it | Login? | Status today | Feeds (screen / plan) |
|---|---|---|---|---|
| NASA POWER weather + wetness | REST API (JSON) | No | ✅ works | All weather screens |
| NASA GPM IMERG rain | Same POWER API, `IMERG_PRECTOT` | No | ✅ works (needs `time-standard=UTC`) | Rain on every screen |
| NASA SMAP soil moisture | POWER public cloud store (Zarr on AWS S3) | No | ⚠️ API returns no data; cloud store open | Planned SMAP card (D-C11) |
| Landsat 8/9 | Planetary Computer STAC (search) + data API | No | ✅ works | My field, Past seasons, Research |
| Sentinel-2 *(ESA)* | Planetary Computer STAC | No | ✅ works | My field |
| Sentinel-1 radar *(ESA)* | Planetary Computer STAC | No | ✅ works | Planned flood history (M5) |
| NASADEM height | Planetary Computer data API (point read) | No | ✅ works (27 m at Mithapukur) | Planned 3D view (D-C4) |
| NISAR radar | ASF search API | Search: no · download: Earthdata login | ✅ scenes found (4 + 6 Nov 2026) | Research pilot (P1) |
| NASA FIRMS fires | REST API | Free MAP_KEY | 🔑 needs key | Fire context (P1) |
| ISRIC SoilGrids | REST API | No | ❌ 503 down today (retry) | Soil baseline (M3) |
| FFWC flood (Bangladesh) | REST API | Registration | 🔑 docs only after sign-up | Flood alerts (P0) |
| geoBoundaries | REST API | No | ✅ works | Map borders |

✅ works · ⚠️ partly · 🔑 needs a free key/registration · ❌ down when tested

---

## 1. NASA POWER — weather and soil wetness

- **What it gives:** temperature, rain, humidity, wind, sunshine, pressure, soil wetness (0–1 score).
- **Docs:** https://power.larc.nasa.gov/docs/services/api/temporal/daily/ · parameter list: https://power.larc.nasa.gov/parameters/
- **Call (daily, one point):**
  ```
  https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,GWETTOP,GWETROOT&community=AG&longitude=89.27&latitude=25.54&start=20240701&end=20240703&format=JSON&time-standard=UTC
  ```
- **Got back:** `T2M 28.55 °C`, `PRECTOTCORR 52.14 mm/day`, `GWETTOP 0.95`, `GWETROOT 0.99` on 1 Jul 2024.
- **The app's full parameter set** (from `scripts/fetch-earth-data.py`): `T2M,T2M_MAX,T2M_MIN,PRECTOTCORR,GWETTOP,GWETROOT,RH2M,WS2M,ALLSKY_SFC_SW_DWN,PS`.
- **Tips:** `-999` means missing → store as null. Max ~20 parameters per call. Monthly: `/api/temporal/monthly/point`. Machine-readable spec: https://power.larc.nasa.gov/api/temporal/daily/openapi.json

## 2. NASA GPM IMERG — satellite rain

- **What it gives:** rain total per day at ~10 km detail.
- **Call:** same POWER endpoint with `parameters=IMERG_PRECTOT`.
  ```
  https://power.larc.nasa.gov/api/temporal/daily/point?parameters=IMERG_PRECTOT&community=AG&longitude=89.27&latitude=25.54&start=20240701&end=20240703&format=JSON&time-standard=UTC
  ```
- **Got back:** 119.88 mm on 1 Jul 2024.
- **Must:** add `time-standard=UTC`. Without it POWER returns `-999` with the message "IMERG Source Data is not available at the Local Solar Time (LST) standard".

## 3. NASA SMAP — real soil moisture (m³/m³)

- **What it gives:** volumetric soil water: `SFMC` (0–5 cm), `RZMC` (root zone 0–100 cm), `PRMC` (profile), plus `SFMC_PRCNTL` / `RZMC_PRCNTL` percentiles (vs 2015–now). ~9 km detail, 2015–present.
- **Docs:** https://power.larc.nasa.gov/docs/methodology/data/sources_hydrology/ (section "SMAP")
- **Finding:** the parameters are listed in POWER's dictionary, but the normal daily API returned `-999` for 2020, 2023, 2024 and 2025. The docs say SMAP needs a "high-resolution mode" that the documented API has no option for (tried 6 spellings).
- **Working route — POWER's public cloud store (no login, listing verified):**
  ```
  s3://nasa-power-smap/smap/temporal/power_smap_daily_temporal_utc.zarr     (time series, best for one point)
  s3://nasa-power-smap/smap/spatial/power_smap_daily_spatial_utc.zarr       (maps)
  ```
  Variables inside include `SFMC, RZMC, PRMC, RZMC_PRCNTL, PRMC_PRCNTL, GWETTOP, GWETROOT, TSOIL1…`. Monthly/annual/hourly stores sit next to them.
- **Read it (Python, not yet run here; needs `xarray zarr s3fs`):**
  ```python
  import xarray as xr
  ds = xr.open_zarr("s3://nasa-power-smap/smap/temporal/power_smap_daily_temporal_utc.zarr",
                    storage_options={"anon": True})
  print(ds)  # check dimension names first, then select the nearest point to 89.27 E, 25.54 N
  ```
- **Backup source:** NSIDC SMAP L4 `SPL4SMGP` v008 (2015-03-31 → present), confirmed in NASA's catalogue; download needs a free Earthdata login: https://nsidc.org/data/spl4smgp/versions/8
- **Rule:** show SMAP in m³/m³ and never mix it with the 0–1 GWET score (D-C6, T-UNIT).

## 4. Landsat, Sentinel-2, Sentinel-1, NASADEM — Microsoft Planetary Computer

- **What it gives:** satellite photos (Landsat 30 m, Sentinel-2 10 m), radar that sees through cloud (Sentinel-1, VV/VH), ground height (NASADEM 30 m).
- **Docs:** https://planetarycomputer.microsoft.com/docs/quickstarts/reading-stac/
- **Search scenes (STAC):**
  ```
  https://planetarycomputer.microsoft.com/api/stac/v1/search?collections=landsat-c2-l2&bbox=89.25,25.52,89.29,25.56&datetime=2024-01-01/2024-12-31&limit=3
  ```
  Swap `collections=` for `sentinel-2-l2a`, `sentinel-1-rtc` or `nasadem` (NASADEM has no dates; drop `datetime`).
- **Got back:** Landsat `LC08_L2SP_138042_20241229_02_T1` (cloud 3.4%), Sentinel-2 `S2A_MSIL2A_20241224…` (cloud 0.01%), Sentinel-1 `S1A_IW_GRDH…20241227…_rtc` (vv, vh), NASADEM tile `NASADEM_HGT_n25e089`.
- **Read one value without downloading (data API):**
  ```
  https://planetarycomputer.microsoft.com/api/data/v1/item/point/89.27,25.54?collection=nasadem&item=NASADEM_HGT_n25e089&assets=elevation
  ```
  → `{"values":[27.0]}` (27 m).
- **Small cut-outs** (what `scripts/extract-optical.py` and `fetch-context.py` already use): `/api/data/v1/item/bbox/{minx},{miny},{maxx},{maxy}/{w}x{h}.tif?collection=…&item=…&assets=…`
- **Full file downloads** need a short-lived token, free and with no login: `https://planetarycomputer.microsoft.com/api/sas/v1/token/<collection>` (tested ✅).
- **Tips:** filter clouds with `eo:cloud_cover`; keep the scene ID with every value (BP §8.2 T-QA).

## 5. NISAR — new NASA–ISRO radar (research pilot)

- **What it gives:** 3–10 m radar images (flood, rice). The ~200 m soil-moisture product is not confirmed yet.
- **Search (no login):**
  ```
  https://api.daac.asf.alaska.edu/services/search/param?platform=NISAR&intersectsWith=POINT(89.27%2025.54)&maxResults=3&output=geojson
  ```
- **Got back:** 3 scenes over Mithapukur, e.g. `NISAR_L1_PR_RSLC_035_019_D_…_20261106…` (level L1 RSLC, raw radar).
- **Download:** free Earthdata login (https://urs.earthdata.nasa.gov). Docs: https://docs.asf.alaska.edu/api/basics/
- **Rule:** radar imagery is not a moisture reading (T-RADAR).

## 6. NASA FIRMS — active fires

- **What it gives:** fire hotspots (375 m, near real time) for fire-recovery context.
- **Call:** `https://firms.modaps.eosdis.nasa.gov/api/area/csv/<MAP_KEY>/VIIRS_SNPP_NRT/88.9,25.3,89.6,26.1/1`
- **Got back without a key:** `Invalid MAP_KEY.` → get a free key at https://firms.modaps.eosdis.nasa.gov/api/map_key/
- **Rule:** never "no hotspot = safe".

## 7. ISRIC SoilGrids — regional soil (pH, carbon, texture)

- **What it gives:** modeled pH, organic carbon, clay/sand/silt, CEC, total N at 250 m, 6 depths.
- **Call:**
  ```
  https://rest.isric.org/soilgrids/v2.0/properties/query?lon=89.27&lat=25.54&property=phh2o&property=soc&property=clay&depth=0-5cm&value=mean
  ```
- **Status:** `503 Service Temporarily Unavailable` twice on 8 Nov 2026. Retry later; docs: https://rest.isric.org/
- **Tips:** values are scaled integers (e.g. pH × 10); read the `unit_measure` block. Modeled total N ≠ plant-available N (T-SOIL).

## 8. FFWC — Bangladesh river levels and flood warnings

- **What it gives:** real-time and historical river water levels, warnings, 24/48 h forecasts.
- **Page:** https://api.ffwc.gov.bd/
- **Status:** the page says "Developer Documentation (link will be provided upon registration)".
- **Contact (updated 9 Nov 2026):** `api.support@bwdb.gov.bd` from the API page **bounces** (550 User unknown). Use the official contacts in the FFWC site footer: **ffwcbwdb@gmail.com**, **ffwc@bwdb.gov.bd**, **ffwc05@yahoo.com**, phone **+880 2 2222 30070** (task D-Q2).
- **Until then:** link to the official bulletin https://ffwc.gov.bd/ (already in the app).
- **Checked 9 Nov 2026 — observed water level page** https://ffwc.gov.bd/app/observed-water-level:
  - The page is an Angular app that reads `https://api.ffwc.gov.bd/data_load/...` (e.g. `stations/`, `observed-waterlevel-by-station/`, `seven-days-observed-waterlevel-by-station/`, `forecast-waterlevel-by-station/`, `three-days-observed-rainfall/`).
  - Direct calls return **403 "Access Denied: Invalid Security Header"**. The site adds an internal key header and, for logged-in users, a Bearer token from `/api/token/`.
  - **Not usable as open data.** We do **not** copy the site's internal key (that would bypass their access control). Use it only after registration gives us our own credentials.
  - **Allowed now:** deep-link farmers to the official page (`/app/observed-water-level`) from the Recovery and Water screens, labelled "Official FFWC — live".
  - **Stations to request first** (Rangpur area, to confirm with FFWC): Teesta (Dalia, Kaunia), Ghaghot (Gaibandha), Karatoya.

## 9. geoBoundaries — district and upazila borders

- **Call:** `https://www.geoboundaries.org/api/current/gbOpen/BGD/ADM3/` → JSON with download links (GeoJSON).
- **Got back:** `BGD-ADM3-5055444`, source BBS / OCHA ROAP, licence CC BY 3.0 IGO.

---

## Rules for anyone adding a data call

1. **Freeze, don't fetch live.** Fetch with a script in `scripts/`, save the raw response in `data-raw/`, and ship the processed JSON in `public/data/` (offline app, D-Q1/Q4).
2. **Keep the receipt.** Store the request URL, scene/item ID, product version and fetch date next to every value.
3. **Missing stays missing.** `-999`, `null`, fill values and cloudy pixels → `UNKNOWN`, never 0.
4. **Label the detail.** Save the native grid size (POWER ~50 km, IMERG ~10 km, SMAP ~9 km, Landsat 30 m) and show it with the value.
5. **Never commit keys.** FIRMS MAP_KEY, Earthdata and FFWC credentials go in an untracked `.env`.
