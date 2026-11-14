# 05 · Data used — SeedWise

Every dataset below is used in the live app or in our model training. The list is taken from the repo's `public/data/*.json` files, `scripts/fetch-*.py`, `docs/credits.md` and the in-app source registry (`src/legacy/ui.js`).

---

## NASA data

| Dataset name | Link | How you used it |
|---|---|---|
| NASA POWER (MERRA-2 based, daily + monthly API) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Weather per field, 1981–now (last 10 days on Weather page); trained fine-tuned model 1. |
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
| Global water table depth (Fan et al. 2017, PNAS) | https://doi.org/10.1073/pnas.1712381114 | Water-table depth in the 3D soil view. |
| Esri World Imagery Wayback (Maxar, 28 Nov 2022 release) | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 | High-detail photo map for drawing fields (credited). |
| OpenStreetMap (via Overpass API) | https://www.openstreetmap.org/copyright | Roads, rivers and place names, offline. |
| geoBoundaries gbOpen BGD ADM2/ADM3 | https://github.com/wmgeolab/geoBoundaries | District and upazila boundaries. |
| Open-Meteo forecast API (CC BY 4.0) | https://open-meteo.com/ | Live 7-day and hourly forecast on the Weather page. |

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

### Code, tools and assets

| Dataset name | Link | How you used it |
|---|---|---|
| Next.js | https://nextjs.org/ | Web app framework (static offline build). |
| React | https://react.dev/ | User interface. |
| three.js | https://threejs.org/ | 3D field, soil and planting views. |
| Recharts | https://recharts.org/ | Charts for weather, soil and history. |
| Leaflet | https://leafletjs.com/ | Field map and boundary drawing. |
| MapLibre GL JS | https://maplibre.org/ | 3D landscape map. |
| TerraTorch | https://github.com/IBM/terratorch | Fine-tuning Prithvi for flood mapping. |
| PyTorch + Lightning | https://pytorch.org/ | Model training. |
| timm | https://github.com/huggingface/pytorch-image-models | Vision backbone utilities in flood training. |
| FastAPI | https://fastapi.tiangolo.com/ | Model endpoints on Modal. |
| NumPy, pandas, SciPy | https://numpy.org/ | Data preparation and backtests. |
| Shapely, pyproj | https://shapely.readthedocs.io/ | Field geometry and map projections. |
| Pillow, netCDF4, requests | https://python-pillow.org/ | Image tiles, GRACE files and data downloads. |
| Playwright | https://playwright.dev/ | Capturing the in-app how-to screenshots. |
| @meta-sam/parser | https://www.npmjs.com/package/@meta-sam/parser | Reading SAM 3.1 results in the crop clinic. |
| TorchGeo | https://github.com/microsoft/torchgeo | Loading Sen1Floods11 training data. |
| AutoGluon TimeSeries | https://auto.gluon.ai/ | Fine-tuning Chronos-Bolt on NASA POWER. |
| rasterio, xarray, pystac-client | https://rasterio.readthedocs.io/ | Reading satellite rasters and STAC search. |
| Albumentations | https://albumentations.ai/ | Image augmentation in flood training. |
| Modal | https://modal.com/ | GPU (A10G) for training and running both models. |
| Cloudflare Workers + KV | https://workers.cloudflare.com/ | Hosting, API and the daily 06:00 analytics job. |
| HyperFrames + GSAP | https://hyperframes.heygen.com/ | Motion graphics in the demo video. |
| Google Flow (Veo 3) | https://labs.google/flow/ | One short SI-generated clip in the demo video (watermarked). |
| AI coding assistants (Claude Code, OpenAI Codex, Google Antigravity, Mistral Vibe) | https://www.anthropic.com/claude-code | Code writing and debugging, reviewed by the team. |
| IBM Plex fonts (OFL) | https://github.com/IBM/plex | App and video typography. |
| Fraunces font (OFL) | https://github.com/undercasetype/Fraunces | Headings. |
| Noto Sans Bengali (OFL) | https://fonts.google.com/noto/specimen/Noto+Sans+Bengali | Bangla text. |
| SeedWise source code (Apache-2.0) | https://github.com/AdribMahmud101/seedwise | Our own code, open source. |
