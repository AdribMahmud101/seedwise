/* global L */
import { projectWgs84ToUtm45N, pointInPoly } from "./spatial.js";
import { units } from "./boundary.js";
import {
  nasaBadge,
  state,
  earth,
  allFields,
  agronomy,
  archive,
  outlook as outlookPack,
  floodFields as floodPack,
  graceGroundwater as gracePack,
  persist,
  t,
  deskNo,
  esc,
  num,
  monthName,
  field,
  fieldName,
  polygon,
  area,
  basePolygon,
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
  truth,
  stateEmpty,
  stateError,
  fetchJsonMaybeGzip,
} from "./ui.js";
import { rotationEvidence, polygonValid, mean, areaHa } from "./engine.js";
import {
  getCachedPower,
  fetchLivePower,
} from "./powerlive.js";
import { getSmapSurfaceForMonth } from "./water.js";
import { netArea, polygonPerimeterM, DEFAULT_NET_INPUTS } from "./netarea.js";
import { outlookCard, floodCard, outlookSite, rainVerdict, backtestYears } from "./outlook-flood.js";
import { mountBarChart, mountLineChart } from "./charts-react.js";

let seasonChartDisposers = [];

export function disposeSeasonCharts() {
  seasonChartDisposers.forEach((dispose) => dispose());
  seasonChartDisposers = [];
}

export function mountSeasonCharts() {
  disposeSeasonCharts();
  document.querySelectorAll("#main-content .sw-chart").forEach((el) => {
    const props = JSON.parse(el.dataset.chartProps);
    seasonChartDisposers.push(el.dataset.chart === "annual-rain"
      ? mountBarChart(el, props)
      : mountLineChart(el, props));
  });
}

function chartPlaceholder(type, props, label) {
  return `<div class="sw-chart" data-chart="${type}" data-chart-props="${esc(JSON.stringify(props))}" role="img" aria-label="${esc(label)}"></div>`;
}

function seasonLineChart(series, months, options) {
  if (!series.some((s) => s.values.some(finiteNum))) return `<p class="empty">${t("No valid observations", "বৈধ পর্যবেক্ষণ নেই")}</p>`;
  const keys = series.map((s, i) => `s${i}`);
  const labels = months.map((_, i) => monthName(i, true));
  const data = months.map((_, i) => Object.fromEntries([
    ["month", labels[i]],
    ...series.map((s, j) => [keys[j], finiteNum(s.values[i]) ? s.values[i] : null]),
  ]));
  const props = {
    data,
    series: series.map((s, i) => ({ key: keys[i], label: s.label, color: s.color, dash: s.dash })),
    unit: options.unit,
    max: options.max,
    selected: labels[state.month],
  };
  return `<div class="chart-legend">${series.map((s) => `<span><i class="legend-dot" style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}<span>${esc(options.unit)}</span></div>` +
    chartPlaceholder("monthly-lines", props, options.description);
}

export function netInputsFor(fieldId = state.fieldId) {
  const saved = state.netInputs?.[fieldId];
  return saved ? { ...DEFAULT_NET_INPUTS, ...saved } : { ...DEFAULT_NET_INPUTS };
}
export function netAreaFor(f = field()) {
  const pts = state.boundaries[f.id] || basePolygon(f);
  const grossHa = areaHa(pts);
  const perimM = polygonPerimeterM(pts);
  return netArea(grossHa, perimM, netInputsFor(f.id));
}
export function isNetEdited(fieldId = state.fieldId) {
  return !!state.netInputs?.[fieldId];
}
// Truth label for the field's bund/drain/path widths.
export function netSourceLabel(fieldId = state.fieldId) {
  return isNetEdited(fieldId) ? 'Entered by farmer' : 'Scenario default';
}

function isOnline() {
  return typeof navigator !== "undefined" && "onLine" in navigator ? !!navigator.onLine : true;
}

// Bangladesh coordinate bounding box
export const BD_BBOX = {
  minLat: 20.5,
  maxLat: 26.7,
  minLon: 88.0,
  maxLon: 92.7,
};

let placesData = null;
let powerLoading = false;
let powerError = null;
let fieldCtaObserver = null;

async function loadCustomPower(f = field(), fetchFn = fetch) {
  if (!f || !f.custom) return;
  const cached = getCachedPower(f.id);
  if (cached && cached.monthly && cached.monthly.length > 0) {
    powerLoading = false;
    powerError = null;
    return cached;
  }
  powerLoading = true;
  powerError = null;
  repaint();
  try {
    const res = await fetchLivePower(f, fetchFn);
    powerLoading = false;
    powerError = null;
    repaint();
    return res;
  } catch (err) {
    powerLoading = false;
    powerError = err;
    repaint();
  }
}

let leafletMap = null,
  drawLayer = null,
  drawPoints = [],
  cornerMarkers = [],
  tapMarker = null,
  drawMode = false,
  pickMapMode = false,
  regional = false,
  showLandsat = false,
  mapLayersData = null,
  ndviGridData = null,
  moistureGridData = null,
  moistureGridLoading = null,
  osmContextData = null,
  lowGroundData = null,
  showLowGround = false,
  activeTileLayer = null,
  activeBaseTileLayer = null,
  activeOsmLayer = null,
  layerMode = isOnline() ? "high-detail" : "natural", // 'high-detail' | 'natural' | 'ndvi'
  activeDate = "2024-11-09",
  layerOpacity = 0.6,
  showOsmContext = true,
  tileErrorCount = 0,
  lastView = null, // keeps pan/zoom across repaints of the same field
  mountedFieldId = null; // field the live map shows; state.fieldId may already point at the next one

const colors = {
  wetness: "#658261",
  rainGpm: "#518899",
  tmean: "#bd8d49",
  et0: "#9e9275",
  smap: "#658261",
};

function getLayerMode() {
  return layerMode;
}

function setLayerMode(mode) {
  layerMode = mode;
}

// Esri imagery depth varies by place (Rangpur stops at z18; cities reach z19-20). Ask Esri's tilemap which
// zoom has real photos at a point, so we never show its grey "Map data not yet available" tiles.
const ESRI_TILEMAP = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap";
const esriDepthCache = new Map();
export async function esriMaxZoom(lat, lon, fetchFn = fetch) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (esriDepthCache.has(key)) return esriDepthCache.get(key);
  const zooms = [20, 19, 18, 17];
  const has = await Promise.all(
    zooms.map(async (z) => {
      const n = 2 ** z;
      const x = Math.floor(((lon + 180) / 360) * n);
      const y = Math.floor(((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n);
      try {
        const j = await (await fetchFn(`${ESRI_TILEMAP}/${z}/${y}/${x}/1/1`)).json();
        return j?.data?.[0] === 1;
      } catch {
        return false;
      }
    }),
  );
  const i = has.indexOf(true);
  const depth = i === -1 ? 18 : zooms[i]; // probe failed: 18 is safe for all three pilot sites
  esriDepthCache.set(key, depth);
  return depth;
}

function switchToOfflineNatural(reason = "offline") {
  layerMode = "natural";
  activeDate = "2024-11-09";
  toast(
    t(
      "No internet — showing offline 10 m satellite map",
      "ইন্টারনেট সংযোগ নেই — অফলাইন ১০ মিটার স্যাটেলাইট মানচিত্র দেখানো হচ্ছে",
    ),
  );
  repaint();
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

function queryLowGround(site, lat, lon) {
  if (!site || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const [w, s, e, n] = site.bounds;
  if (lon < w || lon > e || lat < s || lat > n) return null;
  const col = Math.min(site.width - 1, Math.floor((lon - w) / (e - w) * site.width));
  const row = Math.min(site.height - 1, Math.floor((n - lat) / (n - s) * site.height));
  const value = site.grid[row]?.[col];
  return value === "l" ? t("lower than surroundings", "আশেপাশের চেয়ে নিচু")
    : value === "e" ? t("about level", "প্রায় সমতল")
    : value === "h" ? t("higher", "উঁচু") : null;
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
  if (!placesData) {
    try {
      const res = await fetch("data/places-rangpur.json");
      if (res.ok) placesData = await res.json();
    } catch {
      // offline fallback or test runner
    }
  }
  // Optional local overlay must not prevent the imagery or context data from loading.
  if (!lowGroundData) {
    try {
      const response = await fetch("data/low-ground.json");
      if (response.ok) lowGroundData = await response.json();
    } catch {
      // No prepared overlay: keep its control hidden.
    }
  }
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

async function loadMoistureData() {
  if (moistureGridData) return;
  if (!moistureGridLoading) {
    moistureGridLoading = (async () => {
      try {
        // The full grid pack is gzip JSON to stay within the offline budget.
        moistureGridData = await fetchJsonMaybeGzip("data/moisture-grid.json");
      } catch {
        // Missing offline pack: show no reliable observation and allow another tap to retry.
      } finally {
        moistureGridLoading = null;
      }
    })();
  }
  await moistureGridLoading;
}

function inspectPopup(f, lat, lon) {
  const isInside = pointInPoly([lat, lon], state.boundaries[f.id] || polygon());
  const statusWord = isInside
    ? t("Inside field boundary", "জমির সীমানার ভেতরে")
    : t("Outside field boundary", "জমির সীমানার বাইরে");
  const siteGrids = f.custom ? [] : ndviGridData?.grids?.filter(g => g.siteId === f.id) || [];
  const target = siteGrids.find(g => g.date === activeDate) || siteGrids[0];
  const moisture = f.custom ? null : moistureGridData?.grids?.find(g => g.siteId === f.id && g.date === target?.date);
  const ndmi = queryNdvi(moisture, lat, lon);
  const unavailable = t("Not prepared for this field", "এই জমির জন্য প্রস্তুত নেই");
  const noObservation = t("No reliable observation", "নির্ভরযোগ্য পর্যবেক্ষণ নেই");
  const dateLabel = grid => grid ? new Intl.DateTimeFormat(state.lang === "bn" ? "bn-BD" : "en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(grid.date + "T00:00:00Z")) : "";
  const march = siteGrids.find(g => g.date.startsWith("2024-03-"));
  const november = siteGrids.find(g => g.date.startsWith("2024-11-"));
  const ground = f.custom ? unavailable : queryLowGround(lowGroundData?.sites?.find(s => s.id === f.id), lat, lon) || noObservation;
  const months = f.custom ? getCachedPower(f.id)?.monthly || f.monthly : f.monthly;
  const m = months?.[state.month] || {};
  const weather = (value, places, unit = "") => Number.isFinite(value) ? num(value, places) + unit : t("No data", "তথ্য নেই");
  const moistureWord = ndmi < 0 ? t("Dry", "শুকনো") : ndmi <= 0.2 ? t("Moderate", "মাঝারি") : t("Moist", "আর্দ্র");
  return `
    <div class="inspect-card">
      <div class="inspect-header">
        <strong>${isInside ? "✓ " + esc(fieldName(f)) : esc(statusWord)}</strong>
        <span class="tag ${isInside ? "green" : "amber"}">${isInside ? t("Field plot", "জমি") : t("Surroundings", "আশেপাশে")}</span>
      </div>
      <div class="inspect-coords">${num(lat, 5)}° N · ${num(lon, 5)}° E</div>
      <h3 class="inspect-group">${t("At this spot", "এই জায়গায়")}</h3>
      <dl class="inspect-grid">
        <div class="inspect-item">
          <dt>${t("Greenness NDVI", "সবুজভাব NDVI")}</dt>
          <dd>${f.custom ? unavailable : esc(formatNdvi(queryNdvi(target, lat, lon)))}
            ${target ? `<small>${esc(dateLabel(target))}</small>` : ""}
            ${march && november ? `<small>${t("Mar → Nov", "মার্চ → নভেম্বর")}: ${esc(formatNdvi(queryNdvi(march, lat, lon)))} → ${esc(formatNdvi(queryNdvi(november, lat, lon)))}</small>` : ""}
          </dd>
        </div>
        <div class="inspect-item">
          <dt>${t("Plant & soil moisture (NDMI)", "উদ্ভিদ ও মাটির আর্দ্রতা (NDMI)")}</dt>
          <dd>${f.custom ? unavailable : ndmi === null ? noObservation : `${num(ndmi, 3)} · ${moistureWord}`}
            ${moisture ? `<small>${esc(dateLabel(moisture))}</small>` : ""}
          </dd>
        </div>
        <div class="inspect-item inspect-ground"><dt>${t("Ground", "জমি")} ${!f.custom && ground !== noObservation ? nasaBadge("nasadem") : ""}</dt><dd>${esc(ground)}</dd></div>
      </dl>
      <h3 class="inspect-group">${t("Area weather", "এলাকার আবহাওয়া")} · ${monthName()} ${t("2024", "২০২৪")} ${nasaBadge(["power", "imerg"])}</h3>
      <dl class="inspect-grid">
        <div class="inspect-item"><dt>${t("Rain", "বৃষ্টি")}</dt><dd>${weather(m.rainGpm, 1, t(" mm", " মিমি"))}</dd><small>${t("IMERG · ~10 km", "IMERG · প্রায় ১০ কিমি")}</small></div>
        <div class="inspect-item"><dt>${t("Wetness index", "আর্দ্রতা সূচক")}</dt><dd>${weather(m.wetness, 2)}</dd><small>${t("POWER · ~50 km", "POWER · প্রায় ৫০ কিমি")}</small></div>
        <div class="inspect-item"><dt>${t("Temp", "তাপমাত্রা")}</dt><dd>${weather(m.tmean, 1, " °C")}</dd><small>${t("POWER · ~50 km", "POWER · প্রায় ৫০ কিমি")}</small></div>
      </dl>
      <div class="inspect-footer">${t("◈ Estimated · Sentinel-2 L2A · NASA POWER · GPM IMERG", "◈ স্যাটেলাইট অনুমান · Sentinel-2 L2A · NASA POWER · GPM IMERG")}</div>
    </div>`;
}
function setField(id) {
  state.fieldId = id;
  regional = false;
  drawMode = false;
  drawPoints = [];
  cornerMarkers = [];
  lastView = null;
  persist();
  repaint();
  setTimeout(() => {
    const selectedChip = document.querySelector(".field-selector .field-chip.selected");
    if (selectedChip && typeof selectedChip.scrollIntoView === "function") {
      selectedChip.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    }
  }, 0);
}
function disposeMap() {
  fieldCtaObserver?.disconnect();
  fieldCtaObserver = null;
  if (tapMarker) {
    tapMarker.remove();
    tapMarker = null;
  }
  const sheet = document.querySelector("#inspect-sheet");
  if (sheet) sheet.innerHTML = "";
  if (leafletMap) {
    lastView = { fieldId: mountedFieldId, regional, center: leafletMap.getCenter(), zoom: leafletMap.getZoom() };
    leafletMap.off();
    leafletMap.remove();
    leafletMap = null;
  }
  activeTileLayer = null;
  activeBaseTileLayer = null;
  activeOsmLayer = null;
  drawLayer = null;
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
function stats(months = field().monthly, period = "2024") {
  const f = field();
  if (f.custom && !months) {
    if (powerLoading) {
      return panel(
        t("Historical observations", "পুরনো পর্যবেক্ষণ"),
        `<div class="empty"><h3>${t("Loading weather data from NASA POWER…", "NASA POWER থেকে আবহাওয়া তথ্য লোড হচ্ছে…")}</h3></div>`,
      );
    }
    if (powerError) {
      return panel(
        t("Historical observations", "পুরনো পর্যবেক্ষণ"),
        stateError(
          powerError.offline
            ? t("Internet needed to fetch NASA weather data", "NASA আবহাওয়ার তথ্য আনার জন্য ইন্টারনেট প্রয়োজন")
            : t("Could not load NASA weather data", "NASA আবহাওয়ার তথ্য লোড করা যায়নি"),
          "retry-power",
        ),
      );
    }
    return panel(
      t("Historical observations", "পুরনো পর্যবেক্ষণ"),
      stateEmpty(
        t("Needs internet connection to fetch NASA weather data", "NASA আবহাওয়ার তথ্য সংগ্রহের জন্য ইন্টারনেট প্রয়োজন"),
        t("Fetch weather data", "আবহাওয়া তথ্য আনুন"),
        "retry-power",
      ),
    );
  }
  if (!months || !months.length) {
    return "";
  }
  const m = months[state.month] || {};
  const retrievedDate = f.custom && f.retrievedAt ? f.retrievedAt.slice(0, 10) : "2024";
  const defs = [
    [
      "wetness",
      t("Soil wetness", "মাটির আর্দ্রতা"),
      "index 0–1",
      "water",
      t("POWER · index 0–1", "POWER · সূচক ০–১"),
      2,
      "MODELED",
      { source: "NASA POWER", date: f.custom ? `fetched ${retrievedDate}` : "2024", cell: "50km" },
    ],
  ];

  // Add SMAP tile if field is prepared
  const smapData = getSmapSurfaceForMonth(f.id, state.month);
  if (smapData) {
    defs.push([
      "smap",
      t("Soil water", "মাটির পানি"),
      "m³/m³",
      "water",
      t("SMAP L4 · 9 km", "SMAP L4 · ৯ কিমি"),
      2,
      "REMOTE_OBSERVED",
      { source: "NASA SMAP L4", date: "2024", cell: "9 km" },
    ]);
  } else {
    // For unprepared fields, add empty SMAP tile
    defs.push([
      "smap",
      t("Soil water", "মাটির পানি"),
      "m³/m³",
      "water",
      t("Not prepared for this field", "এই জমির তথ্য প্রস্তুত নেই"),
      0,
      null,
      null,
    ]);
  }

  defs.push(
    [
      "rainGpm",
      t("Rainfall", "বৃষ্টিপাত"),
      "mm",
      "rain",
      t("IMERG · monthly total", "IMERG · মাসের মোট"),
      1,
      "REMOTE_OBSERVED",
      { source: "NASA GPM IMERG", date: f.custom ? `fetched ${retrievedDate}` : "2024", cell: "10km" },
    ],
    [
      "tmean",
      t("Temperature", "তাপমাত্রা"),
      "°C",
      "temp",
      t("POWER · monthly average", "POWER · মাসিক গড়"),
      1,
      "MODELED",
      { source: "NASA POWER", date: f.custom ? `fetched ${retrievedDate}` : "2024", cell: "50km" },
    ],
    [
      "et0",
      t("Water use", "পানির চাহিদা"),
      "mm",
      "sun",
      t("FAO-56 ETo · monthly total", "FAO-56 ETo · মাসের মোট"),
      1,
      "MODELED",
      { source: "FAO-56 ETo", date: f.custom ? `fetched ${retrievedDate}` : "2024", cell: "50km" },
    ],
  );
  
  return `<div class="data-row">${defs
    .map(([key, label, unit, symbol, foot, places, tag, opts]) => {
      let value, values, color, badge = "", status = "";
      if (key === "smap") {
        // Special handling for SMAP tile
        if (!smapData) {
          // Empty state for unprepared fields
          values = Array(12).fill(null);
          color = colors.wetness;
        } else {
          // SMAP tile with data - use 2024 monthly SFMC values for spark line
          value = smapData.sfmc;
          values = smapData.monthly2024;
          color = colors.smap;
          badge = nasaBadge("smap");
          status = smapData.status === "Dry" ? t("Dry", "শুষ্ক") : smapData.status === "Normal" ? t("Normal", "স্বাভাবিক") : t("Wet", "ভিজা");
        }
      } else {
        // Regular tiles
        value = m[key];
        values = months.map((v) => v[key]);
        color = colors[key];
        badge = Number.isFinite(value) ? nasaBadge({ wetness: "wetness", rainGpm: "imerg", tmean: "power", et0: "eto" }[key], f.custom ? `2024 · ${t("retrieved", "সংগৃহীত")} ${retrievedDate}` : period) : "";
      }
      return `<article class="data-stat"><div class="stat-top"><span>${label}</span>${icon(symbol)}</div><div class="stat-badge">${badge}</div><div class="stat-value"><span class="stat-number">${num(value, places)}<small>${unit}</small></span>${status ? `<span class="stat-status">${status}</span>` : ""}</div><div class="stat-spark">${spark(values, color)}</div><div class="stat-foot"><span class="stat-source" title="${esc(foot)}">${foot}</span><div class="stat-truth">${tag ? truth(tag, opts) : ""}</div></div></article>`;
    })
    .join("")}</div>`;
}
function mapImage(f) {
  return showLandsat ? f.imagery[0] : f.contextImage || f.imagery[0];
}
function home() {
  const f = field(),
    p = profile(),
    photoImage = f.imagery?.[0],
    ranks = f.monthly ? rotationEvidence(f.monthly, state.weights, p) : [];
  const first = ranks.find((r) => r.feasible);

  const online = isOnline();
  if (!online && layerMode === "high-detail") {
    layerMode = "natural";
  }

  // Dates for timeline: manifest Sentinel-2 dates (for natural & ndvi)
  const manifestDates = mapLayersData?.layers?.find((l) => l.id === "natural")?.dates?.map((d) => d.date) || [
    "2024-03-09",
    "2024-11-09",
  ];
  const timelineDates = manifestDates.map((d) => ({
    date: d,
    label: formatDateLabel(d),
    available: true,
  }));

  // Ensure activeDate is valid for current mode
  if (!timelineDates.some((td) => td.date === activeDate)) {
    activeDate = timelineDates.at(-1)?.date || "2024-11-09";
  }

  // Determine active chip info based on layerMode and activeDate
  let chipHtml = "";
  if (f.custom) {
    if (layerMode === "high-detail") {
      const chipText = t(
        "High-detail photo · Maxar · World Imagery · online",
        "উচ্চ রেজোলিউশন ছবি · ম্যাক্সার · এসরি ওয়ার্ল্ড ইমেজারি · অনলাইন",
      );
      chipHtml = `<span class="map-chip-text">${esc(chipText)}</span> ${truth("REMOTE_OBSERVED")}`;
    } else {
      const chipText = t(
        "Not prepared for this field · Satellite tiles unavailable",
        "এই জমির জন্য প্রস্তুত নয় · স্যাটেলাইট টাইলস প্রস্তুত নেই",
      );
      chipHtml = `<span class="map-chip-text">${esc(chipText)}</span> ${truth("UNKNOWN")}`;
    }
  } else if (layerMode === "high-detail") {
    const chipText = t(
      "High-detail photo · Maxar · 28 Nov 2022 · online",
      "উচ্চ রেজোলিউশন ছবি · ম্যাক্সার · ২৮ নভেম্বর ২০২২ · অনলাইন",
    );
    chipHtml = `<span class="map-chip-text">${esc(chipText)}</span> ${truth("REMOTE_OBSERVED")}`;
  } else if (layerMode === "natural") {
    const chipLabel = `ESA / Planetary Computer · ${formatDateLabel(activeDate)} · 10 m · ${t("◈ Estimated", "◈ স্যাটেলাইট অনুমান")}`;
    chipHtml = esc(chipLabel);
  } else {
    const chipLabel = `Sentinel-2 NDVI · ${formatDateLabel(activeDate)} · 10 m · ${t("◈ Estimated", "◈ স্যাটেলাইট অনুমান")}`;
    chipHtml = esc(chipLabel);
  }

  const hasCustomBoundary = !!state.boundaries[f.id];
  const lowGroundSite = lowGroundData?.sites?.find((site) => site.id === f.id && site.png);
  const currentDateObj = timelineDates.find((d) => d.date === activeDate);
  const isDateReliable = currentDateObj ? currentDateObj.available : false;
  const customIdx = (state.customFields || []).findIndex((cf) => cf.id === f.id);
  const plotDossierNum = f.custom ? `CF–0${customIdx + 1}` : `RG–0${earth.fields.indexOf(f) + 1}`;
  const net = netAreaFor(f);
  const dossierLocation = f.custom
    ? `${num(f.lat, 4)}° N, ${num(f.lon, 4)}° E · ${t("Bangladesh", "বাংলাদেশ")}`
    : t("Rangpur District, Bangladesh", "রংপুর জেলা, বাংলাদেশ");
  const boundaryTruth = state.boundaries[f.id]
    ? truth("FARMER_REPORTED", { source: "Farmer boundary", date: "2024" })
    : f.custom
      ? truth("SCENARIO", { source: "New custom field", date: "2024" })
      : truth("MODELED", { source: "Traced on Maxar photo", date: "28 Nov 2022" });
  const boundaryLabel = state.boundaries[f.id]
    ? t("Farmer drawn", "কৃষকের আঁকা")
    : f.custom
      ? t("Initial ~20 decimals", "প্রাথমিক ~২০ শতক")
      : t("Traced from photo", "ছবি দেখে আঁকা");

  // Legend HTML per active layer
  let legendHtml = "";
  if (layerMode === "natural") {
    legendHtml = `
      <div class="map-legend-bar">
        <strong>${t("Natural colour 10 m", "প্রাকৃতিক রং ১০ মি")}</strong>
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
  }

  const showTimeline = layerMode !== "high-detail";

  return (
    `<div class="field-compact-head">${header(
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
    )}${chips()}</div>` +
    `<div class="grid-two field-overview"><section class="panel"><div class="panel-header"><h2>${t("Field map", "জমির মানচিত্র")}</h2><div class="panel-header-actions">${tag(t("Satellite imagery", "স্যাটেলাইট ছবি"), "green")}</div></div>
 <div class="map-switcher">
   <div class="map-segmented" role="tablist" aria-label="${t("Map layer switcher", "মানচিত্রের স্তর নির্বাচন")}">
     <button type="button" class="button ${layerMode === "high-detail" ? "active" : ""}" data-action="set-layer-mode" data-value="high-detail" role="tab" aria-selected="${layerMode === "high-detail"}" ${!online ? "disabled" : ""} title="${!online ? t("Needs internet", "ইন্টারনেট প্রয়োজন") : ""}" aria-label="${t("High detail (online)", "উচ্চ স্পষ্টতা (অনলাইন)")}">${icon("camera", 14)} <span class="label-full">${t("High detail (online)", "উচ্চ স্পষ্টতা (অনলাইন)")}</span><span class="label-short">${t("Photo", "ছবি")}</span>${!online ? ` <small class="layer-offline-note">(${t("needs internet", "ইন্টারনেট প্রয়োজন")})</small>` : ""}</button>
     <button type="button" class="button ${layerMode === "natural" ? "active" : ""}" data-action="set-layer-mode" data-value="natural" role="tab" aria-selected="${layerMode === "natural"}" title="${t("Natural colour 10 m (offline)", "প্রাকৃতিক রং ১০ মি (অফলাইন)")}" aria-label="${t("Natural colour 10 m (offline)", "প্রাকৃতিক রং ১০ মি (অফলাইন)")}">${icon("layers", 14)} <span class="label-full">${t("Natural colour 10 m (offline)", "প্রাকৃতিক রং ১০ মি (অফলাইন)")}</span><span class="label-short">${t("Colour 10 m", "রং ১০ মি")}</span></button>
     <button type="button" class="button ${layerMode === "ndvi" ? "active" : ""}" data-action="set-layer-mode" data-value="ndvi" role="tab" aria-selected="${layerMode === "ndvi"}" title="${t("Greenness NDVI (offline)", "সবুজভাব NDVI (অফলাইন)")}" aria-label="${t("Greenness NDVI (offline)", "সবুজভাব NDVI (অফলাইন)")}">${icon("tree", 14)} <span class="label-full">${t("Greenness NDVI (offline)", "সবুজভাব NDVI (অফলাইন)")}</span><span class="label-short">${t("NDVI", "NDVI")}</span></button>
   </div>
   <div class="map-subcontrols">
     <div class="map-opacity-control">
       <label for="layer-opacity-slider">${t("Opacity", "স্বচ্ছতা")}:</label>
       <input type="range" id="layer-opacity-slider" name="layerOpacity" min="0.1" max="1.0" step="0.05" value="${layerOpacity}" title="${t("Adjust imagery opacity to view field outline", "জমির সীমানা স্পষ্ট দেখতে ছবির স্বচ্ছতা কমান-বাড়ান")}">
     </div>
     <button type="button" class="button small ${showOsmContext ? "primary" : ""}" data-action="toggle-osm-context">${icon("field", 14)} ${t("Context lines", "রাস্তা ও নদী")}</button>
     <button type="button" class="button small ${showLowGround ? "primary" : ""}" data-action="toggle-low-ground" aria-pressed="${showLowGround && !!lowGroundSite}" ${lowGroundSite ? "" : "hidden"}>${icon("water", 14)} ${t("Low ground", "নিচু জমি")}</button>
   </div>
 </div>
 ${showTimeline ? `
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
 </div>` : ""}
 <div class="map-shell">
   <div id="field-map" class="field-map" role="region" aria-label="${t("Interactive Rangpur field map", "রংপুরের ইন্টার‌্যাক্টিভ মানচিত্র")}"></div>
   <div class="map-overline" id="map-label">${chipHtml}</div>
   <div class="map-bottom">N ↑ &nbsp; ${num(f.lat, 3)}° N &nbsp; ${num(f.lon, 3)}° E</div>
 </div>
 ${legendHtml}
 ${showLowGround && lowGroundSite ? `<div class="map-legend-bar low-ground-legend">
   <span class="legend-swatch low-ground-swatch" aria-hidden="true"></span>
   <span class="low-ground-description">${t("Lower than land around it — water may collect after heavy rain. Approximate (30 m, includes trees)", "আশেপাশের জমির চেয়ে নিচু — ভারী বৃষ্টির পর পানি জমতে পারে। আনুমানিক (৩০ মি, গাছের উচ্চতাও অন্তর্ভুক্ত)")}</span>
   ${truth("MODELED")} ${nasaBadge("nasadem")}
 </div>` : ""}
 <div class="map-actions">
   <div class="map-controls">
     <button type="button" class="button small ${pickMapMode ? "primary" : ""} map-action-btn" data-action="toggle-pick-map" data-value="" title="${pickMapMode ? t("Cancel pick", "পয়েন্ট বাতিল") : t("Pick on map", "মানচিত্রে বাছুন")}" aria-label="${pickMapMode ? t("Cancel pick", "পয়েন্ট বাতিল") : t("Pick on map", "মানচিত্রে বাছুন")}">${icon("pin")}<span class="label-full">${pickMapMode ? t("Cancel pick", "পয়েন্ট বাতিল") : t("Pick on map", "মানচিত্রে বাছুন")}</span><span class="label-short">${pickMapMode ? t("Cancel", "বাতিল") : t("Pick", "বাছুন")}</span></button>
     <button type="button" class="button small map-action-btn" data-action="region" data-value="" title="${regional ? t("Satellite", "স্যাটেলাইট") : t("District", "জেলা")}" aria-label="${regional ? t("Satellite", "স্যাটেলাইট") : t("District", "জেলা")}">${icon("layers")}<span class="label-full">${regional ? t("Satellite", "স্যাটেলাইট") : t("District", "জেলা")}</span><span class="label-short">${regional ? t("Satellite", "স্যাটেলাইট") : t("District", "জেলা")}</span></button>
     <button type="button" class="button small ${drawMode ? "primary" : ""} map-action-btn" data-action="draw" data-value="" title="${drawMode ? t("Editing corners…", "কোণ বদল হচ্ছে…") : t("Edit boundary", "সীমানা সম্পাদনা")}" aria-label="${drawMode ? t("Editing corners…", "কোণ বদল হচ্ছে…") : t("Edit boundary", "সীমানা সম্পাদনা")}">${icon("draw")}<span class="label-full">${drawMode ? t("Editing corners…", "কোণ বদল হচ্ছে…") : t("Edit boundary", "সীমানা সম্পাদনা")}</span><span class="label-short">${drawMode ? t("Editing", "সম্পাদনা") : t("Boundary", "সীমানা")}</span></button>
     ${hasCustomBoundary && !drawMode ? button(t("Reset outline", "আগের সীমানা"), "reset-demo", "small ghost") : ""}
   </div>
 </div><div id="inspect-sheet" class="inspect-sheet" aria-live="polite"></div><div id="drawing-help"></div></section>
 <section class="panel"><div class="field-card"><div class="field-intro"><div class="eyebrow">${t("Plot dossier", "জমির পরিচয়")} / ${plotDossierNum}</div><h2>${esc(fieldName())}</h2><div class="location">${dossierLocation}</div></div><dl class="field-meta"><div><dt>${t("Boundary area", "জমির আয়তন")}</dt><dd class="large" title="${units(area())}">${num(area(), 2)} <small>ha</small></dd><small class="unit-note">${num(area() * 2.47105381, 2)} ac · ${num(area() * 247.105381, 1)} ${t("decimals", "শতক")}</small> ${boundaryTruth}</div><div><dt>${t("Cultivable area", "চাষযোগ্য আয়তন")} ${button(t("Edit", "বদলান"), "edit-net-area", "ghost small net-area-edit")}</dt><dd class="large" title="${units(net.netHa)}">${num(net.netHa, 2)} <small>ha</small></dd><small class="unit-note">${num(net.netPct, 1)}% ${t("of gross", "মোট আয়তনের")} · ${num(net.netHa * 247.105381, 1)} ${t("decimals", "শতক")}</small> ${isNetEdited(f.id) ? truth("FARMER_REPORTED", { source: "Farmer inputs", date: "2024" }) : truth("SCENARIO", { source: "Default bunds", date: "2024" })}</div><div><dt>${t("Field boundary", "জমির সীমানা")}</dt><dd>${boundaryLabel}</dd></div><div><dt>${t("Planning crop", "পরিকল্পনার ফসল")}</dt><dd>${cropName(p.crop)}</dd></div><div><dt>${t("Expected harvest", "সম্ভাব্য ফসল তোলা")}</dt><dd>${esc(p.harvest)} ${truth("SCENARIO", { source: "Planning assumption", date: "2024" })}</dd></div></dl>
 <div class="field-recommend"><div class="eyebrow">${t("Next decision", "পরবর্তী সিদ্ধান্ত")}</div><h3>${first ? t(first.crops.join(" → "), first.bnCrops.join(" → ")) : t("Review field constraints", "জমির শর্ত দেখুন")}</h3><p>${t("Compare four full rotations using your priorities and the winter planting window.", "আপনার অগ্রাধিকার ও বপনের সময় ধরে চারটি ফসলচক্র তুলনা করুন।")}</p><div class="next-step-hint">${t("Next step 2 of 4 · Rotation studio — pick crops for this field", "পরের ধাপ ২/৪ · ফসলচক্র স্টুডিও — এই জমির জন্য ফসল বাছুন")}</div>${goButton(t("Explore rotations", "ফসলচক্র দেখুন"), "rotations", "primary full")}</div></div>
 <div class="field-bottom">${icon("draw", 13)}${button(t("Edit field assumptions", "জমির অনুমান বদলান"), "profile", "ghost small")}</div></section></div>
 <aside class="field-mobile-cta" hidden>${goButton(t("Next: Rotation studio → Explore rotations", "পরের ধাপ: ফসলচক্র স্টুডিও → ফসলচক্র দেখুন"), "rotations", "primary")}</aside>
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
 ]
   .map(
     ([route, symbol, name, sub]) =>
       `<button data-go="${route}" class="work-action">${icon(symbol, 22)}<span><strong>${name}</strong><small>${sub}</small></span>${icon("right", 15)}</button>`,
   )
   .join("")}</div>`
  );
}
const SEASON_YEARS = [2021, 2022, 2023, 2024, 2025];
const finiteNum = (v) => typeof v === "number" && Number.isFinite(v);

function daysInMonthStr(monthStr) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(monthStr || ""));
  if (!m) return 0;
  return new Date(Number(m[1]), Number(m[2]), 0).getDate();
}

// Experimental outlook hero: season totals derived from outlook.json monthly
// mm/day (p50 × days in month). No flood verdict: no forecast data for floods.
function seasonOutlookHero(fieldId, pack) {
  const site = outlookSite(pack, fieldId);
  const rain = site?.rain_mm_day;
  if (!site || !rain || !Array.isArray(rain.months) || !rain.months.length) return "";
  const rows = rain.months.filter(
    (m) => m && finiteNum(m.p50) && finiteNum(m.climatology) && daysInMonthStr(m.month) > 0,
  );
  if (!rows.length) return "";
  const beats = rain.beats_climatology === true;
  const days = rows.map((m) => daysInMonthStr(m.month));
  const total = (pick) => rows.reduce((a, m, i) => a + m[pick] * days[i], 0);
  const p50 = total("p50"), clim = total("climatology");
  const bandOK = beats && rows.every((m) => finiteNum(m.p10) && finiteNum(m.p90));
  const verdict = beats ? rainVerdict(p50, clim) : null;
  const word =
    { above: ["above usual", "স্বাভাবিকের চেয়ে বেশি"], near: ["near usual", "স্বাভাবিকের কাছাকাছি"], below: ["below usual", "স্বাভাবিকের চেয়ে কম"] }[verdict] || null;
  const first = rows[0].month, last = rows.at(-1).month;
  const span = `${monthName(Number(first.slice(5, 7)) - 1)} ${first.slice(0, 4)} – ${monthName(Number(last.slice(5, 7)) - 1)} ${last.slice(0, 4)}`;
  const years = backtestYears(pack);
  const sentence = beats && word
    ? t(`Rain likely ${word[0]}: ${num(p50, 0)} mm likely vs ${num(clim, 0)} mm usual.`, `বৃষ্টি ${word[1]} হতে পারে: সম্ভাব্য ${num(p50, 0)} মিমি বনাম স্বাভাবিক ${num(clim, 0)} মিমি।`)
    : t("Rain outlook is no better than the monthly average — showing the usual.", "বৃষ্টির আউটলুক মাসিক গড়ের চেয়ে ভালো নয় — স্বাভাবিক মান দেখানো হচ্ছে।");
  return `<section class="season-hero"><div class="season-hero-eyebrow"><span>${esc(t("Experimental outlook · p10–p90 range", "পরীক্ষামূলক আউটলুক · p10–p90 পরিসর"))}</span>${years ? `<span>${esc(years)}</span>` : ""}</div><h2>${esc(t(`Next 3 months · ${span}`, `পরের ৩ মাস · ${span}`))}</h2><p>${esc(sentence)}${bandOK ? ` ${esc(t(`Range ${num(total("p10"), 0)}–${num(total("p90"), 0)} mm.`, `পরিসর ${num(total("p10"), 0)}–${num(total("p90"), 0)} মিমি।`))}` : ""}</p><div class="season-hero-stats"><div><span>${esc(t("Predicted rain", "সম্ভাব্য বৃষ্টি"))}</span><strong>${num(beats ? p50 : clim, 0)}<small> mm</small></strong></div><div><span>${esc(t("Usual", "সাধারণত"))}</span><strong>${num(clim, 0)}<small> mm</small></strong></div></div><div class="season-hero-foot">${truth("MODELED", { source: "Chronos-Bolt outlook", date: `${first} – ${last}` })} ${nasaBadge("power", `${first} – ${last}`)}</div></section>`;
}

// Annual fact tiles for the selected archive year, with change vs prior year.
function annualTiles(archiveMonths, year) {
  const months = archiveMonths.filter((v) => v.month.startsWith(String(year)));
  if (!months.length) return "";
  const prev = archiveMonths.filter((v) => v.month.startsWith(String(year - 1)));
  const sum = (rows, k) => rows.reduce((a, v) => a + (finiteNum(v[k]) ? v[k] : 0), 0);
  const avg = (rows, k) => {
    const vs = rows.map((v) => v[k]).filter(finiteNum);
    return vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : NaN;
  };
  const pct = (cur, ref) => (finiteNum(cur) && finiteNum(ref) && ref !== 0 ? ((cur - ref) / Math.abs(ref)) * 100 : NaN);
  const diff = (cur, ref) => (finiteNum(cur) && finiteNum(ref) ? cur - ref : NaN);
  const vsPrev = (raw, places, suffix) => {
    if (!prev.length || !finiteNum(raw)) return t("first archive year", "আর্কাইভের প্রথম বছর");
    const d = `${raw >= 0 ? "+" : ""}${num(raw, places)}${suffix}`;
    return t(`${d} vs ${year - 1}`, `${d} বনাম ${year - 1}`);
  };
  const rain = sum(months, "rainGpm"), wet = avg(months, "wetness"), temp = avg(months, "tmean"), eto = sum(months, "et0");
  const defs = [
    ["rainGpm", t("Annual rainfall", "বার্ষিক বৃষ্টি"), rain, 0, "mm", "rain", months.map((v) => v.rainGpm), colors.rainGpm, "imerg", t("IMERG · yearly total", "IMERG · বছরের মোট"), "REMOTE_OBSERVED", { source: "NASA GPM IMERG", date: String(year), cell: "10km" }, vsPrev(pct(rain, sum(prev, "rainGpm")), 1, "%")],
    ["wetness", t("Mean soil wetness", "গড় মাটির আর্দ্রতা"), wet, 2, t("index 0–1", "সূচক ০–১"), "water", months.map((v) => v.wetness), colors.wetness, "wetness", t("POWER · yearly average", "POWER · বছরের গড়"), "MODELED", { source: "NASA POWER", date: String(year), cell: "50km" }, vsPrev(diff(wet, avg(prev, "wetness")), 2, "")],
    ["tmean", t("Mean temperature", "গড় তাপমাত্রা"), temp, 1, "°C", "temp", months.map((v) => v.tmean), colors.tmean, "power", t("POWER · yearly average", "POWER · বছরের গড়"), "MODELED", { source: "NASA POWER", date: String(year), cell: "50km" }, vsPrev(diff(temp, avg(prev, "tmean")), 1, " °C")],
    ["et0", t("Annual evaporation", "বার্ষিক বাষ্পীভবন"), eto, 0, "mm", "sun", months.map((v) => v.et0), colors.et0, "eto", t("FAO-56 ETo · yearly total", "FAO-56 ETo · বছরের মোট"), "MODELED", { source: "FAO-56 ETo", date: String(year), cell: "50km" }, vsPrev(pct(eto, sum(prev, "et0")), 1, "%")],
  ];
  return `<div class="data-row season-tiles">${defs.map(([, label, value, places, unit, symbol, values, color, badge, foot, tag, opts, delta]) => `<article class="data-stat"><div class="stat-top"><span>${label}</span>${icon(symbol)}</div><div class="stat-badge">${finiteNum(value) ? nasaBadge(badge, String(year)) : ""}</div><div class="stat-value"><span class="stat-number">${num(value, places)}<small>${unit}</small></span><span class="stat-status">${esc(delta)}</span></div><div class="stat-spark">${spark(values, color)}</div><div class="stat-foot"><span class="stat-source" title="${esc(foot)}">${foot}</span><div class="stat-truth">${truth(tag, opts)}</div></div></article>`).join("")}</div>`;
}

// Year-by-year annual rainfall bars (GPM IMERG totals from history.json).
function yearBars(archiveMonths, year) {
  const totals = SEASON_YEARS.map((y) => ({
    y,
    total: archiveMonths.filter((v) => v.month.startsWith(String(y))).reduce((a, v) => a + (finiteNum(v.rainGpm) ? v.rainGpm : 0), 0),
  }));
  if (!totals.every((r) => finiteNum(r.total))) return "";
  const props = { data: totals.map(({ y, total }) => ({ year: y, total })), selected: year };
  return `<div class="chart-legend"><span><i class="legend-dot" style="background:#517e8b"></i>GPM IMERG</span><span>mm / year</span></div>` +
    chartPlaceholder("annual-rain", props, t("Annual rainfall by year", "বছর অনুযায়ী বার্ষিক বৃষ্টি"));
}

// GRACE groundwater anomaly months (2024 only in the shipped file).
function gracePanel(fieldId) {
  const site = gracePack?.sites?.[fieldId];
  const rows = Array.isArray(site?.monthly) ? site.monthly.filter((r) => r && finiteNum(r.twsAnomalyCm)) : [];
  if (!rows.length) return "";
  const span = rows.length > 1 ? `${rows[0].month} – ${rows.at(-1).month}` : rows[0].month;
  return panel(
    t("Groundwater storage", "ভূগর্ভস্থ পানির মজুত"),
    `<p class="note">${t("Total water anomaly against the 2004–2009 average. Negative means less water than that baseline; this is a wide-regional estimate, not a field reading.", "২০০৪–২০০৯ গড়ের তুলনায় মোট পানির ব্যত্যয়। ঋণাত্মক মানে ভিত্তির চেয়ে কম পানি; এটি বিস্তীর্ণ এলাকার অনুমান, জমির নিজস্ব মাপ নয়।")}</p>` +
      chart([{ label: "GRACE-FO", color: "#6b8ba4", values: rows.map((r) => r.twsAnomalyCm) }], { unit: "cm", description: "Monthly terrestrial water anomaly" }) +
      `<p class="note">${esc(span)} · ${t("Latest", "সর্বশেষ")} ${esc(rows.at(-1).month)}: <b>${num(rows.at(-1).twsAnomalyCm, 1)} cm</b></p>` +
      truth("REMOTE_OBSERVED", { source: "NASA GRACE-FO", date: span, cell: "~300km" }),
    nasaBadge("grace", "2024"),
  );
}

function seasonView() {
  const f = field();
  const [deskEn, deskBn] = deskNo(4);
  if (f.custom || !archive?.fields?.[f.id]?.monthly) {
    return (
      header(
        t(`Season archive  /  ${deskEn}`, `মৌসুমের খাতা  /  ${deskBn}`),
        t("Past seasons", "পুরনো মৌসুম"),
        t(
          "Replay five years. Choose a year and a month to read the regional record.",
          "পাঁচ বছরের আঞ্চলিক তথ্য দেখুন। বছর ও মাস বেছে নিন।",
        ),
      ) +
      chips() +
      stateEmpty(
        t("Historical archive is not available for this custom field", "এই জমির জন্য পুরনো মৌসুমের তথ্য নেই"),
      )
    );
  }
  const year = Number(state.historyYear || 2024),
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
          `<p class="note">${t("Landsat samples in the fixed 900 m window. Cloud-obscured observations leave a gap.", "৯০০ মিটার জানালায় ল্যান্ডস্যাট নমুনা। মেঘে ঢাকা পর্যবেক্ষণ ফাঁকা থাকে।")}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>${t("Acquired", "তারিখ")}</th><th>NDVI</th><th>${t("Clear samples", "পরিষ্কার নমুনা")}</th><th>${t("Coverage", "তথ্যের অবস্থা")}</th></tr></thead><tbody>${f.opticalHistory.map((o) => `<tr><td>${esc(o.date)}</td><td>${o.opticalQA.validFraction >= 0.25 ? num(o.opticalQA.ndvi, 3) : t("No reliable observation", "নির্ভরযোগ্য পর্যবেক্ষণ নেই")}</td><td>${num(o.opticalQA.validPixels)} / ${num(o.opticalQA.pixels)}</td><td>${o.opticalQA.validFraction >= 0.25 ? t("Usable", "ব্যবহারযোগ্য") + truth("REMOTE_OBSERVED", { source: "Landsat 8/9", date: o.date, cell: "30m" }) : t("Too little clear cover", "পরিষ্কার অংশ কম") + truth("UNKNOWN", { source: "Landsat 8/9", date: o.date, cell: "30m" })}</td></tr>`).join("")}</tbody></table></div>`, nasaBadge("landsat"),
        )
      : "";
  const harvests = state.records
    .filter((r) => r && r.fieldId === f.id && r.kind === "harvest" && typeof r.date === "string")
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const harvestYears = [...new Set(harvests.map((r) => r.date.slice(0, 4)))];
  const harvestTimeline = harvestYears
    .map(
      (hy) =>
        `<div class="crophist-year"><div class="crophist-dot${hy === String(year) ? " current" : ""}"></div><div><div class="crophist-head">${esc(hy)}${hy === String(year) ? ` · ${esc(t("selected", "নির্বাচিত"))}` : ""}</div>${harvests
          .filter((r) => r.date.startsWith(hy))
          .map((r) => `<p>${esc(r.date)} · ${esc(r.variety || cropName(r.crop))} · ${num(r.yieldKg, 1)} kg</p>`)
          .join("")}</div></div>`,
    )
    .join("");
  return (
    header(
      t(`Season archive  /  ${deskEn}`, `মৌসুমের খাতা  /  ${deskBn}`),
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
    `<div class="section-space">${seasonOutlookHero(f.id, outlookPack)}</div>` +
    panel(
      t("Choose a month", "মাস বাছুন"),
      select(
        t("Archive year", "রেকর্ডের বছর"),
        "historyYear",
        SEASON_YEARS.map((y) => [y, String(y)]),
        year,
      ) + monthControl(year),
      tag("2021–2025", "blue"),
    ) +
    `<div class="section-space">${outlookCard(f.id, outlookPack)}</div>` +
    `<div class="section-space">${annualTiles(archiveMonths, year)}</div>` +
    stats(months, String(year)) +
    `<div class="notice section-space">${monthName()} ${year} · ${t("Rainfall", "বৃষ্টি")} <b>${num(m.rainGpm, 1)} mm</b> ${truth("REMOTE_OBSERVED", { source: "NASA GPM IMERG", date: "2024", cell: "10km" })}. ${t("Same-month average in the other four archive years", "আর্কাইভের বাকি চার বছরে একই মাসের গড়")} <b>${num(comparisonMean, 1)} mm</b> ${nasaBadge("imerg", "2021–2025")}. ${t("This is a short historical comparison.", "এটি স্বল্পমেয়াদি ঐতিহাসিক তুলনা।")}</div>` +
    `<div class="grid-equal section-space">${panel(
      t("Where the rain went", "কোন মাসে কত বৃষ্টি"),
      seasonLineChart(
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
        months,
        {
          unit: "mm / month",
          description: t("Monthly rainfall estimated by two products", "দুটি পণ্যের মাসিক বৃষ্টির অনুমান"),
        },
      ) +
        `<p class="note">${t("The wettest IMERG month was", "IMERG অনুযায়ী সবচেয়ে বেশি বৃষ্টি")} ${monthName(months.indexOf(wet))} (${num(wet.rainGpm, 1)} mm). ${t("The driest was", "সবচেয়ে কম")} ${monthName(months.indexOf(dry))} (${num(dry.rainGpm, 1)} mm).</p>` + truth("REMOTE_OBSERVED", { source: "NASA GPM IMERG", date: "2024", cell: "10km" }) + " " + truth("MODELED", { source: "NASA POWER", date: "2024", cell: "50km" }), nasaBadge(["imerg", "power"], String(year)),
    )}
 ${panel(
   t("How wet the soil was", "মাটি কতটা ভেজা ছিল"),
   seasonLineChart(
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
     months,
     {
       unit: t("wetness index 0–1", "আর্দ্রতা সূচক ০–১"),
       max: 1,
       description: t("POWER surface and root-zone wetness", "POWER-এর উপরিভাগ ও শিকড়ের স্তরের আর্দ্রতা"),
     },
   ) +
     `<p class="note">${t("These regional model indices describe relative wetness. A soil probe can supply a local reading.", "এলাকার মডেল থেকে আপেক্ষিক আর্দ্রতা পাওয়া যায়। জমির নিজস্ব মাপের জন্য মাটির সেন্সর ব্যবহার করুন।")}</p>` + truth("MODELED", { source: "NASA POWER", date: "2024", cell: "50km" }), nasaBadge("wetness", String(year)),
 )}</div>` +
 `<div class="section-space">${panel(
   t("Compare year-by-year", "বছরের সাথে বছর তুলনা"),
   yearBars(archiveMonths, year) +
     `<p class="note">${t("Annual GPM IMERG totals. The highlighted bar is the selected year.", "IMERG-এর বার্ষিক মোট। গাঢ় দণ্ডটি নির্বাচিত বছর।")}</p>` +
     truth("REMOTE_OBSERVED", { source: "NASA GPM IMERG", date: "2021–2025", cell: "10km" }),
   nasaBadge("imerg", "2021–2025"),
 )}</div>` +
 `<div class="section-space">${floodCard(f.id, floodPack)}</div>` +
 `<div class="section-space">${gracePanel(f.id)}</div>` +
 `<div class="grid-equal section-space">${panel(t("Dated optical observation", "স্যাটেলাইট পর্যবেক্ষণ"), year === 2024 && img ? `<div class="observation-thumb"><img src="${esc(img.url)}" alt="${t("Dated satellite image near the field", "জমির কাছের ল্যান্ডস্যাট ছবি")}"><div><b>${esc(img.date)}</b><p class="note">${img.sourceLabel ? "Sentinel-2 · 10 m" : "Landsat 8 · 30 m"}</p><p class="note">${esc(img.sceneId)}</p>${Number.isFinite(img.ndvi) ? `<p>NDVI ${num(img.ndvi, 2)}</p>` : ""}<a class="source-link" href="${esc(img.itemUrl)}" target="_blank" rel="noopener">${t("View scene record ↗", "ছবির উৎস ↗")}</a></div></div><p class="note">${t("This scene keeps its acquisition date as you move between months.", "মাস বদলালেও ছবিটি তার আসল তারিখেই দেখানো হয়।")}</p>` : `<p class="note">${t("No optical scene prepared for the selected year.", "এই বছরের স্যাটেলাইট ছবি প্রস্তুত নেই।")}</p>`, year === 2024 && img && !img.sourceLabel ? nasaBadge("landsat", img.date) : "")}
 ${panel(t("What grew here?", "এখানে কী ফসল হয়েছিল?"), `<p class="note">${harvests.length ? t("Harvests you recorded, newest first", "আপনার লেখা ফসল, নতুন আগে") : t("No verified harvests are recorded for this field in the selected year. Add a harvest to connect an actual variety and yield to this weather record.", "এই জমির নির্বাচিত বছরের যাচাই করা ফলনের তথ্য নেই। আবহাওয়ার সাথে তুলনা করতে একটি ফলনের রেকর্ড যোগ করুন।")}</p>${harvests.length ? `<div class="crophist">${harvestTimeline}</div>` : ""}<div class="spacer"></div>${button(t("Log a harvest", "ফলন লিখুন"), "new-harvest", "", "add")}`)}</div><div class="section-space">${opticalTable}</div>`
  );
}
async function mountMap() {
  const mobileCta = document.querySelector(".field-mobile-cta");
  const mapTarget = document.querySelector("#field-map");
  const recommendTarget = document.querySelector(".field-recommend");
  if (mobileCta && mapTarget && recommendTarget && "IntersectionObserver" in window) {
    const visibility = new Map();
    fieldCtaObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) visibility.set(entry.target, entry.isIntersecting);
      mobileCta.hidden = !visibility.get(mapTarget) || !!visibility.get(recommendTarget);
    });
    fieldCtaObserver.observe(mapTarget);
    fieldCtaObserver.observe(recommendTarget);
  }
  const selectedChip = document.querySelector(".field-selector .field-chip.selected");
  if (selectedChip && typeof selectedChip.scrollIntoView === "function") {
    selectedChip.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }
  const el = document.querySelector("#field-map");
  if (!el || !window.L) return;
  await loadMapData();
  const f = field();
  const lowGroundSite = lowGroundData?.sites?.find((site) => site.id === f.id && site.png);
  const lowGroundButton = document.querySelector('[data-action="toggle-low-ground"]');
  if (lowGroundButton) lowGroundButton.hidden = !lowGroundSite;
  const online = isOnline();

  if (!online && layerMode === "high-detail") {
    layerMode = "natural";
  }

  tileErrorCount = 0;
  const isHighDetailActive = layerMode === "high-detail" || (layerMode === "ndvi" && online);
  const maxMapZoom = isHighDetailActive ? 18 : 16; // raised per place by esriMaxZoom()
  const fitMaxZoom = online ? 18 : 16;

  leafletMap = L.map(el, {
    zoomControl: false,
    scrollWheelZoom: false,
    zoomSnap: 0.5,
    minZoom: 8,
    maxZoom: maxMapZoom,
    attributionControl: true,
    keyboard: true,
  });
  const current = leafletMap;
  mountedFieldId = f.id;

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
      // Grey out +/− at the limits (max zoom differs by place for the High detail photo).
      const syncZoomButtons = () => {
        for (const [btn, off] of [
          [zoomIn, current.getZoom() >= current.getMaxZoom()],
          [zoomOut, current.getZoom() <= current.getMinZoom()],
        ]) {
          btn.classList.toggle("leaflet-disabled", off);
          btn.setAttribute("aria-disabled", String(off));
        }
        zoomIn.title = current.getZoom() >= current.getMaxZoom()
          ? t("Closest photo available here", "এখানে এর চেয়ে কাছের ছবি নেই")
          : t("Zoom in", "বড় করুন");
      };
      current.on("zoomend zoomlevelschange", syncZoomButtons);
      setTimeout(syncZoomButtons, 0);
      L.DomEvent.on(resetBtn, "click", (e) => {
        L.DomEvent.preventDefault(e);
        if (poly && poly.getBounds().isValid()) {
          current.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: fitMaxZoom });
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
            current.setView([latitude, longitude], Math.min(15, maxMapZoom));
            const popupContent = `
              <div style="text-align: center; padding: 4px;">
                <p style="margin: 0 0 8px 0; font-weight: bold;">${t("Your current position", "আপনার বর্তমান অবস্থান")}</p>
                <button type="button" class="button small primary" data-action="start-custom-field" data-value="${latitude},${longitude},${t("My field", "আমার জমি")}">${t("Start my field here", "এখানে আমার জমি শুরু করুন")}</button>
              </div>
            `;
            const isPhone = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 600px)").matches;
            if (tapMarker) {
              tapMarker.remove();
              tapMarker = null;
            }
            if (isPhone) {
              tapMarker = L.circleMarker([latitude, longitude], {
                radius: 6,
                color: "#315c3d",
                fillColor: "#e5eadb",
                fillOpacity: 1,
                weight: 2,
              }).addTo(current);
              const sheet = document.querySelector("#inspect-sheet");
              if (sheet) {
                sheet.innerHTML = `
                  <div class="inspect-sheet-card">
                    <div class="inspect-sheet-head">
                      <strong>${t("Your current position", "আপনার বর্তমান অবস্থান")}</strong>
                      <button type="button" class="inspect-close-btn" data-action="close-inspect" aria-label="${t("Close", "বন্ধ করুন")}">✕</button>
                    </div>
                    <div style="font-size: 12px; margin: 4px 0 8px 0; color: var(--muted);">${num(latitude, 4)}° N · ${num(longitude, 4)}° E</div>
                    <button type="button" class="button small primary full" data-action="start-custom-field" data-value="${latitude},${longitude},${t("My field", "আমার জমি")}">${t("Start my field here", "এখানে আমার জমি শুরু করুন")}</button>
                  </div>`;
              }
            } else {
              L.circleMarker([latitude, longitude], {
                radius: 8,
                color: "#315c3d",
                fillColor: "#e5eadb",
                fillOpacity: 1,
                weight: 3,
              })
                .addTo(current)
                .bindPopup(popupContent)
                .openPopup();
            }
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
    fillOpacity: 0.06,
  });

  // Set initial map view before adding layers to guarantee valid renderer bounds
  if (regional) {
    current.setView([25.65, 89.25], 10);
  } else if (lastView && lastView.fieldId === f.id && !lastView.regional) {
    current.setView(lastView.center, lastView.zoom);
  } else if (poly && poly.getBounds().isValid()) {
    current.fitBounds(poly.getBounds(), { padding: [24, 24], maxZoom: fitMaxZoom });
  } else {
    current.setView([f.lat, f.lon], 15);
  }

  // Helper to create High Detail Esri layer
  function createHighDetailLayer() {
    // Pinned Esri Wayback release 64776: Maxar 28 Nov 2022, 0.31 m, clear at all 3 pilot sites (live layer is hazy Dec 2023 over Mithapukur).
    // shortcut: date label is exact only around the pilot sites; re-check with waybackconfig.json if sites change.
    const esriUrl = "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/64776/{z}/{y}/{x}";
    const layer = L.tileLayer(esriUrl, {
      maxNativeZoom: 18,
      maxZoom: 20,
      attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
    });
    // Limit zoom to the deepest level Esri really has at the map centre; re-check after each move.
    const fitDepth = async () => {
      const c = current.getCenter();
      const depth = await esriMaxZoom(c.lat, c.lng);
      if (!current.hasLayer(layer)) return;
      layer.options.maxNativeZoom = depth;
      if (current.getMaxZoom() !== depth) current.setMaxZoom(depth); // also zooms out if beyond
    };
    layer.on("add", () => {
      fitDepth();
      current.on("moveend", fitDepth);
    });
    layer.on("remove", () => current.off("moveend", fitDepth));
    layer.on("tileerror", () => {
      tileErrorCount++;
      if (tileErrorCount >= 3) {
        switchToOfflineNatural("tileerror");
      }
    });
    return layer;
  }

  const s2Attribution =
    mapLayersData?.attribution ||
    "Contains modified Copernicus Sentinel data (2024). ESA / Microsoft Planetary Computer.";

  if (layerMode === "high-detail") {
    activeTileLayer = createHighDetailLayer().addTo(current);
  } else if (layerMode === "natural") {
    const layerManifest = mapLayersData?.layers?.find((l) => l.id === "natural");
    const dateEntry = layerManifest?.dates?.find((d) => d.date === activeDate);
    const tileUrl = dateEntry?.pathTemplate || `/tiles/natural/${activeDate}/{z}/{x}/{y}.png`;
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
      maxZoom: 16,
      maxNativeZoom: maxZoom,
      bounds: tileBounds,
      opacity: 1.0,
      attribution: s2Attribution,
    }).addTo(current);
  } else if (layerMode === "ndvi") {
    // When online: draw High detail underneath, NDVI over it
    if (online) {
      activeBaseTileLayer = createHighDetailLayer().addTo(current);
    }
    const layerManifest = mapLayersData?.layers?.find((l) => l.id === "ndvi");
    const dateEntry = layerManifest?.dates?.find((d) => d.date === activeDate);
    const tileUrl = dateEntry?.pathTemplate || `/tiles/ndvi/${activeDate}/{z}/{x}/{y}.png`;
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
      maxZoom: online ? 20 : 16, // overlay must survive the deep photo zooms,
      maxNativeZoom: maxZoom,
      bounds: tileBounds,
      opacity: layerOpacity,
      attribution: s2Attribution,
    }).addTo(current);
  }

  if (showLowGround && lowGroundSite) {
    const [w, s, e, n] = lowGroundSite.bounds;
    const pane = current.createPane("lowGround");
    pane.style.zIndex = "350"; // Above tiles (200), below context and boundary paths (400).
    pane.style.pointerEvents = "none";
    L.imageOverlay(lowGroundSite.png, [[s, w], [n, e]], {
      pane: "lowGround",
      className: "low-ground-overlay",
      opacity: 1,
      interactive: false,
    }).addTo(current);
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
    poly.bindTooltip(fieldName(f), {
      direction: "center",
      permanent: false,
    });
  }

  if (drawMode) {
    if (!drawPoints.length) drawPoints = polygon().map((p) => [...p]);
    syncPolyGeom(drawPoints);
    if (drawLayer) drawLayer.remove();
    drawLayer = L.polygon(drawPoints, {
      color: "#f6d879",
      weight: 2,
      dashArray: "4 4",
    }).addTo(current);
    renderCornerHandles();
    updateDraw();
  }

  current.on("click", async (event) => {
    const { lat, lng } = event.latlng;
    const isPhone = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 600px)").matches;

    if (pickMapMode) {
      if (tapMarker) {
        tapMarker.remove();
        tapMarker = null;
      }
      if (isPhone) {
        tapMarker = L.circleMarker([lat, lng], {
          radius: 6,
          color: "#315c3d",
          fillColor: "#e5eadb",
          fillOpacity: 1,
          weight: 2,
        }).addTo(current);
        const sheet = document.querySelector("#inspect-sheet");
        if (sheet) {
          sheet.innerHTML = `
            <div class="inspect-sheet-card">
              <div class="inspect-sheet-head">
                <strong>${t("Point on map", "মানচিত্রের বিন্দু")}</strong>
                <button type="button" class="inspect-close-btn" data-action="close-inspect" aria-label="${t("Close", "বন্ধ করুন")}">✕</button>
              </div>
              <div style="font-size: 12px; margin: 4px 0 8px 0; color: var(--muted);">${num(lat, 4)}° N · ${num(lng, 4)}° E</div>
              <button type="button" class="button small primary full" data-action="start-custom-field" data-value="${lat},${lng},${t("My field", "আমার জমি")}">${t("Start my field here", "এখানে আমার জমি শুরু করুন")}</button>
            </div>`;
        }
        return;
      }
      const popupHtml = `
        <div style="text-align: center; padding: 6px;">
          <p style="margin: 0 0 6px 0; font-weight: bold;">${t("Point on map", "মানচিত্রের বিন্দু")}</p>
          <div style="font-size: 12px; margin-bottom: 8px;">${num(lat, 4)}° N · ${num(lng, 4)}° E</div>
          <button type="button" class="button small primary" data-action="start-custom-field" data-value="${lat},${lng},${t("My field", "আমার জমি")}">${t("Start my field here", "এখানে আমার জমি শুরু করুন")}</button>
        </div>
      `;
      L.popup({ maxWidth: 240 })
        .setLatLng(event.latlng)
        .setContent(popupHtml)
        .openOn(current);
      return;
    }
    if (drawMode) {
      if (!f.custom) {
        const [w, s, e, n] = f.imagery?.[0]?.bounds || [];
        if (!(lng >= w && lng <= e && lat >= s && lat <= n)) {
          toast(
            t(
              "Draw inside this prepared image.",
              "প্রস্তুত ছবির ভেতরে সীমানা আঁকুন।",
            ),
          );
          return;
        }
      }
      drawPoints.splice(bestInsertIndex(drawPoints, [lat, lng]), 0, [lat, lng]);
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
    await loadMoistureData();
    if (current !== leafletMap) return;
    const popupHtml = inspectPopup(f, lat, lng);

    if (tapMarker) {
      tapMarker.remove();
      tapMarker = null;
    }

    if (isPhone) {
      tapMarker = L.circleMarker([lat, lng], {
        radius: 6,
        color: "#315c3d",
        fillColor: "#e5eadb",
        fillOpacity: 1,
        weight: 2,
      }).addTo(current);
      const sheet = document.querySelector("#inspect-sheet");
      if (sheet) {
        const closeBtnHtml = `<div class="inspect-sheet-bar"><button type="button" class="inspect-close-btn" data-action="close-inspect" aria-label="${t("Close", "বন্ধ করুন")}">✕</button></div>`;
        sheet.innerHTML = `<div class="inspect-sheet-card">${closeBtnHtml}${popupHtml}</div>`;
      }
      return;
    }

    const home = current.getCenter();
    let autoPanned = false;
    const onAutoPan = () => (autoPanned = true);
    const onUserDrag = () => (autoPanned = false); // user moved the map: leave it where they put it
    current.once("autopanstart", onAutoPan);
    current.on("dragstart", onUserDrag);
    L.popup({
      className: "field-inspect-popup",
      maxWidth: 280,
      maxHeight: Math.max(180, el.clientHeight - 96),
      autoPanPadding: [16, 16],
      closeButton: true,
    })
      .setLatLng(event.latlng)
      .setContent(popupHtml)
      .on("remove", () => {
        current.off("autopanstart", onAutoPan);
        current.off("dragstart", onUserDrag);
        if (autoPanned && current === leafletMap) current.panTo(home);
      })
      .openOn(current);
  });
}
// Index at which inserting pt lengthens the outline least, so a tapped corner lands on the nearest edge.
function bestInsertIndex(pts, pt) {
  if (pts.length < 2) return pts.length;
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let best = pts.length, cost = Infinity;
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const c = d(a, pt) + d(pt, b) - d(a, b);
    if (c < cost) [cost, best] = [c, i + 1];
  });
  return best;
}
// Scale an outline about its centre so its area changes by `factor` (shape kept).
function scaleOutline(pts, factor) {
  const k = Math.sqrt(factor);
  const cLat = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cLon = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  return pts.map(([la, lo]) => [cLat + (la - cLat) * k, cLon + (lo - cLon) * k]);
}
function updateDraw() {
  const help = document.querySelector("#drawing-help");
  if (!help) return;
  const currentAreaHa = polygonValid(drawPoints) ? areaHa(drawPoints) : 0;
  const areaLiveStr = currentAreaHa > 0 ? `<div style="margin: 6px 0; font-size: 13px;"><b>${t("Live area:", "বর্তমান আয়তন:")}</b> ${units(currentAreaHa)}</div>` : "";
  const decimals = currentAreaHa * 247.105381;
  help.innerHTML = drawMode
    ? `<div class="notice draw-bar"><p class="draw-tip">${t("Drag a corner to reshape. Tap the map to add a corner on the nearest edge; tap a corner to remove it.", "কোণ টেনে আকার বদলান। মানচিত্রে চাপলে কাছের রেখায় নতুন কোণ বসবে; কোণে চাপলে মুছে যাবে।")}</p>
<div class="draw-size"><span class="draw-size-label">${t("Size", "আয়তন")}</span>${button("−", "scale-boundary", "small draw-step", "", "0.95")}<label class="draw-size-input"><input id="boundary-size" type="number" inputmode="decimal" min="0.5" step="0.1" value="${decimals ? decimals.toFixed(1) : ""}" aria-label="${t("Field size in decimals", "জমির আয়তন শতকে")}"> ${t("decimals", "শতক")}</label>${button("+", "scale-boundary", "small draw-step", "", "1.05")}<span class="note">${num(currentAreaHa, 3)} ha · ${num(drawPoints.length)} ${t("corners", "টি কোণ")}</span></div>
<div class="toolbar-inline">${button(t("Save boundary", "সীমানা সংরক্ষণ"), "finish-draw", "small primary")}${button(t("Cancel", "বাতিল"), "cancel-draw", "small")}${button(t("Enter corners", "কোণ লিখুন"), "coordinates", "small ghost")}${state.boundaries[state.fieldId] ? button(t("Reset outline", "আগের সীমানা"), "reset-demo", "small ghost") : ""}</div></div>`
    : "";
  help.querySelector("#boundary-size")?.addEventListener("change", (e) => {
    const target = Number(e.target.value);
    if (!(target > 0) || !(decimals > 0)) return;
    fieldAction("scale-boundary", String(target / decimals));
  });
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
  
  // 1. Prepared fields match
  const preparedMatches = (earth?.fields || []).filter((f, i) => {
    if (xy) {
      const a = Number(xy[1]),
        b = Number(xy[2]),
        [w, s, e, n] = f.imagery?.[0]?.bounds || [];
      return a >= s && a <= n && b >= w && b <= e;
    }
    return [f.name, fieldName(f), `rg-0${i + 1}`, `rg–0${i + 1}`].some((v) =>
      v.toLowerCase().includes(q),
    );
  });

  // 2. Custom fields match
  const customMatches = (state.customFields || []).filter((f) => {
    if (!q) return false;
    return [f.name, f.name_bn || ""].some((v) => v.toLowerCase().includes(q));
  });

  // 3. Coordinate check anywhere in Bangladesh
  let coordMatch = null;
  if (xy) {
    const lat = Number(xy[1]),
      lon = Number(xy[2]);
    if (
      lat >= BD_BBOX.minLat &&
      lat <= BD_BBOX.maxLat &&
      lon >= BD_BBOX.minLon &&
      lon <= BD_BBOX.maxLon
    ) {
      coordMatch = { lat, lon };
    }
  }

  // 4. Places match (from OSM Overpass places)
  let placeMatches = [];
  if (q && placesData?.places) {
    placeMatches = placesData.places
      .filter((p) => {
        const nameEn = (p.name || "").toLowerCase();
        const nameBn = (p.name_bn || "").toLowerCase();
        return nameEn.includes(q) || nameBn.includes(q);
      })
      .slice(0, 10);
  }

  const results = [];

  // Add prepared fields
  for (const f of preparedMatches) {
    results.push(
      `<button class="result-option" data-action="select-result" data-value="${f.id}">${icon("pin")}<span><b>${esc(fieldName(f))}</b><small>${f.lat}° N · ${f.lon}° E</small></span>${icon("right")}</button>`,
    );
  }

  // Add custom fields
  for (const f of customMatches) {
    results.push(
      `<button class="result-option" data-action="select-result" data-value="${f.id}">${icon("pin")}<span><b>★ ${esc(fieldName(f))}</b><small>${num(f.lat, 4)}° N · ${num(f.lon, 4)}° E</small></span>${icon("right")}</button>`,
    );
  }

  // Add coordinate start field
  if (coordMatch) {
    const val = `${coordMatch.lat},${coordMatch.lon},`;
    results.push(
      `<div class="result-option-action">${icon("pin")}<span><b>${t("Start a field at coordinates", "স্থানাঙ্কে নতুন জমি শুরু করুন")}</b><small>${num(coordMatch.lat, 4)}° N · ${num(coordMatch.lon, 4)}° E</small></span>${button(t("Start a field here", "এখানে নতুন জমি শুরু করুন"), "start-custom-field", "small primary", "draw", val)}</div>`,
    );
  }

  // Add village / place matches
  for (const p of placeMatches) {
    const displayName = state.lang === "bn" && p.name_bn ? p.name_bn : p.name;
    const kindBn = { village: "গ্রাম", town: "শহর", hamlet: "পাড়া", suburb: "এলাকা", locality: "এলাকা" };
    const kind = p.kind || "village";
    const sub = `${t(kind, kindBn[kind] || kind)} · ${num(p.lat, 4)}° N · ${num(p.lon, 4)}° E`;
    const val = `${p.lat},${p.lon},${p.name || ""},${p.name_bn || ""}`;
    results.push(
      `<div class="result-option-action">${icon("pin")}<span><b>${esc(displayName)}</b><small>${esc(sub)}</small></span>${button(t("Start a field here", "এখানে নতুন জমি শুরু করুন"), "start-custom-field", "small primary", "draw", val)}</div>`,
    );
  }

  if (results.length) {
    return results.join("");
  }

  return `<div class="empty">${t("No matches found. Try a village name (e.g. Alampur, Pirganj), upazila, or coordinates (20.5–26.7 N, 88–92.7 E).", "কোনো ফলাফল পাওয়া যায়নি। গ্রামের নাম (যেমন আলমপুর, পীরগঞ্জ), উপজেলা বা স্থানাঙ্ক (২০.৫–২৬.৭ উঃ, ৮৮–৯২.৭ পূঃ) লিখুন।")}</div>`;
}
function editNetArea() {
  const inputs = netInputsFor();
  const f = field();
  const net = netAreaFor(f);
  modal(
    t("Cultivable area after bunds & drains", "আল, নালা ও পথ বাদে চাষযোগ্য আয়তন"),
    `<p class="note">${t(
      "Enter the typical widths on this plot. Defaults are a scenario; your values are kept per field.",
      "এই জমির আল, নালা ও পথের প্রস্থ লিখুন। প্রাথমিক মান কাল্পনিক; আপনার মান জমি অনুযায়ী সংরক্ষিত হয়।",
    )}</p>
<form id="net-area-form" class="section-space"><div class="form-grid">
${input(t("Bund width (m)", "আলের প্রস্থ (মিটার)"), "bundWidthM", inputs.bundWidthM, 'min="0" step="0.05" required inputmode="decimal"')}
${input(t("Drain width (m)", "নালার প্রস্থ (মিটার)"), "drainWidthM", inputs.drainWidthM, 'min="0" step="0.05" required inputmode="decimal"')}
${input(t("Path width (m)", "পথের প্রস্থ (মিটার)"), "pathWidthM", inputs.pathWidthM, 'min="0" step="0.05" required inputmode="decimal"')}
${input(t("Other non-cultivable (decimals / shotok)", "অন্য অকৃষি জমি (শতক)"), "otherDecimals", inputs.otherDecimals, 'min="0" step="0.1" required inputmode="decimal"')}
</div>
<p class="note">${t("Current estimate", "বর্তমান হিসাব")}: <b>${num(net.netHa, 2)} ha</b> · ${num(net.netPct, 1)}% ${t("of gross", "মোট আয়তনের")} · ${units(net.netHa)}</p>
<div class="spacer"></div>
<div class="toolbar-inline"><button class="button primary" type="submit">${t("Save", "সংরক্ষণ")}</button>${isNetEdited(f.id) ? button(t("Reset to defaults", "প্রাথমিক মানে ফিরুন"), "reset-net-area", "small") : ""}</div>
</form>`,
  );
  setTimeout(() => document.querySelector('#in-bundWidthM')?.focus(), 0);
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
  if (action === "close-inspect") {
    if (tapMarker) {
      tapMarker.remove();
      tapMarker = null;
    }
    const sheet = document.querySelector("#inspect-sheet");
    if (sheet) sheet.innerHTML = "";
    return;
  }
  if (action === "set-layer-mode") {
    if (value === "high-detail" && !isOnline()) {
      toast(t("High detail needs internet connection", "উচ্চ স্পষ্টতা দেখার জন্য ইন্টারনেট সংযোগ প্রয়োজন"));
      return;
    }
    layerMode = value;
    if (value === "natural" || value === "ndvi") {
      activeDate = "2024-11-09";
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
  if (action === "toggle-low-ground") {
    if (!lowGroundData?.sites?.some((site) => site.id === state.fieldId && site.png)) return;
    showLowGround = !showLowGround;
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
  if (action === "edit-net-area") editNetArea();
  if (action === "reset-net-area") {
    delete state.netInputs[state.fieldId];
    persist();
    close();
    repaint();
    toast(t("Cultivable-area inputs reset", "চাষযোগ্য আয়তনের তথ্য প্রাথমিক মানে ফিরিয়ে আনা হয়েছে"));
  }
  if (action === "region") {
    regional = !regional;
    repaint();
  }
  if (action === "draw") {
    if (regional) {
      regional = false;
    }
    drawMode = !drawMode;
    if (drawMode) drawPoints = polygon().map((p) => [...p]);
    else {
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
  if (action === "toggle-pick-map") {
    pickMapMode = !pickMapMode;
    if (pickMapMode && regional) regional = false;
    repaint();
  }
  if (action === "start-custom-field") {
    close();
    const parts = (value || "").split(",");
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    const name = parts[2] || t("My field", "আমার জমি");
    const name_bn = parts[3] || (parts[2] ? parts[2] : "আমার জমি");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      toast(t("Invalid coordinates for field", "জমির স্থানাঙ্ক সঠিক নয়"));
      return;
    }
    const newId = `custom-${Date.now()}`;
    const newField = {
      id: newId,
      name,
      name_bn,
      lat,
      lon,
      custom: true,
      imagery: [],
    };
    state.customFields = state.customFields || [];
    state.customFields.push(newField);
    state.fieldId = newId;
    pickMapMode = false;
    regional = false;
    persist();
    repaint();
    toast(t("New field started! Loading NASA weather…", "নতুন জমি তৈরি হয়েছে! আবহাওয়া লোড হচ্ছে…"));

    // Trigger live weather fetch in background
    loadCustomPower(newField);
  }
  if (action === "delete-field") {
    const fieldId = value || state.fieldId;
    state.customFields = (state.customFields || []).filter((cf) => cf.id !== fieldId);
    delete state.boundaries[fieldId];
    if (state.fieldId === fieldId) {
      state.fieldId = "mithapukur";
    }
    persist();
    repaint();
    toast(t("Field deleted", "জমি মুছে ফেলা হয়েছে"));
  }
  if (action === "retry-power") {
    const f = field();
    if (f?.custom) {
      loadCustomPower(f);
    }
  }
  if (action === "scale-boundary") {
    const factor = Number(value);
    if (!drawMode || !(factor > 0) || drawPoints.length < 3) return;
    drawPoints = scaleOutline(drawPoints, Math.min(Math.max(factor, 0.05), 20));
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
    toast(t("Outline reset", "সীমানা আগের মতো করা হয়েছে"));
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
    drawMode = false;
    drawPoints = [];
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
  if (form.id === "net-area-form") {
    const entry = {};
    for (const key of ["bundWidthM", "drainWidthM", "pathWidthM", "otherDecimals"]) {
      const v = Number(d.get(key));
      if (!Number.isFinite(v) || v < 0) {
        toast(t("Enter a non-negative number for every field.", "প্রতিটি ঘরে শূন্য বা তার বেশি মান দিন।"));
        return true;
      }
      entry[key] = v;
    }
    state.netInputs[state.fieldId] = entry;
    persist();
    close();
    repaint();
    toast(t("Cultivable-area inputs saved", "চাষযোগ্য আয়তনের তথ্য সংরক্ষিত"));
    return true;
  }
  return false;
}

function fieldInput(el) {
  if (el.name === "layerOpacity") {
    layerOpacity = parseFloat(el.value);
    if (activeTileLayer) activeTileLayer.setOpacity(layerOpacity);
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
  getLayerMode,
  setLayerMode,
  loadMapData,
  loadMoistureData,
  inspectPopup,
  queryLowGround,
  loadCustomPower,
};
