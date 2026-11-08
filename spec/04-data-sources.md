# 04 · Data Sources

**Included in CORE** = shipped in the current data pack. Priority = BP §Implementation priorities / §7.

## A. Already included in the core data pack [CORE README "Included evidence", CORE/M, CORE/CR]

| Dataset | What is included | Notes |
|---|---|---|
| NASA POWER (MERRA-2) | Daily 2024: temperature, corrected precipitation (PRECTOTCORR), radiation, humidity, pressure, wind, GWETTOP/GWETROOT; monthly 2021–2025 | Meteorology anchors 89.375° E / 25.5° N and 89.375° E / 26.0° N; **Mithapukur and Pirganj share one POWER cell**. Missing values stay null. |
| GPM IMERG (via POWER) | Daily rainfall per prepared centre (2024), monthly 2021–2025 | Requested independently at the three centres |
| Landsat 8/9 C2 L2 (USGS via Planetary Computer) | 4 windows per site in 2024; 900 × 900 m, 30 m grid, UTM 45N; QA_PIXEL masks; map image 28 Jan 2024 (Landsat 8) | Scene IDs, window requests, band references preserved |
| Sentinel-2A L2A (Copernicus via Planetary Computer) | One true-colour context image, 9 Mar 2024 | "Contains modified Copernicus Sentinel data (2024)" |
| Agronomy pack | `agronomy.json`: 33 sources, 5 crops, 4 rotations, 25 symptoms, 10 condition pathways, AEZ matrix, fertilizer, water, groundTruth, qa, resilience | Reviewed 2 Nov 2026 |
| BARC FRG 2024 | AEZ-3 land classes (p. 21 / PDF p. 36), fertilizer composition (Appendix 2, 10) | — |
| Published trials | Hossain et al. 2022 (Mithapukur, Pirganj); Islam et al. 2014 (Paikan, Gangachara) | — |
| geoBoundaries gbOpen BGD ADM3 | District + upazila GeoJSON, release 9469f09 | CC BY 3.0 IGO |
| Not included | SMAP volumetric moisture, BMD gauge archive, measured soil tests, pest diagnoses, farmer yields, aquifer recharge, groundwater levels | [CORE/M, CORE/AG] |

## B. NASA and partner missions catalogue [BP §2.2]

| Mission / product | Native or typical detail | Use / restriction | Priority |
|---|---|---|---|
| NASA POWER / MERRA-2 | Meteorology ~0.5° × 0.625° (canonical value [D-C8]; read the effective grid from response metadata) | Historic weather, ET inputs, wetness index; **reanalysis ≠ forecast** [S1] | P0 (have) |
| GPM IMERG V07 | ~0.1° (~10 km); 30-min; Early (~4 h) / Late (~14 h) / Final (months later) | Recent/seasonal rain; keep run identifiers [S3] | P0 |
| SMAP L4 | 9 km, 3-hourly; 0–5 cm + 0–100 cm modeled | Regional volumetric moisture + percentiles; not a 20-decimal test. Now accessible via POWER high-resolution pathway (SFMC, RZMC, percentiles) [S1, S2] | P0 — **first new data card** [D-C11] |
| Landsat 8/9 C2 L2 | 30 m optical; thermal ~100 m resampled to 30 m | NDVI/NDMI, surface temperature; clouds/gaps [S4, S21] | P0 |
| Sentinel-2 L2A | 10 m (B4, B8, B11; NDVI, NDMI, NDRE), 5-day revisit | Native 10/20 m for small plots [S23; DS §2] | P0 |
| ECOSTRESS | ~70 m thermal/ET, intermittent ISS | LST, actual ET, heat clue; small-plot mixing [S7] | P1 |
| MODIS | NDVI ~250 m / 16 days | Long-term baselines, not micro-plots [S8] | P2 |
| GRACE / GRACE-FO | Basin-scale, monthly | Total water-storage change; **not well depth** [S9] | P2 |
| GEDI | ~25 m laser footprints, sampled tracks | Tree canopy / agroforestry; not soil [S10] | P2 |
| SRTM / NASADEM | ~30 m, static | Relative topography; low-relief flood prediction uncertain [S11] | P0 (flood DEM) |
| NISAR | 3–10 m SAR imagery; planned ~200 m L3 soil moisture | Launched 30 Jul 2025, science ops Jan 2026, provisional L-band via ASF since Jul 2026; validate coverage/maturity; imagery ≠ moisture retrieval [S5, S6] | P1 |
| HLS | 30 m harmonized Landsat/Sentinel-2 | Dense time series; native S2 10 m may suit small plots better [S12] | — |
| VIIRS via FIRMS | 375 m active-fire hotspots, NRT | Regional fire context; never plot safety assurance [S13] | P1 |
| SWOT | 21-day repeat, rivers/lakes | Research-scale hydrology, not flood warnings [S14] | P2 |
| GLDAS / other land models | Coarse grids | Benchmarking/research only [S15] | — |
| NEX-GDDP-CMIP6 via POWER | ~0.25° projections | Long-horizon scenarios, not next-week forecast [S1] | P2 |
| Sentinel-1 SAR (ESA) | 10 m RTC (VV/VH) | Flood history, rice transplanting through cloud; needs speckle filter [BP §3.5; 3D-R] | P0 (flood) / P1 |

CAUTION: stated sizes are sampling grids, not guaranteed field-scale accuracy; check access, latency and coverage at integration time. [BP §2.2]

## C. Bangladesh and international non-satellite sources [DS §2, DS-H, BP §4.2, §7.1]

| Source | Portal (updated links per DS-H) | Variables | Resolution | Use in Ropon Radar |
|---|---|---|---|---|
| BARC Khamari-DAP / Crop Zoning | http://cropzoning.barcapps.gov.bd/ · https://portal.cropzoning.gov.bd/ | Upazila soil fertility N, P, K, S, Zn, B, pH, OM; crop suitability; crop economics | AEZ 2 & 3 / upazila | Regional baseline for fertilizer and suitability; public site ≠ bulk-data/API permission [BP §7.1] |
| BARC FRG 2024 | https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf | Nutrient requirement formulas, AEZ guidance vs test-based recommendations | AEZ | Fertilizer reference only |
| SRDI Upazila Nirdeshika | https://srdi.gov.bd/pages/static-pages/6922defa933eb65569e1edfe | Soil series, topography type, texture, land suitability | Upazila / mouza | Drainage capacity, texture parameters; ask about reuse permission [BP §4.2] |
| ISRIC SoilGrids REST | https://soilgrids.org/ · https://rest.isric.org/ | phh2o, soc, nitrogen (total), sand/silt/clay, cec, bulk density + uncertainty, 6 depths | 250 m | Background soil values before local override; modeled N ≠ available N [BP §4.1] |
| NASA POWER API | https://power.larc.nasa.gov/data-access-viewer/ · /docs/services/api/ | Ts, RH, u2, Rs, GWETROOT … | ~0.5° | FAO-56 ET₀ |
| BWDB & FFWC | https://ffwc.gov.bd/ · https://ffwc.gov.bd/app/flood-magnitude · API https://api.ffwc.gov.bd/?format=json | River levels, flood alerts, groundwater wells | Station / regional | Safety guardrail triggers (Layer E); registration-linked developer docs [BP §7.1] |
| BMD / forecast provider | (not specified) | Short-range forecast | — | Needed for irrigation advisory; "actual forecast provider" P0 [BP §7] |
| DAE / BAMIS, BRRI, BARI, AIS, IRRI, ICAR | various (see `agronomy.json`) | Crop calendars, varieties, symptoms | — | Clinic pathways, recovery windows [CORE/AG, CORE/DR] |

## D. Prototype-only datasets (claimed in 3D-R / 3D-F, not in core pack)

| Claim | Source text |
|---|---|
| NASA POWER 25-year daily (2001–26) at 25.821° N, 89.235° E | 3D-R table, 3D-F sources |
| Sentinel-2 L2A "307 dates (2021–26)"; ~92% cloud in July | 3D-R |
| Sentinel-1 RTC "538 scenes (3 orbits)", 4-day revisit, 3×3 speckle filter | 3D-R |
| NASADEM 30 m parcel mesh; parcel at 21st vs 73rd flood-exposure percentile | 3D-R |
| Sarker et al. (2026) Burirhat RARS trial, 2021–23: soil pH 5.61, OM 1.83%, CP4/CP5/CP11/CP12 economics — https://doi.org/10.1155/ioa/9089088 | 3D-R, 3D-F |

**Decision [D-C2, D-C7]:** none of these ship by default. Sarker et al. 2026 may be added to `agronomy.json` as a reference-trial record once its DOI is verified. Prototype dataset counts are not quoted in the app or the pitch unless re-derived from a real query.

## Data acquisition notes [BP §7.1]

- Check POWER's current parameter dictionary and response metadata before coding; meteorological variables in the same response may have coarser effective resolution.
- SMAP L4 v8 HDF5 from NSIDC; NISAR from ASF; Landsat L2 from USGS; other sources need NASA Earthdata access.
- Avoid speculative endpoints; check usage terms.
- Retain frozen raw snapshots and scene IDs when reproducing results. [CORE README]

## Reproduction pipeline (current) [CORE README]

```sh
python3 scripts/fetch-earth-data.py
python3 scripts/extract-optical.py
python3 scripts/fetch-context.py
python3 scripts/fetch-optical-history.py
python3 scripts/fetch-history.py
python3 scripts/prepare-offline.py
```
Requires Pillow, NumPy and rasterio. The app itself needs no API key or extraction step.
