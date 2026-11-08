# 06 · Methods and Equations

Implemented rules come from CORE/M, CORE/AG and CORE/DR. Planned equations come from BP §6.2.

## 1. Spatial support [CORE/M]
- Field outlines and planning profiles are illustrative.
- Area uses a local equirectangular projection and the shoelace formula; redrawing changes the planting area.
- Climate and optical samples keep their original grid or window, so nearby fields may share one regional value.

## 2. Weather, wetness, history [CORE/M]
- POWER supplies temperature, corrected precipitation, radiation, humidity, pressure, wind and modeled wetness. IMERG is requested separately through POWER.
- GWETTOP and GWETROOT are **dimensionless indices**. A logger can record a local probe reading with depth and volumetric unit.
- History for 2021–2025 is aggregated to months: rain and ETo as totals, temperature and wetness as means, with valid counts. A UTC 2024 replay supports daily QA. Four other years give the same-month reference. This is not a climate normal.

## 3. Optical quality [CORE/M]
- QA_PIXEL bits 1–4 flag dilated cloud, cirrus, cloud and shadow. Fill pixels are excluded from the cloud-loss denominator.
- NDVI additionally excludes snow, saturated red/NIR, terrain occlusion and invalid reflectance.
- `Reflectance = DN × 0.0000275 − 0.2`
- `NDVI = (NIR − Red) / (NIR + Red)`, averaged over usable pixels.
- The farmer view withholds greenness below **25% valid coverage**; this threshold is a demo display choice. Researchers see the surviving samples and counts.

Planned [BP §6.2]:
- `NDMI = (NIR − SWIR) / (NIR + SWIR)` — vegetation water status, strongly context dependent.

## 4. Rain QA [CORE/M]
- POWER minus IMERG on matching dates = inter-product disagreement. The band shows the monthly 10th–90th percentile of daily differences.
- Approximate interval for the annual mean = 1.96 × SE under daily independence. Serial correlation can make this unrealistically narrow.
- Gauge bias uses only independently entered, date-matched 24 h UTC totals; several readings on one date are averaged.
- Label it "mean difference" until a gauge establishes bias. A product difference is not an uncertainty interval. [CORE/AG]
- Example: at Mithapukur in 2024 the products differ by 1.47 mm/day on average. [CORE/JW]

## 5. Crop water (FAO-56) [CORE/M, CORE/AG, BP §6.2]
- ETo = FAO-56 Penman–Monteith from daily POWER temperature, radiation, wind, humidity and pressure. Mean RH is an approximation and soil heat flux G = 0.
- `ETc = Kc × ETo`. Representative Kc: rice 1.10, pulse/mustard 0.85, potato 0.95. Mustard uses rapeseed/canola as an explicit proxy, and coefficients need local calibration.
- ETc omits paddy percolation and field/application losses.

Planned root-zone balance [BP §6.2]:
- `S(t+1) = S(t) + P_eff + I − ET − R − D` (S stored water, P_eff effective rain, I irrigation, R runoff, D deep drainage)
- `TAW ≈ 1000 × (θFC − θWP) × Zr` (mm; Zr root depth in m)
- Irrigate when root-zone depletion > RAW, where `RAW = p × TAW` (p is crop/environment specific)
- Flooded rice needs a separate approach (AWD branch). [BP §3.1, §6.2]

## 6. Rotation fit [CORE/M]
1. **Feasibility gates first:** irrigation, budget, Aman harvest, disruption delay. Late-November harvest and 14-day flood checks are screening assumptions. Feasible rotations rank first.
2. **Score** = normalized weighted sum of water, soil, cost and risk fit. All-zero priorities → no score.
3. **Water fit:** gap = sum of positive monthly crop-demand gaps above 65% of IMERG rain. `relative water fit = 1 − 0.85 × gap / max compared gap`. All-zero gaps → equal water fit.
4. Soil, cost and risk ratings are design judgments. Calendars approximate occupancy in whole months. Trial irrigation totals remain independent evidence.
5. No probability or calibrated-yield interpretation.

BP §3.6 / §8.2 requirement: apply hard exclusions (salinity, season, drainage, planting window) **before** weighted ranking, and test this with a counterexample. Rank agronomic suitability and profit/risk separately. [BP §4.4]

## 7. Planting [CORE/M]
- `positions = usable ha × 10,000 / (row m × within-row m)`. Rice is counted in hills.
- Broadcast mustard: 7 kg/ha (BARI Shorisha-14 reference). Mung: BARI Mung-6, 20–25 kg/ha (AIS). [CORE/AG]
- `harvest illustration = usable area × published trial yield range`. Emergence, yield and microtopography are unknown.
- Yield bounds are minima and maxima of published treatment means, not prediction intervals. Never add tonnes of rice, potato and mustard into one number. Keep physical yield separate from rice-equivalent yield. [CORE/AG]

## 8. Fertilizer [CORE/M, CORE/AG]
- `product_kg = net elemental target kg/ha × treated ha / product fraction`
- Fractions: urea 0.46 N, TSP 0.20 P, MOP 0.50 K (BARC FRG 2024 Appendix 2). Use direct fractions, not the rounded Appendix 10 multipliers (2.17, 5.0, 2.0).
- Labels must say **elemental N, P, K**: 46% P₂O₅ ≠ 46% P, and K₂O ≠ K. Mixed products need joint accounting.
- The target comes from a lab or officer after crediting prior inputs. **No default application target.** Record the soil-test method, units, date, crop and previous inputs before any agronomic recommendation.
- **Tiered rule [D-C1]:** a BARC FRG AEZ/crop guideline value may be shown when cited to its page and labelled "Regional guideline — not site-tested". It can feed the same calculator as a lab target, but keeps that label in outputs and reports.

## 9. Aquifer scenario [CORE/M]
- `ETc = Kc × ETo`. Annual net irrigation = Σ positive monthly (ETc − effective rain) + user-entered extra losses.
- `pumped m³ = net mm × field ha × 10 / efficiency × groundwater share`
- `allocated recharge m³ = recharge mm/yr × accounting ha × 10 × allocation share`
- The scenario subtracts farm and other allocated withdrawals. Multi-year arithmetic repeats the same annual conditions. Recharge and accounting area start blank. Water-table depth and drawdown need aquifer measurements. This is not a groundwater forecast. [CORE/AG]

## 10. Disaster-recovery sowing windows [CORE/DR]

| Option | Reference window | Duration used |
|---|---|---|
| BARI Shorisha-14 | 15 Oct – 15 Nov | 75–80 days from sowing |
| BARI Mung-6 | 21 Feb – 15 Mar (anchored to Gangachara trial) | 55–58 days |
| BRRI dhan71 | 25 Jul – 9 Aug | 90–95 days after transplanting (115 total − 20–25 nursery) |
| Late short Aman | 10 – 25 Aug | Unknown → no next-crop deadline clearance |
| Late photoperiod-sensitive Aman | 26 Aug – 15 Sep | Unknown; nursery must exist from sowing by 15 Aug |

- `earliest readiness = assessment date + extra preparation days`; the next annual window is selected.
- `earliest sowing = max(readiness, window opening)`
- If deadline and duration are known: `latest sowing = min(window closing, deadline − max duration − 1 day)`. This reserves one unoccupied day, not a full land-prep allowance.
- Options more than **183 days** away are held for reassessment.
- Cards are alternatives, not an automatically chained rotation. Approximate harvest = sowing + reference duration (no stress model).
- Holds: an active event, unknown access, missing readiness or unresolved contamination (fire) never release a planting option. [CORE tests]

## 11. Prototype-only calculations (not specified anywhere else)

| Calculation | Shown in | Note |
|---|---|---|
| Drain impact: length × width → area lost (shotok), digging cost ৳, ponding reduction % | 3D-F #5 | Formula not documented |
| Pump hours/cost: tariff ৳/h × hours; flow L/s per pump type | 3D-F #11, 3D-R | Formula not documented |
| Shade %: bund-tree shadow at a chosen sun time | 3D-F #16 | Formula not documented |
| Net return, OM gain, SYI per cropping pattern scaled to plot | 3D-F #18, 3D-R | Uses Sarker et al. 2026 economics |
| "Soil Toxicity Index (STI)" | DS §3 #5 | Undefined |

**Decision [D-C7, D-C15, D-C16]:**
- Drain, pump and cost calculators may be built only with the formula written into this file first. Tariffs, costs, labour and canal level are farmer-entered or `SCENARIO` inputs; prototype values are editable examples only.
- Shade % stays a `SCENARIO` illustration until a sourced shading model exists.
- Net return / OM / SYI per pattern are not ported; rotation economics follow CORE/AG (no historical prices as current profit).
- "STI" is dropped; an intensive potato–rice history shows "Zn/B: needs soil test".
