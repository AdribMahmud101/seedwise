# 05 · Data used — SeedWise

Every dataset below is used in the live app or in our model training. The list is taken from the repo's `public/data/*.json` files, `scripts/fetch-*.py`, `docs/credits.md` and the in-app source registry (`src/legacy/ui.js`).

---

## NASA data

| Dataset name | Link | How you used it |
|---|---|---|
| NASA POWER (MERRA-2 based, daily + monthly API) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Temperature, humidity, solar radiation, wind and rain for each field, 1981–2025: My field weather cards, Past seasons charts, and the training and backtest data for our Chronos-Bolt forecaster. |
| NASA POWER soil wetness (GWETTOP / GWETROOT) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Surface and root-zone soil wetness history; the "soil drier than normal" signal in Today's analytics and a forecast target (about 60% lower error than the seasonal average). |
| FAO-56 reference evapotranspiration from NASA POWER | https://power.larc.nasa.gov/ | ETo × crop coefficient = crop water demand, used in the water-use card, rotation water scores and plan numbers. |
| NASA GPM IMERG (0.1° precipitation) | https://gpm.nasa.gov/data/imerg | Daily and monthly rainfall 2021–2025 per field (via the POWER API); Past seasons year-by-year rainfall and a cross-check against POWER rain. |
| NASA SMAP L4 Soil Moisture (SPL4SMGP, 9 km) | https://nsidc.org/data/spl4smgp/versions/8 | Daily surface (0–5 cm) and root-zone (0–100 cm) moisture 2021–2025 with percentiles, read from POWER's public SMAP store; field soil-moisture cards and the plan pipeline "water" step. |
| NASA HLS v2.0 (Harmonized Landsat Sentinel-2, 30 m) | https://www.earthdata.nasa.gov/data/projects/hls | 2024–2025 monsoon scenes over each field fed into our fine-tuned Prithvi flood model; cloudy scenes skipped with a reason (23 of 201 clear). Drives the flood signal in Today's analytics and the water check. |
| NASA–IBM Prithvi-EO-2.0-300M-TL foundation model | https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M-TL | Fine-tuned by us on Sen1Floods11 for land/water segmentation (water IoU 82.0, mIoU 89.7), served on Modal and run daily on HLS scenes for each field. |
| NASA JPL GRACE / GRACE-FO Mascons (RL06.3 v04) | https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4 | Groundwater storage anomaly for the Rangpur region; the plan pipeline's water-resilience step and 3D studio groundwater context. |
| NASADEM (30 m elevation, NASA JPL) | https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001 | Low-ground map layer showing where water collects, plus the 3D terrain of the field and landscape (accessed via Microsoft Planetary Computer). |
| Landsat 8/9 Collection 2 Level 2 (NASA/USGS) | https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance | Surface reflectance and QA bands (cloud masking) for field imagery and greenness; scene IDs and dates kept with each record. |
| NASA Earthdata / CMR search | https://cmr.earthdata.nasa.gov/search/ | Finding and checking GRACE-FO and HLS granules before download. |

---

## Other space agency data

| Dataset name | Link | How you used it |
|---|---|---|
| ESA Copernicus Sentinel-2 Level-2A (10–20 m) | https://sentiwiki.copernicus.eu/web/s2-mission | Offline true-colour map tiles and the NDVI (greenness) and NDMI (moisture) pixel grids the farmer taps on My field and in the Rotation studio (2024-03-09 and 2024-11-09 scenes). |
| ESA Copernicus Sentinel-1 RTC (radar, 10 m) | https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc | Monthly 2024 radar water masks over each traced field (VV < −18 dB), shown as a radar water check in the Rotation studio. |
| Sen1Floods11 (Sentinel-1/2 hand-labelled flood chips, Bonafilia et al. 2020) | https://github.com/cloudtostreet/Sen1Floods11 | Training, validation and test set for fine-tuning Prithvi for flood/water mapping. |

---

## Other datasets

### Earth, soil and map data

| Dataset name | Link | How you used it |
|---|---|---|
| Microsoft Planetary Computer (STAC + data API) | https://planetarycomputer.microsoft.com/ | Access route for HLS, Landsat, Sentinel-1/2 and NASADEM; scene IDs and requests are preserved. |
| ISRIC SoilGrids 2.0 (250 m) | https://soilgrids.org | Clay, sand, silt, pH, organic carbon, nitrogen, CEC and bulk density at 0–15 cm for each field; soil profile and nutrient cards and rotation soil scores. |
| SRDI Upazila Nirdeshika (Land & Soil Resource Utilization Guide) | https://srdi.portal.gov.bd/ | Local P, K, S, Zn and B levels for Mithapukur, Pirganj and Gangachara; nutrient cards and fertiliser guidance. |
| Global water table depth (Fan et al. 2017, PNAS) | https://doi.org/10.1073/pnas.1712381114 | Monthly modelled water-table depth for each field; 3D studio water-table layer and the plan pipeline water step. |
| Esri World Imagery Wayback (Maxar, 28 Nov 2022 release) | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 | High-detail online photo base map for drawing the field and in the 3D landscape (never cached, credited on screen). |
| OpenStreetMap (via Overpass API) | https://www.openstreetmap.org/copyright | Offline roads, waterways, rivers and 127 place names for Rangpur; map context, 3D landscape rivers and place search (ODbL). |
| geoBoundaries gbOpen BGD ADM2/ADM3 | https://www.geoboundaries.org/ | Rangpur district and upazila boundaries. |

### Agriculture and crop research

| Dataset name | Link | How you used it |
|---|---|---|
| BARC Fertilizer Recommendation Guide 2024 | https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf | Fertiliser rates, AEZ-3 parameters and soil-class interpretation for plans. |
| Hossain et al. 2022, Cropping System Intensification (Int. J. Agronomy) | https://doi.org/10.1155/2022/6288494 | Rangpur rotation yields, durations and water productivity for rotation scores. |
| Potato–mungbean–T. Aman patterns trial (IJARIT) | https://www.banglajol.info/index.php/IJARIT/article/view/22645 | Rotation evidence for the Rotation studio and advisor. |
| FAO Irrigation and Drainage Paper 56 | https://www.fao.org/4/X0490E/x0490e0b.htm | Crop coefficients and ETo method for crop water use. |
| BRRI Rice Knowledge Bank / rice profile (varieties, diseases) | https://riceprofile.brri.gov.bd/ | Rice varieties, durations, spacing and disease guides; tolerant-variety list (e.g. BRRI dhan51, dhan71). |
| BRRI Leaf Colour Chart | https://www.knowledgebank-brri.org/lcc.php | Nitrogen top-dressing guidance in plans. |
| BARI technology (Mustard–Boro–Jute–T. Aman) and BARI annual report | https://baritechnology.org/m/crops/tech_detail/353 | Mustard and pattern production steps; BARI tolerant varieties. |
| BWMRI (wheat and maize varieties) | https://bwmri.gov.bd/ | Heat/drought-tolerant wheat and maize varieties. |
| DAE BAMIS (crops, pests, diseases, bulletins, drought risk map) | https://www.bamis.gov.bd/ | Sowing windows, pest/disease info, past DAE Rangpur advisories and drought adaptation steps; linked as official current advice. |
| AIS / Krishoker Janala (Bangladesh govt. extension) | https://ais.gov.bd/ | Potato late blight and mungbean cultivation guidance. |
| Khamari crop zoning (Bangladesh) | https://portal.cropzoning.gov.bd/aboutKhamari | Location-specific crop suitability reference. |
| IRRI Rice Knowledge Bank | https://www.knowledgebank.irri.org/ | Rice disease diagnosis (blast, brown spot) for the clinic. |
| Crop disease references (Cornell, CIMMYT, ICARDA, FAO, TNAU, KAU, UMN, NSW DPIRD, SAU, CSISA) | https://vegetables.cornell.edu/pest-management/disease-factsheets/ | Symptoms, look-alikes and integrated pest management for 13 diseases across 12 crops in the crop clinic. |
| PlantVillage dataset (Mohanty et al. 2016) | https://github.com/spMohanty/PlantVillage-Dataset | Reference for leaf-disease appearance in the clinic disease library. |
| Wikimedia Commons leaf photos | https://commons.wikimedia.org/ | Credited example leaf photos (rice blast, potato late blight, tomato early blight) in the clinic. |

### Disaster recovery and emergency

| Dataset name | Link | How you used it |
|---|---|---|
| FAO fire management guidelines and assisted natural regeneration | https://www.fao.org/4/j9255e/J9255E07.htm | Fire recovery steps. |
| IFRC flood safety | https://ifrcstaysafe.org/disasters-tips/floods | Flood safety steps. |
| USDA NRCS after-fire seeding; UC ANR post-fire soil; CDPH wildfire ash | https://www.nrcs.usda.gov/resources/guides-and-instructions/after-the-fire-seeding | Post-fire soil and replanting steps. |
| Swamp forest / agroforestry studies (BPPA, Taylor & Francis, Springer) | https://link.springer.com/article/10.1007/s10457-026-01457-z | Char-land agroforestry and replanting recovery options. |
| FFWC flood forecasts and BMD (linked, not ingested) | https://ffwc.gov.bd/ | Official flood warning link shown next to our advisory flood signal. |
| Emergency numbers: 999, Fire Service 102, Krishi Call Center 16123 | https://fireservice.gov.bd/ | One-tap emergency contacts with official sources. |

### AI models and APIs

| Dataset name | Link | How you used it |
|---|---|---|
| Amazon Chronos-Bolt (small) | https://huggingface.co/amazon/chronos-bolt-small | Fine-tuned on NASA POWER 1981–2025 for 1–3 month outlooks of rain, temperature, ETo and root-zone wetness. |
| Meta SAM 3.1 | https://github.com/facebookresearch/sam3 | Segments the leaf in clinic photos before diagnosis. |
| Meta Muse models (Meta AI API) | https://ai.meta.com/ | Planty chat, crop advisor, plan summary and clinic diagnosis, grounded only on our data files. |
