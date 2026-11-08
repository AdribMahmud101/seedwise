# Ropon Radar · Rangpur Field Lab

A Bengali and English field-planning demo for Mithapukur, Pirganj and Gangachara. It combines dated Earth observations, local crop trials, farmer priorities and observations entered by farmers or extension officers.

## Open the demo

The app is a Next.js (App Router) project that exports a static, offline-capable site.

```sh
npm install
npm run dev      # development server at http://localhost:3000
npm run build    # static export to out/ and offline service worker
npm start        # serve out/ with Python (py serve.py on Windows)
```

All maps, fonts and data are included in `public/`. The workspace modules live in `src/legacy/` and are mounted by `app/AppLoader.js`; pages use hash routes such as `#rotations`.

## Farmer journey

1. In **My field**, search an upazila or coordinates. Compare dated Sentinel-2 and Landsat images, draw a boundary, or enter corners. The coordinate editor can measure a plot outside prepared coverage and export its GeoJSON.
2. In **Past seasons**, compare a month in 2021–2025 with the same month in the other four years. Inspect dated vegetation samples and cloudy gaps during 2024.
3. In **Rotation studio**, set water, soil, cost and risk priorities. Compare four whole rotations, inspect the score breakdown, set irrigation and budget constraints, and save a plan.
4. Choose **Plan planting** to adjust usable area and spacing. Rotate the field, switch to an overhead layout, and open a printable field report.
5. In **Crop clinic**, select visible signs, attach a photo, and save a note. The fertilizer calculator accepts net elemental nutrient targets from a lab or officer.
6. In **Water & resilience**, inspect BARC AEZ-3 soil classes and test a pumping scenario.
7. In **Disaster recovery**, choose drought, flood or fire and a recovery stage. Check ground, surviving crops, water and contamination before exploring sowing windows. Try the clearly marked examples, save or print a plan, or carry a crop to the planting-material calculator. See `docs/disaster-recovery.md`.
8. In **Research lab**, compare paired rain products and actual cloud masks. Log a variety and yield, soil test, probe reading, or rain gauge total. Export observations deliberately as CSV or JSON. JSON can include photos.

## Included evidence

- `public/data/earth-data.json` has 366 daily records per site in 2024, monthly aggregation, paired rainfall QA, optical masks and original request URLs. Mithapukur and Pirganj share a POWER meteorological cell.
- `public/data/history.json` has 60 monthly records per site for 2021–2025.
- `public/data/agronomy.json` contains 33 references, five crop profiles, four rotation templates, BARC guidance, 25 symptoms, ten clinic pathways and conditional recovery options.
- `data-raw/` contains original POWER responses and four-band Landsat GeoTIFF windows. The app serves only `public/` and the built `out/`.
- Read `docs/method.md`, `docs/agronomy-notes.md`, `docs/credits.md` and `docs/judging-walkthrough.md` for methods, sources and a two-minute demo.

## Reproduce the data

The included app requires no extraction step or API key. To reproduce the dated pack with Python, install Pillow, NumPy and rasterio, then run the following from this folder with access to the public sources.

```sh
python3 scripts/fetch-earth-data.py
python3 scripts/extract-optical.py
python3 scripts/fetch-context.py
python3 scripts/fetch-optical-history.py
python3 scripts/fetch-history.py
python3 scripts/prepare-offline.py
```

Retain the frozen raw snapshots and scene IDs when reproducing a result. The optical-history script selects a matching Tier 1 acquisition for each selected month. Run `npm test` with Node 20 or newer. The frontend uses native JavaScript modules, Leaflet, Canvas and SVG.


