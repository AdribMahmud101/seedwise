# SeedWise: from NASA orbit to one decision for one field

SeedWise turns NASA Earth data into one decision for one small farm field: what to plant, when, and how. It is a bilingual (Bangla and English), mobile-first web app that works offline, piloted on three real fields in Rangpur, Bangladesh (Mithapukur, Pirganj and Gangachara).

**NASA Space Apps Challenge 2026 · Field Shift: Adapting Farms with NASA Data · Team Kothinn**

- **Live app:** https://seedwise.onefusionlab.systems
- **Every dataset and tool used, with links:** https://seedwise.onefusionlab.systems/data ([`docs/data-used.md`](docs/data-used.md))

## What SeedWise does

- **3D Field Studio:** pick your field on the map, or open one of the three pilot farms, and see it in 3D with terrain, soil layers and soil moisture.
- **Planty Plans (crop rotation):** recommends which crops to grow across the year and when to sow them. Sliders let farmers weight water saving, income, low risk or low labour.
- **Weather:** a 7-day forecast for the field with spray, irrigation and heat tips, plus the last 10 days observed by NASA POWER and a 3-month outlook from our model.
- **Flood and drought briefs:** a daily plain-language brief built at 06:00 from our two models and satellite soil-water and rain data, with early warning signs and links to official alerts (FFWC, BMD).
- **Connected season calendar:** the chosen plan becomes a calendar of sowing, growing and harvest days with weekly tasks, linked to the field's daily risk.
- **AI crop clinic:** snap a photo of a sick leaf to get likely pests or diseases and recovery steps, with sources.
- **Disaster recovery:** step-by-step flood, drought and fire recovery, tolerant varieties, and one-tap emergency numbers.

## Views

| # | Route | English | বাংলা | Module |
|---|---|---|---|---|
| 01 | `#field` (default) | My field | আমার জমি | `fields.js` (crop clinic opens from here) |
| 02 | `#rotations` | Rotation studio | ফসলচক্র বাছাই | `rotations.js`, `studio3d.js` |
| 03 | `#planner` | Planting planner | বপনের পরিকল্পনা | `planner.js` |
| 04 | `#plans` | My plans | আমার পরিকল্পনা | `plans.js`, `plan.js` |
| 05 | `#calendar` | Calendar | ক্যালেন্ডার | `calendar.js` |
| 06 | `#weather` | Weather | আবহাওয়া | `weather.js` |
| 07 | `#seasons` | Past seasons | পুরনো মৌসুম | `fields.js` → `seasonView` |
| 08 | `#recovery` | Disaster recovery | দুর্যোগের পর করণীয় | `recovery.js` |

Hidden from the menu but reachable by URL: `#water` (Water & resilience) and `#research` (Research lab).

## NASA data used

| NASA data | Used for |
|---|---|
| NASA POWER (daily, monthly; soil wetness; ETo) | Field weather 1981–now, crop water need, training data for our outlook model |
| GPM IMERG | Monthly rainfall per field |
| SMAP L4 soil moisture | Surface and root-zone soil moisture |
| HLS v2.0 (Harmonized Landsat Sentinel-2) | Scenes our flood model reads for each field |
| NASA–IBM Prithvi-EO-2.0 | Foundation model we fine-tuned for flood mapping |
| GRACE / GRACE-FO mascons | Groundwater trend |
| NASADEM | Low ground and 3D terrain |
| Landsat 8/9 Collection 2 | Field imagery and cloud masks |

Every NASA value in the app carries a NASA badge with its product, resolution and date.

## Our two models

1. **Flood mapper:** Prithvi-EO-2.0-300M-TL fine-tuned on Sen1Floods11. Test set: water IoU 82.0, mIoU 89.7 (published model: 82.6 / 90.0). Runs on NASA HLS scenes over each field. Model card: [`docs/models/prithvi-flood-MODEL_CARD.md`](docs/models/prithvi-flood-MODEL_CARD.md).
2. **Season outlook:** Chronos-Bolt fine-tuned on NASA POWER 1981–2025, backtested on 81 unseen start months (2019–2025). For each variable we ship whichever version (fine-tuned or base) tested best; every shipped variable beats the seasonal average 1–3 months ahead.

Both run on Modal GPUs and feed the 06:00 daily analytics.

## Honesty

- Modelled and estimated numbers are labelled as such in the app.
- Cloudy satellite scenes are skipped with a reason (23 of 201 monsoon scenes were clear).
- The flood signal is advisory; official warnings come from FFWC and BMD.
- Missing data is shown as unknown, never filled in.

## Use of Super Intelligence (SI)

- **Inside the app:** Prithvi-EO-2.0 and Chronos-Bolt (fine-tuned by the team), Meta SAM 3.1 (finds the leaf in clinic photos) and Meta Muse models (Planty chat, crop advice and clinic answers, grounded in our cited sources).
- **Building the project:** AI coding assistants (Claude Code, OpenAI Codex, Google Antigravity, Mistral Vibe) helped write, test and debug code; Claude helped with research, writing and Bangla translation. The team directed, reviewed and approved all work.
- **Demo video:** motion graphics coded with SI assistance (Claude) and one short Google Flow (Veo 3) clip, both marked on screen. The voiceover is a real human voice.

## Quick start

Next.js (App Router) project that exports a static, offline-capable site.

```sh
npm ci           # install locked dependencies
npm run dev      # development server at http://localhost:3000
npm test         # run tests (Node 20 or newer)
npm run build    # static export to out/ plus offline service worker
npm start        # serve out/ with Python
npm run deploy   # build, then deploy to Cloudflare Workers
```

The app modules live in `src/legacy/` and are mounted by `app/AppLoader.js`. Pages use hash routes: `#field`, `#rotations`, `#planner`, `#plans`, `#calendar`, `#weather`, `#seasons`, `#recovery`. The Cloudflare Worker (`worker/index.js`) serves the API and builds the daily brief.

## Repository layout

| Path | Contents |
|---|---|
| `app/` | Next.js entry points and styles |
| `src/legacy/` | App modules (field, rotation, planner, calendar, weather, clinic, recovery) |
| `worker/` | Cloudflare Worker: API, Planty, clinic and the 06:00 daily job |
| `public/` | Maps, fonts and data served by the app |
| `data-raw/` | Frozen source responses |
| `scripts/` | Data fetching and offline build scripts |
| `tests/` | Tests run by `npm test` |
| `docs/` | Methods, data list, credits, model card |
| `spec/` | Design specification |

## Team Kothinn

Towfiqur Rahman Tonmoy, Maimona Islam, Wadrib Mahmud, Mehedi Hasan Tayef, Sabbir Bhuiyan, Mohammad Sobuj.

## Licence and credits

Code licensed under [Apache-2.0](LICENSE). Data and software credits: [`docs/credits.md`](docs/credits.md) and [`docs/data-used.md`](docs/data-used.md). Imagery © Esri, Maxar, Earthstar Geographics.
