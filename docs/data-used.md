# 05 · Data used — SeedWise

Every dataset below is used in the live app or in our model training. The list is taken from the repo's `public/data/*.json` files, `scripts/fetch-*.py`, `docs/credits.md` and the in-app source registry (`src/legacy/ui.js`).

---

## NASA data

| Dataset name | Link | How you used it |
|---|---|---|
| NASA POWER (MERRA-2 based, daily + monthly API) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Weather per field, 1981–2025; trained fine-tuned model 1 (Chronos-Bolt forecaster). |
| NASA POWER soil wetness (GWETTOP / GWETROOT) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Soil wetness history and forecast; powers the dry-soil alert. |
| FAO-56 reference evapotranspiration from NASA POWER | https://power.larc.nasa.gov/ | Crop water demand for water scores and plans. |
| NASA GPM IMERG (0.1° precipitation) | https://gpm.nasa.gov/data/imerg | Monthly rainfall 2021–2025 per field in Past seasons. |
| NASA SMAP L4 Soil Moisture (SPL4SMGP, 9 km) | https://nsidc.org/data/spl4smgp/versions/8 | Daily surface and root-zone soil moisture cards. |
| NASA HLS v2.0 (Harmonized Landsat Sentinel-2, 30 m) | https://www.earthdata.nasa.gov/data/projects/hls | Monsoon scenes our flood model reads daily for each field. |
| NASA–IBM Prithvi-EO-2.0-300M-TL foundation model | https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M-TL | Fine-tuned model 2: flood mapping, water IoU 82.0 (published 82.6). |
| NASA JPL GRACE / GRACE-FO Mascons (RL06.3 v04) | https://podaac.jpl.nasa.gov/dataset/TELLUS_GRAC-GRFO_MASCON_CRI_GRID_RL06.3_V4 | Groundwater trend for the water-resilience check. |
| NASADEM (30 m elevation, NASA JPL) | https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001 | Low-ground flood layer and 3D field terrain. |
| Landsat 8/9 Collection 2 Level 2 (NASA/USGS) | https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance | Field imagery and cloud masking. |
| NASA Earthdata / CMR search | https://cmr.earthdata.nasa.gov/search/ | Finding GRACE-FO and HLS granules. |

---

## Other space agency data

| Dataset name | Link | How you used it |
|---|---|---|
| ESA Copernicus Sentinel-2 Level-2A (10–20 m) | https://sentiwiki.copernicus.eu/web/s2-mission | Offline map tiles plus greenness (NDVI) and moisture (NDMI) grids. |
| ESA Copernicus Sentinel-1 RTC (radar, 10 m) | https://planetarycomputer.microsoft.com/dataset/sentinel-1-rtc | Monthly radar water check over each field. |
| Sen1Floods11 (Sentinel-1/2 hand-labelled flood chips, Bonafilia et al. 2020) | https://github.com/cloudtostreet/Sen1Floods11 | Training and test data for fine-tuning Prithvi. |

---

## Other datasets

### Earth, soil and map data

| Dataset name | Link | How you used it |
|---|---|---|
| Microsoft Planetary Computer (STAC + data API) | https://planetarycomputer.microsoft.com/ | Access to HLS, Landsat, Sentinel and NASADEM data. |
| ISRIC SoilGrids 2.0 (250 m) | https://soilgrids.org | Soil texture, pH, carbon and nitrogen per field. |
| SRDI Upazila Nirdeshika (Land & Soil Resource Utilization Guide) | https://srdi.portal.gov.bd/ | Local P, K, S, Zn and B levels for each upazila. |
| Global water table depth (Fan et al. 2017, PNAS) | https://doi.org/10.1073/pnas.1712381114 | Water-table depth in the 3D soil view. |
| Esri World Imagery Wayback (Maxar, 28 Nov 2022 release) | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 | High-detail photo map for drawing fields (credited). |
| OpenStreetMap (via Overpass API) | https://www.openstreetmap.org/copyright | Roads, rivers and place names, offline. |
| geoBoundaries gbOpen BGD ADM2/ADM3 | https://www.geoboundaries.org/ | District and upazila boundaries. |

### Agriculture and crop research

| Dataset name | Link | How you used it |
|---|---|---|
| BARC Fertilizer Recommendation Guide 2024 | https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf | Fertiliser rates in plans. |
| Hossain et al. 2022, Cropping System Intensification (Int. J. Agronomy) | https://doi.org/10.1155/2022/6288494 | Rangpur rotation yields and water productivity. |
| Potato–mungbean–T. Aman patterns trial (IJARIT) | https://www.banglajol.info/index.php/IJARIT/article/view/22645 | Rotation evidence for the advisor. |
| FAO Irrigation and Drainage Paper 56 | https://www.fao.org/4/X0490E/x0490e0b.htm | Crop coefficients for water use. |
| BRRI Rice Knowledge Bank / rice profile (varieties, diseases) | https://riceprofile.brri.gov.bd/ | Rice varieties, spacing and disease guides. |
| BRRI Leaf Colour Chart | https://www.knowledgebank-brri.org/lcc.php | Nitrogen top-dressing tips. |
| BARI technology (Mustard–Boro–Jute–T. Aman) and BARI annual report | https://baritechnology.org/m/crops/tech_detail/353 | Mustard and rotation production steps. |
| BWMRI (wheat and maize varieties) | https://bwmri.gov.bd/ | Heat- and drought-tolerant wheat and maize. |
| DAE BAMIS (crops, pests, diseases, bulletins, drought risk map) | https://www.bamis.gov.bd/ | Sowing windows, pest alerts and drought advice. |
| AIS / Krishoker Janala (Bangladesh govt. extension) | https://ais.gov.bd/ | Potato and mungbean guidance. |
| Khamari crop zoning (Bangladesh) | https://portal.cropzoning.gov.bd/aboutKhamari | Crop suitability reference. |
| IRRI Rice Knowledge Bank | https://www.knowledgebank.irri.org/ | Rice disease diagnosis in the clinic. |
| Crop disease references (Cornell, CIMMYT, ICARDA, FAO, TNAU, KAU, UMN, NSW DPIRD, SAU, CSISA) | https://vegetables.cornell.edu/pest-management/disease-factsheets/ | Symptoms and pest management for 13 diseases. |
| PlantVillage dataset (Mohanty et al. 2016) | https://github.com/spMohanty/PlantVillage-Dataset | Leaf-disease reference images. |
| Wikimedia Commons leaf photos | https://commons.wikimedia.org/ | Example leaf photos in the clinic (credited). |

### Disaster recovery and emergency

| Dataset name | Link | How you used it |
|---|---|---|
| FAO fire management guidelines and assisted natural regeneration | https://www.fao.org/4/j9255e/J9255E07.htm | Fire recovery steps. |
| IFRC flood safety | https://ifrcstaysafe.org/disasters-tips/floods | Flood safety steps. |
| USDA NRCS after-fire seeding; UC ANR post-fire soil; CDPH wildfire ash | https://www.nrcs.usda.gov/resources/guides-and-instructions/after-the-fire-seeding | Post-fire soil and replanting steps. |
| Swamp forest / agroforestry studies (BPPA, Taylor & Francis, Springer) | https://link.springer.com/article/10.1007/s10457-026-01457-z | Char-land replanting options. |
| FFWC flood forecasts and BMD (linked, not ingested) | https://ffwc.gov.bd/ | Official flood-warning link beside our advisory. |
| Emergency numbers: 999, Fire Service 102, Krishi Call Center 16123 | https://fireservice.gov.bd/ | One-tap emergency contacts. |

### AI models and APIs

| Dataset name | Link | How you used it |
|---|---|---|
| Amazon Chronos-Bolt (small) | https://huggingface.co/amazon/chronos-bolt-small | Fine-tuned model 1: 1–3 month weather outlook. |
| Meta SAM 3.1 | https://github.com/facebookresearch/sam3 | Finds the leaf in clinic photos. |
| Meta Muse models (Meta AI API) | https://ai.meta.com/ | Planty chat, crop advice and clinic answers. |
