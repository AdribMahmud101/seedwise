# SMAP1 · Freeze NASA SMAP soil moisture into the data pack

## Goal
Add real volumetric soil moisture (m³/m³) for the 3 sites, so a later UI card can show it beside the 0–1 POWER wetness index. Decision D-C11. Read `spec/17-open-data-access.md` §3 first (tested routes and rules).

## Do
1. `scripts/fetch-smap.py`: read POWER's public SMAP store (no login):
   `s3://nasa-power-smap/smap/temporal/power_smap_daily_temporal_utc.zarr` with `xarray.open_zarr(..., storage_options={"anon": True})`. Inspect the dimensions first, then take the nearest grid point to each site: mithapukur 25.54/89.27, pirganj 25.50/89.22, gangachara 25.85/89.20.
   - variables: `SFMC`, `RZMC`, `SFMC_PRCNTL`, `RZMC_PRCNTL`
   - period: 2021-01-01 → 2025-12-31 (matches `history.json`)
   - Use a throwaway `uv venv` outside the repo for `xarray zarr s3fs`; don't commit it.
2. **Fallback only if the Zarr fails:** NSIDC SPL4SMGP v008 with `EARTHDATA_TOKEN` from `/root/projects/ropon-radar/.env` (header `Authorization: Bearer …`). Never print, log or commit the token.
3. Write `public/data/smap.json`: per site → `daily` for 2024 and `monthly` for 2021–2025 (mean, valid-day count), units `m3/m3` and `%`, grid point used (lat/lon), native resolution ~9 km, source and store path, retrieved date, provenance `REMOTE_OBSERVED`/`MODELED` (SMAP L4 is model-assimilated: say so). Fill/NaN → null, never 0.
4. Save small raw extracts in `data-raw/smap-<site>.json`. Add the SMAP credit to `docs/credits.md`.
5. Add `tests/smap.test.mjs`: values within 0–0.6 m³/m³, percentiles 0–100, no 0 where the raw value is missing, units are never "%" for SFMC/RZMC.

## Files in scope
`scripts/fetch-smap.py`, `public/data/smap.json`, `data-raw/smap-*.json`, `docs/credits.md`, `tests/smap.test.mjs`.

## Out of scope
UI code and CSS (another card shows it), map tiles, `.env`.

## Acceptance
- `python3 scripts/fetch-smap.py` re-runs cleanly
- `npm test && npm run build` exit 0 (including the new test)
- `smap.json` ≤ 600 KB; report Mithapukur's July 2024 mean RZMC in your final message
- `git add -A && git commit -m "SMAP1: NASA SMAP L4 soil moisture frozen into data pack"`
