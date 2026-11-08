import { units } from "./boundary.js";
import {
  state,
  earth,
  agronomy,
  archive,
  persist,
  t,
  esc,
  num,
  monthName,
  field,
  fieldName,
  polygon,
  area,
  profile,
  setProfile,
  cropName,
  icon,
  button,
  goButton,
  header,
  panel,
  tag,
  chips,
  input,
  select,
  monthControl,
  toast,
  repaint,
  modal,
  close,
  download,
  csv,
  chart,
} from "./ui.js";
import { rotationEvidence, polygonValid, mean, areaHa } from "./engine.js";

let leafletMap = null,
  drawLayer = null,
  drawPoints = [],
  cornerMarkers = [],
  drawMode = false,
  regional = false,
  showLandsat = false,
  mapLayersData = null,
  ndviGridData = null,
  osmContextData = null,
  activeTileLayer = null,
  activeOsmLayer = null,
  activePhotoOverlay = null,
  layerMode = "natural", // 'natural' | 'ndvi' | 'photo'
  activeDate = "2024-03-09",
  layerOpacity = 0.85,
  showOsmContext = true;

const colors = {
  wetness: "#658261",
  rainGpm: "#518899",
  tmean: "#bd8d49",
  et0: "#9e9275",
};

// EPSG:32645 (WGS 84 / UTM zone 45N) projection for Bangladesh / Rangpur
function projectWgs84ToUtm45N(lon, lat) {
  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const ePrime2 = e2 / (1 - e2);
  const k0 = 0.9996;
  const lon0 = 87.0 * (Math.PI / 180.0);
  const latR = lat * (Math.PI / 180.0);
  const lonR = lon * (Math.PI / 180.0);
  const N = a / Math.sqrt(1 - e2 * Math.sin(latR) ** 2);
  const T = Math.tan(latR) ** 2;
  const C = ePrime2 * Math.cos(latR) ** 2;
  const A = (lonR - lon0) * Math.cos(latR);
  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * latR -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * latR) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * latR) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * latR));
  const x =
    k0 *
      N *
      (A +
        ((1 - T + C) * A ** 3) / 6 +
        ((5 - 18 * T + T ** 2 + 72 * C - 58 * ePrime2) * A ** 5) / 120) +
    500000.0;
  const y =
    k0 *
    (M +
      N *
        Math.tan(latR) *
        (A ** 2 / 2 +
          ((5 - T + 9 * C + 4 * C ** 2) * A ** 4) / 24 +
          ((61 - 58 * T + T ** 2 + 600 * C - 330 * ePrime2) * A ** 6) / 720));
  return [x, y];
}

function queryNdvi(grid, lat, lon) {
  if (!grid) return null;
  const [w, s, e, n] = grid.bounds;
  if (lon < w || lon > e || lat < s || lat > n) return null;
  const [x, y] = projectWgs84ToUtm45N(lon, lat);
  const col = Math.floor((x - grid.transform[2]) / grid.transform[0]);
  const row = Math.floor((grid.transform[5] - y) / -grid.transform[4]);
  if (row < 0 || row >= grid.height || col < 0 || col >= grid.width) return null;
  const val = grid.values[row]?.[col];
  return val !== undefined && val !== null ? val : null;
}

function formatNdvi(val) {
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return t("No reliable observation", "নির্ভরযোগ্য পর্যবেক্ষণ নেই");
  }
  return num(val, 2);
}

function formatDateLabel(iso) {
  if (!iso || typeof iso !== "string") return "";
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  const monthsEn = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d} ${monthsEn[m - 1]} ${y}`;
}

function isValidCoord(pt) {
  return (
    Array.isArray(pt) &&
    pt.length >= 2 &&
    Number.isFinite(pt[0]) &&
    Number.isFinite(pt[1])
  );
}

function filterOsmFeature(feature) {
  if (!feature || typeof feature !== "object") return false;
  const geom = feature.geometry;
  if (!geom || typeof geom !== "object") return false;
  const { type, coordinates } = geom;
  if (!coordinates || !Array.isArray(coordinates)) return false;

  if (type === "Point") {
    return isValidCoord(coordinates);
  }
  if (type === "LineString") {
    const valid = coordinates.filter(isValidCoord);
    return valid.length >= 2;
  }
  if (type === "MultiLineString") {
    const validLines = coordinates
      .map((line) => (Array.isArray(line) ? line.filter(isValidCoord) : []))
      .filter((line) => line.length >= 2);
    return validLines.length > 0;
  }
  if (type === "Polygon") {
    const validRings = coordinates
      .map((ring) => (Array.isArray(ring) ? ring.filter(isValidCoord) : []))
      .filter((ring) => ring.length >= 3);
    return validRings.length > 0;
  }
  if (type === "MultiPolygon") {
    const validPolys = coordinates
      .map((poly) =>
        (Array.isArray(poly) ? poly : [])
          .map((ring) => (Array.isArray(ring) ? ring.filter(isValidCoord) : []))
          .filter((ring) => ring.length >= 3),
      )
      .filter((poly) => poly.length > 0);
    return validPolys.length > 0;
  }
  return false;
}

async function loadMapData() {
  if (!mapLayersData || !ndviGridData || !osmContextData) {
    try {
      const [layersRes, gridRes, osmRes] = await Promise.all([
        fetch("data/map-layers.json"),
        fetch("data/ndvi-grid.json"),
        fetch("data/context-osm.geojson"),
      ]);
      if (layersRes.ok) mapLayersData = await layersRes.json();
      if (gridRes.ok) ndviGridData = await gridRes.json();
      if (osmRes.ok) osmContextData = await osmRes.json();
    } catch {
      // offline fallback or test runner without local server
    }
  }
}
function setField(id) {
  state.fieldId = id;
  regional = false;
  drawMode = false;
  drawPoints = [];
  cornerMarkers = [];
  persist();
  repaint();
}
function disposeMap() {
  if (leafletMap) {
    leafletMap.off();
    leafletMap.remove();
    leafletMap = null;
  }
  drawLayer = null;
  drawMode = false;
  drawPoints = [];
  cornerMarkers = [];
}
function spark(values, color) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return "";
  const low = Math.min(...finiteValues),
    span = Math.max(...finiteValues) - low || 1;
  const points = values.map((v, i) =>
    Number.isFinite(v)
      ? [
          2 + (i * 116) / Math.max(1, values.length - 1),
          24 - ((v - low) / span) * 20,
        ]
      : null,
  );
  const path = points
    .map((p, i) =>
      p ? `${i && points[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : "",
    )
    .join(" ");
  return `<svg class="spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><path d="M0 25h120" stroke="#dce2d6" stroke-dasharray="2 3"/><path d="${path}" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" fill="none"/></svg>`;
}
function stats(months = field().monthly) {
  const m = months[state.month];
  const defs = [
    [
      "wetness",
      t("Surface wetness", "মাটির উপরিভাগের আর্দ্রতা"),
      "",
      "water",
      t("POWER · index from 0 to 1", "POWER · সূচক ০ থেকে ১"),
      2,
    ],
    [
      "rainGpm",
      t("Rainfall", "বৃষ্টিপাত"),
      "mm",
      "rain",
      t("IMERG · monthly total", "IMERG · মাসের মোট"),
      1,
    ],
    [
      "tmean",
      t("Mean temperature", "গড় তাপমাত্রা"),
      "°C",
      "temp",
      t("POWER · monthly average", "POWER · মাসিক গড়"),
      1,
    ],
    [
      "et0",
      t("Reference water use", "রেফারেন্স পানির চাহিদা"),
      "mm",
      "sun",
      t("FAO-56 ETo · monthly total", "FAO-56 ETo · মাসের মোট"),
      1,
    ],
  ];
  return `<div class="data-row">${defs
    .map(
      ([key, label, unit, symbol, foot, places]) =>
        `<article class="data-stat"><div class="stat-top">${label}${icon(symbol)}</div><div class="stat-value">${num(m[key], places)}<small>${unit}</small></div>${spark(
          months.map((v) => v[key]),
          colors[key],
        )}<div class="stat-foot">${foot}</div></article>`,
    )
    .join("")}</div>`;
}
function mapImage(f) {
  return showLandsat ? f.imagery[0] : f.contextImage || f.imagery[0];
}
function pointInPoly(pt, poly) {
  const [y, x] = pt;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i],
      [yj, xj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
function home() {
  const f = field(),
    p = profile(),
    photoImage = f.imagery[0],
    ranks = rotationEvidence(f.monthly, state.weights, p);
  const first = ranks.find((r) => r.feasible);

  // Dates for timeline: manifest Sentinel-2 dates (for natural & ndvi) or original photo
  let timelineDates = [];
  if (layerMode === "photo") {
    timelineDates = [
      { date: "2024-01-28", label: formatDateLabel("2024-01-28"), available: true },
    ];
  } else {
    // For Natural colour and Greenness, use dates from mapLayersData manifest
    const manifestDates = mapLayersData?.layers?.find((l) => l.id === layerMode)?.dates?.map((d) => d.date) || [
      "2024-03-09",
      "2024-11-09",
    ];
    timelineDates = manifestDates.map((d) => ({
      date: d,
      label: formatDateLabel(d),
      available: true,
    }));
  }

  // Ensure activeDate is valid for current mode
  if (!timelineDates.some((td) => td.date === activeDate)) {
    activeDate = timelineDates[0]?.date || "2024-03-09";
  }

  // Determine active chip info based on layerMode and activeDate
  let chipSensor, chipDate, chipRes, chipSource, chipIsEstimate;
  if (layerMode === "natural") {
    chipSensor = "Copernicus Sentinel-2";
    chipDate = formatDateLabel(activeDate);
    chipRes = "10 m";
    chipSource = "ESA / Planetary Computer";
    chipIsEstimate = true;
  } else if (layerMode === "ndvi") {
    chipSensor = "Sentinel-2 NDVI";
    chipDate = formatDateLabel(activeDate);
    chipRes = "10 m";
    chipSource = "ESA / Planetary Computer";
    chipIsEstimate = true;
  } else {
    chipSensor = "Landsat 8";
    chipDate = formatDateLabel(activeDate);
    chipRes = "30 m";
    chipSource = "NASA / USGS";
    chipIsEstimate = true;
  }

  const chipLabel = `${chipSource} · ${chipDate} · ${chipRes} · ${t("◈ Estimated", "◈ স্যাটেলাইট অনুমান")}`;
  const hasCustomBoundary = !!state.boundaries[f.id];
  const currentDateObj = timelineDates.find((d) => d.date === activeDate);
  const isDateReliable = currentDateObj ? currentDateObj.available : false;

  // Legend HTML per active layer
  let legendHtml = "";
  if (layerMode === "natural") {
    legendHtml = `
      <div class="map-legend-bar">
        <strong>${t("Natural colour", "প্রাকৃতিক রং")}</strong>
        <div class="map-legend-items">
          <span class="map-legend-item"><span class="legend-swatch" style="background:#4b5a37"></span> ${t("Vegetation / fields", "ফসল ও গাছপালা")}</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#858374"></span> ${t("Bare soil / paths", "অনাবাদী জমি ও রাস্তা")}</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#3b4f59"></span> ${t("Water / ponds", "পুকুর ও জলাশয়")}</span>
        </div>
      </div>
    `;
  } else if (layerMode === "ndvi") {
    legendHtml = `
      <div class="map-legend-bar">
        <strong>NDVI ${t("Greenness", "সবুজভাব")}</strong>
        <div class="map-legend-items">
          <span class="map-legend-item"><span class="legend-swatch" style="background:#313695"></span> &lt; −0.5 (${t("Water", "পানি")})</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#a50026"></span> −0.5–0.0 (${t("Bare / Cloud", "অনাবাদী")})</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#fee08b"></span> 0.0–0.2 (${t("Low", "কম")})</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#d9ef8b"></span> 0.2–0.4 (${t("Moderate", "মাঝারি")})</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#66bd63"></span> 0.4–0.6 (${t("Vigorous", "ভালো বৃদ্ধি")})</span>
          <span class="map-legend-item"><span class="legend-swatch" style="background:#006837"></span> &gt; 0.6 (${t("Dense canopy", "ঘন সবুজ")})</span>
        </div>
      </div>
    `;
  } else {
    legendHtml = `
      <div class="map-legend-bar">
        <strong>${t("Original 2024 photo", "আসল ২০২৪ ছবি")}</strong>
        <div class="map-legend-items">
          <span class="map-legend-item"><span class="legend-swatch" style="background:#525b42"></span> Landsat 8 True Colour · 30 m (${t("28 Jan 2024 dry season base", "২৮ জানু ২০২৪ শুষ্ক মৌসুম")})</span>
        </div>
      </div>
    `;
  }

  return (
    header(
      t("Field atlas  /  01", "জমির মানচিত্র  /  ০১"),
      t("My field notebook", "আমার জমির খাতা"),
      t(
        "Find your plot, read the season, and plan what comes next.",
        "জমি খুঁজুন, মৌসুমের তথ্য দেখুন এবং পরের ফসল ঠিক করুন।",
      ),
      goButton(
        t("Disaster recovery", "দুর্যোগের পর করণীয়"),
        "recovery",
        "",
        "recovery",
      ) +
        button(t("Find a field", "জমি খুঁজুন"), "search", "primary", "search"),
    ) +
    chips() +
    `<div class="grid-two"><section class="panel"><div class="panel-header"><h2>${t("Field map", "জমির মানচিত্র")}</h2>${tag(t("Satellite imagery", "স্যাটেলাইট ছবি"), "green")}</div>
 <div class="map-switcher">
   <div class="map-segmented" role="tablist" aria-label="${t("Map layer switcher", "মানচিত্রের স্তর নির্বাচন")}">
     <button type="button" class="button ${layerMode === "natural" ? "active" : ""}" data-action="set-layer-mode" data-value="natural" role="tab" aria-selected="${layerMode === "natural"}">${icon("layers", 14)} ${t("Natural colour", "প্রাকৃতিক রং")}</button>
     <button type="button" class="button ${layerMode === "ndvi" ? "active" : ""}" data-action="set-layer-mode" data-value="ndvi" role="tab" aria-selected="${layerMode === "ndvi"}">${icon("tree", 14)} ${t("Greenness (NDVI)", "সবুজভাব (NDVI)")}</button>
     <button type="button" class="button ${layerMode === "photo" ? "active" : ""}" data-action="set-layer-mode" data-value="photo" role="tab" aria-selected="${layerMode === "photo"}">${icon("camera", 14)} ${t("Original 2024 photo", "আসল ২০২৪ ছবি")}</button>
   </div>
   <div class="map-subcontrols">
     <div class="map-opacity-control">
       <label for="layer-opacity-slider">${t("Opacity", "স্বচ্ছতা")}:</label>
       <input type="range" id="layer-opacity-slider" name="layerOpacity" min="0.1" max="1.0" step="0.05" value="${layerOpacity}" title="${t("Adjust imagery opacity to view field outline", "জমির সীমানা স্পষ্ট দেখতে ছবির স্বচ্ছতা কমান-বাড়ান")}">
     </div>
     <button type="button" class="button small ${showOsmContext ? "primary" : ""}" data-action="toggle-osm-context">${icon("field", 14)} ${t("Context lines", "রাস্তা ও নদী")}</button>
   </div>
 </div>
 <div class="map-timeline">
   <span class="map-timeline-label">${icon("seasons", 14)} ${t("Observation date", "পর্যবেক্ষণের তারিখ")}:</span>
   <div class="map-timeline-dates">
     ${timelineDates
       .map(
         (td) =>
           `<button type="button" class="button ${activeDate === td.date ? "active" : ""}" data-action="set-active-date" data-value="${td.date}">${esc(td.label)}</button>`,
       )
       .join("")}
   </div>
   <span class="map-timeline-status">${isDateReliable ? `<span class="tag green">✓ ${t("Clear observation", "পরিষ্কার ছবি")}</span>` : `<span class="tag amber">⊘ ${t("No reliable observation", "নির্ভরযোগ্য পর্যবেক্ষণ নেই")}</span>`}</span>
 </div>
 <div class="map-shell"><div id="field-map" class="field-map" role="region" aria-label="${t("Interactive Rangpur field map", "রংপুরের ইন্টার‌্যাক্টিভ মানচিত্র")}"></div><div class="map-overline" id="map-label">${esc(chipLabel)}</div><div class="map-bottom">N ↑ &nbsp; ${num(f.lat, 3)}° N &nbsp; ${num(f.lon, 3)}° E</div></div>
 ${legendHtml}
 <div class="map-actions"><span class="note">${esc(chipLabel)}</span><div class="map-controls">${button(regional ? t("Satellite", "স্যাটেলাইট") : t("District", "জেলা"), "region", "small", "layers")}${button(drawMode ? t("Editing corners…", "কোণ বদল হচ্ছে…") : t("Edit boundary", "সীমানা সম্পাদনা"), "draw", `small ${drawMode ? "primary" : ""}`, "draw")}${hasCustomBoundary ? button(t("Reset to demo outline", "নমুনা সীমানায় ফিরুন"), "reset-demo", "small") : ""}</div></div><div id="drawing-help"></div></section>
 <section class="panel"><div class="field-card"><div class="field-intro"><div class="eyebrow">${t("Plot dossier", "জমির পরিচয়")} / RG–0${earth.fields.indexOf(f) + 1}</div><h2>${esc(fieldName())}</h2><div class="location">${t("Rangpur District, Bangladesh", "রংপুর জেলা, বাংলাদেশ")}</div></div><dl class="field-meta"><div><dt>${t("Boundary area", "জমির আয়তন")}</dt><dd class="large" title="${units(area())}">${num(area(), 2)} <small>ha</small></dd><small class="unit-note">${num(area() * 2.47105381, 2)} ac · ${num(area() * 247.105381, 1)} ${t("decimals", "শতক")}</small></div><div><dt>${t("Field boundary", "জমির সীমানা")}</dt><dd>${state.boundaries[f.id] ? t("Farmer drawn", "কৃষকের আঁকা") : t("Demo outline", "নমুনা সীমানা")}</dd></div><div><dt>${t("Planning crop", "পরিকল্পনার ফসল")}</dt><dd>${cropName(p.crop)}</dd></div><div><dt>${t("Expected harvest", "সম্ভাব্য ফসল তোলা")}</dt><dd>${esc(p.harvest)}</dd></div></dl>
 <div class="field-recommend"><div class="eyebrow">${t("Next decision", "পরবর্তী সিদ্ধান্ত")}</div><h3>${first ? t(first.crops.join(" → "), first.bnCrops.join(" → ")) : t("Review field constraints", "জমির শর্ত দেখুন")}</h3><p>${t("Compare four full rotations using your priorities and the winter planting window.", "আপনার অগ্রাধিকার ও বপনের সময় ধরে চারটি ফসলচক্র তুলনা করুন।")}</p>${goButton(t("Explore rotations", "ফসলচক্র দেখুন"), "rotations", "primary full")}</div></div>
 <div class="field-bottom">${icon("draw", 13)}${button(t("Edit field assumptions", "জমির অনুমান বদলান"), "profile", "ghost small")}</div></section></div>
 <div class="section-label"><div><div class="eyebrow">${t("Historical observations", "পুরনো পর্যবেক্ষণ")}</div><h2>${monthName()} 2024</h2></div>${goButton(t("See past seasons", "পুরনো মৌসুম"), "seasons", "small")}</div>${stats()}
 <div class="section-label"><h2>${t("Work on this field", "এই জমিতে আরও কাজ")}</h2></div><div class="work-actions">${[
   [
     "planner",
     "planner",
     t("Lay out the rows", "সারি সাজান"),
     t(
       "Preview planting density in 3D",
       "ত্রিমাত্রিক দৃশ্যে গাছের ঘনত্ব দেখুন",
     ),
   ],
   [
     "clinic",
     "clinic",
     t("Check a crop problem", "ফসলের সমস্যা দেখুন"),
     t(
       "Record insects, leaf damage, or soil concerns",
       "পোকা, পাতার ক্ষতি বা মাটির সমস্যা লিখুন",
     ),
   ],
   [
     "research",
     "research",
     t("Add a field observation", "পর্যবেক্ষণ যোগ করুন"),
     t(
       "Connect rain, soil tests and measured yields",
       "বৃষ্টি, মাটি ও ফলনের রেকর্ড রাখুন",
     ),
   ],
 ]
   .map(
     ([route, symbol, name, sub]) =>
       `<button data-go="${route}" class="work-action">${icon(symbol, 22)}<span><strong>${name}</strong><small>${sub}</small></span>${icon("right", 15)}</button>`,
   )
   .join("")}</div>`
  );
}
function seasonView() {
  const f = field(),
    year = Number(state.historyYear || 2024),
    archiveMonths = archive.fields[f.id].monthly,
    months = archiveMonths.filter((v) => v.month.startsWith(String(year)));
  const m = months[state.month],
    img = year === 2024 && state.month >= 2 ? f.contextImage : f.imagery[0],
    dry = months.reduce((a, b) => (b.rainGpm < a.rainGpm ? b : a)),
    wet = months.reduce((a, b) => (b.rainGpm > a.rainGpm ? b : a));
  const comparators = archiveMonths.filter(
    (v) => v.month.slice(5) === m.month.slice(5) && v.month !== m.month,
  );
  const comparisonMean = mean(comparators.map((v) => v.rainGpm));
  const opticalTable =
    year === 2024 && f.opticalHistory
      ? panel(
          t("Greenness through the season", "মৌসুমে গাছের সবুজভাব"),
          `<p class="note">${t("Landsat samples in the fixed 900 m window. Cloud-obscured observations leave a gap.", "৯০০ মিটার জানালায় ল্যান্ডস্যাট নমুনা। মেঘে ঢাকা পর্যবেক্ষণ ফাঁকা থাকে।")}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>${t("Acquired", "তারিখ")}</th><th>NDVI</th><th>${t("Clear samples", "পরিষ্কার নমুনা")}</th><th>${t("Coverage", "তথ্যের অবস্থা")}</th></tr></thead><tbody>${f.opticalHistory.map((o) => `<tr><td>${esc(o.date)}</td><td>${o.opticalQA.validFraction >= 0.25 ? num(o.opticalQA.ndvi, 3) : "—"}</td><td>${num(o.opticalQA.validPixels)} / ${num(o.opticalQA.pixels)}</td><td>${o.opticalQA.validFraction >= 0.25 ? t("Usable", "ব্যবহারযোগ্য") : t("Too little clear cover", "পরিষ্কার অংশ কম")}</td></tr>`).join("")}</tbody></table></div>`,
        )
      : "";
  const history = state.records.filter(
    (r) =>
      r.fieldId === f.id &&
      r.kind === "harvest" &&
      r.date.startsWith(String(year)),
  );
  return (
    header(
      t("Season archive  /  02", "মৌসুমের খাতা  /  ০২"),
      t("Past seasons", "পুরনো মৌসুম"),
      t(
        "Replay five years. Choose a year and a month to read the regional record.",
        "পাঁচ বছরের আঞ্চলিক তথ্য দেখুন। বছর ও মাস বেছে নিন।",
      ),
      button(
        t("Download archive", "পুরনো তথ্য নিন"),
        "export-archive",
        "",
        "download",
      ),
    ) +
    chips() +
    panel(
      t("Choose a month", "মাস বাছুন"),
      select(
        t("Archive year", "রেকর্ডের বছর"),
        "historyYear",
        [2021, 2022, 2023, 2024, 2025].map((y) => [y, String(y)]),
        year,
      ) + monthControl(year),
      tag("2021–2025", "blue"),
    ) +
    stats(months) +
    `<div class="notice section-space">${monthName()} ${year} · ${t("Rainfall", "বৃষ্টি")} <b>${num(m.rainGpm, 1)} mm</b>. ${t("Same-month average in the other four archive years", "আর্কাইভের বাকি চার বছরে একই মাসের গড়")} <b>${num(comparisonMean, 1)} mm</b>. ${t("This is a short historical comparison.", "এটি স্বল্পমেয়াদি ঐতিহাসিক তুলনা।")}</div>` +
    `<div class="grid-equal section-space">${panel(
      t("Where the rain went", "কোন মাসে কত বৃষ্টি"),
      chart(
        [
          {
            label: "GPM IMERG",
            color: "#517e8b",
            values: months.map((m) => m.rainGpm),
          },
          {
            label: "POWER",
            color: "#9c9c67",
            values: months.map((m) => m.rainPower),
            dash: true,
          },
        ],
        {
          unit: "mm / month",
          description: "Monthly rainfall estimated by two products",
        },
      ) +
        `<p class="note">${t("The wettest IMERG month was", "IMERG অনুযায়ী সবচেয়ে বেশি বৃষ্টি")} ${monthName(months.indexOf(wet))} (${num(wet.rainGpm, 1)} mm). ${t("The driest was", "সবচেয়ে কম")} ${monthName(months.indexOf(dry))} (${num(dry.rainGpm, 1)} mm).</p>`,
    )}
 ${panel(
   t("How wet the soil was", "মাটি কতটা ভেজা ছিল"),
   chart(
     [
       {
         label: t("Surface layer", "উপরিভাগ"),
         color: "#567f56",
         values: months.map((m) => m.wetness),
       },
       {
         label: t("Root zone", "শিকড়ের স্তর"),
         color: "#b19251",
         values: months.map((m) => m.rootWetness),
         dash: true,
       },
     ],
     {
       unit: t("wetness index 0–1", "আর্দ্রতা সূচক ০–১"),
       max: 1,
       description: "POWER surface and root-zone wetness",
     },
   ) +
     `<p class="note">${t("These regional model indices describe relative wetness. A soil probe can supply a local reading.", "এলাকার মডেল থেকে আপেক্ষিক আর্দ্রতা পাওয়া যায়। জমির নিজস্ব মাপের জন্য মাটির সেন্সর ব্যবহার করুন।")}</p>`,
 )}</div>
 <div class="grid-equal section-space">${panel(t("Dated optical observation", "স্যাটেলাইট পর্যবেক্ষণ"), year === 2024 && img ? `<div class="observation-thumb"><img src="${esc(img.url)}" alt="${t("Dated satellite image near the field", "জমির কাছের ল্যান্ডস্যাট ছবি")}"><div><b>${esc(img.date)}</b><p class="note">${img.sourceLabel ? "Sentinel-2 · 10 m" : "Landsat 8 · 30 m"}</p><p class="note">${esc(img.sceneId)}</p>${Number.isFinite(img.ndvi) ? `<p>NDVI ${num(img.ndvi, 2)}</p>` : ""}<a class="source-link" href="${esc(img.itemUrl)}" target="_blank" rel="noopener">${t("View scene record ↗", "ছবির উৎস ↗")}</a></div></div><p class="note">${t("This scene keeps its acquisition date as you move between months.", "মাস বদলালেও ছবিটি তার আসল তারিখেই দেখানো হয়।")}</p>` : `<p class="note">${t("No optical scene prepared for the selected year.", "এই বছরের স্যাটেলাইট ছবি প্রস্তুত নেই।")}</p>`)}
 ${panel(t("What grew here?", "এখানে কী ফসল হয়েছিল?"), `<p class="note">${history.length ? t("Harvests recorded in this year", "এই বছরে লেখা ফসল") : t("No verified harvests are recorded for this field in the selected year. Add a harvest to connect an actual variety and yield to this weather record.", "এই জমির নির্বাচিত বছরের যাচাই করা ফলনের তথ্য নেই। আবহাওয়ার সাথে তুলনা করতে একটি ফলনের রেকর্ড যোগ করুন।")}</p>${history.map((r) => `<p>${esc(r.date)} · ${esc(r.variety || cropName(r.crop))} · ${num(r.yieldKg, 1)} kg</p>`).join("")}<div class="spacer"></div>${button(t("Log a harvest", "ফলন লিখুন"), "new-harvest", "", "add")}`)}</div><div class="section-space">${opticalTable}</div>`
  );
}
async function mountMap() {
  const el = document.querySelector("#field-map");
  if (!el || !window.L) return;
  await loadMapData();
  const f = field();
  const maxZ = 17;
  leafletMap = L.map(el, {
    zoomControl: false,
    scrollWheelZoom: false,
    zoomSnap: 0.5,
    minZoom: 8,
    maxZoom: maxZ,
    attributionControl: true,
    keyboard: true,
  });
  const current = leafletMap;

  // Custom 44px Controls: Zoom (+/-), Reset view, Locate me, Full screen
  const FieldNavControl = L.Control.extend({
    options: { position: "topright" },
    onAdd: function () {
      const container = L.DomUtil.create("div", "leaflet-bar");
      
      const zoomIn = L.DomUtil.create("a", "leaflet-control-zoom-in", container);
      zoomIn.href = "#";
      zoomIn.title = t("Zoom in", "বড় করুন");
      zoomIn.setAttribute("aria-label", t("Zoom in", "বড় করুন"));
      zoomIn.setAttribute("role", "button");
      zoomIn.innerHTML = "+";

      const zoomOut = L.DomUtil.create("a", "leaflet-control-zoom-out", container);
      zoomOut.href = "#";
      zoomOut.title = t("Zoom out", "ছোট করুন");
      zoomOut.setAttribute("aria-label", t("Zoom out", "ছোট করুন"));
      zoomOut.setAttribute("role", "button");
      zoomOut.innerHTML = "−";

      const resetBtn = L.DomUtil.create("a", "map-control-btn", container);
      resetBtn.href = "#";
      resetBtn.title = t("Reset view", "আগের দৃশ্য");
      resetBtn.setAttribute("aria-label", t("Reset view", "আগের দৃশ্য"));
      resetBtn.setAttribute("role", "button");
      resetBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`;

      const locateBtn = L.DomUtil.create("a", "map-control-btn", container);
      locateBtn.href = "#";
      locateBtn.title = t("Locate me", "আমার অবস্থান");
      locateBtn.setAttribute("aria-label", t("Locate me", "আমার অবস্থান"));
      locateBtn.setAttribute("role", "button");
      locateBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3 M12 19v3 M2 12h3 M19 12h3"/></svg>`;

      const fsBtn = L.DomUtil.create("a", "map-control-btn", container);
      fsBtn.href = "#";
      fsBtn.title = t("Full screen", "সম্পূর্ণ পর্দা");
      fsBtn.setAttribute("aria-label", t("Full screen", "সম্পূর্ণ পর্দা"));
      fsBtn.setAttribute("role", "button");
      fsBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>`;

      L.DomEvent.disableClickPropagation(container);
      L.DomEvent.disableScrollPropagation(container);

      L.DomEvent.on(zoomIn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        current.zoomIn();
      });
      L.DomEvent.on(zoomOut, "click", (e) => {
        L.DomEvent.preventDefault(e);
        current.zoomOut();
      });
      L.DomEvent.on(resetBtn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        if (poly && poly.getBounds().isValid()) {
          current.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: 16 });
        } else {
          current.setView([f.lat, f.lon], 15);
        }
      });
      L.DomEvent.on(locateBtn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        if (!navigator.geolocation) {
          toast(t("Location is not supported on this browser.", "এই ব্রাউজারে লোকেশন পাওয়া যাচ্ছে না।"));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const { latitude, longitude } = pos.coords;
            current.setView([latitude, longitude], Math.min(15, maxZ));
            L.circleMarker([latitude, longitude], {
              radius: 8,
              color: "#315c3d",
              fillColor: "#e5eadb",
              fillOpacity: 1,
              weight: 3,
            })
              .addTo(current)
              .bindPopup(t("Your current position", "আপনার বর্তমান অবস্থান"))
              .openPopup();
          },
          (err) => {
            if (err.code === 1) {
              toast(t("Location access was denied. You can still use the map freely.", "লোকেশন অনুমতি দেওয়া হয়নি। আপনি মানচিত্রটি স্বাভাবিকভাবে ব্যবহার করতে পারবেন।"));
            } else {
              toast(t("Could not get current location.", "বর্তমান অবস্থান পাওয়া যায়নি।"));
            }
          },
          { timeout: 8000, enableHighAccuracy: false },
        );
      });
      L.DomEvent.on(fsBtn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        const panel = el.closest(".panel");
        if (panel) {
          panel.classList.toggle("field-map-fullscreen");
          setTimeout(() => current.invalidateSize(), 200);
        }
      });

      return container;
    },
  });
  new FieldNavControl().addTo(current);

  L.control.scale({ position: "bottomright", imperial: false }).addTo(current);
  current.attributionControl.setPrefix(false);

  // Soft halo polygon underlay (prepare objects first before adding to map)
  const haloPoly = L.polygon(polygon(), {
    color: "#24392c",
    weight: 7,
    opacity: 0.35,
    fill: false,
    interactive: false,
    lineCap: "round",
    lineJoin: "round",
  });

  const poly = L.polygon(polygon(), {
    color: "#e3f9a2",
    weight: 2.5,
    fillColor: "#c8e383",
    fillOpacity: 0.22,
  });

  // Set initial map view before adding layers to guarantee valid renderer bounds
  if (regional) {
    current.setView([25.65, 89.25], 10);
  } else if (poly && poly.getBounds().isValid()) {
    current.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: 16 });
  } else {
    current.setView([f.lat, f.lon], 15);
  }

  // 1. Add Imagery: Tiles (natural/ndvi) or original 2024 photo
  const s2Attribution =
    mapLayersData?.attribution ||
    "Contains modified Copernicus Sentinel data (2024). ESA / Microsoft Planetary Computer.";

  if (layerMode === "natural" || layerMode === "ndvi") {
    const layerManifest = mapLayersData?.layers?.find((l) => l.id === layerMode);
    const dateEntry = layerManifest?.dates?.find((d) => d.date === activeDate);
    const tileUrl = dateEntry?.pathTemplate || `/tiles/${layerMode}/${activeDate}/{z}/{x}/{y}.png`;
    const minZoom = dateEntry?.minZoom ?? 9;
    const maxZoom = dateEntry?.maxZoom ?? 16;
    let tileBounds = undefined;
    if (dateEntry?.bounds && dateEntry.bounds.length === 4) {
      const [w, s, e, n] = dateEntry.bounds;
      tileBounds = [
        [s, w],
        [n, e],
      ];
    }
    activeTileLayer = L.tileLayer(tileUrl, {
      minZoom,
      maxZoom: 17,
      maxNativeZoom: maxZoom,
      bounds: tileBounds,
      opacity: layerOpacity,
      attribution: s2Attribution,
    }).addTo(current);
  } else if (layerMode === "photo") {
    const photo = f.imagery[0];
    if (photo && photo.bounds && photo.bounds.length === 4) {
      const [w, s, e, n] = photo.bounds;
      activePhotoOverlay = L.imageOverlay(photo.url, [[s, w], [n, e]], {
        opacity: layerOpacity,
        attribution: photo.source || "Landsat · NASA / USGS",
      }).addTo(current);
    }
  }

  // 2. Context lines from public/data/context-osm.geojson (filtered for validity)
  if (showOsmContext && osmContextData) {
    activeOsmLayer = L.geoJSON(osmContextData, {
      attribution: "© OpenStreetMap contributors (ODbL)",
      filter: (feature) => {
        if (!filterOsmFeature(feature)) return false;
        // Filter features belonging to the current site (or show nearby)
        const p = feature.properties || {};
        return !p.siteId || p.siteId === f.id;
      },
      style: (feature) => {
        const p = feature.properties || {};
        if (p.highway) {
          const isMajor =
            p.highway === "trunk" ||
            p.highway === "secondary" ||
            p.highway === "tertiary";
          return {
            color: isMajor ? "#7d8471" : "#9ca392",
            weight: isMajor ? 2.5 : 1.5,
            opacity: 0.75,
            dashArray:
              p.highway === "track" || p.highway === "path" ? "4 4" : null,
          };
        }
        if (p.waterway || p.natural === "water" || p.water) {
          return {
            color: "#527f8d",
            weight: 2,
            opacity: 0.8,
            fillColor: "#759ca8",
            fillOpacity: 0.35,
          };
        }
        return { color: "#8a9184", weight: 1, opacity: 0.6 };
      },
      pointToLayer: (feature, latlng) => {
        const p = feature.properties || {};
        const name =
          state.lang === "bn" && p["name:bn"]
            ? p["name:bn"]
            : p["name:en"] || p.name || "";
        return L.marker(latlng, {
          icon: L.divIcon({
            className: "osm-place-icon",
            html: `<span class="osm-village-label">${esc(name)}</span>`,
            iconAnchor: [20, 10],
          }),
          interactive: false,
          keyboard: false, // village names are labels, not controls
        });
      },
    }).addTo(current);
  }

  haloPoly.addTo(current);
  poly.addTo(current);

  function syncPolyGeom(pts) {
    poly.setLatLngs(pts);
    haloPoly.setLatLngs(pts);
  }

  function clearCornerHandles() {
    cornerMarkers.forEach((m) => m.remove());
    cornerMarkers = [];
  }

  function renderCornerHandles() {
    clearCornerHandles();
    if (!drawMode) return;
    drawPoints.forEach((pt, idx) => {
      const icon = L.divIcon({
        className: "corner-marker-handle",
        html: `<div class="corner-marker-dot" title="${t("Drag corner or tap to remove", "কোণ টানুন বা মুছতে চাপুন")}"></div>`,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });
      const marker = L.marker(pt, {
        icon,
        draggable: true,
        keyboard: true,
        alt: `${t("Corner", "কোণ")} ${idx + 1}`,
      }).addTo(current);

      marker.on("drag", (e) => {
        const { lat, lng } = e.target.getLatLng();
        drawPoints[idx] = [lat, lng];
        if (drawLayer) drawLayer.setLatLngs(drawPoints);
        syncPolyGeom(drawPoints);
        updateDraw();
      });

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        if (drawPoints.length <= 3) {
          toast(t("A boundary needs at least three corners.", "জমির সীমানার জন্য অন্তত তিনটি কোণ থাকা প্রয়োজন।"));
          return;
        }
        drawPoints.splice(idx, 1);
        if (drawLayer) drawLayer.setLatLngs(drawPoints);
        syncPolyGeom(drawPoints);
        renderCornerHandles();
        updateDraw();
      });

      cornerMarkers.push(marker);
    });
  }

  if (regional) {
    try {
      const gj = await (await fetch("data/rangpur_upazilas.geojson")).json();
      if (current !== leafletMap) return;
      const validFeatures = gj.features?.filter(filterOsmFeature) || [];
      const validGj = { ...gj, features: validFeatures };
      const region = L.geoJSON(validGj, {
        style: {
          color: "#9ca889",
          weight: 1,
          fillColor: "#b7c69d",
          fillOpacity: 0.55,
        },
        interactive: false,
      }).addTo(current);
      region.bringToBack();
      if (region.getBounds().isValid()) {
        current.fitBounds(region.getBounds(), { padding: [12, 12] });
      }
      earth.fields.forEach((other) =>
        L.circleMarker([other.lat, other.lon], {
          radius: 6,
          color: "#d6ec97",
          fillColor: "#2c4b35",
          fillOpacity: 1,
        })
          .addTo(current)
          .bindTooltip(fieldName(other), {
            permanent: true,
            direction: "right",
          })
          .on("click", () => setField(other.id)),
      );
      document.querySelector("#map-label").textContent = t(
        "RANGPUR  /  PREPARED SITES",
        "রংপুর  /  প্রস্তুত জমি",
      );
    } catch {
      current.setView([25.65, 89.25], 10);
    }
  } else {
    poly.bindTooltip(t("Demo plot", "নমুনা জমি"), {
      direction: "center",
      permanent: false,
    });
  }

  if (drawMode) {
    drawPoints = polygon().map((p) => [...p]);
    if (drawLayer) drawLayer.remove();
    drawLayer = L.polygon(drawPoints, {
      color: "#f6d879",
      weight: 2,
      dashArray: "4 4",
    }).addTo(current);
    renderCornerHandles();
    updateDraw();
  }

  current.on("click", (event) => {
    const { lat, lng } = event.latlng;
    if (drawMode) {
      const [w, s, e, n] = f.imagery[0]?.bounds || [];
      if (!(lng >= w && lng <= e && lat >= s && lat <= n)) {
        toast(
          t(
            "Draw inside this prepared image.",
            "প্রস্তুত ছবির ভেতরে সীমানা আঁকুন।",
          ),
        );
        return;
      }
      drawPoints.push([lat, lng]);
      if (drawLayer) drawLayer.remove();
      drawLayer = L.polygon(drawPoints, {
        color: "#f6d879",
        weight: 2,
        dashArray: "4 4",
      }).addTo(current);
      syncPolyGeom(drawPoints);
      renderCornerHandles();
      updateDraw();
      return;
    }

    // Tap to inspect: fetch ndvi from ndvi-grid.json
    const pts = polygon();
    const isInside = pointInPoly([lat, lng], pts);
    const m = f.monthly?.[state.month] || {};

    const targetGrid = ndviGridData?.grids?.find(
      (g) => g.siteId === f.id && g.date === activeDate,
    ) || ndviGridData?.grids?.find((g) => g.siteId === f.id);
    let probeNdvi = null;
    let cellSizeMetres = targetGrid?.cellSizeMetres || 20;
    if (targetGrid) {
      probeNdvi = queryNdvi(targetGrid, lat, lng);
    } else if (activeDate === "2024-01-28") {
      probeNdvi = f.imagery[0]?.ndvi ?? null;
      cellSizeMetres = 30;
    }
    const ndviDisplayStr = formatNdvi(probeNdvi);

    const statusWord = isInside
      ? t("Inside field boundary", "জমির সীমানার ভেতরে")
      : t("Outside field boundary", "জমির সীমানার বাইরে");

    const popupHtml = `
      <div class="inspect-card">
        <div class="inspect-header">
          <strong>${isInside ? "✓ " + esc(fieldName(f)) : esc(statusWord)}</strong>
          <span class="tag ${isInside ? "green" : "amber"}">${isInside ? t("Field plot", "জমি") : t("Surroundings", "আশেপাশে")}</span>
        </div>
        <div class="inspect-coords">${num(lat, 5)}° N · ${num(lng, 5)}° E</div>
        <dl class="inspect-grid">
          <div class="inspect-item">
            <dt>${t("NDVI (Greenness)", "NDVI (সবুজভাব)")}</dt>
            <dd><strong>${esc(ndviDisplayStr)}</strong></dd>
          </div>
          <div class="inspect-item">
            <dt>${t("Cell size", "সেল সাইজ")}</dt>
            <dd>${num(cellSizeMetres)} m</dd>
          </div>
          <div class="inspect-item">
            <dt>${t("Observation date", "পর্যবেক্ষণের তারিখ")}</dt>
            <dd>${esc(activeDate)}</dd>
          </div>
          <div class="inspect-item">
            <dt>${t("Surface wetness", "মাটির আর্দ্রতা")}</dt>
            <dd>${Number.isFinite(m.wetness) ? num(m.wetness, 2) : t("No data", "তথ্য নেই")}</dd>
          </div>
          <div class="inspect-item">
            <dt>${t("Rainfall", "বৃষ্টি")}</dt>
            <dd>${Number.isFinite(m.rainGpm) ? num(m.rainGpm, 1) + " mm" : t("No data", "তথ্য নেই")}</dd>
          </div>
          <div class="inspect-item">
            <dt>${t("Temp", "তাপমাত্রা")}</dt>
            <dd>${Number.isFinite(m.tmean) ? num(m.tmean, 1) + " °C" : t("No data", "তথ্য নেই")}</dd>
          </div>
        </dl>
        <div class="inspect-footer">
          ◈ ${t("Estimated", "স্যাটেলাইট অনুমান")} · ${layerMode === "photo" ? "Landsat 8 · 30 m" : "Sentinel-2 L2A · 10/20 m"} · ${esc(activeDate)}
        </div>
      </div>
    `;

    L.popup({ className: "field-inspect-popup", maxWidth: 280, closeButton: true })
      .setLatLng(event.latlng)
      .setContent(popupHtml)
      .openOn(current);
  });
}
function updateDraw() {
  const help = document.querySelector("#drawing-help");
  if (!help) return;
  const currentAreaHa = polygonValid(drawPoints) ? areaHa(drawPoints) : 0;
  const areaLiveStr = currentAreaHa > 0 ? `<div style="margin: 6px 0; font-size: 13px;"><b>${t("Live area:", "বর্তমান আয়তন:")}</b> ${units(currentAreaHa)}</div>` : "";
  help.innerHTML = drawMode
    ? `<div class="notice">${t("Drag corners or tap map to add. Tap a corner to remove.", "কোণ টেনে সরান বা মানচিত্রে চেপে যোগ করুন। মুছতে কোণে চাপুন।")} <b>${num(drawPoints.length)}</b> ${t("corners", "টি কোণ")} ${areaLiveStr}<div class="toolbar-inline">${button(t("Save boundary", "সীমানা সংরক্ষণ"), "finish-draw", "small primary")}${button(t("Enter corners", "কোণ লিখুন"), "coordinates", "small")}${button(t("Cancel", "বাতিল"), "cancel-draw", "small")}${drawPoints.length ? button(t("Undo corner", "শেষ কোণ বাদ"), "undo-corner", "small") : ""}${button(t("Reset to demo outline", "নমুনা সীমানায় ফিরুন"), "reset-demo", "small")}</div></div>`
    : "";
}
function searchModal() {
  modal(
    t("Find a field", "জমি খুঁজুন"),
    `<form id="field-search" class="search-form"><label for="lookup">${t("Upazila, plot code, or latitude and longitude", "উপজেলা, জমির কোড অথবা অক্ষাংশ ও দ্রাঘিমাংশ")}</label><input id="lookup" name="query" placeholder="Mithapukur / RG-01 / 25.54, 89.27" autocomplete="off"><button class="button primary">${icon("search")} ${t("Search", "খুঁজুন")}</button></form><p class="note">${t("Three prepared locations have satellite imagery. Coordinate search checks the footprint of each image.", "তিনটি স্থানের স্যাটেলাইট ছবি প্রস্তুত আছে। স্থানাঙ্ক দিয়ে খুঁজলে তা ছবির সীমানায় আছে কি না দেখা হয়।")}</p><div id="search-results">${searchResults("")}</div>`,
  );
  setTimeout(() => document.querySelector("#lookup")?.focus(), 0);
}
function searchResults(query) {
  const q = query.trim().toLowerCase(),
    xy = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const matches = earth.fields.filter((f, i) => {
    if (xy) {
      const a = Number(xy[1]),
        b = Number(xy[2]),
        [w, s, e, n] = f.imagery[0]?.bounds || [];
      return a >= s && a <= n && b >= w && b <= e;
    }
    return [f.name, fieldName(f), `rg-0${i + 1}`, `rg–0${i + 1}`].some((v) =>
      v.toLowerCase().includes(q),
    );
  });
  return matches.length
    ? matches
        .map(
          (f) =>
            `<button class="result-option" data-action="select-result" data-value="${f.id}">${icon("pin")}<span><b>${esc(fieldName(f))}</b><small>${f.lat}° N · ${f.lon}° E</small></span>${icon("right")}</button>`,
        )
        .join("")
    : `<div class="empty">${t("No prepared coverage here. Try Mithapukur, Pirganj, or Gangachara.", "এই স্থানের তথ্য প্রস্তুত নেই। মিঠাপুকুর, পীরগঞ্জ বা গঙ্গাচড়া লিখুন।")}${xy ? button(t("Measure an unsupported plot", "অন্য জমি মাপুন"), "measure-new", "small", "draw", xy[1] + "," + xy[2]) : ""}</div>`;
}
function editProfile() {
  const p = profile();
  modal(
    t("Field assumptions", "জমির নিজস্ব তথ্য"),
    `<p class="note">${t("The initial entries are demo assumptions. Replace them with the farmer’s actual plan. Changes also affect rotation eligibility.", "শুরুর মানগুলো নমুনা। কৃষকের বাস্তব তথ্য লিখলে ফসলচক্রের ফলও বদলাবে।")}</p><form id="profile-form"><div class="form-grid section-space">${select(
      t("Planning crop", "পরিকল্পনার ফসল"),
      "crop",
      agronomy.crops.map((c) => [c.id, cropName(c.id)]),
      p.crop,
    )}${input(t("Expected Aman harvest", "সম্ভাব্য আমন কাটার দিন"), "harvest", p.harvest, "required", "date")}${select(
      t("Irrigation access", "সেচের সুবিধা"),
      "irrigation",
      [
        ["reliable", t("Reliable", "নির্ভরযোগ্য")],
        ["limited", t("Limited", "সীমিত")],
        ["none", t("Unavailable", "নেই")],
      ],
      p.irrigation,
    )}${select(
      t("Input budget", "উপকরণের বাজেট"),
      "budget",
      [
        ["low", t("Low", "কম")],
        ["medium", t("Medium", "মাঝারি")],
        ["high", t("High", "বেশি")],
      ],
      p.budget,
    )}</div><div class="spacer"></div><button class="button primary">${t("Save field details", "তথ্য সংরক্ষণ করুন")}</button></form>`,
  );
}
function fieldAction(action, value) {
  if (action === "set-layer-mode") {
    layerMode = value;
    if (value === "photo") {
      activeDate = "2024-01-28";
    } else {
      activeDate = "2024-03-09";
    }
    repaint();
  }
  if (action === "set-active-date") {
    activeDate = value;
    repaint();
  }
  if (action === "toggle-osm-context") {
    showOsmContext = !showOsmContext;
    repaint();
  }
  if (action === "search") searchModal();
  if (action === "swap-image") {
    showLandsat = !showLandsat;
    regional = false;
    repaint();
  }
  if (action === "select-result") {
    close();
    setField(value);
  }
  if (action === "profile") editProfile();
  if (action === "region") {
    regional = !regional;
    repaint();
  }
  if (action === "draw") {
    if (regional) {
      regional = false;
    }
    drawMode = !drawMode;
    if (!drawMode) {
      drawPoints = [];
      if (drawLayer) drawLayer.remove();
      cornerMarkers.forEach((m) => m.remove());
      cornerMarkers = [];
    }
    repaint();
  }
  if (action === "cancel-draw") {
    drawMode = false;
    drawPoints = [];
    if (drawLayer) drawLayer.remove();
    cornerMarkers.forEach((m) => m.remove());
    cornerMarkers = [];
    repaint();
  }
  if (action === "undo-corner") {
    drawPoints.pop();
    if (drawPoints.length === 0) {
      drawPoints = polygon().map((p) => [...p]);
    }
    repaint();
  }
  if (action === "reset-demo") {
    delete state.boundaries[state.fieldId];
    drawMode = false;
    drawPoints = [];
    if (drawLayer) drawLayer.remove();
    cornerMarkers.forEach((m) => m.remove());
    cornerMarkers = [];
    persist();
    repaint();
    toast(t("Boundary reset to demo outline", "নমুনা সীমানায় ফিরে যাওয়া হয়েছে"));
  }
  if (action === "finish-draw") {
    if (!polygonValid(drawPoints)) {
      toast(
        t(
          "Draw at least three corners without crossing edges.",
          "অন্তত তিনটি কোণ দিন। সীমানার রেখা একে অপরকে পার হবে না।",
        ),
      );
      return;
    }
    state.boundaries[state.fieldId] = drawPoints.slice();
    persist();
    repaint();
    toast(
      t(
        "Boundary saved. The planner now uses your area.",
        "সীমানা সংরক্ষিত। পরিকল্পনায় নতুন আয়তন ব্যবহার হবে।",
      ),
    );
  }
  if (action === "export-archive") {
    download(
      `rangpur-${field().id}-monthly-2021-2025.csv`,
      csv(archive.fields[field().id].monthly),
      "text/csv;charset=utf-8",
    );
  }
  if (action === "export-days") {
    download(
      `rangpur-${field().id}-2024.csv`,
      csv(field().daily),
      "text/csv;charset=utf-8",
    );
  }
}
function fieldSubmit(form) {
  const d = new FormData(form);
  if (form.id === "field-search") {
    document.querySelector("#search-results").innerHTML = searchResults(
      String(d.get("query") || ""),
    );
    return true;
  }
  if (form.id === "profile-form") {
    setProfile(Object.fromEntries(d));
    close();
    repaint();
    toast(t("Field assumptions saved", "জমির তথ্য সংরক্ষিত"));
    return true;
  }
  return false;
}

function fieldInput(el) {
  if (el.name === "layerOpacity") {
    layerOpacity = parseFloat(el.value);
    if (activeTileLayer) activeTileLayer.setOpacity(layerOpacity);
    if (activePhotoOverlay) activePhotoOverlay.setOpacity(layerOpacity);
  }
}

export {
  home,
  seasonView,
  mountMap,
  disposeMap,
  setField,
  fieldAction,
  fieldInput,
  fieldSubmit,
  searchResults,
  formatNdvi,
  formatDateLabel,
  filterOsmFeature,
  queryNdvi,
  projectWgs84ToUtm45N,
};
