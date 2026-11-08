# 01 · Product Overview

## Name and scope

- **Ropon Radar · রোপণ রাডার** — "Rangpur Field Lab" [CORE README]; "Earth Observation + Soil Intelligence" [BP title].
- **Challenge:** NASA Space Apps Challenge 2026 [DS, DS-H, 3D-R].
- **Pilot area:** Rangpur district — Mithapukur, Pirganj, Gangachara upazilas [BP, DS, CORE README]. **Final [D-C2]:** these three stay the pilot, and the 3D demo field is in Mithapukur. Burirhat (from the prototypes) appears only as a reference trial, after its DOI is verified.
- **Language:** Bengali and English, with Banglish farmer explanations [CORE README, BP reading note, F18].

## Core proposition

> Use satellite observations for regional and field-context evidence, use agronomic models for water and crop decisions, and use farmer observations or field tests when a question cannot be answered reliably from space. Never present a coarse pixel as a laboratory result. — [BP cover]

> Satellite boro elakar idea dey, kintu jomir centimeter-level pani nishkashon (drainage) ba matir nicher bhalo tothyo pete hole jomi theke shorasori map (local survey/sensor) lagbe. — [F18 Mul Kotha]

Water cost depends not only on soil but on pump rent, fuel cost and water availability (IRRI research in Rangpur, Rajshahi, Mymensingh), so the app needs pump and money accounting. [F18 Mul Kotha]

## The farmer decision it serves

"After Aman, what can this plot support before the next rice season?" … "the decision after Aman depends on time, water and what a family can afford." [CORE/JW]

## Users

| User | Role in the system | Source |
|---|---|---|
| Farmer (smallholder, ~20-decimal / 809 m² plot) | Selects field, sets priorities, compares rotations, plans planting, logs symptoms, keeps final decision | CORE README, DS §1, BP §1.3, CORE/JW |
| Extension officer (DAE) | Enters observations, reviews clinic notes, supplies nutrient targets, receives printed plans | CORE README, CORE/AG, BP §5.4 |
| Researcher | Compares rain products, cloud masks, logs ground truth (variety/yield, soil test, probe, gauge), exports CSV/JSON | CORE README "Research lab", BP §8.3 |
| Judges (demo) | 2-minute walkthrough | CORE/JW |

## Six farmer questions + seventh pillar [BP Executive summary, §3]

1. Is there enough moisture in my field?
2. Is my crop stressed by water shortage?
3. Will I need irrigation in the next few days?
4. Is groundwater declining in my area?
5. Will flood water collect in this field?
6. What crops could grow well here?
7. **Soil health & nutrient intelligence** — pH, texture, organic matter, N/P/K and other nutrients. [BP; F18 soil note]

## What the system can responsibly claim [BP Executive summary]

| Question | Highest practical output | Key missing evidence |
|---|---|---|
| Soil moisture | Regional trend + modeled field water balance; direct local readings when available | Soil hydraulic properties, irrigation log, field sensor/AWD pipe |
| Crop stress | Possible water-stress signal with competing explanations | Recent clear imagery, weather, field inspection |
| Irrigation | Conditional 3–5 day scheduling advisory | Current soil-water status and genuine forecast |
| Groundwater | Basin / nearby monitoring-well trends | Well hydrographs; no exact field aquifer level from GRACE |
| Flood / standing water | Historical exposure, short-term area hazard, scenario risk | Better DEM, drainage, river gauge, hydrologic model |
| Which crop / fertilizer | Suitability shortlist and guideline-based soil advice | Soil test, local agronomy, economics, market access |

## Differentiation [BP §9.2]

BARC Khamari-DAP already provides crop suitability and soil/fertilizer advice. Ropon Radar differentiates through a farm's **ongoing evidence history**: irrigation and soil-health logs, measured-vs-modeled clarity, verified satellite changes, disaster-recovery branching, uncertainty-aware recommendations, human expert review and an open evaluation protocol. Claim improvement only after comparison against official baseline advice and field results.

## Pitch lines (as written)

- **30-second version** [CORE/JW]: "In Rangpur, the decision after Aman depends on time, water and what a family can afford. Ropon Radar combines five years of NASA regional conditions with published local crop trials. Farmers compare complete rotations and see how many planting positions their field could hold. Extension officers can add measured yields, soil tests and gauge readings. When sensors disagree, we show the difference. When clouds hide the field, we show the gap. The farmer keeps the final decision."
- **Resolution paradox** [DS §1]: NASA SMAP 9 km → SoilGrids 250 m → farmer's plot 809 m², bridged by low-budget offline tools (50–720 BDT).
- **Honest product promise** [BP Final position]: tell a farmer what the available evidence suggests about their field, why, what uncertainty remains, and what measurement or action is needed next — "better decisions under uncertainty", not claiming satellites read every farm's nutrients, root-zone moisture, aquifer depth or future flood depth.

## Status statement

BP describes itself as a "research and architecture blueprint — not a validated forecasting system". CORE is a demonstration with frozen data (2024 daily, 2021–2025 monthly) and illustrative field outlines; it makes no live NASA call. [BP status table; CORE/M; CORE/JW]
