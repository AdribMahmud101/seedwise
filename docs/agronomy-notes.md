# Agronomy evidence and model boundaries

Reviewed 2 November 2026. `public/data/agronomy.json` is a compact reference asset for the Rangpur demonstration. It includes 17 source records, five crop records, four rotation candidates, ten symptom pathways, an AEZ context matrix, and research workflow requirements. No measured soil test, pest diagnosis, farmer yield, aquifer recharge, or groundwater level is supplied for a demo polygon.

## Integration contract

| Key | Contents | UI use |
| --- | --- | --- |
| `sources[]` | Stable ID, publisher, URL, publication date when verified, access date and page/section locator | Clickable evidence drawer |
| `crops[]` | Crop/variety, historical reference yield, planting spacing or verified seed rate, FAO coefficients | Editable planning estimates |
| `conditions[]` | Crop IDs, symptom IDs, possible cause, field checks and nonchemical next steps | Symptom-based triage; no probability or photo classifier |
| `rotations[]` | Existing rotation plus three alternatives, evidence and constraints | Preference-based comparison |
| `aez` | BARC AEZ-3 matrix, source page, separate study context | Research context selected by the user |
| `fertilizer` | Elemental nutrient-to-product calculation and gates | Convert an existing approved nutrient target |
| `water` | Explicit scenario inputs and formulas | Explore assumed withdrawal and recharge balance |
| `groundTruth`, `qa` | Record fields and quality rules | Researcher logger and inspector |

## Soil context is real, but is not a field sample

The [BARC Fertilizer Recommendation Guide 2024](https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf#page=36) was downloaded and its scanned AEZ-3 page visually checked. Printed page 21 is PDF page 36. The two reported major land classes are:

| Land class | AEZ share | pH | Organic matter class |
| --- | ---: | --- | --- |
| Highland | 35% | 3.6–6.6 | Low–medium |
| Medium highland | 51% | 4.1–6.8 | Low–medium |

The numeric percentages refer to regional land coverage, not a probability that any selected field has those properties. The class labels are not a numeric organic-carbon measurement. The matrix is partial because the cited page reports those two major classes. The JSON carries the accompanying nutrient status classes. Neither AEZ location nor soil texture supports a calculation of groundwater recharge. Rangpur includes multiple AEZs; selecting Rangpur alone cannot assign AEZ-3.

The Hossain study's silt-loam, pH and organic-carbon context is separately identified as study context. It must not prefill a field's soil-test form.

## Crop and rotation evidence

[Hossain et al. (2022)](https://doi.org/10.1155/2022/6288494) provides local field trials from Mithapukur and Pirganj. Crop yield bounds in the JSON are minima and maxima of published treatment means, not statistical prediction intervals. The irrigation bounds use the **total** columns of Table 2. That table has an apparent inconsistency in its Pirganj 2019–2020 baseline component: Boro is shown as 127 while total is 1272. The prototype therefore should never reconstruct that row from its components.

Keep physical crop yield distinct from rice-equivalent yield, which is an economic normalization. Do not add tonnes of rice, potato and mustard into one unlabeled production number. Do not carry the article's historical prices into a current profitability forecast. Management, variety and planting-date effects are intertwined in these trials; the tested savings are not a generic causal effect of adding any third crop.

[Islam et al. (2014)](https://www.banglajol.info/index.php/IJARIT/article/download/22645/15576) supplies the short-Aman/potato/mungbean candidate from Paikan, Gangachara. It does not supply a measured annual irrigation range for this asset. Keep its water total unavailable rather than constructing a fake observation. The two mungbean yield references in the JSON are separate examples, not uncertainty bounds from one experiment.

A 7 kg/ha mustard seed input is supported for BARI Shorisha-14 in [BARI's specified production system](https://baritechnology.org/m/crops/tech_detail/353). The index was retrievable, although the direct page has an anti-bot verification interstitial. Leave the rate editable and identify its variety/system context. AIS gives BARI Mung-6 seed at 20–25 kg/ha. Rice spacing describes hills and potato spacing describes planting positions; neither is a guaranteed count of harvestable plants.

## Fertilizer calculation

[BARC FRG 2024](https://apps.barc.gov.bd/fertilizer_recommendation/FRG%20English%2030.10.2024.pdf#page=227), Appendix 2, lists elemental compositions of 46% N in urea, 20% P in TSP and 50% K in potassium chloride/MOP. Appendix 10 provides rounded product multipliers of 2.17, 5.0 and 2.0. Use direct fractions for arithmetic:

`product_kg = entered_net_nutrient_target_kg_per_ha × field_area_ha / nutrient_fraction`

The input labels must say **elemental N, P and K**. A product label of 46% P2O5 does not mean 46% elemental P. Likewise K2O and K are different bases. This prototype supplies no default application target. Record a soil-test method, units, date, crop and previous inputs before presenting an agronomic recommendation. Conversion alone does not establish a suitable dose or application schedule.

## Crop health and research records

The ten pathways are symptom possibilities supported by IRRI, BRRI, ICAR, DAE/BAMIS and AIS references. Suggestions focus on field checks, record keeping and local review. Archived chemical prescriptions are deliberately not converted into present-day spray instructions. Some source pages contain chemical recommendations; linking them is evidence attribution, not endorsement of every prescription on the page.

A photo may be attached to a local report, but this prototype has no validated disease classifier. Do not show “AI diagnosed”, a confidence percentage, or a treatment selected from the image. Farmer observations, extension review and laboratory confirmation need distinct statuses. Future supervised learning must retain observer, variety, sampling method, label provenance and review status, with consent before research use.

## Water and sensor QA

[FAO-56 Chapter 6](https://www.fao.org/4/X0490E/x0490e0b.htm) supports `ETc = Kc × ETo` under standard conditions. The mustard coefficient uses rapeseed/canola as an explicit proxy. Coefficients and dates need local calibration. ETc omits important irrigation-accounting terms, including paddy percolation and field/application losses.

The proposed aquifer panel is accounting under user-entered assumptions. Recharge, accounting area, allocation share, other pumping and irrigation efficiency must be visible. A multi-year cumulative balance is not a groundwater forecast. Leave recharge and specific yield unset. Head change requires a suitable aquifer model and validated inputs.

For POWER versus IMERG, “mean difference” is the appropriate label until an independent gauge establishes bias. Align units, spatial support, dates and valid samples before comparison. A difference between products is not an uncertainty interval. Cloud-mask loss applies to optical imagery with actual QA masks, not rainfall products. Never synthesize missing flags, confidence bands, surface-moisture values, or local sensor readings.
