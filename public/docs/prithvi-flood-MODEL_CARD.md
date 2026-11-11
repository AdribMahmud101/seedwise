# ropon-flood · Prithvi-EO-2.0-300M-TL fine-tuned for surface water (Sen1Floods11)

**What it is.** A 2-class (land / water) segmentation model: the NASA–IBM foundation model
[Prithvi-EO-2.0-300M-TL](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M-TL) (ViT-L, pretrained on NASA HLS)
with a UperNet decoder, fine-tuned by us on Modal. Code: `../flood.py` (Modal app `ropon-flood`).

## Data
- **Training:** Sen1Floods11 v1.1 hand-labelled Sentinel-2 chips (Bonafilia et al. 2020; `gs://sen1floods11`), 512×512 px at 10 m,
  11 flood events, 6 continents. Official `flood_handlabeled` split: train 252 / valid 89 / test 90 chips (Bolivia 15 not used).
- **Inputs:** 6 bands BLUE, GREEN, RED, NIR_NARROW, SWIR_1, SWIR_2, ×0.0001, then Sen1Floods11 mean/std normalisation (TerraTorch).
  Labels: 0 land, 1 water, -1 no data/cloud (ignored).

## Training
- Follows IBM/NASA's published recipe (`ibm-nasa-geospatial/Prithvi-EO-2.0-300M-TL-Sen1Floods11/config.yaml`): AdamW lr 5e-5,
  weight decay 0.05, cosine schedule over 50 epochs, batch 16, random 224 px crops + flips, CE loss, 16-bit mixed precision, seed 0.
- Early stopping on val loss (patience 10) and best checkpoint by val mIoU. It ran all 50 epochs and never stopped early. Best val mIoU was 0.898.
- TerraTorch 1.2.14, torch 2.8.0, lightning 2.6.6, torchgeo 0.10.1, albumentations 2.0.8, timm 1.0.31, Python 3.12.
- One NVIDIA A10G, about 8.6 GPU-minutes (about $0.16).

## Test scores (official test split, 90 chips, never used for model selection)

| Metric | Ours (1 seed) | Published Prithvi-EO-2.0-300M-TL* |
|---|---|---|
| IoU water | **82.0** | 82.6 ± 0.3 |
| IoU land | 97.3 | – |
| mIoU | **89.7** | 90.0 ± 0.2 |
| F1 water | 90.1 | – |
| F1 macro | 94.4 | "mF1" 97.7 (not directly comparable, see below) |
| Pixel accuracy | 97.6 | – |

\* Szwarcman et al. 2024, *Prithvi-EO-2.0*, arXiv:2412.02732, Table IV. The paper resized chips to 448 px and reports the mean over several runs.
We use full 512 px chips and one seed. The paper's mF1 does not match a macro F1 computed from its own IoUs, so it is probably a
different averaging. Our F1 values come from torchmetrics' macro F1 and from the identity F1 = 2·IoU/(1+IoU).
Our result is about 0.5 points below the published one, which is within roughly 2 published standard deviations.

## How it is used in Ropon Radar (`flood-fields.json`)
NASA HLS v2.0 (S30 Sentinel-2 and L30 Landsat, surface reflectance, 30 m) from Microsoft Planetary Computer, Jun–Oct 2024 and 2025.
For each field we read a 224×224 px (6.7 km) window centred on the field centroid, run the model, and report water fraction over
clear pixels in a 2 km box and in a 300 m radius. Clear means HLS Fmask bits 0–3 (cirrus, cloud, adjacent, shadow) are not set.
A scene is skipped, with the reason recorded, if more than 30% of the box is cloud or shadow, or more than 50% of it has no data.
When two MGRS tiles overlap, we keep one per date and sensor. HLS's own rule-based Fmask water flag is also reported as an
independent cross-check.

## Check on HLS (positive control, `teesta-positive-control.png`)
There are no water labels for Rangpur, so we ran the model on a window around the Teesta at Kaunia (25.775N 89.435E), where water
is certainly present. We used HLS S30 2025-10-22 and L30 2024-11-19, and also ran IBM's published Sen1Floods11 checkpoint on the
same inputs.
- **Our model and IBM's checkpoint agree:** water covers 8.4% vs 8.1% of the window (S30) and 0.9% vs 0.7% (L30). Both masks
  trace the visible river channel, which suggests our training and preprocessing match the reference.
- **HLS Fmask water** flags 25% (S30) and 18% (L30), with blocky edges, and includes sand bars (chars) and turbid shallows.
  No ground truth decides between them. Assume the model under-detects small, shallow or turbid water.
- **Across the 23 usable field scenes,** model and Fmask agree within about 2 percentage points except Mithapukur 2024-08-16
  (model 0%, Fmask 4.5% of the box).

## Limitations (read before quoting a number)
1. **Domain shift:** fine-tuned on Sentinel-2 **L1C top-of-atmosphere** chips but applied to HLS **surface reflectance**. The backbone
   was pretrained on HLS, but the head saw TOA. We have no labelled Bangladesh data, so accuracy on these fields is **not validated**.
2. **Resolution:** 30 m HLS pixels (training was 10 m). Fields in Rangpur are often < 0.5 ha (under 6 pixels). Narrow channels, ponds
   and flooded plots below about 1 pixel are missed or mixed. The 300 m buffer holds about 300 pixels.
3. **Clouds:** this is an optical model. In the monsoon most scenes are cloudy and get skipped, so peak flood days are under-sampled.
   Low water fractions in clear scenes do not prove there was no flooding on cloudy days. SAR (Sentinel-1) would be needed for that.
4. **Water ≠ flood:** the model maps all surface water, including ponds, rivers, beels and flooded/transplanted Aman paddy.
   It does not separate floodwater from permanent water or irrigation.
5. **Locations:** results use field centroids, not surveyed polygons.
6. **Test set:** Sen1Floods11 is global. South Asia is well represented: 29 of 90 test chips are from India, Pakistan or Sri Lanka,
   but there are no Bangladesh chips. The test IoU is a benchmark score on chips from the same flood events as training, not a
   Rangpur validation.

