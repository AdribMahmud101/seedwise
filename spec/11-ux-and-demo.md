# 11 · UX Guidelines and Demo

> Build rules for any UI work live in **[15-ui-ux-spec.md](15-ui-ux-spec.md)**. This file keeps the source material and the demo script.

## 1. Farmer interface principles [F18 "Krishi App Ti Kemon Hobe"]

- **Five simple views:** Amar Jomi (My field), Pani (Water), Mati (Soil), Foshol (Crops), Recovery. Only one thing on screen at a time.
- **Action cards:** give direct advice instead of complex science, e.g. "Aajke aal check korun", "Pani jome ache, nala khulun". (3D-F shows a "Today's Advice" bar: "Low SE corner collects rain first — check bund outlet before heavy rain.")
- **Truth labels on every value:** Measured · Estimated · Scenario · Unknown (see 08 §1).
- **Local units:** bigha, katha, shotok (decimal), acre, plus hectare. 3D-F uses 1 bigha = 33 shotok.
- **Phone-friendly:** big buttons, works offline/cached, can share an image when no printer is available.
- **Demo advice:** keep the satellite overview for all of Rangpur, but demo one specific real field with accurate bund, drain, soil and pump maps.

## 2. Language [CORE, BP]

- Full EN/BN toggle on every view (`t(en, bn)`); Bengali font Noto Sans Bengali. [CORE]
- Farmer-facing explanation in Banglish where helpful. [BP reading note]
- Prototype bilingual labels follow the pattern "English (বাংলা)". [3D-F]

## 3. Banglish message templates [BP §9.4]

| Topic | Message |
|---|---|
| Moisture | "Apnar elakay mati-r upor-er layer-e shukna trend dekha jacche. Kintu apnar jomi-r exact moisture satellite diye measure kora hoyni. Field-e pani/soil check korun." |
| Crop stress | "Gach-er greenness/temperature change hoyeche. Pani-r obhab hote pare, kintu rog ba nutrient deficiency-o hote pare. Ei 3 ta symptom check korun." |
| Soil fertility | "Ei elakar soil map-e pH-er ekta estimate ache, kintu apnar exact jomi-r phosphorus/potassium jana nei. Soil test korle better fertilizer advice deya jabe." |
| Flood | "Official FFWC alert ache. Ekhuni local authority-r guidance follow korun. Ropon Radar-er historical map kono personal safety guarantee na." |

DS-H also gives an IVR/SMS example with exact doses. It is not used: IVR/SMS is out of scope [D-Q5], and doses follow the tiered rule [D-C1]. Moisture wording always says "wetness index (0–1), regional", never % [D-C6].

## 4. Visual identity [CORE/CR, CORE `layout.js`]

- The original Ropon Radar colour and type direction is retained: Fraunces (display), IBM Plex Sans/Mono, Noto Sans Bengali. Theme colour `#233d2b`.
- The brand mark is `assets/mark.svg`; the wordmark is "রোপণ".
- The prototypes use a different stack (Inter, JetBrains Mono, Newsreader via Google Fonts). The CORE identity is the one that ships.

## 5. 3D interaction patterns (from prototypes) [3D-F, 3D-R, VIS]

- Orbit (drag), zoom (scroll), click to probe a point (lat/lon, elevation, ponding, NDVI).
- Surface overlays: natural crop + Sentinel-2 true colour · NASADEM elevation rainbow + contours · water logging + Sentinel-1 water · Sentinel-2 NDVI vigour · SMAP/POWER surface moisture · soil fertility NPK heatmap.
- Views: 3D block · root slice · top 2D. A movable cutaway slice (%) and vertical relief scale (2–2.5×).
- A–A′ transect chart that can be rotated.
- Disclaimer chip: "REAL SATELLITE + ILLUSTRATIVE 3D MODEL — CHECK LOCAL SURVEY"; "Terrain & root depth exaggerated for 3D illustration".
- Wireframe grid, boundary and swales toggles, reset camera. [VIS]
- **Final placement [D-C4]:** these patterns live in the "3D view" toggle of `#field` (terrain, slope, transect) and `#water` (drainage, cutaway), using the CORE visual identity and a Mithapukur demo field [D-C2]. Every 3D value carries its provenance label; illustrative geometry is tagged `SCENARIO` [D-C5, D-C7].

## 6. Judging walkthrough — 2 minutes [CORE/JW]

| Time | Action | Narration |
|---|---|---|
| 0:00–0:15 | My field → Mithapukur | "After Aman, what can this plot support before the next rice season? The outline is illustrative. The image underneath is a dated acquisition. Redrawing the boundary changes the planting area." |
| 0:15–0:30 | Past seasons → change year and month | "Here are five years of regional rain, wetness and temperature. Clouds hide some 2024 vegetation samples completely. The missing months remain visible." |
| 0:30–0:52 | Rotation studio → priorities → constraints | "Compare the familiar rice sequence with mustard, potato and a pulse option. Set a low budget and the potato stage needs review. Each card shows the evidence and a practical check." |
| 0:52–1:08 | Save rotation → Plan planting | "Reserve room for paths or a tree border. The count updates in rice hills, planting positions or seed weight. The harvest illustration keeps its trial reference." |
| 1:08–1:26 | Crop clinic → rice → pointed leaf spots | "Describe the damage. The clinic suggests what to inspect and saves a note for an officer. A photo can accompany it. A separate calculator converts a lab's nutrient target into fertilizer quantities." |
| 1:26–1:43 | Research lab → Sensor QA → July acquisition | "At Mithapukur the two rain products differ by 1.47 mm per day on average in 2024. July's optical window lost all usable samples. An independent gauge can establish a local reference." |
| 1:43–1:55 | Water & resilience → flood scenario | "A hypothetical delay feeds back into rotation eligibility. Drainage and aftercare guide tree choices. Groundwater balance needs an independent recharge estimate." |
| 1:55–2:00 | Printable field plan | "The farmer leaves with a plan, its assumptions and the next field checks." |

**Disaster-recovery extension (45 s):** Drought example → February assessment fits mungbean, window shortened to free the field by 5 May. Fire example → the contamination check holds food-crop planting. Flood example → September Aman needs already-raised photoperiod-sensitive seedlings; show the timing evidence and wetland-border tree guidance; save and preview the plan. [CORE/JW]

## 7. Presentation checklist [DS §5]

- Offline independence: farmers can test pH and nitrogen with kits under 720 BDT.
- Complements satellite coarseness: SMAP (9 km) gives the regional trend; local inputs give plot-level precision for 20-decimal farms.
- Real-world feasibility: existing Bangladeshi open data (BARC Khamari, SRDI, NASA POWER) plus local field practice in Rangpur.
