# 16 · Which NASA Data Each Screen Uses

Plain-language map of every screen (route) in Ropon Radar and the NASA data behind it. Checked against the app code (`src/legacy/*.js`) and data files (`public/data/*.json`) on 8 Nov 2026.

## The NASA data we use (in easy words)

| Short name | Full name | What it tells us, simply | Detail (one value covers) | Years in the app |
|---|---|---|---|---|
| **POWER weather** | NASA POWER (MERRA-2) | Temperature, humidity, wind, sunshine, air pressure | One big square ≈ 50 km wide | Daily 2024 + monthly 2021–2025 |
| **POWER wetness** | NASA POWER GWETTOP / GWETROOT | How wet the soil is, as a score from 0 (dry) to 1 (soaked): top layer and root layer | Same ≈ 50 km square | Same as above |
| **IMERG rain** | NASA GPM IMERG | How much rain fell, measured from satellites | One square ≈ 10 km wide | Daily 2024 + monthly 2021–2025 |
| **ETo (crop water need)** | FAO-56 ETo, calculated from POWER weather | How much water plants lose to heat and wind each day | Same as POWER | Daily 2024 + monthly 2021–2025 |
| **Landsat images** | NASA/USGS Landsat 8/9 | Real photos from space, plant greenness (NDVI) and where clouds hid the field | One dot = 30 m | 2024 (map photo 28 Jan 2024 + 4 dated windows) |
| **Sentinel-2 image** *(partner: ESA)* | Copernicus Sentinel-2 | A sharper photo of the field area | One dot = 10 m | One photo, 9 Mar 2024 |

None of these is a live reading of today. They are saved past records, so the app works offline.

## Data sources, links, and what each one helps with

URLs are the exact ones recorded in the app's data files (`public/data/earth-data.json`, `agronomy.json`) and `docs/credits.md`.

### NASA and partner satellite data

| Source | Link | Helps with | Used on |
|---|---|---|---|
| NASA POWER (weather + soil wetness) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | Temperature, humidity, wind, sunshine, rain, top/root soil wetness score; inputs for crop water need | My field, Past seasons, Recovery, Research, Report |
| NASA GPM IMERG (rain) | https://gpm.nasa.gov/data/imerg | Satellite rain totals; how much water the sky gives the crop | My field, Past seasons, Rotations, Water, Recovery, Research, Report |
| Landsat 8/9 Collection 2 Level 2 (NASA/USGS, via Microsoft Planetary Computer) | https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2 | Real photo of the field; plant greenness (NDVI) | My field, Past seasons, Research |
| Landsat quality bands (USGS) | https://www.usgs.gov/landsat-missions/landsat-collection-2-quality-assessment-bands | Finding clouds and shadows so cloudy pixels aren't counted | Past seasons, Research |
| Landsat surface reflectance (USGS) | https://www.usgs.gov/landsat-missions/landsat-collection-2-surface-reflectance | Turning raw image numbers into real brightness for greenness | Past seasons, Research |
| Sentinel-2 L2A (ESA Copernicus, via Planetary Computer) | https://planetarycomputer.microsoft.com/api/stac/v1/collections/sentinel-2-l2a/items/S2A_MSIL2A_20240309T043701_R033_T45RYJ_20240309T091652 | A sharper 10 m photo of the field area (9 Mar 2024) | My field |

### Methods and calculation guides

| Source | Link | Helps with | Used on |
|---|---|---|---|
| FAO-56 (crop water need method) | https://www.fao.org/4/X0490E/x0490e08.htm | Calculating ETo, how much water plants lose each day, from POWER weather | My field, Past seasons, Rotations, Water, Report |
| FAO-56 Chapter 6 (crop coefficients) | https://www.fao.org/4/X0490E/x0490e0b.htm | Turning ETo into the need of rice, mustard, potato (ETc = Kc × ETo) | Rotations, Water |

### Bangladesh farming evidence (not NASA, used together with it)

| Source | Link | Helps with | Used on |
|---|---|---|---|
| BARC Fertilizer Recommendation Guide 2024 | https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf | Soil classes for the Rangpur area (AEZ-3); fertilizer product conversion (urea, TSP, MOP) | Water, Clinic |
| BARC Khamari | https://portal.cropzoning.gov.bd/aboutKhamari | Location-based crop and nutrient planning reference | Clinic, evidence register |
| Hossain et al. 2022 (Mithapukur & Pirganj trials) | https://doi.org/10.1155/2022/6288494 | Real local yields and irrigation totals for the rotation options | Rotations, Planner |
| Islam et al. 2014 (Gangachara trial) | https://www.banglajol.info/index.php/IJARIT/article/view/22645 | The short Aman → potato → mungbean option | Rotations, Recovery |
| BARI mustard production technology | https://baritechnology.org/m/crops/tech_detail/353 | Mustard seed rate (7 kg/ha) | Planner |
| BRRI dhan71 variety page | https://riceprofile.brri.gov.bd/varieties/80 | Rice duration for recovery planting windows | Recovery |
| DAE/BAMIS Rangpur bulletin (Oct 2020) | https://www.bamis.gov.bd/res/bulletins/2020/10/08/22190.pdf#page=5 | Mustard sowing window | Recovery |
| BRRI rice disease guide | https://riceprofile.brri.gov.bd/cultivation/disease | Rice symptom checks | Clinic |
| IRRI rice disease diagnosis | https://www.knowledgebank.irri.org/images/docs/diagnostic-of-common-diseases-of-rice.pdf | Rice symptom checks | Clinic |
| BRRI Leaf Colour Chart | https://www.knowledgebank-brri.org/lcc.php | Checking leaf nitrogen by colour | Clinic |

The app holds 33 agronomy sources in total. All of them open from the **Evidence register** in the sidebar. The full list is in [13-source-register.md](13-source-register.md).

### Maps

| Source | Link | Helps with | Used on |
|---|---|---|---|
| geoBoundaries gbOpen (Bangladesh ADM3) | https://www.geoboundaries.org/ | District and upazila borders on the map (CC BY 3.0 IGO) | My field |
| Leaflet 1.9.4 | https://leafletjs.com/ | The interactive map itself | My field |

## Screen by screen

| Screen (route) | What the farmer does here | NASA data used | What the data shows on this screen |
|---|---|---|---|
| **My field** `#field` | Picks the field, draws its edge | Landsat photo, Sentinel-2 photo, POWER wetness (top), IMERG rain, POWER temperature, ETo | Real satellite photo under the field; the month's rain, soil wetness score, temperature and crop water need |
| **Past seasons** `#seasons` | Compares one month across 2021–2025 | IMERG rain + POWER rain, POWER temperature, POWER wetness (top + root), ETo; Landsat greenness and cloud gaps (2024) | How this month compares with the other four years; when clouds hid the crop |
| **Rotation studio** `#rotations` | Compares 4 crop plans | IMERG rain + ETo (2024, monthly) | "Water fit": which plan needs more water than the rain gives |
| **Planting planner** `#planner` | Lays out rows and counts plants | **None** | Uses field size, spacing and published crop trials only |
| **Crop clinic** `#clinic` | Picks symptoms, adds a photo, fertilizer calculator | **None** | Uses Bangladesh crop guides (BRRI, BARI, DAE, BARC) only |
| **Water & resilience** `#water` | Tests a pumping scenario | ETo + IMERG rain (2024, monthly) | How much water the crop needs beyond the rain → pumping estimate |
| **Disaster recovery** `#recovery` | Plans what to plant after drought, flood or fire | IMERG rain (same month, 2021–2025), POWER wetness (root) | The normal range of rain and root-soil wetness for that month, as background only (not a disaster warning) |
| **Research lab** `#research` | Checks data quality, logs ground truth | POWER rain vs IMERG rain (daily 2024), Landsat cloud masks + greenness | Where the two rain sources disagree; which 2024 photos were lost to cloud |
| **Field report** (print) | Prints the plan | IMERG rain, POWER wetness (top), ETo for the chosen month | Same numbers as My field, on paper |
| **Evidence register** (sidebar) | Opens the source list | Lists every NASA and other source | Where every number comes from |

## Coming next (planned, not built yet)

| Data | Screens | Why | Decision |
|---|---|---|---|
| **SMAP soil moisture** (via NASA POWER) | My field, Water | Real soil water amount (m³/m³), not just a 0–1 score | D-C11 (first new data card) |
| **NASADEM / SRTM height** | 3D view in My field and Water | Field slope and where water collects | D-C4 (3D toggle) |

## Remember (rules on every screen)

- A **wetness score of 0.50 is not "50% water"**. Always show it as "index 0–1". (D-C6)
- One NASA square covers **many farms**, so nearby fields can show the same number.
- If clouds hid a photo, say **"No reliable observation"**, never 0.
- This is **past data (2021–2025)**, never "today's" condition.
