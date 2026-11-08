# 02 · Core Views (implemented routes)

The core app is a single page whose views are selected by hash route. The route table is in `src/legacy/app.js` (`const pages`). Each nav item shows an icon, label (EN/BN) and number 01–08; "Research lab" sits under a separate **RESEARCH DESK** group. The sidebar also has an **Evidence register** button. [CORE `app.js`]

| # | Route | English | বাংলা | Module | Group |
|---|---|---|---|---|---|
| 01 | `#field` (default) | My field | আমার জমি | `fields.js` → `home` | Field workspace |
| 02 | `#seasons` | Past seasons | পুরনো মৌসুম | `fields.js` → `seasonView` | Field workspace |
| 03 | `#rotations` | Rotation studio | ফসলচক্র বাছাই | `rotations.js` | Field workspace |
| 04 | `#planner` | Planting planner | বপনের পরিকল্পনা | `planner.js` | Field workspace |
| 05 | `#clinic` | Crop clinic | ফসলের চিকিৎসাঘর | `clinic.js` | Field workspace |
| 06 | `#water` | Water & resilience | পানি ও সহনশীলতা | `water.js` | Field workspace |
| 07 | `#recovery` | Disaster recovery | দুর্যোগের পর করণীয় | `recovery.js` + `recovery-engine.js` + `recovery-data.js` | Field workspace |
| 08 | `#research` | Research lab | গবেষণাগার | `research.js` | Research desk |
| — | modal | Evidence register | তথ্যসূত্রের খাতা | `app.js` → `evidence()` | Sidebar |

Shared: `ui.js` (state, data loading, `t(en, bn)` i18n, modal), `engine.js` (planning math), `report.js` (printable field report), `boundary.js` (boundary drawing/corner entry). Data is loaded from `public/data/*.json`; local records persist in the browser. [CORE]

---

## 01 · `#field` — My field

**Purpose:** choose and describe the plot. [CORE README step 1]

- Search an upazila or coordinates. [README]
- Compare dated Sentinel-2 and Landsat images; interactive Rangpur field map (Leaflet), natural-color imagery. [README; `fields.js` strings]
- Draw a boundary or enter corners; coordinate editor measures a plot outside prepared coverage and exports GeoJSON. [README]
- Shows boundary area, planning crop, expected harvest, next decision, "Review field constraints". [`fields.js`]
- Climate tiles: surface wetness (POWER index 0–1), IMERG monthly total, mean temperature, FAO-56 ETo monthly total. [`fields.js`]
- Entry point to Disaster recovery. [CORE/DR]
- **Rules:** initial outlines are illustrative; redrawing changes planting area; area = local equirectangular projection + shoelace formula. [CORE/M "Spatial support"]

## 02 · `#seasons` — Past seasons

**Purpose:** show history honestly. [README step 2]

- Compare a month in 2021–2025 with the same month in the other four years. [README]
- Inspect dated vegetation samples and cloudy gaps during 2024; missing months remain visible. [README; CORE/JW 0:15]
- **Rules:** five years is a short comparison, not a climate normal; farmer view withholds greenness below 25% valid coverage. [CORE/M "History", "Optical quality"]

## 03 · `#rotations` — Rotation studio

**Purpose:** compare whole rotations against the family's priorities. [README step 3]

- Set water, soil, cost and risk priorities. [README]
- Compare four whole rotations: Aman → fallow → Boro; Aman → mustard → Boro; Aman → potato → Boro; Short Aman → potato → mungbean. [`agronomy.json` rotations]
- Inspect score breakdown; set irrigation and budget constraints; options needing review are flagged (e.g. low budget → potato stage needs review); save a plan. [README; CORE/JW 0:30]
- Each card shows evidence and a practical check. [CORE/JW]
- **Rules:** feasibility gates (irrigation, budget, Aman harvest, disruption delay) before score; score = normalized weighted sum; no probability or calibrated-yield meaning. [CORE/M "Rotation fit"] → see 06.

## 04 · `#planner` — Planting planner

**Purpose:** turn a saved rotation into a field layout. [README step 4]

- Adjust usable area (reserve paths or a tree border) and spacing. [README; CORE/JW 0:52]
- Count updates in rice hills, planting positions, or seed weight (broadcast mustard). [CORE/JW]
- Rotate the field, switch to overhead layout, open a printable field report. [README]
- Harvest illustration keeps its trial reference. [CORE/JW]
- **Rules:** positions formula, 7 kg/ha mustard reference, illustration only. [CORE/M "Planting"] → see 06.

## 05 · `#clinic` — Crop clinic

**Purpose:** symptom triage and notes for an officer. [README step 5]

- Select crop and visible signs (25 symptoms, 10 condition pathways), attach a photo, save a note. [README; `agronomy.json`]
- Suggests what to inspect; non-chemical next steps. [CORE/JW 1:08; CORE/AG]
- Fertilizer calculator accepts **net elemental** nutrient targets from a lab or officer and converts them to product quantities. [README; CORE/AG]
- **Rules:** no validated disease classifier, no "AI diagnosed", no confidence %, no treatment from image. [CORE/AG]

## 06 · `#water` — Water & resilience

**Purpose:** water balance, soil context, aquifer scenario. [README step 6]

- Water balance; BARC AEZ-3 soil reference classes; published trial sites and "this field's tests". [README; `water.js` strings]
- Pumping / groundwater scenario: rice Kc, effective share of rain, extra annual loss, irrigation efficiency, pumped groundwater share; aquifer accounting: recharge (mm/yr), accounting area (ha), farm allocation of recharge, other allocated withdrawals. [`water.js`]
- Flood scenario: a hypothetical delay feeds back into rotation eligibility; drainage and aftercare guide tree choices. [CORE/JW 1:43]
- Link to Disaster recovery. [CORE/DR]
- **Rules:** recharge and accounting area start blank; multi-year arithmetic is not a forecast; water-table depth needs aquifer measurement. [CORE/M "Aquifer scenario"]

## 07 · `#recovery` — Disaster recovery (v1.1)

**Purpose:** drought / flood / fire recovery sequence. [CORE/DR]

- Choose hazard (drought, flood, fire) and stage (preparation, active event, inspection, safe access confirmed). [CORE/DR Flow 1]
- Enter field condition, surviving crop, water supply, contamination review, extra preparation days, optional next-crop deadline. [CORE/DR Flow 2]
- Date-qualified crop options (rice also checks land class and pre-raised seedlings), soil and border restoration (wetland/fruit trees by site type; after fire assess natural regeneration and contamination first). [CORE/DR Flow 3–4]
- Save per field and hazard on device, export JSON, print; carry a crop into the planting-material calculator. [CORE/DR Flow 5]
- Three clearly labelled fictional worked examples (flood 2 Sep 2026, drought 25 Feb with 5 May deadline, fire 4 Nov with unresolved contamination). [CORE/DR]
- Collapsed NASA panel: same month 2021–2025 IMERG range and POWER root-zone wetness — not a hazard classification. [CORE/DR]
- **Rules:** sowing-window arithmetic and holds → see 06; 183-day reassessment hold.

## 08 · `#research` — Research lab

**Purpose:** sensor QA and ground-truth logging. [README step 8]

- Compare paired rain products (POWER vs IMERG) and actual cloud masks. [README; CORE/JW 1:26]
- Log a variety and yield, soil test, probe reading or rain-gauge total. [README]
- Export observations deliberately as CSV or JSON; JSON can include photos. [README]
- **Rules:** "mean difference" label until a gauge establishes bias; gauge bias uses only date-matched 24 h UTC totals. [CORE/M "Rain QA"; CORE/AG]

## Evidence register (modal)

Lists every source in `earth.sources` + `agronomy.sources` with a note: weather values are frozen to 2024, each prepared field has a dated image and an illustrative boundary, rotation scores combine data with stated assumptions. [CORE `app.js`]

---

## Other view structures found in the sources

| Source | Structure |
|---|---|
| F18 "Farmer Interface" | **5 simple views:** Amar Jomi (My field) · Pani (Water) · Mati (Soil) · Foshol (Crops) · Recovery. One thing on screen at a time. |
| 3D-F | **5 tabs:** 1 My Field (3D terrain & slope) · 2 Water & Drainage · 3 Soil, Roots & NPK · 4 Layout, Stress & Rotation · 5 Flood & Recovery Plan |
| 3D-R | **3 sections:** 01 Crop Rotation & Bare-Field Window · 02 3D Slope, Water & Drainage · 03 Subsurface Soil, Roots & NPK Cutaway |

## Final information architecture [D-C4]

The 8 routes stay; none are rewritten. The sidebar groups them into F18's five farmer areas, with the Research desk kept separate:

| Farmer area (F18) | Routes / panels |
|---|---|
| আমার জমি · My field | `#field`, `#seasons` |
| পানি · Water | `#water` |
| মাটি · Soil | Soil panel in `#water` (AEZ, SoilGrids when added, local tests) + fertilizer calculator in `#clinic` |
| ফসল · Crops | `#rotations`, `#planner`, `#clinic` |
| Recovery | `#recovery` |
| Research desk | `#research` |

**3D is a "3D view" toggle, not a route:**
- inside `#field`: terrain, slope, A–A′ transect (features #2, #3)
- inside `#water`: drainage, waterlogging, soil and root cutaway (features #4, #5, #8, #10)

three.js is **self-hosted under `public/assets/`** like Leaflet, so the static export stays fully offline. The 3D demo field is anchored in **Mithapukur** [D-C2].
