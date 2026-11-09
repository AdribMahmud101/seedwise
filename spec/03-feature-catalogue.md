# 03 · Feature Catalogue

The 18 features come from F18 (translated from Banglish; wording kept close). Each is mapped to the core view that owns it, its data, its guardrail and its build status.

**Status legend** (taken from CORE README/docs and the prototypes; the code was not run):
- **CORE** = implemented in the core app
- **PARTIAL** = core has a reduced or different form
- **PROTO** = only in 3D-F / 3D-R prototypes
- **PLAN** = described in a spec, not built anywhere

| # | Feature | Core view | Status |
|---|---|---|---|
| 1 | Select & save field | `#field` | CORE |
| 2 | 3D terrain view | `#water` (district 3D landscape) | BUILT — field-scale 3D dropped [14 D-Q4 amendment] |
| 3 | Slope & cross-section | — | DROPPED: 30 m DEM cannot resolve plot slope; needs survey or drone |
| 4 | Waterlogging (where water collects) | `#water` | PROTO |
| 5 | Drain design & test | `#water` | PROTO |
| 6 | Rain & flood scenario | `#water` / `#recovery` | PARTIAL |
| 7 | Surface moisture | `#field` / `#water` | PARTIAL |
| 8 | Root-zone water | `#water` | PARTIAL |
| 9 | Groundwater level | `#water` | PARTIAL |
| 10 | Soil profile | `#water` | PARTIAL |
| 11 | Irrigation planner (pump hours & cost) | `#water` | PROTO |
| 12 | Crop stress | `#seasons` / `#research` | PARTIAL |
| 13 | Cultivation layout design | `#planner` | CORE |
| 14 | Crop rotation | `#rotations` | CORE |
| 15 | Flood / damage recovery plan | `#recovery` | CORE |
| 16 | Tree & bund planning | `#planner` / `#recovery` | PARTIAL |
| 17 | Pin disease & soil problems | `#clinic` | PARTIAL |
| 18 | Plan & cost comparison | `#rotations` | PARTIAL |
| S | Soil Fertility & Nutrient Intelligence mode | `#clinic` / `#water` | PARTIAL |

---

### #1 Select & save field — CORE
- **What:** find the village, draw and save your boundary; see the whole field map and how much of it can be cultivated. [F18 #1]
- **Data:** satellite map + farmer's own boundary. [F18 #1]
- **Built:** upazila/coordinate search, draw boundary or enter corners, GeoJSON export, dated imagery. [CORE README]
- **Prototype extra:** gross vs net cultivable area (e.g. 92.8% after bunds/drains) shown in 5 local units. [3D-F]
- **Guardrail:** an administrative boundary is never land-ownership documentation. [BP §6.4]

### #2 3D terrain view — PROTO
- **What:** rotate, tilt and zoom the field to see high and low ground around it. [F18 #2]
- **Data:** NASA or Copernicus elevation; small bunds (aal) inside the field need a ground survey. [F18 #2]
- **Prototype:** NASADEM 30 m mesh, elevation-rainbow and contour overlays (15/25/50 cm interval), relief exaggeration 2.5×, 2D/3D toggle. [3D-F, 3D-R; VIS for the mesh-viewer pattern]
- **Guardrail:** a 30 m DEM cannot see 10–15 cm bunds or culverts → needs a spirit-level or drone check. [3D-R, 3D-F; BP §3.5]

### #3 Slope & cross-section — PROTO
- **What:** draw a line from one end of the field to the other to see high points, dips and hollows. [F18 #3]
- **Data:** accurate terrain model. [F18 #3]
- **Prototype:** A → A′ transect profile, mean slope %, min/max elevation, relief. [3D-R, 3D-F]

### #4 Waterlogging — PROTO
- **What:** after rain, where water will stand and which way it will drain. [F18 #4]
- **Data:** field map, bunds, drains, culverts, soil infiltration capacity. [F18 #4]
- **Prototype:** runoff arrows to the low corner; Sentinel-1 open-water zone; "low SE corner collects rain first" advice card. [3D-F, 3D-R]

### #5 Drain design & test — PROTO
- **What:** draw a new drain and check that water leaves properly, how much crop area the drain costs and roughly what it costs to dig. [F18 #5]
- **Data:** field elevation, drain map and water level of the connected main canal (khal). [F18 #5]
- **Prototype:** proposed trench drain (46 m × 0.45 m → 0.51 shotok area, ৳1,380, "ponding cut −78%"), blocked-outlet simulation, "check the outlet" state. [3D-F, 3D-R] Numbers are illustrative (12 · C7).

### #6 Rain & flood scenario — PARTIAL
- **What:** raise or lower rainfall to see what flooding happens if drains are blocked or the river rises. [F18 #6]
- **Data:** rainfall forecast, BWDB/FFWC river data. [F18 #6]
- **Built:** water view flood scenario — a hypothetical delay feeds rotation eligibility. [CORE/JW]
- **Prototype:** 0–250 mm rain/flood slider; replay of 26 Sep 2020 (433 mm), 4 Oct 2023 Teesta surge, 22 Jan 2024 cold wave (7.8 °C), 30 Apr 2024 heat (39.4 °C). [3D-F]
- **Guardrail:** official FFWC warning outranks model reassurance; never a plot water-depth claim. [BP §3.5, §8.2]
- **Decision [D-C17]:** event replay keeps only the 2023–2024 events that the core 2021–2025 POWER/IMERG archive confirms, cited to the archive. The 26 Sep 2020 event is dropped unless an official BMD/FFWC source is added. Canal level and culvert behaviour are **Scenario-only** inputs [D-C15].

### #7 Surface moisture — PARTIAL
- **What:** how dry or wet the surrounding area is, from satellite. [F18 #7]
- **Data:** SMAP. Satellite gives a large-area idea, so no made-up wet/dry colouring inside a small field. [F18 #7]
- **Built:** POWER GWETTOP wetness index (0–1) per prepared site; no SMAP in this release. [CORE/M "Weather and wetness"]
- **Plan [D-C11]:** SMAP L4 SFMC/RZMC + percentiles via POWER is the **first new data card** (M2), frozen into the data pack like the existing POWER data. Until it ships, all wording says "POWER wetness index", not SMAP.
- **Display [D-C6]:** "Wetness index 0.50 (0–1), regional cell", never a %. SMAP is shown separately in m³/m³.
- **Guardrail:** GWETTOP index ≠ SMAP volumetric m³/m³. [BP §1.2, §8.2]

### #8 Root-zone water — PARTIAL
- **What:** cut a 3D soil slice and check how much water is near the roots. [F18 #8]
- **Data:** SMAP root-zone estimate + crop root depth + rainfall accounting. [F18 #8]
- **Built:** POWER GWETROOT index. [CORE/M]
- **Prototype:** cutaway slice with root depth (e.g. 35 cm rice). [3D-F, 3D-R]
- **Plan:** FAO-56 root-zone water balance; rice AWD branch (M2). [BP §3.1, §9.1]

### #9 Groundwater level — PARTIAL
- **What:** how deep the water is in the tube-well or deep well. [F18 #9]
- **Data:** local tube-well or BWDB map. If there is no map the app must say plainly: **"Groundwater level unknown"**. [F18 #9]
- **Built:** aquifer accounting scenario with blank recharge/area; water-table depth needs measurement. [CORE/M]
- **Prototype:** shows "Unknown — requires local tubewell dip", with a local-reading entry modal. [3D-R, 3D-F]
- **Guardrail:** GRACE measures total water-storage anomaly, not tube-well depth. [BP §3.4]

### #10 Soil profile — PARTIAL
- **What:** in the soil slice, show soil type (texture), pH, organic carbon and water-holding capacity. [F18 #10]
- **Data:** SoilGrids and BARC/SRDI local soil samples. [F18 #10]
- **Built:** BARC AEZ-3 land classes (highland 35%, medium highland 51%, with pH and OM classes). [CORE/AG]
- **Prototype:** horizons 0–15 / 15–45 (or 60) / >45 (or 120) cm; sand 58 / silt 22 / clay 20; pH 5.61; OM 1.83%; 145 mm/m holding capacity (RARS baseline). [3D-F, 3D-R]
- **Plan:** SoilGrids + BARC Khamari/SRDI + soil-test import (P0, M3). [BP §7, §9.1]

### #11 Irrigation planner — PROTO
- **What:** whether water is needed today, how many hours to run the pump, and how many taka it costs. [F18 #11]
- **Data:** crop age, upcoming rain forecast, pump cost/tariff. [F18 #11]
- **Prototype:** pump types diesel STW ৳320/h (12 L/s), electric ৳160/h (14 L/s), solar/BMDA ৳110/h (10 L/s); "next irrigation 5.2 h, ৳1,664". [3D-F, 3D-R]
- **Guardrail:** conditional 3–5 day advisory only; no precise litre amount or definite schedule without field calibration. [BP §3.3]
- **Decision [D-C1, D-C7, D-C15, D-Q1]:** pump type, tariff (৳/h), flow and shared-pump schedule are **farmer-entered inputs**; the prototype values (৳320/160/110 per h) are editable examples only. An AWD reading below −15 cm gives "time to re-irrigate" with no mm amount. There is no live forecast, so the wording is "conditional on the next days' rain — check BMD".

### #12 Crop stress — PARTIAL
- **What:** browse past seasons and dated satellite images to see where the crop is yellow or weak. [F18 #12]
- **Data:** Sentinel-2, Landsat. A satellite cannot confirm disease; the farmer must go and look. [F18 #12]
- **Built:** dated Landsat NDVI windows, cloud loss, 25% coverage threshold (`#seasons`, `#research`). [CORE/M]
- **Prototype:** "Canopy yellowing / weak zone detected" (NDVI 0.38 vs median 0.72) with walk-to-pin instruction. [3D-F]
- **Plan:** native Sentinel-2 NDVI/NDMI + Landsat surface temperature (M4). [BP §9.1]

### #13 Cultivation layout design — CORE
- **What:** place crop rows, beds, walking paths and drains and see how many plants fit. [F18 #13]
- **Data:** exact field map and plant-to-plant spacing. [F18 #13]
- **Built:** usable area, spacing, hills/positions/seed weight, rotate, overhead view, printable report. [CORE README]
- **Prototype:** line rows (20×15 cm) / raised beds / bund drains + buffer; "272,000 hills, 22 kg seed". [3D-F, 3D-R]

### #14 Crop rotation — CORE
- **What:** compare which crop to plant next for more profit, less water or better soil, **in 3 plans**. [F18 #14]
- **Data:** BRRI/BARI/DAE crop calendar and local seed availability. [F18 #14]
- **Built:** **4** rotations with priorities, constraints and score breakdown. [CORE]
- **Rule [D-C3]:** always show **current rotation + 3 alternatives** (4 cards). This satisfies F18's "3 plans".
- **Prototype:** 4 RARS patterns CP12 (Boro–Fallow–Aman, current), CP4, CP5, CP11 with priority weights water 45 / OM 25 / income 20 / stability 10. [3D-R, 3D-F] The Burirhat patterns are not used as farmer rotations. Sarker 2026 may be added only as a reference trial record once its DOI is verified [D-C2].

### #15 Flood / damage recovery plan — CORE
- **What:** after flood, drought or fire, mark the damage and get a step-by-step plan for a new crop. [F18 #15]
- **Data:** Sentinel-1 flood maps and agronomy advice. [F18 #15]
- **Built:** drought/flood/fire × 4 stages, sowing windows, worked examples (no Sentinel-1 maps yet). [CORE/DR]
- **Prototype:** Warning → During → Recovery stages; contacts 16123 Krishi Call Centre, FFWC Teesta bulletin, 999. [3D-F]
- **Plan:** FFWC alerts, Sentinel-1 flood history, VIIRS fire context (M5). [BP §9.1]

### #16 Tree & bund planning — PARTIAL
- **What:** check in advance whether trees or grass on the bunds will shade the crop or block drains. [F18 #16]
- **Data:** tree type, shade tolerance, boundary map. [F18 #16]
- **Built:** tree-border reservation in planner; conditional wetland/fruit tree guidance in recovery. [CORE/JW, CORE/DR]
- **Prototype:** scenarios (none, Sajna/Moringa NW, Supari + Napier perimeter, dense boundary); sun-time shadow check ("8.4% afternoon shade"). [3D-F]

### #17 Pin disease & soil problems — PARTIAL
- **What:** at a specific spot in the field, take a photo, note the pest or disease and pin it so the agriculture officer can see it. [F18 #17]
- **Data:** GPS location, farmer photos and lab test report. [F18 #17]
- **Built:** clinic note + photo saved locally; research JSON export can include photos. [CORE README]
- **Prototype:** click-to-pin on 3D field with 5 issue types (N yellowing, brown planthopper, deadheart, late blight, waterlogging). [3D-F]

### #18 Plan & cost comparison — PARTIAL
- **What:** side by side, old vs new practice: pump hours, labour, taka profit or loss. [F18 #18]
- **Data:** the farmer's own cost entries and shared-pump schedule. [F18 #18]
- **Built:** rotation score with cost rating (design judgment), budget constraint. [CORE/M]
- **Prototype:** table of dry-season pumping, production cost, net return, final OM, SYI per pattern ("৳128,783, +৳97,781 vs Boro, −68% water"). [3D-F, 3D-R]
- **Guardrail:** do not carry historical trial prices into current profitability forecasts. [CORE/AG]
- **Decision [D-C7, D-C15]:** labour, input cost, pump hours and tariff are farmer-entered. Prototype totals (৳128,783, −68% water, SYI 71%) are not ported; each figure is recomputed with a documented formula, cited, or labelled Scenario.

### S · Soil Fertility & Nutrient Intelligence mode — PARTIAL
- **What:** "Soil Health" mode on the 3D field showing pH, N, P, K, S, Zn, B, organic matter, texture, salinity. [F18 soil note]
- **Critical distinction:** satellites can help estimate some soil properties but cannot reliably measure available N/P/K or micronutrients for a small field; separate regional estimates from lab values. [F18 soil note; BP §4.1]
- **Built:** fertilizer calculator for lab or officer **elemental** targets; AEZ-3 classes. [CORE/AG]
- **Prototype:** NPK lens pH 5.61 · N Low · P Med · K Low · Zn · B · OM 1.83% (RARS Table 1 / AEZ-3). [3D-R, 3D-F]
- **Plan:** soil lab ingestion, provenance-labelled soil UI (M3). [BP §4.4, §9.1]

---

## Farmer-interface features (cross-cutting) [F18 "Krishi App Ti Kemon Hobe"]

| Feature | Requirement | Status |
|---|---|---|
| 5 simple views | My field, Water, Soil, Crops, Recovery; only one thing on screen at a time | PLAN: 8 routes grouped into 5 farmer areas [D-C4] |
| Action cards | Direct advice instead of complex science: "Aajke aal check korun", "Pani jome ache, nala khulun" | PROTO ("Today's Advice" in 3D-F); on-screen only, no IVR/SMS [D-Q5] |
| Data truth labels | Every value labelled Measured / Estimated / Scenario / Unknown | PLAN: 6 schema tags → 4 farmer labels [D-C5] |
| Local units | Bigha, katha, shotok (decimal), acre (+ ha) | PROTO (3D-F, 3D-R) |
| Phone-friendly | Big buttons, offline/cached, share an image when no printer | CORE offline + print; image share PLAN |
| Demo focus | Satellite overview for all of Rangpur, but demo one real field with accurate bund, drain, soil and pump maps | PLAN |
