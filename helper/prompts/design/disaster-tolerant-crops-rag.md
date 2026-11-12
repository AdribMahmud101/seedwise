---
title: "Rangpur Disaster-Tolerant Crop Varieties — RAG Knowledge Base"
version: "1.0"
review_date: "2026-11-11"
region: "Rangpur Division, Bangladesh"
intended_use: "Evidence-aware retrieval for crop-variety recommendations"
status: "Research shortlist; not field-level agronomic advice"
---

# Rangpur Disaster-Tolerant Crop Varieties

## Scope and evidence rules

This document organizes research-institute crop varieties by disaster tolerance for retrieval-augmented generation (RAG). Rangpur Division includes Rangpur, Dinajpur, Kurigram, Lalmonirhat, Nilphamari, Gaibandha, Thakurgaon and Panchagarh. Regional suitability must be evaluated at field and season level. **NASA does not certify crop-variety tolerance**: NASA observations support hazard assessment; Bangladesh research institutes supply varietal characteristics.

**Evidence labels**
- `official_trait`: tolerance explicitly stated in an official institute source.
- `research_candidate`: reported in an institute experiment, but not proof of universal tolerance.
- `requires_local_validation`: local field suitability not established for a particular farmer's plot.
- `stock_unverified`: no current dealer-level inventory confirmed.

Never infer a tolerance duration, guaranteed yield, precise field suitability or available stock from a generic variety listing. Flood/submergence, waterlogging and drought escape are different traits.

## Quick retrieval index

| Crop | Variety | Hazard / trait | Evidence | Source |
|---|---|---|---|---|
| Rice | BRRI dhan51 | Submergence, up to 14 days | official_trait | [BRRI official listing](https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3) |
| Rice | BRRI dhan52 | Submergence, up to 14 days | official_trait | [BRRI official listing](https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3) |
| Rice | BRRI dhan55 | Salt, drought and cold tolerance | official_trait | [BRRI official listing](https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3) |
| Rice | BRRI dhan56 | Drought | official_trait | [BRRI official listing](https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3) |
| Rice | BRRI dhan57 | Drought | official_trait | [BRRI official listing](https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3) |
| Rice | BRRI dhan65 | Drought | official_trait | [BRRI official listing](https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3) |
| Rice | BRRI dhan79 | Submergence | requires_local_validation | [BRRI rice profiles](https://riceprofile.brri.gov.bd/) |
| Rice | BRRI dhan71 | Drought | requires_local_validation | [BRRI rice profiles](https://riceprofile.brri.gov.bd/) |
| Rice | BRRI dhan42, dhan43 | Drought (Aus) | requires_local_validation | [BRRI rice profiles](https://riceprofile.brri.gov.bd/) |
| Rice | BRRI dhan36 | Cold | requires_local_validation | [BRRI rice profiles](https://riceprofile.brri.gov.bd/) |
| Maize | BARI Hybrid Maize 12, 13 | Moderate drought tolerance reported | requires_local_validation | [BWMRI](https://bwmri.gov.bd/pages/static-pages/6922ddc4933eb65569e16294) |
| Maize | BARI Hybrid Maize 14, 15, 17 | Heat tolerance reported | requires_local_validation | [BWMRI](https://bwmri.gov.bd/pages/static-pages/6922ddc4933eb65569e16294) |
| Maize | BWMRI Hybrid Maize 1 | Lodging resistance reported | requires_local_validation | [BWMRI](https://bwmri.gov.bd/) |
| Potato | BARI Alu 41 | Strong performance in heat-stress research | research_candidate | [BARI annual report](https://bari.gov.bd/sites/default/files/files/bari.portal.gov.bd/annual_reports/7c2952eb_e99f_4951_8c31_83c80909bc8b/BARI%20Annual%20Report%202015%20%28With%20Bookmark%29%20%2833%29.pdf) |
| Potato | BARI Alu 36, Provento, Sagitta | Tested under heat stress | research_candidate | [BARI annual report](https://bari.gov.bd/sites/default/files/files/bari.portal.gov.bd/annual_reports/7c2952eb_e99f_4951_8c31_83c80909bc8b/BARI%20Annual%20Report%202015%20%28With%20Bookmark%29%20%2833%29.pdf) |
| Wheat | BARI Gom 26, 30, 32 | Used as heat-stress trial checks | research_candidate | [BWMRI](https://bwmri.gov.bd/) |

## Variety records — rice

### RICE-BRRI-DHAN51
- **Crop:** Rice (*Oryza sativa*)
- **Variety:** BRRI dhan51
- **Season:** Transplanted Aman
- **Hazard:** Flash flood / temporary complete submergence
- **Tolerance:** Up to 14 days according to BRRI's official list; actual survival varies with flood depth, growth stage and water conditions.
- **Land suitability:** BRRI Rice Profile describes medium-high land level 2 and flood-prone settings.
- **Rangpur relevance:** Candidate for flood-exposed Aman fields, subject to plot-level checks.
- **Developer tags:** `rice`, `aman`, `submergence`, `flood`, `rangpur_candidate`
- **Evidence:** `official_trait`; `requires_local_validation`; `stock_unverified`
- **Sources:** https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3 ; https://riceprofile.brri.gov.bd/varieties/60

### RICE-BRRI-DHAN52
- **Crop:** Rice
- **Variety:** BRRI dhan52
- **Season:** Aman
- **Hazard:** Temporary submergence
- **Tolerance:** Up to 14 days (BRRI official list).
- **Rangpur relevance:** Candidate for flood-prone Aman plots; confirm land class and seed availability.
- **Evidence:** `official_trait`; `requires_local_validation`; `stock_unverified`
- **Source:** https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3

### RICE-BRRI-DHAN55
- **Crop:** Rice
- **Variety:** BRRI dhan55
- **Season:** Boro (official BRRI listing)
- **Hazards:** Cold, drought and salinity; salt tolerance is not a major Rangpur selection criterion without local salinity evidence.
- **Quantitative threshold:** Not established in the cited listing.
- **Evidence:** `official_trait`; `requires_local_validation`; `stock_unverified`
- **Source:** https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3

### RICE-BRRI-DHAN56
- **Crop:** Rice
- **Variety:** BRRI dhan56
- **Season:** Aman
- **Hazard:** Drought
- **Quantitative threshold:** Not established by the cited official listing.
- **Rangpur relevance:** Candidate for drought-prone Aman plots; irrigation and planting dates matter.
- **Evidence:** `official_trait`; `requires_local_validation`; `stock_unverified`
- **Source:** https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3

### RICE-BRRI-DHAN57
- **Crop:** Rice
- **Variety:** BRRI dhan57
- **Season:** Aman
- **Hazard:** Drought
- **Quantitative threshold:** Not established by the cited official listing.
- **Evidence:** `official_trait`; `requires_local_validation`; `stock_unverified`
- **Source:** https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3

### RICE-BRRI-DHAN65
- **Crop:** Rice
- **Variety:** BRRI dhan65
- **Season:** Direct-seeded Aus (Bona Aus)
- **Hazard:** Drought
- **Quantitative threshold:** Not established by the cited official listing.
- **Evidence:** `official_trait`; `requires_local_validation`; `stock_unverified`
- **Source:** https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3

### RICE-ADDITIONAL-CANDIDATES
- **BRRI dhan79:** Reported submergence-tolerant Aman variety. Verify exact maximum submergence duration against its current official variety profile before exposing a number.
- **BRRI dhan71:** Reported drought-tolerant Aman variety. Verify specific conditions and region.
- **BRRI dhan42 / dhan43:** Reported drought-tolerant Aus varieties. Verify the official variety profile before field recommendations.
- **BRRI dhan36:** Reported cold-tolerant Boro variety; check the official profile and regional trials.
- **BRRI dhan62:** Early-maturing Aman candidate; **do not label genetically drought tolerant merely because early harvest can avoid drought**.
- **Evidence:** `requires_local_validation`; `stock_unverified`
- **Research portal:** https://riceprofile.brri.gov.bd/

## Variety records — maize

### MAIZE-BARI-HYBRID-12-13
- **Crop:** Maize
- **Varieties:** BARI Hybrid Maize 12; BARI Hybrid Maize 13
- **Reported hazard trait:** Moderate drought tolerance.
- **Tolerance threshold:** Not verified; do not assign an irrigation-free day count.
- **Rangpur relevance:** Candidate for drought-exposed maize fields after seasonal and local validation.
- **Evidence:** `requires_local_validation`; `stock_unverified`
- **Source to verify variety-level detail:** https://bwmri.gov.bd/pages/static-pages/6922ddc4933eb65569e16294

### MAIZE-BARI-HYBRID-14-15-17
- **Crop:** Maize
- **Varieties:** BARI Hybrid Maize 14; BARI Hybrid Maize 15; BARI Hybrid Maize 17
- **Reported hazard trait:** Heat tolerance.
- **Temperature threshold:** Not verified; do not assign degrees Celsius.
- **Evidence:** `requires_local_validation`; `stock_unverified`
- **Source to verify variety-level detail:** https://bwmri.gov.bd/pages/static-pages/6922ddc4933eb65569e16294

### MAIZE-BWMRI-HYBRID-1
- **Crop:** Maize
- **Variety:** BWMRI Hybrid Maize 1
- **Reported trait:** Lodging resistance; **not equivalent to flood tolerance**.
- **Evidence:** `requires_local_validation`; `stock_unverified`
- **Source:** https://bwmri.gov.bd/

## Variety records — potato

### POTATO-BARI-ALU41
- **Crop:** Potato
- **Variety:** BARI Alu 41
- **Hazard:** Heat stress
- **Research context:** Historical BARI heat-stress trials in Debiganj, Panchagarh (within Rangpur Division); a previously reported experimental yield was 45.89 t/ha. **This is a trial result, not a guaranteed farmer yield or universal tolerance threshold.**
- **Evidence:** `research_candidate`; `requires_local_validation`; `stock_unverified`
- **Source:** https://bari.gov.bd/sites/default/files/files/bari.portal.gov.bd/annual_reports/7c2952eb_e99f_4951_8c31_83c80909bc8b/BARI%20Annual%20Report%202015%20%28With%20Bookmark%29%20%2833%29.pdf

### POTATO-OTHER-HEAT-TRIALS
- **Crop:** Potato
- **Varieties:** BARI Alu 36; Provento; Sagitta
- **Hazard:** Heat stress (trial context only)
- **Interpretation:** Comparative heat-stress trial entries, not proof of broadly certified tolerance.
- **Evidence:** `research_candidate`; `requires_local_validation`; `stock_unverified`
- **Source:** https://bari.gov.bd/sites/default/files/files/bari.portal.gov.bd/annual_reports/7c2952eb_e99f_4951_8c31_83c80909bc8b/BARI%20Annual%20Report%202015%20%28With%20Bookmark%29%20%2833%29.pdf

## Variety records — wheat

### WHEAT-HEAT-TRIAL-CHECKS
- **Crop:** Wheat
- **Varieties:** BARI Gom 26; BARI Gom 30; BARI Gom 32
- **Hazard:** Heat stress
- **Evidence:** Used as comparison/check varieties in reported heat-stress research. **Check variety status alone does not establish a heat-tolerance rating.**
- **Rangpur relevance:** BWMRI is based at Nashipur, Dinajpur; field-level suitability requires independent confirmation.
- **Evidence:** `research_candidate`; `requires_local_validation`; `stock_unverified`
- **Source / research institution:** https://bwmri.gov.bd/

## Seed acquisition — where farmers should inquire

**Research institution ≠ confirmed retail seed seller.** No live inventory, seed lot quality, dealer location or price has been verified for any variety here.

| Contact / channel | Purpose | URL | Availability status |
|---|---|---|---|
| BRRI, including Rangpur regional research services | Rice variety information, suitable conditions, referral to seed distribution channels | https://brri.gov.bd/ | Ask locally; stock unverified |
| BWMRI, Nashipur, Dinajpur | Wheat/maize variety research and seed-source guidance | https://bwmri.gov.bd/ | Ask locally; stock unverified |
| BARI | Potato and other crop-variety research; breeder/seed guidance | https://bari.gov.bd/ | Ask locally; stock unverified |
| Bangladesh Agricultural Development Corporation (BADC) | Government seed distribution, sales channels and dealers | https://badc.gov.bd/ | Check current district dealer inventory |
| Department of Agricultural Extension (DAE), local Upazila Agriculture Office | Locally suitable varieties, authorized dealers and extension advice | https://dae.gov.bd/ | Confirm locally |

**Farmer-facing instruction:** Ask the local DAE office or BADC seed dealer for the exact variety name, current certified seed availability, package/lot identification and planting window. Do not direct farmers to an unverified seller or claim a particular variety is in stock.

## NASA open datasets for the RAG + hazard engine

| Data source | Variables | Intended use | Official documentation |
|---|---|---|---|
| NASA POWER Daily API | Daily meteorology, temperature and rainfall parameters | Historical heat/dry-spell indicators; not a field-scale forecast | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ |
| NASA GPM IMERG | Precipitation estimates, half-hourly/daily/monthly | Heavy rain, dry-spell monitoring and rainfall anomaly indicators | https://gpm.nasa.gov/data/imerg |
| NASA GPM IMERG directory | 0.1-degree / ~10 km precipitation products | Product selection, latency and spatial-resolution metadata | https://gpm.nasa.gov/data/directory |
| NASA-USDA Global Soil Moisture | Modeled/assimilated soil moisture | Regional drought context, subject to spatial uncertainty | https://earth.gsfc.nasa.gov/hydro/data/nasa-usda-global-soil-moisture-data |

**Operational warning:** Rainfall anomalies alone cannot prove a plot is flooded; satellite grids are not individual fields. Combine satellite products with soil, elevation, crop stage, drainage and ground reports. Never invent crop tolerance thresholds from weather readings.

## RAG retrieval and recommendation safeguards

1. Index each `###` variety record as an independent chunk with its ID, crop, variety, hazard, season, evidence status and source URL.
2. Retrieve by crop + hazard + season + local land conditions. Do not rank purely by matching the word "flood" or "drought".
3. Distinguish `official_trait`, `research_candidate` and `requires_local_validation` in the final answer.
4. Surface missing values as `unknown`, never zero and never a fabricated threshold.
5. Keep `seed_availability = unverified` until a current dealer or official inventory confirms it.
6. Cite the original research institution or NASA documentation next to each retrieved recommendation.
7. Before recommending to a farmer, check planting season, plot elevation, duration of expected flooding, irrigation, soil, seed availability and local extension advice.
8. In the event of an active flood or wildfire, do not confuse long-term crop variety selection with immediate emergency safety guidance.

## Evidence gaps / pending verification

- The exact tolerance limits and current official profiles of BRRI dhan79, dhan71, dhan42, dhan43 and dhan36 need variety-level confirmation.
- Detailed agronomic parameters for the listed maize hybrids require direct variety datasheets.
- Potato trial results are historical and may not represent current release or commercial availability.
- Heat-stress check varieties of wheat must not be presented as proven heat-tolerant without supporting trial results.
- Mustard, lentil, mung bean, jute and vegetable varieties are **not included** because sufficiently specific disaster-tolerance evidence has not been established in this report.
- District-specific seed stock, dealer addresses, prices and lot certification have not been verified.

## Primary references

1. Bangladesh Rice Research Institute (BRRI), official list of rice variety traits: https://brri.gov.bd/pages/static-pages/6922de57933eb65569e19fb3
2. BRRI Rice Profile, BRRI dhan51: https://riceprofile.brri.gov.bd/varieties/60
3. BRRI Rice Profile portal: https://riceprofile.brri.gov.bd/
4. Bangladesh Wheat and Maize Research Institute (BWMRI): https://bwmri.gov.bd/
5. BWMRI maize variety listing: https://bwmri.gov.bd/pages/static-pages/6922ddc4933eb65569e16294
6. Bangladesh Agricultural Research Institute (BARI) Annual Report 2015: https://bari.gov.bd/sites/default/files/files/bari.portal.gov.bd/annual_reports/7c2952eb_e99f_4951_8c31_83c80909bc8b/BARI%20Annual%20Report%202015%20%28With%20Bookmark%29%20%2833%29.pdf
7. BADC: https://badc.gov.bd/
8. DAE: https://dae.gov.bd/
9. NASA POWER Daily API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
10. NASA GPM IMERG: https://gpm.nasa.gov/data/imerg
11. NASA GPM Data Directory: https://gpm.nasa.gov/data/directory

_Last reviewed: 2026-11-11. This is an evidence-graded research shortlist, not a live seed inventory or validated farm-level recommendation engine._
