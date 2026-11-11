# PLAN3DFIX verification

The planting preview now draws healthy, individually modelled plants at an explicit display scale. The sample field uses ×4 plants; the footer reports the actual row and plant sampling intervals. Plant counts and mustard seed quantities still come from the unchanged planting calculations.

The original wind shader used `instanceMatrix[12]`, which is invalid GLSL matrix indexing and prevented plant shaders from compiling with motion enabled. It now reads the translation column with `instanceMatrix[3].x`.

Rice has arching green blades, shallow rippled water and perimeter bunds. Potato has dark compound foliage on raised brown ridges. Mustard has green stems/leaves and separate yellow flower petals. Mungbean has low branches with groups of three broad leaves. The topsoil is moist brown; lighting uses a brighter key and hemisphere fill. Distance fog no longer washes out the crops.

Perspective framing fits the entire soil block and canopy at the canvas aspect, including the existing ±5° idle yaw and ±1% dolly. Crop changes retain their outgoing plants until the transition finishes, including cancellation during rapid changes or disposal. The public planner API and count calculations are unchanged.

## Screenshots

Captured from the production export in Firefox with motion enabled, at the default fitted camera without zooming. The page is scrolled to show the entire field preview. Desktop uses 1366×768 at DPR 1; phone uses 412×915 at DPR 2.625.

| Crop | Desktop | Phone |
| --- | --- | --- |
| Rice | [1366×768](PLAN3DFIX_rice_1366x768.png) | [412×915 @2.625](PLAN3DFIX_rice_412x915.png) |
| Potato | [1366×768](PLAN3DFIX_potato_1366x768.png) | [412×915 @2.625](PLAN3DFIX_potato_412x915.png) |
| Mustard | [1366×768](PLAN3DFIX_mustard_1366x768.png) | [412×915 @2.625](PLAN3DFIX_mustard_412x915.png) |
| Mungbean | [1366×768](PLAN3DFIX_mungbean_1366x768.png) | [412×915 @2.625](PLAN3DFIX_mungbean_412x915.png) |

## Checks

- Requested ESLint `no-undef` command: passed.
- `npm test`: 353 passed, zero failures. Node prints existing experimental localStorage warnings.
- `npm run build`: passed, including offline export preparation.
- Browser checks: all four crop changes at both viewport sizes; no JavaScript or shader errors; 3D/Top controls and keyboard zoom work.
- Regression tests: true row/plant grid sampling; representative plants in narrow fields; projected block and canopy containment across landscape/portrait aspects and idle sway.

The optional true-size close-up was omitted. No dependencies were added; package-lock.json and node_modules were not changed. Screenshots use a software WebGL renderer rather than physical phone hardware.
