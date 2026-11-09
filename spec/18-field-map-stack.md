# 18 · Field Map: Stack & Technologies

*As of 9 Nov 2026.*

The field map is a static web page. Leaflet draws the 2D field map, MapLibre GL draws the 3D landscape, and every layer is either a pre-built offline file or a free online imagery service. There is no server and no database; Cloudflare serves the files at <https://roponradar.onefusionlab.systems>.

It covers the three pilot sites (Mithapukur, Pirganj, Gangachara) plus any field a farmer starts, and lives in two views: `#field` (2D field map) and `#water` ("Your land in 3D").

## 1. App platform

| Layer | Technology | Role in the field map |
|---|---|---|
| Framework | Next.js 16, React 19, `output: export` | Builds the whole app into static files in `out/` |
| View code | Plain JavaScript modules in `src/legacy/` | `fields.js` (2D map), `boundary.js` (field outline), `landscape3d.js` (3D), `water.js` |
| Styling | CSS files in `app/` | `style.css`, `lowground.css`, `landscape.css`, `labels.css` |
| Languages | `t(en, bn)` helper | Every label in English and Bengali |
| Saved data | Browser `localStorage` | Field boundaries, custom fields, cultivable-area inputs and fetched POWER data stay on the phone |
| Offline | Service worker built by `scripts/prepare-offline.py` | Caches app files and offline tiles; never caches Esri imagery |
| Hosting | Cloudflare Workers static assets, `wrangler` | Deployed with `npm run deploy` to a custom domain |
| Source | GitHub (private repo) | Code, briefs and spec |

## 2. Map engines

| Engine | Version | Used for | How it loads | Size |
|---|---|---|---|---|
| [Leaflet](https://leafletjs.com/) | 1.9.4 | 2D field map in `#field`: imagery, outline, overlays, tap-to-inspect | Self-hosted in `public/assets/`, loaded with the page | 148 KB JS + 16 KB CSS |
| [MapLibre GL JS](https://maplibre.org/) | 5.24.0 | 3D landscape in `#water`: terrain, sky, fog, rivers | Self-hosted in `public/assets/maplibre/`, loaded only when the 3D panel scrolls into view | 1.1 MB |

Both are self-hosted so the app works offline. The earlier three.js field-scale 3D view was removed: 30 m elevation shows only noise at plot scale (see 14, D-Q4 amendment).

## 3. Imagery and data layers

| Layer | Source | Detail | Date | Online / offline | Truth label |
|---|---|---|---|---|---|
| High detail photo (default) | [Esri World Imagery Wayback](https://livingatlas.arcgis.com/wayback/), release 64776 (Maxar capture) | 0.31 m, zoom up to 18 | 28 Nov 2022 | Online, never cached | Estimated |
| Natural colour | Sentinel-2 L2A via [Microsoft Planetary Computer](https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a) | 10 m, zoom 12–16 | 9 Mar 2024, 9 Nov 2024 | Offline tiles (`public/tiles/natural/`) | Estimated |
| Greenness (NDVI) | Same Sentinel-2 scenes | 10 m | 9 Mar 2024, 9 Nov 2024 | Offline tiles (`public/tiles/ndvi/`); drawn over the photo when online | Estimated |
| Low ground | [NASADEM](https://planetarycomputer.microsoft.com/dataset/nasadem) relative elevation (cell minus 1 km median) | 30 m, smoothed | NASADEM (2000 radar) | Offline PNG overlays (`public/overlays/`, 80 KB) | Estimated |
| Context lines | [OpenStreetMap](https://www.openstreetmap.org/) roads, rivers, villages | Vector | Fetched Nov 2026 | Offline (`context-osm.geojson`) | — |
| Tap-to-inspect values | [NASA POWER](https://power.larc.nasa.gov/) wetness and temperature, [GPM IMERG](https://gpm.nasa.gov/data/imerg) rain, NDVI grid | ~50 km / ~10 km / 10 m | 2024 monthly | Offline JSON | Estimated |
| 3D terrain | NASADEM, Terrarium-encoded tiles | 30 m, zoom 8–12, height ×10 | NASADEM | Offline (`public/landscape/`, 2.4 MB) | Estimated |
| 3D colours | Built from NASADEM: height colours + hillshade, edges faded into haze | 30 m | — | Offline | Estimated |
| 3D photo mode | Same Esri Wayback release | 0.31 m | 28 Nov 2022 | Online only | Estimated |
| 3D rivers and borders | OSM named rivers; geoBoundaries upazilas | Vector | — | Offline | — |
| Village search | OSM places (83 villages, 60 towns in Rangpur) via `fetch-places.py` | Point | Fetched Nov 2026 | Offline (`places-rangpur.json`, 24 KB) | — |
| New-field weather | NASA POWER daily point API (AG community) + IMERG, summarised in the browser (`powerlive.js`, FAO-56 ETo) | ~50 km / ~10 km | 2024 | Fetched live once, then cached on the phone | Estimated |
| Soil water (SMAP) tile | NASA SMAP L4 surface soil moisture, pilot sites only | 9 km | 2024 monthly | Offline JSON | Estimated |

Why Wayback release 64776: the live Esri layer shows a hazy 14 Dec 2023 capture over Mithapukur and a hazy Jan 2024 capture over Gangachara. Of the 198 archived releases, the Maxar 28 Nov 2022 capture is clear at all three sites.

## 4. Map features and how they work

| Feature | How it works |
|---|---|
| Layer switch | Three buttons: High detail (online) · Natural colour 10 m · Greenness NDVI. The date timeline shows only for the Sentinel-2 layers |
| Offline fallback | If the phone is offline, or 3 photo tiles fail, the map switches to Natural colour 10 m with a bilingual toast; the High detail button greys out |
| Zoom limit per place | `esriMaxZoom()` asks Esri's tilemap which zoom (17–20) has real photos at the map centre and caps zoom there; cached per ~1 km; falls back to 18 |
| Zoom caps | Sentinel-2 layers stop at zoom 16 so 10 m pixels don't turn into blocks; +/− buttons grey out at the limit |
| Field boundary | Draw and edit the outline; area shown live in shotok, bigha, katha, acre and hectare; saved in the browser |
| Tap-to-inspect | Tap a point: NDVI, wetness index, temperature, rain for the month, and low / level / high ground, each with its source |
| Low ground toggle | One button, off by default; the legend appears only when it is on |
| Locate, reset, full screen | Map controls on the right, all 44 px tap targets |
| 3D landscape | Lazy-loaded; frames all 3 upazilas (side view on wide screens, north-up on phones); Height colours / Photo switch and reset; one 2 s fly-in, no auto-rotate; shows a message without WebGL |
| Start any field | Search a village or coordinates, Locate me, or Pick on map → "Start a field here" makes a ~20-decimal outline to edit; fields marked ★ can be deleted |
| New-field data | POWER is fetched live once per new field and cached; offline shows "Internet needed" with a retry, never another site's numbers; SMAP shows "Not prepared for this field" |
| Cultivable area | Gross area minus bunds, drains, paths and other land (`netarea.js`); farmer edits widths per field |
| Truth labels | Every layer and value carries Measured, Estimated, Scenario or Unknown (`truth()` in `ui.js`) |

## 5. Data pipeline and quality checks

All offline map data is built once by Python scripts and committed as static files; the app never calls these sources at run time.

| Script | Builds | From |
|---|---|---|
| `fetch-map-tiles.py` | Sentinel-2 natural and NDVI tiles, `map-layers.json`, `ndvi-grid.json` | Planetary Computer STAC + data API |
| `fetch-context.py` | `context-osm.geojson` | OpenStreetMap |
| `fetch-low-ground.py` | Low-ground PNGs, `low-ground.json` | NASADEM via Planetary Computer |
| `build-landscape.py` | 3D terrain and colour tiles, `landscape-rivers.geojson` | NASADEM + OSM Overpass |
| `fetch-earth-data.py`, `fetch-smap.py` | POWER, IMERG and SMAP values used by tap-to-inspect and Water | NASA POWER API, POWER SMAP Zarr store |
| `prepare-offline.py` | Service worker and offline file list | Build output |

Checks before every release:

- **Unit tests:** `npm test` (Node test runner), 68 tests, including the `map-layers`, `low-ground`, `landscape`, `esri-zoom`, `custom-fields` (POWER parity with the Python fixture) and `netarea` suites.
- **Build:** `npm run build` must compile on the main branch.
- **Browser checks:** headless Chrome (Playwright) at 1280 px and 360 px, English and Bengali: no sideways scroll, no text under 12 px, no tap target under 44 px, no console errors, no 404s, only expected outside hosts.
- **Size budgets:** low-ground overlays ≤ 300 KB; 3D landscape files ≤ 4 MB; MapLibre not loaded on first page load.

## 6. Licences, attribution and known limits

| Item | Licence / terms | What we must do |
|---|---|---|
| Leaflet | BSD-2-Clause | Keep the licence file |
| MapLibre GL JS | BSD-3-Clause | Keep `LICENSE.txt` in `public/assets/maplibre/` |
| Esri World Imagery (Wayback) | Esri terms of use | Show "Imagery © Esri, Maxar, Earthstar Geographics"; never cache tiles; check terms before commercial use |
| Sentinel-2 | Copernicus open licence | Show "Contains modified Copernicus Sentinel data (2024)" |
| OpenStreetMap | ODbL | Show "© OpenStreetMap contributors" |
| NASADEM, NASA POWER, GPM IMERG, SMAP | NASA open data | Cite the source on each card |
| geoBoundaries | CC BY 3.0 IGO | Credit in `docs/credits.md` |

Known limits:

- The 28 Nov 2022 date is exact only around the three pilot sites; if Esri retires release 64776 the URL must be re-pointed.
- Esri has no photos deeper than zoom 18 over Rangpur.
- Sentinel-2 is 10 m, so it looks soft up close; only two dates are stored (30 MB tile budget).
- NASADEM heights include trees and houses; low ground and 3D are approximate.
- 3D has not yet been tested on a real phone GPU.
- Village search has only 143 OSM places; coordinates, Locate me and Pick on map work anywhere.
