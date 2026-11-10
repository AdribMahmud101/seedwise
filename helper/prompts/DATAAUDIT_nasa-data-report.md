# DATAAUDIT · Which data each route uses, and is NASA open data used well?

Write `docs/reports/data-audit.md` (+ one file per route in `docs/reports/routes/<route>.md`). Read-only on app code — change NO source files.

For every route/view in the app (find them in `src/legacy/app.js` router + sidebar: My field, Past seasons, Rotation studio, Planting planner, Crop clinic, Water & resilience, Disaster recovery, Research lab, Evidence register, and any others):
1. **Files:** every JS module the view uses and every data file it fetches (`public/data/*`, tiles, overlays) — path, size, what it holds, date range, which script builds it (`scripts/*`).
2. **Sources:** the upstream dataset for each (NASA POWER, GPM IMERG, SMAP, NASADEM, Landsat, MODIS, Sentinel-1/2, SoilGrids, OSM, FFWC, trial papers…), resolution, licence, truth label shown in the UI. Mark anything hard-coded/illustrative in JS (search for literal arrays of numbers) as such.
3. **Use quality:** is the value shown at the right scale with the right label? stale? duplicated across views? shown as Measured when it is modelled? any number with no traceable source?
4. **Gaps / opportunities:** NASA open datasets that would materially improve that view and are free + no-key or Earthdata-login (e.g. SMAP L4 9 km, MODIS/VIIRS NDVI & LST, Landsat, GPM IMERG daily, GRACE groundwater, ECOSTRESS ET, HLS 30 m, OPERA DSWx water, FIRMS fire, SRTM/NASADEM) — say concretely what each would change, effort S/M/L.
5. Summary table at top: route × data files × NASA sources × issues (count) × top fix.
Be factual — cite file:line for every claim. No invented sizes: measure with `du -h`/`wc -c`.
Acceptance: report files exist and are committed; `npm test` still passes. Commit.
