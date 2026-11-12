# FIELDUI — modernize the My field page (#field)

Owner: "The field looks primitive. Improve it and modernize it with appropriate components." (screenshot at 1642×888)

## Today (src/legacy/fields.js + app/style.css field rules, journey-bar.js banner)
Header "FIELD ATLAS / 01 My field notebook" + plain bordered field chips + "Disaster recovery" / "Find a field" buttons;
left "Field map" panel: a separate bar of layer buttons (High detail / Natural colour 10 m / Greenness NDVI), a separate row
(Opacity slider, Context lines, Low ground), the Leaflet map with a white zoom/reset/locate/fullscreen column, a source label box,
a coordinate box, then a bottom row of plain buttons (Pick on map, District, Edit boundary);
right "Plot dossier" card: label/value pairs with "Estimated"/"Scenario" tags, Next decision + glowing "Explore rotations" CTA,
"Edit field assumptions" footer; below: "Historical observations · November 2024" metric strip.
Everything works — it just looks like stacked boxes and default buttons.

## Do (visual + layout only)
1. Page header: compact title row; field selector as a modern **segmented control** (pill track, sliding active indicator,
   field number badge, tiny status dot); header actions as icon+label buttons with consistent height (40 px) and radius.
2. Map card: make the map the hero — full-bleed inside the card with rounded corners. Put controls **on the map as floating
   glass toolbars** (backdrop-blur, soft shadow):
   - top-left: layer switcher as a segmented pill (icons + short labels; long names in tooltips/aria-label);
   - top-right: compact zoom / reset / locate / fullscreen button group (consistent 36 px icon buttons);
   - bottom-left: a single "info chip" combining source/date + coordinates (collapsible on small screens);
   - opacity + Context lines + Low ground grouped in a small "Layers" popover or a second floating pill.
   - Pick on map / District / Edit boundary as a floating action pill at the bottom of the map (not a separate row).
3. Plot dossier: **stat tiles** (Boundary area, Cultivable area) with big numbers, unit, sub-line and the truth tag as a small
   badge; Field boundary / Planning crop / Expected harvest as an icon list; keep "Edit" link. Next decision block stays
   prominent with the existing Explore rotations CTA (keep its gradient/glow/ripple and the "next step" hint).
4. Historical observations strip: modern metric cards (icon chip, value, unit, tiny trend/sparkline if the data is already there,
   NASA badge) in a responsive grid; consistent spacing.
5. Consistent design tokens: spacing 8/12/16/24, radius 12–16, one shadow scale, one border colour; hover/focus states;
   subtle entrance animation; respect prefers-reduced-motion. Dark-on-light contrast WCAG AA.
6. Keep the FIELDFOLD rule: at ≥1100 px wide, map + dossier + Explore rotations CTA fit the first screen without page scroll
   (check 1366×768, 1642×888, 1920×1080); phones (360/412) single column, map ~55vh, sticky CTA bar stays.

## Do NOT
- No mock data/placeholders. Same real data, same NASA badges and truth tags ("Estimated", "Scenario").
- Don't change map logic (Leaflet layers, boundary editing, tile sources); never cache Esri tiles. Keep element ids, data-action /
  data-go attributes and classes that tests or other modules use (grep tests/ and src/legacy/*.js before renaming anything;
  prefer adding wrapper classes). Keep Guide me / howto targets working (src/legacy/howto-field.js selectors).
- Don't touch other pages.

## Done when
- `npm test` fail 0 (update only pure-markup assertions you deliberately changed); `npm run build` passes.
- No horizontal page scrollbar at 360/412/1024/1366/1642/1920.
- Commit on the card branch; body lists the visual changes.
