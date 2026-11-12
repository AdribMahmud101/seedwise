# 04 · Our models: fine-tuning report

We trained two models for SeedWise on Modal (cloud GPUs) and serve both as small web endpoints that sleep when unused. One is NASA's own open foundation model; the other is a forecasting model trained on NASA data. Here is what we did, what came out, and where we would not trust the numbers.

---

## 1. Flood model — NASA–IBM Prithvi-EO-2.0 (the NASA open model)

### Why this model
Rangpur sits on the Tista floodplain. We wanted to know, field by field, whether standing water shows up during the monsoon. NASA and IBM's **Prithvi-EO-2.0-300M-TL** is an open Earth-observation foundation model pre-trained on NASA's HLS imagery — exactly the imagery we can get for our fields — so it was the natural starting point.

### What we did
- **Task:** two classes, land and water, pixel by pixel.
- **Training data:** Sen1Floods11 v1.1, the standard hand-labelled flood dataset (Bonafilia et al. 2020): 512×512 chips from 11 flood events on 6 continents. We used the official split — 252 training, 89 validation and 90 test chips.
- **Recipe:** we followed IBM/NASA's published configuration so our result is comparable: a UperNet decoder on the Prithvi backbone, AdamW (learning rate 5e-5, weight decay 0.05), cosine schedule over 50 epochs, batch 16, random 224-pixel crops and flips, mixed precision, seed 0. Six bands: blue, green, red, narrow NIR, SWIR-1, SWIR-2.
- **Compute:** one NVIDIA A10G, about 9 GPU-minutes. Cost was well under one dollar.
- It ran all 50 epochs without stopping early; the best validation mIoU was 0.898.

### Results (official test set, 90 chips the model never saw during training)

| Metric | Our model | Published Prithvi-EO-2.0-300M-TL |
|---|---|---|
| Water IoU | **82.0** | 82.6 ± 0.3 |
| Mean IoU | **89.7** | 90.0 ± 0.2 |
| Land IoU | 97.3 | – |
| Water F1 | 90.1 | – |
| Pixel accuracy | 97.6 | – |

We land about half a point below the paper, which is within the spread they report (they averaged several runs and resized chips; we used one run on full chips). In short: our training matches the reference.

### Checking it on our own region
There are no water labels for Rangpur, so we tested where we *know* there is water: the Teesta river at Kaunia. Our model and IBM's own published checkpoint, run on the same HLS scenes, agreed closely — water covered 8.4% vs 8.1% of the window — and both traced the river channel. HLS's built-in rule-based water flag marked much more (it also catches sand bars and muddy shallows), which tells us our model is conservative with small or turbid water.

### What it says about the three fields
We ran it on every HLS scene from June to October in 2024 and 2025. Most monsoon scenes are cloudy and were skipped (each with the reason recorded) — only **23 of 201** were clear. On those clear days, **no standing water was seen within 300 m** of any of the three fields. Across those scenes the model and HLS's own water flag agreed within about 2 percentage points except one day.

### Where we would be careful
- **Clouds:** an optical model can't see through monsoon cloud, so the worst flood days are the ones we are most likely to miss.
- **Domain shift:** trained on Sentinel-2 top-of-atmosphere chips, applied to HLS surface reflectance.
- **Resolution:** 30 m pixels; many Rangpur plots are under half a hectare, so small ponds and channels can be missed.
- **No local labels:** accuracy on these exact fields is not validated. That is why the app shows the flood signal as *advisory* and points to official warnings (BMD, FFWC).

Endpoint: `adribmahmud101--ropon-flood-flood.us-east.modal.run?field=<id>`. Full model card: `docs/models/prithvi-flood-MODEL_CARD.md`.

---

## 2. Seasonal outlook — Chronos-Bolt trained on NASA POWER

> Chronos-Bolt is Amazon's open time-series model, not a NASA model. What makes it a NASA product in SeedWise is the data: 45 years of NASA POWER for the Rangpur grid.

### Why
Farmers decide in November what to sow for the dry season. A 1–3 month outlook for rain, soil wetness, temperature and crop water demand helps — but only if it is actually better than "what usually happens in this month".

### What we did
- **Data:** NASA POWER monthly values from **1981 to 2025** for the Rangpur grid and our three fields, topped up with daily data to the latest complete month (October 2026).
- **Variables:** rainfall, root-zone soil wetness, air temperature, and reference evapotranspiration (crop water demand).
- **Models compared:** Chronos-Bolt (small) **fine-tuned** (1,500 steps, learning rate 1e-4), Chronos-Bolt **as released** (zero-shot), and two simple baselines (last year's same month, and the long-term same-month average).
- **Fair test:** we trained only on data up to the end of **2018**, then forecast forward from **81 monthly starting points (Jan 2019 to Sep 2025)** that the models never saw — 1, 2 and 3 months ahead.
- **Score:** skill = 1 − (model error ÷ seasonal-average error). Above 0 means better than "the usual for this month".
- **Compute:** one A10G on Modal.

### Results (skill vs the seasonal average, 1 / 2 / 3 months ahead)

| Variable | Fine-tuned | As released | Shipped |
|---|---|---|---|
| Rainfall | **0.27 / 0.28 / 0.27** | 0.24 / 0.28 / 0.27 | fine-tuned |
| Root-zone soil wetness | 0.64 / 0.61 / 0.60 | **0.68 / 0.60 / 0.61** | as released |
| Crop water demand (ETo) | 0.05 / 0.12 / 0.15 | **0.18 / 0.21 / 0.19** | as released |
| Temperature | 0.07 / 0.02 / −0.10 | **0.11 / 0.06 / 0.04** | as released |

What we learned, honestly: **fine-tuning helped rainfall a little and did not help the rest.** The released model was already good on smooth signals like soil wetness. So instead of forcing our fine-tune everywhere, the system **picks the better model per variable** — and every variable we ship beats the seasonal average at all three horizons. Soil wetness is the strongest (about 60–68% lower error than the seasonal average); temperature is the weakest (only slightly better), which the app reflects in its strength meters.

### How it is shown
The outlook runs Nov 2026 → Jan 2027 with a likely range (10th–90th percentile), clamped to physical limits. It is labelled *experimental*. In Today's analytics, for example, November root-zone soil is forecast **19% drier than normal**, which turns the status amber with the advice "plan irrigation and mulch before sowing".

Endpoint: `adribmahmud101--ropon-outlook-outlook.us-east.modal.run?site=<mithapukur|pirganj|gangachara>`. Code: `ml/outlook/outlook.py`; backtest: `ml/outlook/out/backtest.json`.

---

## 3. Models we use but did not train
- **Meta SAM 3.1** — segments leaves and damaged areas in clinic photos (concept prompts such as "diseased spot", "disease lesion").
- **Muse Ember / Muse Spark** (Meta) — Planty's language and vision reasoning, always grounded in our data files and validated in code (see 03).
