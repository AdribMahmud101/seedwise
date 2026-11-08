# 10 · Roadmap

## 1. Priorities [BP Implementation priorities]

| Tier | Items |
|---|---|
| **P0 (immediate)** | Field boundaries + evidence provenance · current forecasts and GPM rainfall · SMAP L4 via POWER · Sentinel-2 NDVI/NDMI and Landsat surface temperature · BARC/SRDI/SoilGrids soil baseline · crop-specific soil-water balance · FFWC flood alerts |
| **P1** | Sentinel-1 flood monitoring · NISAR pilot data · ECOSTRESS ET · calibrated soil sampling · crop economics · farmer ground-truth logging |
| **P2** | Research-grade regional GRACE/GRACE-FO · GEDI for agroforestry · SWOT hydrology · climate-scenario planning |

## 2. Release increments M1–M6 [BP §9.1]

| ID | Increment | Scope | Touches views / features |
|---|---|---|---|
| **M1** | Data truth & farm registration | Audit the existing repository; confirm the source inventory; farm-boundary capture; schema for units, spatial support, acquisition time, ingest time, provenance | `#field`, all · #1, provenance labels |
| **M2** | Moisture & irrigation | SMAP via POWER, time-series anomalies, effective rainfall, initial FAO-56 root-zone balance; rice AWD branch; field logging | `#water`, `#field` · #7, #8, #11 |
| **M3** | Soil & crop potential | SoilGrids, licensed BARC/SRDI layers, crop requirement rules, soil-lab ingestion, suitability/economic constraints, fertilizer reference only | `#water`, `#rotations`, `#clinic` · #10, #14, #18, S |
| **M4** | Crop-health monitoring | Native Sentinel-2 NDVI/NDMI, Landsat surface temperature, symptom triage, uncertainty-based follow-up | `#seasons`, `#clinic`, `#research` · #12, #17 |
| **M5** | Flood, fire & recovery | FFWC alerts, Sentinel-1 flood history, DEM-based preliminary exposure, VIIRS context, post-disaster planning with explicit emergency boundaries | `#recovery`, `#water` · #4, #5, #6, #15 |
| **M6** | Satellite extensions & validation | NISAR research pilot, ECOSTRESS, full researcher QA inspector, ground-truth evaluation, uncertainty calibration, field pilots | `#research` · validation gates |

3D work (#2, #3, #4, #5, #8, #10) is scheduled as the **3D view toggle** in `#field` and `#water` (sequence step 5 below) [D-C4].

## 2a. Final build sequence (hackathon) [14]

| Step | Work | Decisions | Maps to |
|---|---|---|---|
| 1 | Doc fixes: POWER grid wording, `agronomy-notes.md` 17 → 33 sources + 25 symptoms, mark VIS reference-only, drop STI, record this spec as the M1 audit | D-C8, C10, C13, C14, C16 | M1 |
| 2 | Canonical provenance enum + farmer labels + review status; wetness-index display fix; T-UNIT test | D-C5, C6 | M1 |
| 3 | SMAP L4 SFMC/RZMC + percentiles via POWER, frozen into the data pack, shown as a data card. **Access route:** POWER's public SMAP Zarr store (the daily point API returned -999 on 8 Nov 2026), see 17 §3 | D-C11 | M2 |
| 4 | Tiered field-kit advisories (pH, LCC, VSA, AWD, history) + tests; no mm/lime amounts | D-C1, C16 | M2/M3 |
| 5 | Nav grouping into 5 farmer areas; self-hosted three.js; 3D toggle in `#field` and `#water` on a Mithapukur demo field; calculators with documented formulas and farmer-entered costs | D-C4, C2, C7, C15 | M3/M5 |
| 6 | Event replay limited to archive-verified 2023–2024 events | D-C17 | M5 |

Not scheduled for the hackathon: live forecast (D-Q1), IVR/SMS (D-Q5), server/auth (D-Q4). Team actions: FFWC API registration (D-Q2), export the 18-Feature Google Doc into `specs/` (D-Q6), verify the Sarker 2026 DOI (D-C2).

## 3. Integration backlog with acceptance criteria [BP §7]

| Priority / deliverable | Integration | Acceptance criteria |
|---|---|---|
| P0 / regional moisture | POWER high-res SMAP SFMC/RZMC + percentiles; MERRA GWETTOP/GWETROOT kept separate | Units, source switch, timestamps and 9 km provenance tested; no double counting |
| P0 / weather | POWER history + actual forecast provider; IMERG Early/Late for recent rain | No archive data labelled live; timezone and daily rain sums validated |
| P0 / field vegetation | Native Sentinel-2 10/20 m NDVI + NDMI; Landsat C2 SR + ST | Cloud and mixed-pixel flags; no result if too few valid pixels |
| P0 / soil baseline | SoilGrids + BARC Khamari/SRDI + soil-test import | Total N vs available N clear; no invented P/K lab values |
| P0 / flood safety | FFWC API/alerts + historical Sentinel-1 flood maps + DEM | Official alert precedence, latency labels, no plot water-depth claim |
| P1 / radar pilot | ASF NISAR provisional L-band + Sentinel-1 SAR | Bangladesh acquisitions, calibration and algorithm validation checked |
| P1 / stress & ET | ECOSTRESS ET/LST + Landsat ST | Observation-time/temperature mismatch and resolution flagged |
| P1 / fire risk | FIRMS VIIRS hotspots + official emergency messaging | No "no hotspot means safe" statement |
| P2 / regional research | GRACE/GRACE-FO, SWOT, MODIS, GEDI, NEX-GDDP-CMIP6 | Basin/regional context only; projection vs forecast distinguished |

## 4. Production work named in CORE [CORE/DR, CORE/M]

Extension validation, live hazard services, field soil samples, calibrated crop models, authenticated review and independent outcome validation for a research service.

## 5. Publishable research questions [BP §9.3]

1. How much do farmer-entered water logs improve field irrigation decisions beyond SMAP + rain + FAO-56?
2. How do native Sentinel-2, HLS and NISAR/Sentinel-1 differ on mixed tiny plots in the monsoon?
3. Does crop-suitability ranking improve with soil-lab evidence, flood-risk constraints and farmer budget?
4. Can uncertainty and abstention thresholds reduce dangerous false reassurance in flood/drought events?
5. What minimum field-sampling density corrects regional soil/nutrient maps in AEZ-3?
