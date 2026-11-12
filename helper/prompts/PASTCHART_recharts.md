# PASTCHART — Past seasons charts on a proper chart library (Recharts)

Owner: "fix this past season chart … use established UI elements like proper react graph / chart libraries and fix those issues."

## Bug seen (owner screenshot, #seasons at ~1900px wide)
"Compare year-by-year" (`yearBars` in src/legacy/fields.js ~870) is a hand-made SVG that scales with the card:
axis/value labels become huge (2,397 at ~28px, years at ~36px), y-axis labels are clipped (",397", ",199"),
bars stretch. The monthly line charts above it (ui.js `chart()` used by fields.js) have the same scaling problem
and tiny/cramped axis text.

## Do
1. Add `recharts` (React 19 is already a dependency; the app is Next + legacy HTML-string pages).
   Create one small module, e.g. `src/legacy/charts-react.js` (or .jsx if the build supports it — check next.config / how src/legacy is bundled),
   exporting `mountBarChart(el, props)`, `mountLineChart(el, props)` that use `react-dom/client` `createRoot` and return an unmount fn.
   Legacy renderers output a placeholder `<div class="sw-chart" data-chart="…">` and mount after render; unmount on page dispose
   (follow the existing mount/dispose pattern in fields.js / app router — no leaks across hash navigation).
2. Replace on the Past seasons page (#seasons):
   - "Compare year-by-year" annual IMERG totals → Recharts BarChart: fixed readable font sizes (11–13px), formatted y-axis (e.g. 2.4k or 2,400 mm),
     selected year highlighted (existing dark green), others muted; tooltip with exact mm; value labels on top at normal size.
   - The monthly rain / wetness line charts in the same page → Recharts LineChart/AreaChart with the same series, legend, units.
   Use ResponsiveContainer with a fixed height (e.g. 220–260px desktop, 200px mobile) so text never scales with width.
3. Keep exactly: the real data series (GPM IMERG, model indices), "Estimated" truth tags, NASA badges, captions, bilingual labels (t()),
   the Prithvi water-check dot timeline (leave it as is unless it is trivially fixed).
4. Accessible: role="img" + aria-label summary on each chart container; works keyboard/tooltip.
5. Mobile is the main screen: check 360/412 widths as well as 1280/1920.

## Do NOT
- No mock data, no placeholders, no invented numbers. Same data the SVG used.
- Don't touch other pages' charts (plan.js waterChartSVG, outlook fanChartSVG) in this card.
- Don't change storage keys or data files.

## Done when
- `npm test` fail 0 (update tests that assert the old SVG markup to assert the new placeholder + data; keep data/logic tests).
- `npm run build` passes (Next build includes recharts).
- Commit on the card branch; body lists what changed.
