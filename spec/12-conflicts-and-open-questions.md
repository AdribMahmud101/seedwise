# 12 · Conflicts and Open Questions

> **Status: all conflicts and open questions resolved (8 Nov 2026).** Final decisions are in [14-decision-recommendations.md](14-decision-recommendations.md) and are already applied across this spec. This file is kept as the record of *why* each decision was needed.

Contradictions found between the source files, and gaps where no source specifies the answer. **Severity:** 🔴 blocks safe implementation · 🟠 affects scope or data · 🟡 documentation drift.

## Conflicts

### C1 🔴 Automatic dosing and irrigation amounts — ✅ resolved → 14 · C1
- **DS §3–4 / DS-H simulator:** LCC shade 2 → "Top-dress 1.2 kg urea/decimal"; pH 4.8 → "Apply lime 8 kg/dec"; AWD −18 cm → "Irrigate 15 mm NOW". pH also "automatically prescribes lime or TSP".
- **BP §3.3:** no precise amount or definite schedule without field calibration. **BP §8.1:** no automatic precision dosing without tests. **BP §5.4:** no autonomous dosing.
- **CORE/AG:** "This prototype supplies no default application target"; conversion alone does not establish a suitable dose.
- **Decision needed:** may field-kit readings trigger only *advisories to verify* (BP/CORE), or quantified prescriptions (DS)? If quantified, which officially sourced table produces them, and who reviews them?

### C2 🟠 Pilot site and evidence base — ✅ resolved → 14 · C2
- **CORE, BP, DS:** Mithapukur, Pirganj, Gangachara. Rotations come from Hossain 2022 and Islam 2014.
- **3D-R, 3D-F:** Burirhat, Rangpur (25.821° N, 89.235° E): "Burirhat North Paddy 0.88 ha" and "BARI RARS station 7.36 ha", with soil and economics from Sarker et al. 2026 (patterns CP4/CP5/CP11/CP12).
- **Decision needed:** is Burirhat the "one real field" for the demo (F18 demo advice), or should the 3D views be re-anchored to a field in the three pilot upazilas? Is Sarker 2026 added to the core evidence pack?

### C3 🟠 Number of rotation plans — ✅ resolved → 14 · C3
- **F18 #14:** compare **3** plans.
- **CORE:** 4 rotations (1 existing + 3 alternatives) — which could be read as "3 alternatives". **3D-R/3D-F:** 4 patterns.
- **Decision needed:** confirm "existing + 3 alternatives" as the rule.

### C4 🟠 Information architecture: 8 routes vs 5 farmer views vs 3D — ✅ resolved → 14 · C4
- **CORE:** 8 routes (#field … #research).
- **F18:** 5 simple farmer views (My field · Water · Soil · Crops · Recovery).
- **3D-F:** 5 tabs that cover all 18 features in 3D.
- No source says how the 3D prototypes merge into CORE, or whether Soil becomes its own route (CORE folds soil into `#water` and `#clinic`). The M1–M6 roadmap schedules no 3D work.
- **Decision needed:** target IA; whether 3D becomes a mode inside `#field`/`#water` or a separate route; and whether three.js (CDN in the prototypes) is acceptable in the offline static export.

### C5 🟠 Four provenance vocabularies — ✅ resolved → 14 · C5
- BP §1.2 MEASURED / OBSERVED REMOTELY / MODELED / RECOMMENDED · BP §4.4 LAB-MEASURED / FARMER-REPORTED / REGIONAL-MODELED / UNKNOWN · F18/3D-F Measured / Estimated / Scenario / Unknown · DS fusion badge.
- **Decision needed:** one canonical enum for the schema (M1), plus how it maps to the farmer-facing 4-label set.

### C6 🔴 Wetness index shown as a percentage — ✅ resolved → 14 · C6
- **3D-F** shows surface moisture as "0.50 (50%)" from GWETTOP.
- **BP §1.2, §8.2 T-UNIT:** a wetness index must not read as a % water content.
- **Action:** the prototype display violates a mandatory test and must not be ported as is.

### C7 🟠 Unverified prototype numbers — ✅ resolved → 14 · C7
3D-R/3D-F present figures with no derivation in any spec: "~465 mm pumping", "−68% water", "৳128,783 net return / +৳97,781 vs Boro", "ponding cut −78%", "৳1,380 digging", "8.4% shade", "5.2 h / ৳1,664 next irrigation", "SYI 71%", "OM 2.11%", NDVI 0.38/0.72/0.74, "92% cloud in July", "307 S2 dates", "538 S1 scenes", "25-year POWER", "21st vs 73rd percentile", "lowest 21% of surrounding land", pump tariffs ৳320/160/110 per hour.
- **Decision needed:** which values are sourced (Sarker 2026, real queries), and which are placeholders to label as Scenario or replace.

### C8 🟡 POWER grid resolution — ✅ resolved → 14 · C8
- **DS §2:** 0.5° × 0.5°. **BP §2.2:** ~0.5° × 0.625° (MERRA-2). **3D-R:** 0.5° × 0.625°.
- **Action:** use the documented native grid from response metadata (BP §7.1).

### C9 🟠 AEZ assignment per upazila — ✅ resolved → 14 · C9
- **DS-H simulator:** Mithapukur AEZ 3, Pirganj AEZ 3 (sandy loam), Gangachara **AEZ 2** (active floodplain). **DS §2:** "AEZ 2 & 3".
- **CORE/AG:** Rangpur includes multiple AEZs, and selecting Rangpur cannot assign AEZ-3; CORE carries only an AEZ-3 matrix, chosen by the user.
- **Decision needed:** a sourced AEZ mapping for each pilot upazila or field, and the AEZ-2 data to add if Gangachara is AEZ-2.

### C10 🟡 Stale source count in CORE docs — ✅ resolved → 14 · C10
- **CORE/AG** says 17 source records. **CORE README** and the actual `agronomy.json` have **33** sources (plus 25 symptoms).
- **Action:** update `docs/agronomy-notes.md`.

### C11 🟠 SMAP status — ✅ resolved → 14 · C11
- **BP P0:** SMAP L4 via POWER. **F18 #7, #8:** SMAP as the data source. **CORE/M:** this release has no SMAP measurement. **DS:** uses SMAP as the "regional trend" in the pitch.
- Not a contradiction, but the pitch and the prototypes reference SMAP while the build shows only POWER GWET indices. **Action:** M2 work item, or adjust the pitch wording.

### C12 🟡 Unsourced claims in DS — ✅ resolved → 14 · C12
- Lab turnaround of "3–6 weeks", "saves up to 30% diesel irrigation cost", "pH < 5.5 common in Rangpur", "1 SMAP pixel ≈ 100,123 plots" (arithmetic only), "< 720 BDT (~US$6.50)".
- **Action:** attach sources before using them in judging material.

### C13 🟡 VIS file is not project-specific — ✅ resolved → 14 · C13
- Its elevation of 142.4 m and slope of 4.8° don't fit Rangpur (CORE/3D ~32 m). The file starts with a stray Markdown fence.
- **Action:** treat as an interaction reference only; don't cite its values.

### C14 🟡 Blueprint says it did not audit the code — ✅ resolved → 14 · C14
- **BP §1.1:** "project files were not re-audited for this document". Its inventory is "user-reported".
- Checked against CORE it matches: 2024 daily, 2021–2025 monthly, 2024 Landsat, one Sentinel-2 scene dated 9 Mar 2024. BP's M1 "audit the existing repository" is therefore partly done by this spec (00, 02, 04).

### C15 🟠 F18 data sources not covered by any plan — ✅ resolved → 14 · C15
- F18 names data not scheduled in BP M1–M6: drain/canal (khal) water level (#5), culvert maps (#4), pump tariff and shared-pump schedule (#11, #18), labour cost (#18), tree shade tolerance (#16), local seed availability (#14).
- **Decision needed:** whether these come from farmer entry, survey or out of scope.

### C16 🟡 "Soil Toxicity Index (STI)" — ✅ resolved → 14 · C16
- Named in DS §3 #5 and DS-H with no definition in any source.
- **Action:** define it with a source, or drop it.

### C17 🟠 Historical disaster replay values — ✅ resolved → 14 · C17
- **3D-F** replays "26 Sep 2020 433 mm record rain", "4 Oct 2023 Teesta surge", "22 Jan 2024 7.8 °C", "30 Apr 2024 39.4 °C". None is sourced.
- **CORE/DR** shows only the 2021–2025 archive and says no fabricated live measurement or forecast is included.
- **Action:** source each event (BMD/FFWC/POWER) or drop it.

## Open questions (no source answers them)

1. Which forecast provider gives the "actual short-range forecast" (BP §3.3, §7 P0)?
2. Will FFWC developer registration be done, and by whom (BP §7.1)?
3. Is reusing BARC Khamari / SRDI data permitted (BP §4.2, §7.1)?
4. What is the target deployment: offline static (CORE) or a service with authentication (CORE/M, BP §6.4)?
5. Should the Banglish IVR/SMS channel in DS-H be in scope?
6. What is in the Google Doc "18-Feature Spec Doc" (linked from 3D-F, not in the folder)? Does it supersede F18?
