# 14 · Final Decisions (approved 8 Nov 2026)

Final resolution for every conflict in [12](12-conflicts-and-open-questions.md). One principle runs through all of them:

> **Evidence-first.** Measured-vs-modeled honesty is the thing that differentiates Ropon Radar (BP §9.2, CORE/JW). Where sources conflict, choose the option that keeps that promise and that the working core app already satisfies, and add only what can be sourced before judging.

All recommendations below were validated by the project owner on 8 Nov 2026 and are **final**. They override any conflicting statement in the source files. Status ✅ = accepted.

## A. Safety and scientific integrity (🔴)

| ID | Conflict | Option A | Option B | **Recommendation** | Why | Status |
|---|---|---|---|---|---|---|
| C1 | Exact doses from field-kit readings (DS) vs no dosing without calibration (BP, CORE) | Quantified prescriptions as in the DS simulator (1.2 kg urea/dec, lime 8 kg/dec, 15 mm now) | Advisory only, no numbers | **Tiered:** (1) a reading triggers a *check-and-act advisory*; (2) a number appears only when it comes from an **official published table** and carries that label: BARC FRG AEZ/crop guideline → "Regional guideline, not site-tested"; lab/officer target → existing calculator; (3) AWD below −15 cm → "time to re-irrigate" (IRRI AWD rule) **without an mm amount**; (4) no lime dose unless sourced. | Keeps the DS field-kit value (instant, cheap, actionable) without breaking BP §3.3, §5.4, §8.1 or CORE/AG. BARC FRG explicitly allows AEZ guidance when tests are missing (BP §4.2). Judges reward honesty. | ✅ |
| C6 | Wetness index shown as "0.50 (50%)" (3D-F) | Keep % | Index only | **Show as "Wetness index 0.50 (0–1), regional cell"; never %.** SMAP m³/m³ is shown separately once integrated. | Mandatory test T-UNIT (BP §8.2). | ✅ |

## B. Scope and data (🟠)

| ID | Conflict | Option A | Option B | **Recommendation** | Why | Status |
|---|---|---|---|---|---|---|
| C2 | Pilot site: 3 upazilas (CORE/BP/DS) vs Burirhat RARS (3D) | Move the demo to Burirhat | Keep the 3 upazilas | **Keep Mithapukur · Pirganj · Gangachara as the pilot.** Add Sarker et al. 2026 / Burirhat as a **reference trial evidence record** (like Hossain 2022) once the DOI is verified, not as a prepared farmer field. Re-anchor the 3D demo field to **Mithapukur** (the default demo site in CORE/JW, with a Hossain trial). | All built data (POWER, IMERG, Landsat, history), the tests and the judging script are for the 3 upazilas. Moving means rebuilding the data pack. | ✅ |
| C3 | 3 plans (F18) vs 4 rotations (CORE, 3D) | 3 | 4 | **"Current rotation + 3 alternatives" = 4 cards.** Write this rule into the spec. | Satisfies both readings; already built and tested. | ✅ |
| C4 | IA: 8 routes (CORE) vs 5 farmer views (F18) vs 3D tabs | Rewrite to 5 views | Keep 8 and bolt 3D on as a 9th route | **Keep the 8 routes. Group the nav into F18's 5 farmer areas** (My field → `#field` `#seasons`; Water → `#water`; Soil → soil panel in `#water` + fertilizer in `#clinic`; Crops → `#rotations` `#planner` `#clinic`; Recovery → `#recovery`) with Research desk separate. **3D becomes a "3D view" toggle inside `#field` (terrain, slope, A–A′) and `#water` (drainage, soil cutaway),** not a new route. **Self-host three.js** like Leaflet so the static export stays offline. | No rewrite of tested views. Matches F18's "one thing at a time". Keeps the offline promise. Puts the strongest visual (3D) where its data lives. | ✅ |
| C5 | Four provenance vocabularies | Pick one existing set | Keep them all | **One schema enum + one farmer label set.** Schema: `MEASURED`, `FARMER_REPORTED`, `REMOTE_OBSERVED`, `MODELED`, `SCENARIO`, `UNKNOWN`. Farmer labels (F18): Measured ← MEASURED/FARMER_REPORTED (with a "farmer" sub-badge) · Estimated ← REMOTE_OBSERVED/MODELED · Scenario · Unknown. Keep CORE's **review status** (farmer → extension → lab) as a separate field. Recommendations stay an *output type* (BP §6.3), not a data label. | Covers every source's distinctions. Simple for farmers, precise for the audit trail (T-AUDIT). | ✅ |
| C7 | Unsourced prototype numbers | Port as is | Drop all | **Port nothing by default.** Each figure is either (a) recomputed from the data pack with its formula documented in 06, (b) cited (Sarker 2026, if verified), or (c) shown with a `SCENARIO` label. Tariffs and costs become **farmer-entered inputs** with the prototype values as editable examples. | Avoids fabricated precision (BP §4.4), keeps the useful calculators. | ✅ |
| C9 | AEZ per upazila (DS-H: Gangachara AEZ-2) | Hard-code the DS-H mapping | No AEZ | **Keep CORE's user-selected AEZ context** until the mapping is sourced from the SRDI Upazila Nirdeshika / BARC. Don't hard-code DS-H's mapping. | CORE/AG: selecting Rangpur cannot assign AEZ-3; the DS mapping is unsourced. | ✅ |
| C11 | SMAP referenced, not built | Remove SMAP from the pitch | Build it | **Build SMAP L4 (SFMC/RZMC + percentiles) via POWER in M2 as the first new data card** and freeze it into the data pack like the others. Until then, the pitch says "POWER wetness index". | P0 in BP; a real NASA product; high judging value; same pipeline as existing POWER fetches. | ✅ |
| C15 | F18 data with no plan (canal level, culverts, pump tariff, labour, shade tolerance, seed availability) | Integrate datasets | Ignore | **Farmer-entered optional inputs** for pump tariff, shared-pump schedule, labour and seed availability. **Scenario-only** for canal level and culverts (survey-dependent, labelled). Tree shade from the existing recovery tree guidance. | No public dataset exists in our sources; F18 itself says these need local survey. | ✅ |
| C17 | 3D disaster replay events (2020/2023/2024) | Keep | Drop | **Verify the 2023–2024 events against the core 2021–2025 archive** (POWER/IMERG) and keep only those the archive shows, with the archive as source. **Drop 26 Sep 2020** (outside the archive) unless an official BMD/FFWC source is added. | Real NASA data already on hand; no fabricated events (CORE/DR). | ✅ |

> **C2 verification (9 Nov 2026):** both PDFs are in `nsac/files/` (kept out of git until licence checked). Sarker et al. 2026 DOI `10.1155/ioa/9089088` verified: RARS Rangpur, AEZ-3, 2021–23, soil pH 5.61 / OM 1.83 % (Table 1), patterns CP4/CP5/CP11/CP12 among others. It may now be added to `agronomy.json` as a reference-trial record. **But** the paper never says "Burirhat", and its printed coordinates (25.33° N, 87.1° E) are outside Bangladesh (likely a typo). Cite it as "RARS Rangpur" without coordinates; the prototypes' Burirhat location and economics stay unverified (D-C7). Hossain et al. 2022 DOI `10.1155/2022/6288494` verified; Table 2 CP3 Pirganj row (Boro 127 vs total 1272) confirms the CORE/AG caution.

## C. Documentation drift (🟡) — do directly, no debate needed

| ID | Issue | **Recommendation** | Status |
|---|---|---|---|
| C8 | POWER grid 0.5° vs 0.5° × 0.625° | Write "~0.5° × 0.625° (MERRA-2)" and read the effective grid from response metadata. | ✅ |
| C10 | `agronomy-notes.md` says 17 sources | Update it to 33 sources + 25 symptoms. | ✅ |
| C12 | Unsourced DS claims (lab 3–6 weeks, 30% diesel, < 720 BDT) | Source each before it goes on a slide, or reword ("can take weeks"). | ✅ |
| C13 | VIS file is not Rangpur | Interaction reference only; don't cite its values. | ✅ |
| C14 | BP did not audit code | Record spec 00/02/04 as the M1 repository audit. | ✅ |
| C16 | "Soil Toxicity Index" undefined | Drop the term. Keep the cropping-history log (BP §4.3) and show "Zn/B: needs soil test" when intensive potato–rice history is entered. | ✅ |

## D. Open questions

| # | Question | **Recommendation** | Status |
|---|---|---|---|
| Q1 | Forecast provider | **No live forecast for the hackathon build.** Stay frozen and offline; irrigation advice phrased as "conditional on the next days' rain — check BMD". Revisit after judging. | ✅ |
| Q2 | FFWC registration | One team member registers for the API now. The app links to the official FFWC bulletin meanwhile (already done in CORE). | ✅ |
| Q3 | BARC/SRDI reuse | Use only published documents with page-level citations (as CORE does); no bulk scraping. | ✅ |
| Q4 | Deployment | **Offline static export** (CORE today). Auth/service is post-hackathon. | ✅ |

> **Amendment 9 Nov 2026 (owner), live data for new fields:** a farmer may start a field anywhere; when online the app fetches NASA POWER (incl. its IMERG rain) for that point ONCE and caches it on the phone. Prepared sites stay fully offline. A new field never borrows a prepared site's numbers; layers not prepared for it (Sentinel-2, NDVI, low ground) show "Not prepared for this field".

> **Amendment 9 Nov 2026 (owner):** #field gets an **online "High detail" imagery layer** (Esri World Imagery, network-only, not cached) as default when online; Sentinel-2 10 m stays the offline fallback. **3D terrain removed from #field** (30 m DEM is noise at plot scale on a flat floodplain) — overrides the 3D part of C4.
| Q5 | IVR/SMS channel | **Out of scope.** Keep the Banglish message templates (11 §3) for on-screen action cards. | ✅ |
| Q6 | 18-Feature Google Doc | **Resolved 9 Nov 2026:** the Google Doc is public and its text is identical to F18 (`specs/Shob plan aar features…txt`). No export needed. | ✅ |

## Resulting build order (if all accepted)

1. **Doc fixes** C8, C10, C13, C14, C16 — small; one fleet card.
2. **Schema and labels** C5 + C6 — foundation for everything else (M1).
3. **SMAP via POWER** C11 (M2).
4. **Field-kit advisories** C1 — tiered logic + tests.
5. **Nav grouping + 3D toggle** C4, re-anchored to Mithapukur (C2), with recomputed or labelled numbers (C7, C15).
6. **Archive-verified event replay** C17.
