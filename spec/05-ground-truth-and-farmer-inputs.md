# 05 · Ground Truth and Farmer Inputs

## Why ground truth [DS §1, BP §1.3]

| Scale | Pixel | Area |
|---|---|---|
| NASA SMAP | 9 km | 81,000,000 m² (regional trend) |
| ISRIC SoilGrids | 250 m | 62,500 m² (neighbourhood base) |
| Landsat | 30 m | 900 m² — often the whole plot |
| Sentinel-2 | 10 m | 100 m², minus edge mixing and cloud |
| Farmer's plot | ~20 decimals | ~809 m² (0.081 ha) |

DS-H states 1 SMAP pixel ≈ 100,123 plots and 1 SoilGrids pixel averages ~77 farms. Never call interpolated or resampled data "field-level precision". [BP §1.3]

DS adds claims that SRDI/BARC labs take 3–6 weeks, need travel to district towns, and cost too much for repeated tests. These claims must be sourced before they appear on a slide; otherwise reword to "lab results can take weeks" [D-C12].

## Low-budget offline field kit [DS §3, DS-H §3]

| # | Parameter | Tool / method | Approx. cost | Why needed | Intended app logic (as written) | Reference |
|---|---|---|---|---|---|---|
| 1 | Soil pH | Universal pH strips or 3-in-1 analog moisture/pH meter | 68–720 BDT | Acid soils (pH < 5.5 in Rangpur) lock up P | Calibrates BARC/SoilGrids baseline; adjusts fertilizer (lime or TSP placement) | Daraz BD listing |
| 2 | Leaf chlorophyll / N status | IRRI/BRRI Leaf Color Chart, shade 1–4 | 50–150 BDT | Satellites can't isolate early N deficiency under cloud | LCC shade 1–2 → urea top-dressing advisory (Boro/Aman) | IRRI Knowledge Bank LCC |
| 3 | Soil physical health | FAO Visual Soil Assessment (VSA) spade/drop test | Free | Compaction, earthworms, root penetration, hardpan | VSA score 0 / 1 / 2 adjusts FC and PWP | FAO VSA manual |
| 4 | Field water depth | AWD perforated PVC pipe (20 cm) | 50–100 BDT | Water presence in Boro root zone; up to 30% diesel saving | Overrides SMAP 9 km estimate; below −15 cm → irrigation advisory | IRRI AWD fact sheet |
| 5 | Cropping history | In-app log (e.g. Potato–Rice–Rice) | Free | Intensive potato–rice depletes Zn and B | Flags "Soil Toxicity Index (STI)" / micronutrient depletion risk | — |

Total farmer kit: under 720 BDT (~US$6.50). [DS-H]

> **Final rule [D-C1] replaces the "app logic" column wherever they differ.** Field-kit readings drive *tiered advisories*, not automatic prescriptions:
>
> | Tier | When | Output |
> |---|---|---|
> | 1 · Check & act | Any reading (pH strip, LCC shade, VSA score, AWD level) | Advisory naming what the reading suggests and what to verify, e.g. LCC shade 1–2 → "possible N shortage — confirm and consult the BARC/LCC guideline"; pH < 5.5 → "acidic — soil test advised before liming" |
> | 2 · Regional guideline number | A dose exists in an **official published table** (BARC FRG AEZ/crop guidance, IRRI LCC guide) and its page is cited | The number, labelled **"Regional guideline — not site-tested"** |
> | 3 · Site-specific number | Lab or officer supplies an elemental target | Existing fertilizer calculator [CORE/AG] |
> | AWD | Water below −15 cm (IRRI AWD rule) | "Time to re-irrigate" — **no mm amount** |
> | Lime | — | No lime dose unless sourced |
>
> DS's example outputs (1.2 kg urea/dec, lime 8 kg/dec, irrigate 15 mm) are **not** implemented. The "Soil Toxicity Index" is dropped [D-C16]. Instead, an intensive potato–rice history shows "Zn/B: needs soil test".

## What the farmer must be able to enter [BP §4.3]

- Boundary and land area; village, union, upazila; floodplain/AEZ map context.
- Previous crops (at least two seasons), harvest yield, irrigation method, drainage/waterlogging, manure/fertilizer history.
- Optional soil-test document: sample date, lab, location, sampling depth, assay method; pH, OM, EC, N/P/K, micronutrients.
- Observed leaf symptoms with photos, affected growth stage, spread, irrigation, recent rain.
- Cash limits, desired crop season, market access, priorities (low water, rapid recovery, income, nutrition).

## Local reading entry (prototypes) [3D-R, 3D-F]

The "Enter Local Well or Soil Test" modal takes: tubewell water depth (m below ground), measured soil pH (SRDI / kit), organic matter (%), available P (mg/kg), and measurement source / lab ID. It offers "Reset to regional default" and "Apply / Save & update 3D model". Saving switches the provenance badge to **✓ Measured**.

## Clinic inputs [BP §5.4, CORE README]

Crop species and variety, stage, affected plant part, severity, distribution, symptom photos, recent weather, fertilizer and pesticide history. CORE implements visible-sign selection plus a photo and note.

## Research-lab ground-truth logging [CORE README, CORE/AG]

- Variety and yield, soil test, probe reading (with depth and volumetric unit), rain-gauge total (24 h UTC, date-matched).
- Records and photos stay in the browser. Review and consent are self-reported by the person entering them.
- Future supervised learning must keep observer, variety, sampling method, label provenance and review status, with consent before research use.
- Farmer observation, extension review and lab confirmation need distinct statuses.

## Minimum field evaluation dataset (for validation) [BP §8.1]

Recruit diverse small farms across the three upazilas, varying crop, water management, soil, flooding and parcel size. Record georeferenced soil-test samples, moisture probe or AWD readings, rain-gauge comparisons, crop stages, irrigation decisions, pest diagnoses and harvest outcomes. Repeat across seasons. Split evaluation **by farm and time**, not by random pixels from the same field.
