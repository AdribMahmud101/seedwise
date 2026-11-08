# DOC1 · Bring the in-app docs in line with the final spec

## Goal
Roadmap step 1 (`spec/10-roadmap.md` §2a): small documentation fixes decided in `spec/14-decision-recommendations.md`. Docs only, with no app behaviour change.

## Do
1. `docs/agronomy-notes.md`: "17 source records" → the real counts in `public/data/agronomy.json` (count `sources`, `symptoms`, `conditions`, `crops`, `rotations` with a script; don't guess) (D-C10).
2. `docs/method.md`: POWER meteorology grid = "~0.5° × 0.625° (MERRA-2)" (D-C8). Add short paragraphs, factual and sourced to `spec/17`, for the new data: Sentinel-2 map tiles (2 dates, 10 m, offline, provenance), NASADEM terrain (surface model: includes trees and houses), NASA SMAP L4 soil moisture (m³/m³, ~9 km, model + satellite, percentiles; not the same as the POWER 0–1 wetness index).
3. `docs/credits.md`: make sure Sentinel-2 tiles, OpenStreetMap (ODbL), NASADEM and SMAP each appear exactly once with their licence/attribution.
4. `docs/judging-walkthrough.md`: add one row for the new map (layers, tap-to-inspect, local units) and one for the Water screen SMAP card. Keep the 2-minute total; trim words elsewhere if needed.
5. `README.md`: remove any statement that is no longer true (e.g. "no SMAP"); add the Sarker 2026 and Hossain 2022 DOIs to the evidence list (both verified, see `spec/14` C2 note). Cite Sarker as "RARS Rangpur" (no Burirhat, no coordinates).

## Files in scope
`docs/*.md`, `README.md`.

## Out of scope
Code, data, CSS, `spec/`.

## Acceptance
- `npm test` exits 0
- `grep -n "17 source" docs/agronomy-notes.md` prints nothing
- `git add -A && git commit -m "DOC1: docs match final spec (counts, grid, new data, credits)"`
