# 08 · Evidence, Safety and Privacy Rules

These rules apply to every view and every fleet task.

## 1. Provenance / evidence labels

### Final canonical labels [D-C5]

**Schema enum** (stored with every value, alongside units, spatial support, acquisition time and ingest time):

| Tag | Meaning | Farmer label |
|---|---|---|
| `MEASURED` | Probe, lab assay, gauge, observation well, verified field reading | ✓ Measured (জমি থেকে মাপা) |
| `FARMER_REPORTED` | Entered by a farmer or officer, unverified | ✓ Measured + "farmer" sub-badge |
| `REMOTE_OBSERVED` | Satellite reflectance, backscatter, thermal, etc. | ◈ Estimated (স্যাটেলাইট অনুমান) |
| `MODELED` | ET, water balance, NDVI-derived, reanalysis, suitability score | ◈ Estimated |
| `SCENARIO` | User-set hypothetical or illustrative value | ⬡ Scenario (কাল্পনিক পরিকল্পনা) |
| `UNKNOWN` | No evidence | ⊘ Unknown (অজানা — তথ্য দিন) |

- **Review status** is a separate field: `farmer` → `extension` → `lab` [CORE/AG].
- A **recommendation** is an *output type* under the decision output contract (§2), never a data tag.
- DS's "fusion" badge is expressed as the set of input tags behind an output (shown in the audit trace).

### Source vocabularies (superseded, kept for traceability)

| Source | Labels |
|---|---|
| BP §1.2 (evidence types) | **MEASURED** (probe, tensiometer, lab assay, observation well, river gauge, farmer water-level reading) · **OBSERVED REMOTELY** (brightness temperature, backscatter, reflectance, thermal, height, laser) · **MODELED / DERIVED** (soil-water estimate, ET, NDVI, flood hazard, inferred groundwater, suitability score) · **RECOMMENDED** (action from measurements + models + rules; must state assumptions) |
| BP §4.4 (soil UI) | LAB-MEASURED · FARMER-REPORTED · REGIONAL-MODELED · UNKNOWN, plus date, depth, method, map pixel size and uncertainty |
| F18 / 3D-F (farmer UI) | ✓ Measured (জমি থেকে মাপা) · ◈ Estimated (স্যাটেলাইট অনুমান) · ⬡ Scenario (কাল্পনিক পরিকল্পনা) · ⊘ Unknown (অজানা — তথ্য দিন) |
| DS §4 | Fusion badge `[MEASURED + MODELED FUSION]` / `[FUSION CALIBRATED]` |

CORE status-separation rule: farmer observation, extension review and laboratory confirmation are distinct statuses. [CORE/AG]

## 2. Decision output contract [BP §6.3]

Every farmer-facing answer must include:
- (a) the question and its crop/field scope
- (b) answer type: measured / estimated / uncertain
- (c) source data, latest observation timestamp and spatial footprint
- (d) confidence tier and why
- (e) a concrete safe next step
- (f) limitations and possible alternative explanations
- (g) a review contact or source link

A map overlay and a numeric value alone are insufficient.

## 3. Never-do rules (guardrails)

**Data honesty**
- Never present a coarse pixel as a lab result or as "field-level precision". [BP cover, §1.3]
- Never synthesize missing flags, confidence bands, surface-moisture values or local sensor readings. Missing stays null / UNKNOWN. [CORE/AG; CORE/M]
- Never use an old observation to justify a present-tense "your field is dry today". Archive data is never labelled live. [BP §2.4, §7]
- GWETTOP/GWETROOT (index) ≠ SMAP SFMC/RZMC (m³/m³). 0.30 in each means different things. [BP §1.2]
- Don't paint fake wet/dry colours inside a small field from a regional cell. [F18 #7; 3D-F "no fake sub-parcel color"]
- Keep processing version and latency (IMERG Early/Late/Final). [BP §2.4]
- NISAR 3–10 m imagery is not 3–10 m moisture retrieval. [BP §2.3]
- A satellite cannot measure plant-available N, P or K. Modeled SoilGrids N is total N, not available N. Missing P/K → "needs soil test", never a value inferred from greenness. [BP §4.1, §4.4]
- NDVI alone is not a disease or nutrient test. [BP §3.2]
- Selecting Rangpur alone cannot assign AEZ-3. Study soil context must not prefill a field's soil-test form. [CORE/AG]
- No "97.8% optimal crop" false precision. [BP §4.4]
- Don't add tonnes of different crops. Don't carry historical prices into current profitability. [CORE/AG]

**Agronomic advice**
- No precise litre amount or definite irrigation schedule without field calibration. [BP §3.3]
- No default fertilizer application target. Convert only a lab or officer target, with elemental labels. [CORE/AG]
- Field-kit readings follow the **tiered advisory rule** (05): check-and-act → official-table number labelled "Regional guideline — not site-tested" → lab/officer target. No irrigation mm amounts and no unsourced lime dose. [D-C1]
- Wetness indices are shown as "index 0–1, regional", never as %. [D-C6]
- No prototype number ships unless it is recomputed with a documented formula, cited, or labelled `SCENARIO`. [D-C7]
- The AEZ is user-selected context until an SRDI/BARC mapping is sourced; no hard-coded upazila → AEZ table. [D-C9]
- No autonomous pesticide dosing. Archived chemical prescriptions are not turned into spray instructions. Refer severe or uncertain cases to DAE and official IPM labels. [BP §5.4; CORE/AG]
- No "AI diagnosed", no confidence %, and no treatment selected from a photo. [CORE/AG]
- Trial yields are not guaranteed field yields. [BP §3.6]

**Safety**
- An official FFWC warning outranks model reassurance. Never say "safe to stay". [BP §8.2]
- During a flood, prioritize personal safety and official guidance. No field-specific evacuation maps from satellite risk alone. [BP §5.2]
- Fire: direct users to emergency services and safe evacuation, never to fighting a dangerous fire. FIRMS can miss small fires, so never state "no hotspot means safe". [BP §5.3, §7]
- Emergency contacts shown in the prototype: 999, Krishi Call Centre 16123, FFWC Teesta bulletin. [3D-F, 3D-R] No emergency number is called during UI testing. [CORE/DR]
- A user-entered "qualified clearance" is an assertion, not a Ropon Radar certification. [CORE/DR]
- Worked examples must be conspicuously labelled fictional, in the UI and in exports. [CORE/DR; CORE/JW]

**Positioning**
- The tool supports, and does not replace, farmer judgment and local extension advice. [3D-R notice; CORE/JW "The farmer keeps the final decision"]

## 4. Privacy and consent [BP §6.4, CORE/AG, CORE/M]

- Farm boundaries, coordinates, soil tests and photos may reveal sensitive property or economic information.
- Require explicit consent for scientific reuse. Aggregate data for public dashboards. Use role-based access for researcher and extension workflows.
- An administrative boundary is never land-ownership documentation.
- Current build: records and photos stay in the browser, and export is deliberate (CSV/JSON). A deployed research service would require authenticated review and independent outcome validation.
