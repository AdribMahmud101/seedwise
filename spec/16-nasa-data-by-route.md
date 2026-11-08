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
