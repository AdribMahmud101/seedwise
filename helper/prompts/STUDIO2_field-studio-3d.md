# STUDIO2 · 3D Field Studio on #rotations (premium, lazy, honest)

## Goal
A polished interactive 3D studio on `#rotations`: the farmer's own plot as a 3D block with soil cutaway, crops of the
selected rotation growing month by month, real NASA/Sentinel layers on top. Reference look (owner-approved mockup):
left rail = layer list + field observation + month weather; right = 3D stage, view switch, calendar bar with play.
`three` 0.181 is already in package.json. Data comes from `buildStudioData()` in `src/legacy/studiodata.js`, built by
STUDIO1 in parallel: code against the contract below; if the file is missing in your worktree, create a minimal stub
there that returns `tests/fixtures/studio-data.json` (write that fixture to the contract) and mark it `// STUB`.

## Build (files: `src/legacy/studio3d.js` new, `src/legacy/rotations.js`, `src/legacy/app.js`, `app/studio.css` new + import in `app/layout.js`, tests)
1. **Lazy + acknowledged.** Poster card first (CSS-only illustration, no WebGL): "Your field, season by season",
   download note ("3D · ~N KB · then works offline"), button "Open 3D studio". Desktop (≥ 1024 px, no `saveData`)
   auto-opens when scrolled into view; phones need a tap. `import()` three + studio3d only then — never in the initial
   page JS. Loading steps shown ("Loading 3D engine… Building your field… Placing crops…"); no-WebGL / context-lost →
   clear message + the 2D calendar still works.
2. **Scene.** Plot = `outlineM` extruded block; top texture by layer; sides = soil bands from `soil.layers`
   (colour by texture, depth labels); "Soil cutaway" slider slices the block to show layers + roots (`rootDepthM`).
   `soil === null` → plain sides labelled "Soil profile not prepared". Optional "Surroundings" ring of photo ground.
   Views: 3D / Top (orthographic). Controls: OrbitControls with limits, N arrow tracking bearing, +/−, reset, fullscreen.
3. **Layers (radio):** Photo (Esri Wayback 64776 z18 tiles for `bboxLatLon` composed to a canvas texture, online only,
   never cached, attribution shown; offline → `/tiles/natural/` Sentinel tiles) · Greenness (ndvi-grid cells coloured
   with the #field NDVI legend) · Moisture (NDMI) · Crop season (InstancedMesh plants on the crop's real spacing,
   thinned to a device cap; height = canopyHeightM × stageFraction; green→gold at mature; stubble after harvest; bare at fallow).
4. **Rail + calendar.** Rotation picker (default top-ranked; each rotation card gets "Preview in 3D"). Month slider
   Jan–Dec + play/pause (1.5 s/month, stops at Dec; no autoplay with `prefers-reduced-motion`). Observation card:
   vegetation sparkline with dated points + value nearest the month; moisture. Weather for the month: rain, temp, ETo,
   crop need, shortfall mm and **litres for this plot**. Every item carries its `truth()` label + source; plants say
   "Illustrative crops · not observed". Visually-hidden live text summary of the current month (screen readers).
5. **Performance.** Render on demand (only on change/animation); pause when off-screen or tab hidden; DPR ≤ 1.5 phones
   / 2 desktop; plant cap by `deviceMemory`/cores (≈ 4k phone, 20k desktop); dispose geometry/textures.
   **#app is re-rendered on every repaint** (`render()` in app.js): keep the renderer + canvas in module state and
   re-attach the canvas into the new host after each repaint; dispose only when leaving #rotations (next to `disposeMap()`).
6. Phones (≤ 600 px): stage first (`clamp(340px,60svh,560px)`), rail below as compact sections, no sideways scroll.
   Bilingual `t(en,bn)` everywhere; text ≥ 12 px; targets ≥ 44 px; keyboard: arrows rotate, +/− zoom.

## Acceptance (must pass)
`npm test` with new tests: poster renders without importing three; studio chunk only via dynamic import (grep the
source: no static `import ... from "three"` outside studio3d.js); contract fixture renders a month summary in EN and BN.
Out of scope: other views, data scripts, studiodata.js logic (STUDIO1).
## Shared data contract (STUDIO1 builds it, STUDIO2 renders it) — do not change field names
`buildStudioData(input) -> StudioData` exported from `src/legacy/studiodata.js` (pure, no DOM, Node-testable).
```
StudioData = {
  field:   { id, name, nameBn, areaHa, centroid:[lat,lon], bboxLatLon:[w,s,e,n],
             outlineM:[[eastM,northM],...],            // metres from centroid, ring not closed
             boundary:"traced"|"farmer"|"custom" },
  rotation:{ id, label, bn },
  months:  [ 12 x { month:"2024-01", cropId|null, cropName, cropNameBn,
             stage:"fallow"|"establish"|"grow"|"mature"|"harvest", stageFraction:0..1,
             canopyHeightM|null, rootDepthM|null,          // FAO-56 tables, SCENARIO
             rainMm, et0Mm, tmeanC, wetness, needMm, shortfallMm, shortfallLitres } ],
  vegetation:[ { date, ndvi, source:"Landsat"|"Sentinel-2", cellM, validFraction } ], // sorted; plot mean where a grid exists
  moisture:[ { date, ndmi } ],
  ground:  { class:"low"|"level"|"high"|null, source, note },  // note says the plot is flat at 30 m
  soil:    null | { source, cellM:250, layers:[ { topCm, bottomCm, clayPct, sandPct, siltPct, socGkg, ph, bulkDensity, textureClass } ] },
  sources: [ { id, name, url } ],
  truth:   { plants:"SCENARIO", roots:"SCENARIO", soil:"MODELED", vegetation:"REMOTE_OBSERVED", weather:"MODELED", water:"MODELED" }
}
```
Custom fields: weather from their cached live POWER (`getCachedPower`), vegetation/moisture/ground/soil = [] / null (never another site's data).
