# 03 · NASA data, external data, and how the AI uses them

## The idea in one line
NASA data tells us **what the land and the weather are doing**; agricultural research tells us **what farmers can do about it**; our models and Planty **turn both into one decision for one field** — and every number keeps its source.

## NASA data we use

| NASA product | What we take from it | Where it shows |
|---|---|---|
| **HLS v2.0** (Harmonized Landsat Sentinel-2, 30 m) | Monsoon scenes 2024–2025 over each field, the input to our flood model | Daily brief, plan pipeline, Past seasons water check, Today's analytics |
| **Prithvi-EO-2.0-300M-TL** (NASA–IBM open foundation model) | Fine-tuned by us for land/water segmentation | Flood signal everywhere above |
| **POWER / MERRA-2** | Monthly temperature, rain, humidity, solar radiation, soil wetness, 1981–2025, for the Rangpur grid | Forecast model training data, historical observations, crop water use |
| **POWER soil wetness** (surface and root zone) | Soil wetness history and forecast target | Past seasons, Today's analytics (dry soil) |
| **FAO-56 reference ET from POWER** | Crop water demand (ETo × crop coefficient) | Water use, rotation water scores, plan numbers |
| **GPM IMERG** (0.1° rainfall) | Monthly rainfall 2021–2025 | Past seasons charts, year-by-year comparison, historical observations |
| **SMAP L4** soil moisture | Surface/root-zone moisture context | Field observations, plan pipeline "water" step |
| **GRACE / GRACE-FO** mascons (JPL RL06.3) | Groundwater storage anomaly | Plan pipeline water resilience step |
| **NASADEM** | Elevation → low ground (where water collects) | Low-ground map layer, 3D terrain |
| **Landsat Collection 2 Level 2** (NASA/USGS) | Surface reflectance and quality bands | Field imagery and greenness |

Every value from these sources wears a **NASA badge**; tapping it shows the product, resolution and date. We never badge non-NASA data.

## How we use the data efficiently
- **Prepare once, serve fast.** Heavy processing (HLS scenes, POWER history, IMERG, GRACE) is done ahead of time and stored as small JSON files per field. Pages load instantly and keep working offline.
- **Run the models once a day, not per click.** A scheduled Cloudflare job at **06:00 Bangladesh time** calls our two models on Modal for the three fields and stores the result (Workers KV, 48 h). Every page and notification reads that one daily brief. If the models are down, it falls back to the shipped files and says so.
- **Right scale, stated honestly.** Each card says its spatial support (e.g. "regional 50 km cell, not your field"). Field-level numbers (area, spacing, plant counts) come from the farmer's own boundary.
- **Quality first.** Cloudy satellite scenes are skipped with the reason recorded (only 23 of 201 monsoon scenes were clear); forecasts ship only for variables where the model beat the seasonal average in the backtest.

## External (non-NASA) data we combine
- **Agronomy research** (`agronomy.json`): Rangpur crops, durations, sowing windows, research spacing, rotation evidence — each with a source id (BRRI, BARI, DAE and peer-reviewed papers).
- **Disaster-tolerant varieties** (`tolerant-varieties.json`): 24 varieties (e.g. BRRI dhan51 submergence-tolerant up to 14 days, BRRI dhan55 salt/drought/cold) with official sources and honest labels (*official trait*, *requires local validation*, *seed stock unverified*).
- **Crop disease reference** (`crop-diseases.json`): 13 diseases across rice, potato, wheat, maize, mustard, lentil, mungbean, jute, tomato, chilli, mango and banana — symptoms, look-alikes, triggers, integrated pest management, sources.
- **Sentinel-2 (ESA Copernicus)** imagery and **OpenStreetMap** context lines; **Maxar/Esri** high-detail photo (online only, never cached).
- **Emergency contacts** with official sources (999, Fire Service 102, Krishi Call Center 16123).

## Feeding the AI: determinism where it matters, creativity where it helps

**Deterministic (no AI):** areas, plant counts, spacing maths, water demand, rotation scores, the flood fraction, the forecast numbers, and the status rules in Today's analytics. These are plain code with unit tests — the same input always gives the same output.

**AI (Muse models via Meta's API, through our Worker):** the parts that need judgement and language —
- the crop decision helper and plan re-check (verdict, calendar, reasons, risks),
- the daily **refinement suggestion**,
- Planty's report summary and chat,
- the clinic diagnosis (with **SAM 3.1** doing the segmentation).

How we keep the AI grounded:
1. **We feed it facts, not the open web:** the field context (area, outlook line, flood line), the saved plan, our research files and the tolerant-variety shortlist.
2. **Strict rules in the prompt:** never invent measurements, yields, prices or chemical doses; cite only the supplied source ids; be honest when a crop won't work.
3. **Structured output, validated in code:** answers must be JSON in a fixed shape; unknown source ids, out-of-range confidence, unknown disease ids or chemical doses are dropped; invalid answers are rejected rather than shown.
4. **Low temperature** (0.1–0.25) for consistency, with room for natural, friendly wording.
5. **Human in the loop:** suggestions are proposals — the farmer approves (with Undo); the clinic says "this is a guide, not a lab diagnosis" and points to DAE 16123.
6. **Labels:** AI text is labelled as AI; modelled numbers carry *Modelled/Estimated* tags; forecasts are marked experimental.

**Creativity** is used for explanation and options: friendly Bangla/English/Banglish answers, follow-up questions, trade-offs in farmer terms (water, flood risk, labour, timing), and proposing a better crop or variety — always tied back to a cited source.
