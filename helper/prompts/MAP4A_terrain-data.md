# MAP4A · Offline terrain height data for the 3D view

## Goal
Prepare small offline height files so a later card (MAP4B) can show the field area in 3D. Rules: `spec/17-open-data-access.md` §4 + "Rules for anyone adding a data call", `spec/14` D-C4/D-C7/D-Q4.

## Do
1. `scripts/fetch-terrain.py`: for each of the 3 sites (mithapukur 25.54/89.27, pirganj 25.50/89.22, gangachara 25.85/89.20) take NASADEM (Planetary Computer collection `nasadem`, item `NASADEM_HGT_n25e089`, no login) over the same 6 km box as MAP1 tiles.
2. Save `public/terrain/<site>.json` with: a grid of heights in metres (≤ 128×128, row-major, null for no data), bounds, cell size in m, min/max, source, item ID, request URL pattern, retrieved date, provenance `REMOTE_OBSERVED`, and a note that **NASADEM is a surface model: heights include trees and houses**.
3. Keep each file ≤ 200 KB. Python deps: a throwaway `uv venv` outside the repo if needed; don't commit it.
4. Add the NASADEM credit to `docs/credits.md`.

## Files in scope
`scripts/fetch-terrain.py`, `public/terrain/*.json`, `docs/credits.md`.

## Out of scope
App UI, three.js, tiles (MAP1 does those).

## Acceptance
- `python3 scripts/fetch-terrain.py` re-runs cleanly; each JSON parses; the grid has no 0 where data is missing
- Mithapukur min/max roughly 22–34 m (a sanity check from a supervisor sample)
- `npm test` exits 0
- `git add -A && git commit -m "MAP4A: offline NASADEM terrain grids"`
