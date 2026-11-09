# Ropon Radar — Field Studio
Standalone, map-first 3D demo for the NASA Space Apps Field Shift challenge.

Serve dist/ over HTTP: `python -m http.server 8000 --directory dist`.
Run checks: `node tests.mjs`.

Two example Burirhat study blocks use the user's supplied Sentinel-2 and NASA POWER archive. Numeric NASADEM terrain was independently retrieved from Planetary Computer; provenance is in dist/data/terrain.json. New boundaries use online imagery, mixed-source Terrain Tiles, and NASA POWER weather where available. Unknown field observations remain unknown.

Features: orbit/pan/zoom, top view, crop close-up, height exaggeration, elevation contours, seasonal greenness, three illustrative rotation calendars, satellite polygon drawing, coordinate navigation, browser-local field notes and follow-up questions. WebGL is used where supported; Canvas perspective projection is the compatibility fallback and omits wind animation.

Limitations: approximately 30 m NASADEM does not resolve small bunds or drains. Satellite basemap dates differ from observation dates. Plants, density, scale and planting months are illustrative, not observed or predicted. No crop ranking, yield forecast, exact NPK, flood depth or irrigation prescription is generated. Example boundaries are not cadastral records. Guided questions do not call a live AI model. Current custom boundary lasts for the browser session; its field notes are saved locally by boundary coordinates.

Sources and attribution:
- NASADEM: https://doi.org/10.5067/MEASURES/NASADEM/NASADEM_HGT.001
- Sentinel-2: https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a
- NASA POWER: https://power.larc.nasa.gov/
- Soil cover and rotations: https://www.nrcs.usda.gov/conservation-basics/soil/soil-health/soil-health-on-cropland
- Esri: https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer
- Terrain Tiles: https://github.com/tilezen/joerd/blob/master/docs/attribution.md

Three.js r170 and Leaflet 1.9.4 are bundled with licenses in vendor/. Online imagery is requested at runtime, not included. Optional Google Fonts fall back to system fonts. Original uploaded project is unchanged.

## 3D field model update
The initial view now isolates the selected parcel as a 3D land model, with an exact polygon outline, sampled elevation surface, crop rows, textured soil sides and a movable cutaway. Satellite terrain remains a separate context view. Click the surface to inspect interpolated terrain elevation. Soil texture, roots, soil depth and crop size/density are illustrative; the block's depth is enlarged for visual explanation. The model does not infer nutrient concentrations or underground water.

Browser QA uses the software perspective renderer because the remote test browser has WebGL disabled; GPU visuals still require validation on a WebGL-capable device. Both paths share the same geometry. The software renderer omits wind animation.
