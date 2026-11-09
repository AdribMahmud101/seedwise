# STUDIO1 · Real data for the rotation field studio (data layer only)

## Goal
Build the pure data module the 3D studio (STUDIO2, in parallel) renders, plus real soil-profile data. No UI work.

## Work
1. `scripts/fetch-soilgrids.py` → `public/data/soil-profile.json` for the 3 prepared sites (lat/lon from
   `public/data/earth-data.json`). ISRIC SoilGrids 2.0 (250 m, CC BY 4.0): clay, sand, silt, soc, phh2o, bdod at depths
   0-5, 5-15, 15-30, 30-60, 60-100 cm, mean. REST `rest.isric.org` is currently down; use WCS 2.0.1 GetCoverage,
   e.g. `https://maps.isric.org/mapserv?map=/map/clay.map&SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=clay_0-5cm_mean&FORMAT=image/tiff&SUBSET=long(LON1,LON2)&SUBSET=lat(LAT1,LAT2)&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&OUTPUTCRS=http://www.opengis.net/def/crs/EPSG/0/4326`
   (tiny bbox around the site; take the pixel containing it). Try REST first with short timeout, then WCS. Apply
   SoilGrids conversion factors (clay/sand/silt g/kg→%, soc dg/kg→g/kg, phh2o pH×10, bdod cg/cm³→g/cm³), USDA texture
   class. Retries + timeouts; if a site fails write `null` for it, never invented values. `--self-check` for unit
   conversion + texture class. Run it for real and commit the JSON (≤ 20 KB). Record source/licence/date in the JSON.
2. `src/legacy/studiodata.js` exporting `buildStudioData` per the contract below. Reuse, don't re-implement:
   month crop plan + Kc + shortfall formula from `src/legacy/engine.js` (shortfall must equal the engine's monthly
   deficit for the same field/rotation), crop data from `agronomy.json`, vegetation from `opticalHistory` (Landsat) and
   plot-mean of `ndvi-grid.json` / gzip `moisture-grid.json` cells inside the boundary (Sentinel-2), ground class from
   `low-ground.json` at the centroid. Litres = shortfallMm × areaHa × 10 000. FAO-56 max crop height (Table 12) and root
   depth (Table 22) as cited constants; `stageFraction` from the crop's day in its duration.
3. Tests `tests/studiodata.test.mjs`: contract shape for all 3 sites × 4 rotations; shortfall parity with engine;
   litres math; custom field gets no site data; soil-profile.json schema + nulls allowed; outlineM area ≈ areaHa (±2 %).

## Acceptance (must pass)
`npm test` · `python3 scripts/fetch-soilgrids.py --self-check`. Out of scope: UI, CSS, three.js, other views.
Never print or commit tokens/keys.
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
