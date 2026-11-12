# Disaster recovery · v1.1

The new workspace adds a farmer-facing sequence for drought, flood and fire. It preserves the existing data and research tools and is available from My field, the main navigation and Water & resilience.

## Flow

1. Choose a hazard and one of four stages: preparation, active event, inspection, or safe access confirmed.
2. Read the next action. For recovery, enter field condition, surviving-crop status, water supply, contamination review, extra preparation days and an optional next-crop deadline.
3. Explore date-qualified crops. Rice also checks land class and pre-raised seedlings. Each option explains the evidence, assumptions and checks that remain.
4. Review soil and border restoration. Wetland trees and fruit-tree options depend on site type. After fire, assess natural regeneration and contamination first.
5. Save the assessment per field and hazard on the device, export JSON, or preview and print it for a local extension discussion. A selected crop opens the existing planting-material calculator. Its reference variety and yield assumptions still apply.

## Evidence and calculation

The reference calendars use archived DAE/BAMIS guidance, BRRI variety information and the included Bangladesh trial sources. The linked 2020 bulletins are historical evidence, not current alerts. The app links to current BAMIS and FFWC pages for a separate check. International fire recovery sources contribute general principles and are explicitly subject to local review.

| Option | Reference window | Duration used |
| --- | --- | --- |
| BARI Shorisha-14 | 15 October–15 November, approximate bounds for the Rangpur bulletin's middle-of-month wording | 75–80 days from sowing |
| BARI Mung-6 | 21 February–15 March, an approximate late-February to mid-March window, anchored to the Gangachara trial | 55–58 days from variety guidance |
| BRRI dhan71 | 25 July–9 August, normal transplant window | 90–95 days after transplanting, derived from 115 total days less 20–25 nursery days |
| Late short Aman | 10–25 August, starts after the regular window above | Unknown, so no next-crop deadline clearance |
| Late photoperiod-sensitive Aman | 26 August–15 September, separate late window | Unknown; suitable nursery must already exist from sowing by 15 August |

Earliest readiness = assessment date + extra preparation days. The next annual window is selected. The earliest sowing date is the later of readiness and window opening. Where a next-crop deadline and duration are known, latest sowing = minimum(window closing, deadline minus maximum duration minus one day). This reserves one unoccupied day, not a complete land-preparation allowance. Increase the buffer with an earlier entered deadline where needed. Options more than 183 days away are held for reassessment closer to the season.

The cards are alternatives for an available field, not an automatically chained rotation. A future window assumes that entered conditions will still hold and must be checked again. Approximate harvest dates simply add a reference duration and do not model stress, temperature, soil, management or delayed maturity.

The collapsed NASA panel reads the same month across the genuine 2021–2025 archive for the selected prepared site. It shows the IMERG monthly rainfall range and mean POWER root-zone wetness index. It does not classify the current hazard or measure a particular field's current moisture. No fabricated live sensor measurement or disaster forecast is included.

## Worked examples and validation

The examples contain fictional conditions, conspicuously labelled in the workspace and exported plan. Flood uses 2 September 2026 and existing late Aman seedlings. Drought uses 25 February and a 5 May deadline. Fire uses 4 November and unresolved contamination, which blocks food-crop planning. Changing values retains the example label until a fresh personal assessment is started.

Unit checks cover active-event holds, dry and waterlogged ground, unresolved contamination, surviving crops, missing water, missed windows, next-crop collisions, unknown rice duration, invalid dates and source resolution. Rendering checks cover all three fields, both languages and all three examples. No emergency phone number is called during UI testing.

The app stores entries locally. Qualified clearance is a user-entered assertion, not a certification issued by SeedWise. Extension validation, live hazard services, field soil samples and calibrated crop models remain production work.
