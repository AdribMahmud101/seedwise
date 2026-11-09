# STUDIO3 · Make the 3D field studio look like the approved mockup

Target look: `helper/prompts/STUDIO3_mockup.png` (owner-approved). Current state: `STUDIO3_now-1280.png`,
`STUDIO3_now-390.png`. Files: `src/legacy/studio3d.js`, `app/studio.css`, `src/legacy/rotations.js` (picker only).
Data contract and `studiodata.js` are final: do not change them.

## Fix (all observed at 1280 and 390 px, headless Chrome)
1. **Framing:** camera too close, plot clipped. Fit the block to the stage on open/resize/reset
   (bounding sphere, ~35° elevation, slight yaw, 12 % margin); orbit limits keep it in view; top view fits too.
2. **Plants spill outside the boundary** (dots on surroundings). Place instances only inside `outlineM`
   (point-in-polygon), inset by half the row spacing.
3. **Plants look like flat dark dots.** Low-poly 3D clumps (rice/boro: blade tufts; potato/mustard/mungbean: leafy
   mound) with per-instance scale/rotation jitter, height from `canopyHeightM × stageFraction`, colour ramp by stage
   (establish light green → grow green → mature gold → harvest stubble; fallow: bare soil). Max instances unchanged.
4. **Block and soil:** visible thickness (~1/6 of plot width, exaggerated, labelled "Soil depth exaggerated"), side
   faces banded by `soil.layers` (colour by texture + clay %, thin separators, depth ticks 0/15/30/60/100 cm on hover/
   cutaway). Cutaway slider must visibly slice the block showing bands + roots (`rootDepthM`).
5. **Lighting/look:** hemisphere + soft directional light with shadows on desktop only, ACES tone mapping, soft
   gradient background like the mockup (no grey void), subtle ground shadow. Remove the white diagonal line artefact
   and the white elliptical "Surroundings" disc; Surroundings = photo/ Sentinel ground plane fading at the edges.
6. **Overlays:** on phones the "3D View/Top View" and "Soil cutaway" panels overlap; stack them (views top-left,
   cutaway as a bottom bar) with ≥ 44 px targets. Month chip: "Nov · Potato · growing" (BN text too), not "2024-11 · Potato (grow)".
7. **Rotation picker** shows only one rotation: list all 4 (ranked, score shown), selecting re-builds the studio data.
8. **Observation value bug:** shows NDVI 0.32 from 2024-01-28 while the month is Nov; show the observation nearest the
   selected month (with its date), and highlight that point on the sparkline.
9. Keep: lazy loading, poster, render-on-demand, repaint re-attach, reduced-motion, truth labels, bilingual, no sideways scroll.

## Acceptance (must pass)
`npm test` (add tests: nearest-observation helper; instance positions all inside a test polygon; month chip text EN/BN).
Out of scope: other views, data files.
