
async function loadS1WaterData() {
  if (s1WaterData !== null) return s1WaterData;
  try {
    const res = await fetch("/data/s1-water.json");
    if (res.ok) s1WaterData = await res.json();
    else s1WaterData = false;
  } catch (e) {
    s1WaterData = false;
  }
  return s1WaterData;
}

async function loadWaterTableData() {
  if (waterTableData !== null) return waterTableData;
  try {
    const res = await fetch("/data/water-table.json");
    waterTableData = res.ok ? await res.json() : false;
    // Callouts may have rendered before this arrived: refresh them once.
    if (waterTableData && currentData && containerEl) {
      updateSoilDetails(buildCalloutData({ data: currentData, monthIdx: currentMonthIdx, soilOverrides, waterTable: waterTableData, t }));
    }
  } catch (e) {
    waterTableData = false;
  }
  return waterTableData;
}

async function loadSoilNutrientsData() {
  if (soilNutrientsData !== null) return soilNutrientsData;
  try {
    const res = await fetch("/data/soil-nutrients.json");
    if (res.ok) soilNutrientsData = await res.json();
    else soilNutrientsData = false;
  } catch (e) {
    soilNutrientsData = false;
  }
  return soilNutrientsData;
}
/**
 * STUDIO3 · 3D Field Studio
 *
 * Ports the owner's standalone field-model demo into the studio:
 * an exact extruded field outline, a NASADEM-sampled surface, crop rows,
 * banded soil sides, a movable cutaway with roots, height exaggeration,
 * contours, optional wind sway, and a Canvas software-renderer fallback.
 *
 * All demo data from the reference (Burirhat fields, POWER/NDVI/S1 snapshots,
 * illustrative rotations) is replaced by the StudioData contract built by
 * buildStudioData(). Nothing in helper/reference is imported or shipped.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { state, t, truth, esc, num, fetchJsonMaybeGzip } from "./ui.js";
import {
  outlineBounds,
  plantPositionsInPolygon,
  nearestObservation,
  monthChipText,
  fitCameraToBlock,
  fitTopView,
  clipRing,
  pointInPolygon,
  ringSignedArea,
  canopyVisualHeight,
  idleCameraSway,
  IDLE_RESUME_DELAY_S,
  solveFramingMultiplier,
  layoutLeaderLabels,
  surfaceGridPositions,
  pondingPositions,
  waterTablePositions,
  sampleS1Water,
  transectEndpoints,
  sampleTransectProfile,
  lookupProbePoint,
  buildCalloutData,
  computeAutoExaggeration,
  usdaTextureClass,
  easeOutCubic,
  easeInOutCubic,
  tweenValue,
  interpolateDonutArcs,
  createTween,
  introCameraParams,
  shouldSkipIntro,
  sampleRowCropScale,
  nearestCropMonth,
  cropStageAt,
  MONTHS_EN,
  MONTHS_BN,
  surfaceLegend,
  surfaceClass,
  surfaceCells,
  sampleSurfaceGrid,
  cropSurfaceValue,
  cropStageColor as stageColor,
  fieldFlow, fillAndSpill, interpolateSoil, productivityZones,
  pondingWaterline,
} from "./studio3d-helpers.js";
import {
  smoothOutline,
  computeMicroRelief,
  rimErosionNoise,
  generateUndersideGeometry,
} from "./landshape.js";

export {
  nearestObservation,
  monthChipText,
  plantPositionsInPolygon,
  outlineBounds,
  clipRing,
  canopyVisualHeight,
  idleFloatOffset,
  nearestCropMonth,
  cropStageAt,
} from "./studio3d-helpers.js";

/* ------------------------------------------------------------------ state */

let renderer = null;
let canvas = null;
let scene = null;
let cameraPersp = null;
let cameraOrtho = null;
let activeCamera = null;
let controls = null;
let animFrameId = null;
let currentData = null;
let currentMonthIdx = 0;
let currentLayer = "crops"; // crops | photo | ndvi | moisture | elevation
let currentCutaway = 0; // 0..0.8
let showSurroundings = false;
let isTopView = false;
let isCloseView = false;
let isPlaying = false;
let playTimer = null;
let containerEl = null;
let canvasHostEl = null;
let isDisposed = false;
let isVisible = true;
let intersectionObserver = null;
let resizeObserver = null;
let rotationOptions = null;
let activeRotationId = null;
let onRotationSelect = null;
let heightExaggeration = 1;
let isSoftwareRenderer = false;
let elevationSampler = null;
let prefersReducedMotion = false;
let buildToken = 0;
let plantShaders = [];

/* --- STUDIO5A multi-layer state --- */
let currentSurfaceMode = "crops"; // crops/agronomic | elevation/hypso | ndvi | water/ponding | fertility
let currentViewMode = "3d"; // 3d | cutaway | top
let plantingLayout = "rows"; // rows | beds | bund-drains
let rainScenarioMm = 45; // 0..240 mm
let showRoots = true;
let showBunds = true;
let proposedDrain = false;
let outletBlocked = false;
let soilOverrides = null; // { ph, om, p, gwDepthM }
let ndviRelativeOverride = null; // null = auto (within-field at ≥95 % one class), true/false = legend toggle
let probeUV = { u: 0.5, v: 0.5 };
let s1WaterData = null; // lazy loaded from /data/s1-water.json
let waterTableData = null; // lazy loaded from /data/water-table.json
let soilNutrientsData = null; // lazy loaded from /data/soil-nutrients.json
let waterMesh = null;
let contourLinesGroup = null;
let transect3dGroup = null;
let glassFrameGroup = null;
let edgeTreesGroup = null;
let probePinMesh = null;
let cameraEasing = null;
let hoveredBandId = null;
let introAnim = null; // STUDIO5M first load intro animation state
let openSoilBand = null;
let popoverTrigger = null;
let restoringPopoverFocus = false;
let suppressSoilHover = false;
let soilPinned = false; // click pins the card; hover-opened cards close on hover-out
let soilCloseTimer = 0;
let overlayEvents = null;
let hintShown = false;
let leaderLayoutCache = null;
let wideLayersOpen = false;
let stageOverlayCleanup = null;
let currentSurface = null;
const surfacePacks = new Map();

/* --- SMOOTH animated surface-layer switching --- */
const SURFACE_FADE_MS = 450; // top-texture cross-fade, ease-in-out
const LEGEND_DONUT_MS = 500; // donut arc + percentage count tween
const LEGEND_ROW_OUT_MS = 150; // old class rows fade/slide out
const LEGEND_ROW_IN_MS = 250; // new class rows fade/slide in
const LEGEND_ROW_STAGGER_MS = 30; // per-row enter stagger
const LEGEND_HEIGHT_MS = 300; // legend body height ease
const WATER_MODES = ["water", "ponding"];
let surfaceSwitchToken = 0; // invalidates in-flight fast surface switches
let legendSwitchToken = 0; // invalidates in-flight legend transitions
let surfaceFade = null; // { tween, overlay, oldTexture, fadingOut, waterMats }

let blockGroup = null;
let plantsGroup = null;
let rootsGroup = null;
let surroundingsGroup = null;
let shadowPlane = null;

const currentBlock = {
  depth: 1.5,
  bottomY: -1.5,
  topMin: 0,
  topMax: 0,
  effectiveMaxX: Infinity,
  bounds: null,
  ring: [],
  transect: [],
};

const textureCache = new Map();
const sideTextureCache = new Map();
const skyTextureCache = new Map();
const groundTextureCache = new Map();
const shadowTextureCache = new Map();

/* ------------------------------------------------------------ capabilities */

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")),
    );
  } catch (e) {
    return false;
  }
}

function isPhone() {
  return typeof window !== "undefined" && window.innerWidth <= 600;
}

function whenReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ------------------------------------------- STUDIO5T phone gesture split */

// Map-style gesture split for phones: a vertical one-finger drag scrolls the
// page natively (canvas touch-action: pan-y) while a horizontal drag rotates
// the field and two fingers pinch/tilt. Pure — unit tested.
export const TOUCH_INTENT_THRESHOLD_PX = 10;
export function touchGestureIntent(dx, dy, threshold = TOUCH_INTENT_THRESHOLD_PX) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return "undecided";
  if (Math.hypot(dx, dy) < threshold) return "undecided";
  return Math.abs(dx) > Math.abs(dy) ? "rotate" : "scroll";
}

let touchSplitEnabled = false;
let isFullscreenStage = false;
let touchGesture = null; // { mode: "undecided" | "rotate" | "scroll" | "pinch", ... }
let touchHintTimer = null;

function isTouchSplitActive() {
  if (isFullscreenStage) return false;
  if (typeof window === "undefined") return false;
  const narrow = canvasHostEl ? (canvasHostEl.clientWidth || 0) < 600 : window.innerWidth < 600;
  if (narrow) return true;
  try {
    return typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function applyTouchMode() {
  touchSplitEnabled = isTouchSplitActive();
  if (!controls || !canvas) return;
  if (touchSplitEnabled) {
    // OrbitControls sets touch-action: none on connect; relax it so vertical
    // one-finger drags scroll the page natively instead.
    canvas.style.touchAction = "pan-y";
    // One finger is handled by the gesture split below (ONE falls through to
    // OrbitControls' STATE.NONE default). Two fingers keep pinch zoom and tilt
    // (polar) within the existing distance/polar limits; top view keeps pan.
    controls.touches.ONE = null;
    controls.touches.TWO = controls.enableRotate === false ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE;
  } else {
    canvas.style.touchAction = "none";
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
  }
}

// One-finger horizontal rotate for the gesture split: azimuth only, mirroring
// OrbitControls' touch speed (2π per canvas height) and direction.
function rotateAzimuthByPixels(dxPx) {
  if (!controls || !activeCamera || !canvas) return;
  if (controls.enableRotate === false) return;
  const heightPx = Math.max(1, canvas.clientHeight || 600);
  const angle = (2 * Math.PI * dxPx * (controls.rotateSpeed || 1)) / heightPx;
  const offset = activeCamera.position.clone().sub(controls.target);
  const spherical = new THREE.Spherical().setFromVector3(offset);
  spherical.theta -= angle;
  offset.setFromSpherical(spherical);
  activeCamera.position.copy(controls.target).add(offset);
  activeCamera.lookAt(controls.target);
  requestRender();
}

function endTouchRotate() {
  isDragging = false;
  startAnimation();
  requestRender();
}

function showTouchHint() {
  if (!containerEl || !touchSplitEnabled) return;
  let seen = false;
  try {
    seen = sessionStorage.getItem("ropon_studio_touch_hint") === "1";
  } catch {
    seen = false;
  }
  if (seen) return;
  try {
    sessionStorage.setItem("ropon_studio_touch_hint", "1");
  } catch {
    // Private mode: still show the hint once per mount.
  }
  const hint = containerEl.querySelector(".studio-touch-hint");
  if (!hint) return;
  hint.hidden = false;
  void hint.offsetWidth; // force reflow so the fade-in transition runs
  hint.classList.add("visible");
  if (touchHintTimer) clearTimeout(touchHintTimer);
  touchHintTimer = setTimeout(() => {
    touchHintTimer = null;
    hint.classList.remove("visible");
    if (prefersReducedMotion) hint.hidden = true;
    else touchHintTimer = setTimeout(() => { touchHintTimer = null; hint.hidden = true; }, 350);
  }, 2500);
}

/* --------------------------------------------------------- soil and colour */

// FAO texture-triangle grouping used to shade soil-layer bands.
const SOIL_TEXTURE_COLORS = {
  clay: "#4a3525",
  "silty clay": "#533e2c",
  "sandy clay": "#5c4735",
  "clay loam": "#66503c",
  "silty clay loam": "#6e5944",
  "sandy clay loam": "#79644f",
  loam: "#836d56",
  "silt loam": "#8d7860",
  silt: "#98836a",
  "sandy loam": "#a38e75",
  "loamy sand": "#ae9a81",
  sand: "#baa68d",
  default: "#7a5f45",
};

function soilBandColor(layer) {
  const base = SOIL_TEXTURE_COLORS[layer?.textureClass?.toLowerCase()] || SOIL_TEXTURE_COLORS.default;
  // Heavier clay soil reads darker and browner; organic topsoil is darkened by SOC.
  const clay = Math.max(0, Math.min(45, layer?.clayPct || 20));
  const soc = Math.max(0, Math.min(40, layer?.socGkg || 0));
  const r = parseInt(base.slice(1, 3), 16);
  const g = parseInt(base.slice(3, 5), 16);
  const b = parseInt(base.slice(5, 7), 16);
  const shift = (v) =>
    Math.max(0, Math.min(255, Math.round(v + ((clay - 20) / 25) * -24 - soc * 0.9)));
  const hex = (v) => v.toString(16).padStart(2, "0");
  return `#${hex(shift(r))}${hex(shift(g))}${hex(shift(b))}`;
}

/* ------------------------------------------------------------------ sky */

function buildSkyTexture() {
  if (skyTextureCache.has("sky")) return skyTextureCache.get("sky");
  const cvs = document.createElement("canvas");
  cvs.width = 2;
  cvs.height = 256;
  const ctx = cvs.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.0, "#e7efe9");
  grad.addColorStop(0.52, "#f3f5ee");
  grad.addColorStop(1.0, "#d5dccb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  skyTextureCache.set("sky", tex);
  return tex;
}

/* ---------------------------------------------------------- local images */

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image unavailable: ${url}`));
    img.src = url;
  });
}

function drawImageCover(ctx, img, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/* ------------------------------------------------------ elevation sampler */

function tileX(lon, z) {
  return ((lon + 180) / 360) * Math.pow(2, z);
}
function tileY(lat, z) {
  return ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, z);
}

/**
 * Read local Terrarium DEM tiles (public/landscape/dem) and return a bilinear
 * elevation sampler in metres. No remote request is made. If the plot lies
 * outside the bundled coverage we deliberately fall back to a flat reference.
 */
async function createElevationSampler(data) {
  const bbox = data?.field?.bboxLatLon;
  if (!Array.isArray(bbox) || bbox.length !== 4 || bbox.some((v) => !Number.isFinite(v))) return null;
  const [w, s, e, n] = bbox;
  for (const z of [12, 11, 10]) {
    try {
      const minX = Math.floor(tileX(w, z));
      const maxX = Math.floor(tileX(e, z));
      const minY = Math.floor(tileY(n, z));
      const maxY = Math.floor(tileY(s, z));
      const jobs = [];
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          const url = `/landscape/dem/${z}/${x}/${y}.png`;
          jobs.push(
            loadImageElement(url).then((img) => {
              const cvs = document.createElement("canvas");
              cvs.width = 256;
              cvs.height = 256;
              const ctx = cvs.getContext("2d", { willReadFrequently: true });
              ctx.drawImage(img, 0, 0, 256, 256);
              return { key: `${x},${y}`, data: ctx.getImageData(0, 0, 256, 256).data };
            }),
          );
        }
      }
      const tiles = new Map();
      const loaded = await Promise.all(jobs);
      for (const item of loaded) tiles.set(item.key, item.data);
      if (tiles.size === 0) continue;

      return (lon, lat) => {
        const fx = tileX(lon, z);
        const fy = tileY(lat, z);
        const tx = Math.floor(fx);
        const ty = Math.floor(fy);
        const grid = tiles.get(`${tx},${ty}`);
        if (!grid) return null;
        const px = Math.max(0, Math.min(255, (fx - tx) * 256));
        const py = Math.max(0, Math.min(255, (fy - ty) * 256));
        const x0 = Math.floor(px);
        const y0 = Math.floor(py);
        const x1 = Math.min(255, x0 + 1);
        const y1 = Math.min(255, y0 + 1);
        const fxr = px - x0;
        const fyr = py - y0;
        const at = (xx, yy) => {
          const i = (yy * 256 + xx) * 4;
          return grid[i] * 256 + grid[i + 1] + grid[i + 2] / 256 - 32768;
        };
        const top = at(x0, y0) * (1 - fxr) + at(x1, y0) * fxr;
        const bottom = at(x0, y1) * (1 - fxr) + at(x1, y1) * fxr;
        return top * (1 - fyr) + bottom * fyr;
      };
    } catch (err) {
      // Try a coarser bundled zoom, then flat.
    }
  }
  return null;
}

function makeHeightAt(data) {
  const [lat, lon] = data?.field?.centroid || [0, 0];
  const fieldId = data?.field?.id || "pilot";
  const outlineM = data?.field?.outlineM || [];
  const isLowGround = data?.ground?.class === "low";
  const scaleX = 111195.08 * Math.cos((lat * Math.PI) / 180);
  const base = elevationSampler ? elevationSampler(lon, lat) : 0;
  const hasBase = Number.isFinite(base);

  return (x, z) => {
    // Studio world: x east, z south. Local outline y is north, so z = -y.
    let macro = 0;
    if (elevationSampler && hasBase) {
      const el = elevationSampler(lon + x / scaleX, lat + -z / 111195.08);
      if (Number.isFinite(el)) macro = (el - base) * heightExaggeration;
    }
    const micro = computeMicroRelief({
      x,
      z,
      fieldId,
      outlineM,
      isLowGround,
      maxNoiseM: 0.08,
    });
    return macro + micro;
  };
}

/* -------------------------------------------------------- surface texture */

function nearestForMonth(list, monthIdx) {
  const month = currentData?.months?.[monthIdx];
  const year = Number(month?.month?.slice(0, 4)) || 2024;
  return nearestObservation(list || [], monthIdx, year);
}

function loadSurfacePack(name) {
  if (!surfacePacks.has(name)) surfacePacks.set(name, fetchJsonMaybeGzip(`/data/${name}.json`));
  return surfacePacks.get(name);
}

// RELVAR: moisture always shows within-field tertiles (absolute is kept as the
// headline); NDVI follows the legend toggle, defaulting to within-field when the
// absolute view collapses to one class.
function relativeOptionFor(mode) {
  if (mode === 'moisture' || mode === 'ndmi') return true;
  if (mode === 'ndvi') return ndviRelativeOverride ?? 'auto';
  return undefined;
}

async function prepareSurface(data, mode, monthIdx) {
  const month = data.months?.[monthIdx] || {};
  const optical = ['ndvi', 'moisture', 'ndmi'].includes(mode);
  const [radarPack, nutrientPack, gridPack, soilPack] = await Promise.all([
    loadS1WaterData(), loadSoilNutrientsData(),
    optical || mode === 'productivity' ? loadSurfacePack(mode === 'moisture' || mode === 'ndmi' ? 'moisture-grid' : 'ndvi-grid') : null,
    mode === 'fertility' ? loadSurfacePack('soil-profile') : null,
    loadWaterTableData(), // keep last: the destructure above is positional
  ]);
  const year = Number(month.month?.slice(0, 4)) || 2024;
  const grid = nearestObservation(gridPack?.grids?.filter((g) => g.siteId === data.field.id), monthIdx, year)?.observation;
  const site = radarPack?.[data.field.id];
  const radar = nearestObservation(site?.dates, monthIdx, year)?.observation;
  const [lat, lon] = data.field.centroid;
  const scaleX = 111195.08 * Math.cos(lat * Math.PI / 180);
  const coordinates = (x, y) => [lon + x / scaleX, lat + y / 111195.08];
  const heightAt = makeHeightAt(data);
  const elevationAt = (x, y) => elevationSampler?.(...coordinates(x, y)) ?? null;
  const waterMaskAt = (x, z) => sampleS1Water(site, radar, ...coordinates(x, -z));
  const cells = surfaceCells(data.field.outlineM, (x, y) => ({
    elevation: elevationAt(x, y), height: heightAt(x, -y), waterMask: waterMaskAt(x, -y),
  }));
  const elevations = cells.map((c) => c.value.elevation).filter(Number.isFinite);
  // Route on physical NASADEM elevations; decorative microrelief never becomes observed terrain.
  const flow = elevationSampler ? fieldFlow(data.field.outlineM, elevationAt) : null;
  const pond = fillAndSpill(flow, rainScenarioMm, { areaM2: data.field.areaHa * 10000,
    drainFraction: proposedDrain && !outletBlocked ? 0.55 : 0 });
  const ponding = { rainMm: rainScenarioMm, depthAt: (x, z) => (pond?.depthAt(x, -z) || 0) * heightExaggeration };
  const zones = mode === 'productivity' ? productivityZones(
    gridPack?.grids?.filter((g) => g.siteId === data.field.id) || [], data.field.outlineM, coordinates) : null;
  const soilGrid = data.field.boundary === 'custom' ? null : soilPack?.sites?.[data.field.id]?.neighborhood;
  const soilAt = (x, y, key) => interpolateSoil(soilGrid, ...coordinates(x, y), key);
  const nutrients = data.field.boundary === 'custom' ? null : nutrientPack?.sites?.[data.field.id]?.nutrients;
  const ph = soilOverrides?.ph ?? data.soil?.layers?.[0]?.ph ?? nutrients?.ph?.value;
  const valueAt = (x, y) => {
    if (mode === 'ndvi' || mode === 'moisture' || mode === 'ndmi') return sampleSurfaceGrid(grid, ...coordinates(x, y));
    if (mode === 'elevation' || mode === 'hypso') return elevationAt(x, y);
    if (mode === 'water' || mode === 'ponding') return pond ? pond.depthAt(x, y) * 100 : null;
    if (mode === 'fertility') return soilOverrides?.ph ?? soilAt(x, y, 'ph') ?? ph;
    if (mode === 'productivity') return zones.at(...coordinates(x, y));
    return cropSurfaceValue(month);
  };
  const knownRadar = cells.filter((c) => c.value.waterMask !== null);
  const radarObservation = radar && knownRadar.length ? { date: radar.date,
    floodedPct: knownRadar.filter((c) => c.value.waterMask === 1).length / knownRadar.length * 100 } : null;
  const context = { month, rotation: data.rotation, soil: data.soil, nutrients, soilOverrides,
    soilCellCount: soilGrid ? 9 : data.soil || nutrients ? 1 : null,
    soilRange: soilGrid ? { ph: cells.map((c) => soilAt(c.x, c.y, 'ph')).filter(Number.isFinite), om: cells.map((c) => soilAt(c.x, c.y, 'omPct')).filter(Number.isFinite) } : null,
    zoneDates: zones?.dates, terrainAvailable: !!flow, relative: relativeOptionFor(mode),
    date: mode === 'fertility' ? (soilGrid?.retrievedAt || nutrientPack?.retrievedAt)?.slice(0, 10) : null,
    observation: grid, radarObservation, rainMm: rainScenarioMm, exaggeration: heightExaggeration,
    elevationMin: elevations.length ? Math.min(...elevations) : null,
    elevationMax: elevations.length ? Math.max(...elevations) : null,
    lang: t('en', 'bn'), cells: zones?.cells.length ? zones.cells : cells.map((c) => ({ ...c, value: valueAt(c.x, c.y) })) };
  return { mode, context, legend: surfaceLegend(mode, context), valueAt, elevationAt, ponding, flow, pond, soilAt };
}

async function buildTopTexture(data, layer, monthIdx, model = null) {
  const mode = layer || currentSurfaceMode || 'crops';
  model ||= await prepareSurface(data, mode, monthIdx);
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = mode === 'photo' ? 1024 : 128;
  const ctx = cvs.getContext('2d');
  const b = outlineBounds(data.field.outlineM);
  const legend = model.legend;
  // Paint the same polygon cells counted by the legend, without synthetic index variation.
  // Fertility keeps flat class colours: SoilGrids is a 250 m map, too coarse for
  // within-field zones, so contrast-stretched shading would invent differences.
  for (let row = 0; row < 128; row++) {
    for (let col = 0; col < 128; col++) {
      const x = b.minX + (col + 0.5) / 128 * b.width;
      const y = b.maxY - (row + 0.5) / 128 * b.height;
      const value = model.valueAt(x, y);
      const color = new THREE.Color(surfaceClass(legend, value).color);
      if (['water', 'ponding'].includes(mode)) {
        const index = model.flow?.at(x, y);
        const wetness = rainScenarioMm > 0 && index !== undefined
          ? Math.log1p(model.flow.accumulation[index]) / Math.log1p(model.flow.cells.length) : 0;
        color.set('#a38a60').lerp(new THREE.Color('#344d4b'), Math.min(0.9, wetness * 1.8));
      }
      ctx.fillStyle = `#${color.getHexString()}`;
      const scale = cvs.width / 128;
      ctx.fillRect(col * scale, row * scale, scale, scale);
    }
  }
  // The photo layer keeps its actual image; categorical surfaces keep exact class colours.
  if (mode === 'photo') {
    for (const name of [`/assets/sentinel-${data.field.id}.jpg`, `/assets/satellite-${data.field.id}.jpg`]) {
      try { drawImageCover(ctx, await loadImageElement(name), cvs.width, cvs.height); break; } catch { /* Keep the unclassified base if offline. */ }
    }
  }
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  textureCache.set(tex.uuid, tex);
  return tex;
}

function buildStratigraphicSoilWallTexture(data, highlightBand = null) {
  const custom = soilOverrides !== null;
  const key = `${data.field.id}-soil-${custom ? "custom" : "std"}-${highlightBand || "none"}`;
  if (sideTextureCache.has(key)) return sideTextureCache.get(key);

  const cvs = document.createElement("canvas");
  cvs.width = 1024;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");

  const layers = data.soil?.layers || [];
  const lastCm = Math.max(100, layers.at?.(-1)?.bottomCm || 100);

  // Stratigraphic gradient base
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.0, "#3e2918");  // Topsoil (0–15 cm)
  g.addColorStop(0.22, "#4d3420");
  g.addColorStop(0.24, "#6b492e"); // Root Zone (15–60 cm)
  g.addColorStop(0.56, "#7d5638");
  g.addColorStop(0.58, "#946b47"); // Subsoil / Plow Pan (60–120 cm)
  g.addColorStop(0.82, "#825d3d");
  g.addColorStop(0.84, "#27597a"); // Capillary fringe & Aquifer (>120 cm)
  g.addColorStop(1.0, "#1b435e");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);

  // Blend SoilGrids horizons
  for (const layer of layers) {
    const y0 = (layer.topCm / lastCm) * 512;
    const y1 = (layer.bottomCm / lastCm) * 512;
    const h = Math.max(1, y1 - y0);
    const wash = ctx.createLinearGradient(0, y0, 0, y1);
    const col = soilBandColor(layer);
    wash.addColorStop(0, `${col}22`);
    wash.addColorStop(0.5, `${col}15`);
    wash.addColorStop(1, `${col}22`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, y0, 1024, h);
  }

  // Emissive highlight wash for hovered band
  if (highlightBand) {
    let y0 = 0, y1 = 512;
    if (highlightBand === "topsoil") {
      y0 = 0; y1 = Math.round((15 / lastCm) * 512);
    } else if (highlightBand === "rootzone") {
      y0 = Math.round((15 / lastCm) * 512); y1 = Math.round((60 / lastCm) * 512);
    } else if (highlightBand === "aquifer") {
      y0 = Math.round((100 / lastCm) * 512); y1 = 512;
    }
    ctx.fillStyle = "rgba(255, 235, 180, 0.28)";
    ctx.fillRect(0, y0, 1024, Math.max(1, y1 - y0));
  }

  // Fine sedimentary grain texture
  let seed = 907;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 28000; i++) {
    const x = rnd() * 1024;
    const y = rnd() * 512;
    const r = rnd() * 1.5 + 0.3;
    ctx.fillStyle = rnd() > 0.52 ? "rgba(22, 14, 8, 0.20)" : "rgba(218, 192, 156, 0.15)";
    ctx.fillRect(x, y, r * 2.5, r * 1.5);
  }

  // Horizon wavy division lines from SoilGrids (organic wavy strata)
  const divY = [
    Math.round((15 / lastCm) * 512),
    Math.round((60 / lastCm) * 512),
    Math.round((100 / lastCm) * 512),
  ];
  divY.forEach((y0, idx) => {
    ctx.strokeStyle = idx === 2 ? "rgba(125, 211, 252, 0.75)" : "rgba(30, 18, 10, 0.4)";
    ctx.lineWidth = idx === 2 ? 2.5 : 1.5;
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = y0 + Math.sin(x * 0.028 + idx * 1.5) * 5 + Math.sin(x * 0.065 + idx) * 2;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  });

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  sideTextureCache.set(key, tex);
  return tex;
}

function buildSideTexture(data) {
  return buildStratigraphicSoilWallTexture(data, hoveredBandId);
}
function blockDepthM(bounds) {
  // ~1/6 of the plot width, with a floor so tiny plots still read as a block.
  return Math.max(1.5, Math.max(bounds.width, bounds.height) / 6);
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((child) => {
    if (child.userData.terrain && child.material?.map) {
      child.material.map.dispose();
      textureCache.delete(child.material.map.uuid);
    }
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) m.dispose();
    }
  });
  if (group.parent) group.parent.remove(group);
}

function buildSurfaceGeometry(ringM, heightAt, bounds, model) {
  const ring = ringM.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(ring, []);
  const positions = surfaceGridPositions(ringM, triangles, heightAt, isSoftwareRenderer ? 14 : 28);
  const uvs = [];
  const elevations = [];
  const width = Math.max(1e-6, bounds.width);
  const depth = Math.max(1e-6, bounds.height);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, h, z] = positions.slice(i, i + 3);
    uvs.push((x - bounds.minX) / width, (-z - bounds.minY) / depth);
    elevations.push(model.elevationAt(x, -z) ?? 0);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute("aElevation", new THREE.Float32BufferAttribute(elevations, 1));

  geom.computeVertexNormals();
  return geom;
}

function buildWallMesh(ringM, heightAt, bottomY, sideMaterial, fieldId = "pilot") {
  const positions = [];
  const uvs = [];
  const indices = [];
  const anchorTops = [];
  let total = 0;
  // Farm-traced outlines can be clockwise. Reverse the wall winding for those
  // rings so the outward faces receive light instead of rendering inside-out.
  const flipWinding = ringSignedArea(ringM) < 0;
  const lengths = [];
  for (let i = 0; i < ringM.length; i++) {
    const a = ringM[i];
    const b = ringM[(i + 1) % ringM.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    lengths.push(len);
    total += len;
  }
  let travelled = 0;
  for (let edge = 0; edge < ringM.length; edge++) {
    const a = ringM[edge];
    const b = ringM[(edge + 1) % ringM.length];
    const len = lengths[edge];
    const steps = Math.max(1, Math.min(14, Math.ceil(len / 2)));
    for (let step = 0; step < steps; step++) {
      const t0 = step / steps;
      const t1 = (step + 1) / steps;
      const x0 = a[0] + (b[0] - a[0]) * t0;
      const y0 = a[1] + (b[1] - a[1]) * t0;
      const x1 = a[0] + (b[0] - a[0]) * t1;
      const y1 = a[1] + (b[1] - a[1]) * t1;
      const z0 = -y0;
      const z1 = -y1;

      // Eroded rim: deterministic subtle crumble/overhang and height variation along outline
      const noise0 = rimErosionNoise(fieldId, edge, t0);
      const noise1 = rimErosionNoise(fieldId, edge, t1);
      const top0 = heightAt(x0, z0) - 0.03 + noise0.dh;
      const top1 = heightAt(x1, z1) - 0.03 + noise1.dh;
      if (t0 <= 0.5 && t1 >= 0.5) anchorTops[edge] = top0 + (top1-top0) * (0.5-t0)/(t1-t0);

      const u0 = ((travelled + len * t0) / Math.max(1e-6, total)) * 2;
      const u1 = ((travelled + len * t1) / Math.max(1e-6, total)) * 2;
      const base = positions.length / 3;
      positions.push(x0, top0, z0, x0, bottomY, z0, x1, top1, z1, x1, bottomY, z1);
      uvs.push(u0, 1, u0, 0, u1, 1, u1, 0);
      if (flipWinding) {
        indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      } else {
        indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
    }
    travelled += len;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, sideMaterial);
  mesh.userData.soil = true;
  mesh.userData.anchorTops = anchorTops;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildUndersideMesh(ringM, bottomY, depthM, fieldId, sideMaterial) {
  const geoData = generateUndersideGeometry({
    ringM,
    bottomY,
    depthM,
    fieldId,
    numAngles: 36,
    numRings: 8,
  });
  if (!geoData.positions.length) return null;

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(geoData.positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(geoData.uvs, 2));
  geom.setIndex(geoData.indices);
  geom.computeVertexNormals();

  const mesh = new THREE.Mesh(geom, sideMaterial);
  mesh.userData.soil = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBoundaryLine(ringM, heightAt) {
  // Subdivide each edge so the rim tracks the wavy terrain top instead of
  // chording across it, and sit the line a hair above the surface so it reads
  // as a crisp pale outline — not a slab stripe.
  const points = [];
  for (let i = 0; i < ringM.length; i++) {
    const a = ringM[i];
    const b = ringM[(i + 1) % ringM.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const steps = Math.max(2, Math.ceil(len / 1.5));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + (b[0] - a[0]) * t;
      const y = a[1] + (b[1] - a[1]) * t;
      points.push(new THREE.Vector3(x, heightAt(x, -y) + 0.045, -y));
    }
  }
  if (points.length) points.push(points[0].clone());
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: 0xf3f6e5,
    transparent: true,
    opacity: 0.85,
    depthTest: true,
  });
  const line = new THREE.Line(geom, mat);
  line.userData.boundary = points.map((p) => [p.x, p.y, p.z]);
  return line;
}

function makeElevationMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: false,
    roughness: 0.96,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uContours = { value: 1 };
    shader.vertexShader =
      "attribute float aElevation; varying float vElev;\n" +
      shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvElev=aElevation;",
      );
    shader.fragmentShader =
      "varying float vElev; uniform float uContours;\n" +
      shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
         float d=abs(fract(vElev/0.25-0.5)-0.5);
         float edge=max(fwidth(vElev/0.25),0.006);
         diffuseColor.rgb*=1.0-(1.0-smoothstep(0.0,edge,d))*0.35*uContours;`,
      );
    mat.userData.shader = shader;
  };
  return mat;
}

// Ponding + runoff overlays are built standalone so a surface-mode change can
// fade them in/out without rebuilding the field block.
function buildPondingMesh(surfacePositions, model) {
  const waterPositions = pondingPositions(surfacePositions, model.ponding);
  if (!waterPositions.length) return null;
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute("position", new THREE.Float32BufferAttribute(waterPositions, 3));
  wGeo.computeVertexNormals();
  const waterLegend = surfaceLegend('water', model.context);
  const colors = [];
  for (let i = 0; i < waterPositions.length; i += 9) {
    const x = (waterPositions[i] + waterPositions[i + 3] + waterPositions[i + 6]) / 3;
    const z = (waterPositions[i + 2] + waterPositions[i + 5] + waterPositions[i + 8]) / 3;
    const depthCm = (model.pond?.depthAt(x, -z) || 0) * 100;
    const color = new THREE.Color(surfaceClass(waterLegend, Math.max(0.001, depthCm)).color);
    for (let j = 0; j < 3; j++) colors.push(color.r, color.g, color.b);
  }
  wGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(wGeo, new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    roughness: 0.16,
    metalness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  mesh.userData.water = true;
  // Only unshared wet-triangle edges form the white waterline, never the triangulation.
  const shoreline = new THREE.BufferGeometry();
  shoreline.setAttribute('position', new THREE.Float32BufferAttribute(pondingWaterline(waterPositions), 3));
  const line = new THREE.LineSegments(shoreline, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1.5 }));
  line.userData.waterline = true;
  mesh.add(line);
  return mesh;
}

function buildRunoffLines(ringM, heightAt, model) {
  if (!(rainScenarioMm > 0) || !model.flow) return null;
  const positions = [], phases = [], { cells, direction, accumulation } = model.flow;
  const threshold = Math.max(4, cells.length * 0.012);
  for (let i = 0; i < cells.length; i++) {
    const next = direction[i];
    if (next < 0 || accumulation[i] < threshold) continue;
    const a = cells[i], b = cells[next];
    if (![a, b].every((c) => pointInPolygon(c.x, c.y, ringM))) continue;
    // Interpolate terrain along each D8 segment so the line cannot tunnel through the surface.
    const count = 6;
    for (let j = 0; j < count; j++) for (const f of [j / count, (j + 1) / count]) {
      const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f;
      positions.push(x, heightAt(x, -y) + 0.045, -y);
      phases.push((accumulation[i] + f) * 0.23);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('flowPhase', new THREE.Float32BufferAttribute(phases, 1));
  const material = new THREE.LineBasicMaterial({ color: 0x249aff, transparent: true, opacity: 0.9 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.flowTime = { value: 0 };
    shader.vertexShader = 'attribute float flowPhase; varying float vFlowPhase;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFlowPhase = flowPhase;');
    shader.fragmentShader = 'uniform float flowTime; varying float vFlowPhase;\n' + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= 0.85 + 0.15 * sin(vFlowPhase - flowTime * 2.0);');
    material.userData.flowShader = shader;
  };
  const runoff = new THREE.LineSegments(geometry, material);
  runoff.userData.runoff = true;
  return runoff;
}

async function buildFieldBlock(data, cutawayFraction) {
  const token = ++buildToken;
  surfaceSwitchToken++; // an in-flight fast surface switch must not swap into a rebuilt block
  cancelSurfaceFade(); // tear down any running cross-fade before its meshes are disposed
  disposeGroup(blockGroup);
  blockGroup = null;
  disposeGroup(waterMesh);
  waterMesh = null;
  disposeGroup(contourLinesGroup);
  contourLinesGroup = null;
  disposeGroup(transect3dGroup);
  transect3dGroup = null;

  const outlineM = data.field.outlineM;
  if (!outlineM || outlineM.length < 3) return;
  const bounds = outlineBounds(outlineM);
  const depth = blockDepthM(bounds);
  const effectiveMaxX = bounds.maxX - cutawayFraction * Math.max(1e-6, bounds.maxX - bounds.minX);
  // Organic outline smoothing pass (Chaikin / quadratic pass <= 1.5 m)
  const smoothedOutline = smoothOutline(outlineM, 1.5);
  const ringM = cutawayFraction > 0.001 ? clipRing(smoothedOutline, effectiveMaxX) : smoothedOutline.map((p) => [p[0], p[1]]);
  if (ringM.length < 3) return;

  const heightAt = makeHeightAt(data);
  const model = await prepareSurface(data, currentSurfaceMode, currentMonthIdx);
  if (token !== buildToken) return;
  const topTex = await buildTopTexture(data, currentSurfaceMode, currentMonthIdx, model);
  if (token !== buildToken) {
    topTex.dispose();
    textureCache.delete(topTex.uuid);
    return;
  }
  const prevLegend = currentSurface?.legend || null;
  currentSurface = model;
  const legendResized = updateSurfaceLegend(prevLegend);

  const topMat = model.mode === 'elevation' || model.mode === 'hypso' ? makeElevationMaterial() : new THREE.MeshStandardMaterial({
    map: topTex,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  topMat.map = topTex;

  const sideTex = buildStratigraphicSoilWallTexture(data);
  const sideMat = new THREE.MeshStandardMaterial({
    name: "side",
    map: sideTex,
    emissive: 0xffffff,
    emissiveMap: sideTex,
    emissiveIntensity: 0.35,
    roughness: 0.94,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  sideMat.userData.isSide = true;

  const topGeom = buildSurfaceGeometry(ringM, heightAt, bounds, model);
  const topMesh = new THREE.Mesh(topGeom, topMat);
  topMesh.userData.terrain = true;
  topMesh.userData.contours = (model.mode === 'elevation' || model.mode === 'hypso') && Number.isFinite(model.context.elevationMin);
  topMesh.castShadow = true;
  topMesh.receiveShadow = true;

  let topMin = Infinity;
  let topMax = -Infinity;
  const pos = topGeom.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < topMin) topMin = y;
    if (y > topMax) topMax = y;
  }
  if (!Number.isFinite(topMin)) topMin = 0;
  if (!Number.isFinite(topMax)) topMax = 0;
  const bottomY = topMin - depth;

  const wallMesh = buildWallMesh(ringM, heightAt, bottomY, sideMat, data.field.id);
  const boundary = buildBoundaryLine(ringM, heightAt);
  const undersideMesh = buildUndersideMesh(ringM, bottomY, depth, data.field.id, sideMat);

  blockGroup = new THREE.Group();
  blockGroup.add(topMesh, wallMesh, boundary);
  if (undersideMesh) blockGroup.add(undersideMesh);

  // Subsurface Aquifer / Groundwater Table Slab
  const gwDepth = soilOverrides?.gwDepthM ?? 3.4;
  const gwTopY = Math.max(bottomY + 0.2, topMin - (gwDepth / 5.0) * (depth * 0.8));
  if (cutawayFraction > 0.05) {
    const gwGeom = new THREE.BufferGeometry();
    gwGeom.setAttribute("position", new THREE.Float32BufferAttribute(
      waterTablePositions(pos.array, gwTopY, bottomY, topMin), 3,
    ));
    gwGeom.computeVertexNormals();
    const gwMat = new THREE.MeshStandardMaterial({
      color: soilOverrides ? 0x1d6fa5 : 0x526575,
      transparent: true,
      opacity: 0.65,
      roughness: 0.25,
      side: THREE.DoubleSide,
    });
    const gwSlab = new THREE.Mesh(gwGeom, gwMat);
    gwSlab.userData.water = true;
    blockGroup.add(gwSlab);
  }

  // Water Ponding layer: simulated water only in the Water view (crop view must not look flooded).
  if (WATER_MODES.includes(model.mode)) {
    const ponding = buildPondingMesh(pos.array, model);
    if (ponding) {
      waterMesh = ponding;
      blockGroup.add(waterMesh);
    }
    const runoff = buildRunoffLines(ringM, heightAt, model);
    if (runoff) blockGroup.add(runoff);
  }

  // Bunds follow the actual boundary at terrain height; no tree features are supplied.
  if (showBunds) {
    const bund = buildBoundaryLine(ringM, heightAt);
    bund.material.color.set(0x8b784b);
    blockGroup.add(bund);
  }

  // 3D Transect Line A -> A'
  const transect = transectEndpoints(ringM, bounds);
  transect3dGroup = new THREE.Group();
  if (transect.length === 2) {
    const [a, b] = transect;
    const points = [];
    for (let i = 0; i <= 36; i++) {
      const x = a[0] + (b[0] - a[0]) * i / 36;
      const y = a[1] + (b[1] - a[1]) * i / 36;
      points.push(new THREE.Vector3(x, heightAt(x, -y) + 0.025, -y));
    }
    transect3dGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xfffdf5, transparent: true, opacity: 0.7 }),
    ));
  }
  blockGroup.add(transect3dGroup);

  ensureFloatGroup();
  floatGroup.add(blockGroup);

  currentBlock.depth = depth;
  currentBlock.bottomY = bottomY;
  currentBlock.topMin = topMin;
  currentBlock.topMax = topMax;
  currentBlock.effectiveMaxX = effectiveMaxX;
  currentBlock.bounds = bounds;
  currentBlock.ring = ringM.map(([x, y]) => [x, -y]);
  currentBlock.transect = transect;

  if (scene) {
    scene.userData.fieldMode = true;
    scene.userData.shadow = { ring: currentBlock.ring, y: bottomY - 0.02 };
    scene.userData.version = (scene.userData.version || 0) + 1;
  }

  renderTransectSVG();
  buildGlassFrame(ringM, topMin, bottomY, effectiveMaxX, cutawayFraction);
  buildEdgeTrees(ringM, heightAt);
  if (legendResized) onResize();
}

/* ------------------------------------------- SMOOTH surface cross-fade */

function findTopMesh() {
  return blockGroup?.children.find((c) => c.userData.terrain && !c.userData.fadeOverlay) || null;
}

// Tear down a running cross-fade: stop its tween, remove the overlay mesh and
// dispose the stale overlay material + old texture (the overlay shares the
// top mesh geometry, so the geometry itself is never disposed here).
// Fading-out water is stale and disposed; fading-in water keeps its target
// opacity as the current on-screen state, so a rapid re-switch starts from
// what is visible. Never leaves more than one overlay behind.
function cancelSurfaceFade() {
  const fade = surfaceFade;
  surfaceFade = null;
  if (!fade) return;
  fade.tween?.cancel();
  if (fade.overlay) {
    if (fade.overlay.parent) fade.overlay.parent.remove(fade.overlay);
    if (fade.overlay.material) fade.overlay.material.dispose();
    if (fade.oldTexture) {
      textureCache.delete(fade.oldTexture.uuid);
      fade.oldTexture.dispose();
    }
  }
  for (const obj of fade.fadingOut || []) disposeGroup(obj);
  if (!fade.fadingOut?.length) {
    for (const { mat, to } of fade.waterMats || []) mat.opacity = to;
  }
}

// Fast surface-mode switch: the new texture goes live underneath while the
// previous one fades out on a temporary overlay copy of the top mesh
// (same geometry, polygonOffset, transparent, 450 ms ease-in-out), then the
// overlay + old texture are disposed. Water overlays fade in/out with the
// same timing. No geometry is rebuilt. Returns true when handled (swapped,
// swapped instantly, or superseded by a newer switch); false when the caller
// must fall back to a full buildFieldBlock.
async function runSurfaceCrossfade(prevMode) {
  const myToken = ++surfaceSwitchToken;
  cancelSurfaceFade();
  const data = currentData;
  if (!data || !blockGroup || !findTopMesh()) return false;
  const mode = currentSurfaceMode;
  let model = null;
  let topTex = null;
  try {
    model = await prepareSurface(data, mode, currentMonthIdx);
  } catch {
    return false;
  }
  if (myToken !== surfaceSwitchToken || !containerEl || !currentData) return true;
  try {
    topTex = await buildTopTexture(data, mode, currentMonthIdx, model);
  } catch {
    return false;
  }
  if (myToken !== surfaceSwitchToken || !containerEl) {
    textureCache.delete(topTex.uuid);
    topTex.dispose();
    return true;
  }
  const mesh = findTopMesh();
  if (!mesh || !blockGroup) {
    textureCache.delete(topTex.uuid);
    topTex.dispose();
    return false;
  }
  const oldMat = mesh.material;
  const oldTex = oldMat?.map || null;
  const prevLegend = currentSurface?.legend || null;
  const newMat = (mode === 'elevation' || mode === 'hypso') ? makeElevationMaterial() : new THREE.MeshStandardMaterial({
    map: topTex,
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  newMat.map = topTex;
  mesh.material = newMat;
  mesh.userData.contours = (mode === 'elevation' || mode === 'hypso') && Number.isFinite(model.context.elevationMin);
  currentSurface = model;

  // Water overlays follow the same timing: old ones fade out, new ones fade in.
  const wasWater = WATER_MODES.includes(prevMode);
  const isWater = WATER_MODES.includes(mode);
  const fadingOut = [];
  const waterMats = []; // { mat, from, to }
  const trackMats = (obj, from, to) => {
    obj.traverse((child) => {
      if (!child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (!mat.transparent) {
          mat.transparent = true;
          mat.needsUpdate = true;
        }
        waterMats.push({ mat, from: from === null ? mat.opacity : from, to: to === null ? mat.opacity : to });
      }
    });
  };
  if (wasWater && !isWater) {
    if (waterMesh) fadingOut.push(waterMesh);
    for (const child of blockGroup.children) {
      if (child.userData.runoff && !fadingOut.includes(child)) fadingOut.push(child);
    }
    waterMesh = null;
    for (const obj of fadingOut) trackMats(obj, null, 0);
  } else if (isWater && !wasWater) {
    const heightAt = makeHeightAt(data);
    const ringM = (currentBlock.ring || []).map(([x, z]) => [x, -z]);
    const posAttr = mesh.geometry.getAttribute("position");
    const ponding = buildPondingMesh(posAttr.array, model);
    if (ponding) {
      waterMesh = ponding;
      blockGroup.add(ponding);
    }
    const runoff = buildRunoffLines(ringM, heightAt, model);
    if (runoff) blockGroup.add(runoff);
    for (const obj of [ponding, runoff]) {
      if (!obj) continue;
      trackMats(obj, 0, null);
    }
    for (const { mat } of waterMats) mat.opacity = 0;
  }

  // Reduced motion (and the canvas fallback, which cannot blend) switch instantly.
  if (prefersReducedMotion || isSoftwareRenderer) {
    if (oldMat) oldMat.dispose();
    if (oldTex) {
      textureCache.delete(oldTex.uuid);
      oldTex.dispose();
    }
    for (const obj of fadingOut) disposeGroup(obj);
    for (const { mat, to } of waterMats) mat.opacity = to;
    updateSurfaceLegend(prevLegend);
    buildPlantsAndRoots(data, currentMonthIdx);
    updateProbeCard();
    requestRender();
    return true;
  }

  const overlayMat = oldMat;
  overlayMat.transparent = true;
  overlayMat.opacity = 1;
  overlayMat.depthWrite = false;
  overlayMat.polygonOffset = true;
  overlayMat.polygonOffsetFactor = -2;
  overlayMat.polygonOffsetUnits = -2;
  overlayMat.needsUpdate = true;
  const overlay = new THREE.Mesh(mesh.geometry, overlayMat);
  overlay.userData.terrain = true;
  overlay.userData.fadeOverlay = true;
  overlay.castShadow = false;
  overlay.receiveShadow = false;
  blockGroup.add(overlay);
  const fade = { tween: null, overlay, oldTexture: oldTex, fadingOut, waterMats };
  surfaceFade = fade;
  startAnimation(); // keep frames flowing for the fade even when idle
  fade.tween = createTween({
    duration: SURFACE_FADE_MS,
    ease: easeInOutCubic,
    onUpdate: (eased) => {
      if (surfaceFade !== fade) return;
      overlayMat.opacity = 1 - eased;
      for (const { mat, from, to } of waterMats) mat.opacity = from + (to - from) * eased;
      requestRender();
    },
    onDone: () => {
      if (surfaceFade !== fade) return;
      surfaceFade = null;
      if (overlay.parent) overlay.parent.remove(overlay);
      overlayMat.dispose();
      if (oldTex) {
        textureCache.delete(oldTex.uuid);
        oldTex.dispose();
      }
      for (const obj of fadingOut) disposeGroup(obj);
      for (const { mat, to } of waterMats) mat.opacity = to;
      requestRender();
    },
  });
  fade.tween.start();
  updateSurfaceLegend(prevLegend);
  buildPlantsAndRoots(data, currentMonthIdx);
  updateProbeCard();
  requestRender();
  return true;
}

// Route a surface-mode change: fast texture cross-fade when the block exists,
// otherwise a full rebuild (first build, or a rebuild already in flight).
function switchSurfaceMode(prevMode) {
  const afterBuild = () => {
    if (!currentData) return;
    buildPlantsAndRoots(currentData, currentMonthIdx);
    updateProbeCard();
    requestRender();
  };
  if (!currentData || !blockGroup || !findTopMesh()) {
    buildFieldBlock(currentData, currentCutaway).then(afterBuild);
    return;
  }
  runSurfaceCrossfade(prevMode).then((handled) => {
    if (!handled && containerEl && currentData) {
      buildFieldBlock(currentData, currentCutaway).then(afterBuild);
    }
  }).catch(() => {
    // The fast path never leaves a half-swapped block: rebuild from scratch.
    if (containerEl && currentData) buildFieldBlock(currentData, currentCutaway).then(afterBuild);
  });
}

/* ------------------------------------------------------------ crop clumps */

function mergeClumpParts(parts) {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const positions = new Float32Array(total * 3);
  let offset = 0;
  for (const g of nonIndexed) {
    positions.set(g.attributes.position.array, offset * 3);
    offset += g.attributes.position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

// Low-poly crop geometry shared by every instance of a clump.

export function buildClumpGeometry(cropId, heightM, spreadM, stage = "grow") {
  const h = Math.max(0.06, heightM);
  // Clumps are a little wider than the grid gap so the canopy closes over the
  // soil, while their centres remain inset inside the field boundary.
  const r = Math.max(0.08, spreadM * 0.46);

  if (["aman", "boro", "mustard", "potato", "mungbean"].includes(cropId)) {
    const leafy = cropId === "potato" || cropId === "mungbean";
    // Rice/grass family: a dense tuft of fine tapered blades. Each blade is a
    // narrow quad that leans gently outward from the base to make a soft fuzzy
    // top silhouette without silhouetting any single blade. Eight blades are
    // already in-geometry; InstancedMesh reuses this tuft across the field so
    // the entire crop still renders in one draw call.
    const parts = [];
    const blades = leafy ? 6 : 8;
    for (let k = 0; k < blades; k++) {
      // Spread the blades around and give each a tiny deterministic jitter so
      // the tuft reads as hand-sown, not as a star.
      const angle = (k / blades) * Math.PI * 2 + Math.sin(k * 11.3) * 0.18;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const bladeH = h * (0.82 + Math.abs(Math.sin(k * 3.7)) * 0.3);
      const baseW = Math.max(0.012, r * (leafy ? 0.16 : 0.055));
      const midW = baseW * 0.65;
      const tipW = baseW * 0.18;
      const lean = r * ((leafy ? 0.55 : 0.38) + Math.abs(Math.cos(k * 2.1)) * 0.22);
      // Two-strip quad: base → mid → tip for a soft taper.
      const bx0 = -baseW * s;
      const bz0 = baseW * c;
      const bx1 = baseW * s;
      const bz1 = -baseW * c;
      const mx = lean * c * 0.5;
      const mz = lean * s * 0.5;
      const mX0 = mx - midW * s;
      const mZ0 = mz + midW * c;
      const mX1 = mx + midW * s;
      const mZ1 = mz - midW * c;
      const tx = lean * c;
      const tz = lean * s;
      const tX0 = tx - tipW * s;
      const tZ0 = tz + tipW * c;
      const tX1 = tx + tipW * s;
      const tZ1 = tz - tipW * c;
      const g = new THREE.BufferGeometry();
      const verts = [
        bx0, 0, bz0,       bx1, 0, bz1,       mX0, bladeH * 0.5, mZ0,
        bx1, 0, bz1,       mX1, bladeH * 0.5, mZ1,  mX0, bladeH * 0.5, mZ0,
        mX0, bladeH * 0.5, mZ0, mX1, bladeH * 0.5, mZ1, tX0, bladeH, tZ0,
        mX1, bladeH * 0.5, mZ1, tX1, bladeH, tZ1,     tX0, bladeH, tZ0,
      ];
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.computeVertexNormals();
      parts.push(g);
    }
    // A low inner cone fills the tuft centre so distant clumps don't go hollow.
    const base = new THREE.ConeGeometry(r * 0.26, h * 0.55, 5);
    base.translate(0, h * 0.28, 0);
    parts.push(base);
    if (cropId === "mustard" && stage === "mature") {
      const bloom = new THREE.IcosahedronGeometry(r * 0.18, 0);
      bloom.scale(1, 0.55, 1);
      bloom.translate(0, h, 0);
      parts.push(bloom);
    }
    return mergeClumpParts(parts);
  }

  const g = new THREE.ConeGeometry(r * 0.4, h, 5);
  g.translate(0, h / 2, 0);
  return g;
}

export function buildFallowResidueGeometry(spreadM = 0.3) {
  const parts = [];
  const r = Math.max(0.08, spreadM * 0.46);
  // Stubble: short cut stems in old rows (straw colour, angled slightly)
  for (let k = 0; k < 3; k++) {
    const angle = (k / 3) * Math.PI * 2 + k * 0.35;
    const h = 0.08 + (k % 2) * 0.04;
    const stem = new THREE.CylinderGeometry(0.012, 0.016, h, 4);
    stem.rotateZ(0.14 * Math.cos(angle));
    stem.rotateX(0.14 * Math.sin(angle));
    stem.translate(Math.cos(angle) * r * 0.35, h / 2, Math.sin(angle) * r * 0.35);
    parts.push(stem);
  }
  // Low sparse weeds
  for (let k = 0; k < 2; k++) {
    const angle = k * Math.PI + 1.1;
    const weed = new THREE.ConeGeometry(r * 0.18, 0.05, 3);
    weed.rotateZ(0.35 * Math.cos(angle));
    weed.translate(Math.cos(angle) * r * 0.55, 0.025, Math.sin(angle) * r * 0.55);
    parts.push(weed);
  }
  return mergeClumpParts(parts);
}

export function createBotanicalPlantGeometry() {
  const geo = new THREE.BufferGeometry();
  const positions = [];
  const normals = [];
  const blades = 7;

  for (let b = 0; b < blades; b++) {
    const angle = (b / blades) * Math.PI * 2 + (b % 2) * 0.2;
    const lean = 0.18 + (b % 3) * 0.11;
    const h = 0.42 + (b % 3) * 0.08;
    const w = 0.032;

    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const px = -dz * w;
    const pz = dx * w;

    // 2-segment arched leaf ribbon
    const x0 = 0, y0 = 0, z0 = 0;
    const x1 = dx * lean * 0.45, y1 = h * 0.55, z1 = dz * lean * 0.45;
    const x2 = dx * lean, y2 = h, z2 = dz * lean;

    // Lower quad (2 triangles)
    positions.push(
      x0 - px, y0, z0 - pz,
      x0 + px, y0, z0 + pz,
      x1 + px * 0.7, y1, z1 + pz * 0.7,
      x0 - px, y0, z0 - pz,
      x1 + px * 0.7, y1, z1 + pz * 0.7,
      x1 - px * 0.7, y1, z1 - pz * 0.7
    );
    // Upper tapering tip triangle
    positions.push(
      x1 - px * 0.7, y1, z1 - pz * 0.7,
      x1 + px * 0.7, y1, z1 + pz * 0.7,
      x2, y2, z2
    );

    for (let k = 0; k < 9; k++) {
      normals.push(dx * 0.3, 0.9, dz * 0.3);
    }
  }

  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geo;
}

function deterministic(i, seed) {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function cropSpacing(cropId) {
  // Rice tufts sit tight enough to form a continuous canopy at the fitted
  // overview camera; the other crops stay on a looser grid so leaves stay
  // individually readable.
  if (cropId === "mustard") return { row: 0.3, plant: 0.2 };
  if (cropId === "boro" || cropId === "aman") return { row: 0.3, plant: 0.2 };
  if (cropId === "potato") return { row: 0.5, plant: 0.34 };
  if (cropId === "mungbean") return { row: 0.34, plant: 0.24 };
  return { row: 0.4, plant: 0.26 };
}

function buildPlantsAndRoots(data, monthIdx) {
  disposeGroup(plantsGroup);
  plantsGroup = null;
  disposeGroup(rootsGroup);
  rootsGroup = null;
  plantShaders = [];

  const month = data.months?.[monthIdx];
  if (!month) return;
  if (!['crops', 'photo'].includes(currentSurfaceMode)) return;
  const isFallow = month.stage === "fallow" || !month.cropId;

  // For fallow months: find previous crop in rotation for row spacing and residue
  let prevCrop = null;
  if (isFallow) {
    const months = data.months || [];
    for (let step = 1; step <= 12; step++) {
      const idx = ((monthIdx - step) % 12 + 12) % 12;
      const m = months[idx];
      if (m && m.cropId && m.stage !== "fallow") {
        prevCrop = m;
        break;
      }
    }
  }

  const outlineM = data.field.outlineM;
  const bounds = currentBlock.bounds || outlineBounds(outlineM);
  const heightAt = makeHeightAt(data);
  const maxPlants = isPhone() || (navigator.deviceMemory || 4) <= 4 ? 4000 : 38000;
  
  // Adapt spacing based on plantingLayout and cropId (or previous crop if fallow)
  const activeCropId = isFallow ? (prevCrop?.cropId || "boro") : month.cropId;
  const step = cropSpacing(activeCropId);
  const layout = plantingLayout || "rows";
  const rowsAlongX = bounds.width >= bounds.height;
  let rowSpacing = (rowsAlongX ? step.row : step.plant) * (layout === "beds" ? 1.5 : layout === "bund-drains" ? 1.25 : 1);
  let plantSpacing = (rowsAlongX ? step.plant : step.row) * (layout === "beds" ? 0.8 : 1);

  let positions = plantPositionsInPolygon(
    outlineM,
    rowSpacing,
    currentBlock.effectiveMaxX,
    plantSpacing,
  );
  while (positions.length > maxPlants && rowSpacing < 3) {
    rowSpacing *= 1.22;
    plantSpacing *= 1.15;
    positions = plantPositionsInPolygon(outlineM, rowSpacing, currentBlock.effectiveMaxX, plantSpacing);
  }
  if (positions.length === 0) return;

  const fieldSpan = Math.max(bounds.width, bounds.height);
  const h = isFallow ? 0.12 : canopyVisualHeight(month, fieldSpan);
  if (!(h > 0)) return;

  const geom = isFallow
    ? buildFallowResidueGeometry(Math.max(rowSpacing, plantSpacing))
    : buildClumpGeometry(month.cropId, h, Math.max(rowSpacing, plantSpacing), month.stage);
  
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = "uniform float uTime;\n" + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
       transformed.x += sin(uTime * 1.7 + instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.15) * 0.08 * position.y;
       transformed.z += cos(uTime * 1.3 + instanceMatrix[3].x * 0.11) * 0.04 * position.y;`,
    );
    mat.userData.shader = shader;
    plantShaders.push(shader);
  };

  const mesh = new THREE.InstancedMesh(geom, mat, positions.length);
  mesh.castShadow = !isPhone();
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const strawColor = stageColor(null, 'fallow');
  const base = new THREE.Color(isFallow ? strawColor : stageColor(month.cropId, month.stage));
  const colour = new THREE.Color();

  // Stage scaling factor so seedlings and establishing crops are small, not invisible
  const stageScale = isFallow
    ? 1.0
    : month.stage === "establish"
      ? 0.42
      : month.stage === "harvest"
        ? 0.55
        : 1.0;

  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[i];
    const z = -y;
    const jitter = 0.82 + deterministic(i, 1) * 0.38;
    const yaw = deterministic(i, 2) * Math.PI * 2;
    dummy.position.set(
      x + (deterministic(i, 3) - 0.5) * plantSpacing * 0.18,
      heightAt(x, z) + 0.015,
      z + (deterministic(i, 4) - 0.5) * plantSpacing * 0.18,
    );
    dummy.rotation.set(0, yaw, 0);
    const sx = jitter * (month.cropId === "potato" ? 1.35 : 1.0) * stageScale;
    const sz = jitter * (month.cropId === "potato" ? 1.35 : 1.0) * stageScale;
    const sy = (0.9 + deterministic(i, 5) * 0.24) * stageScale;
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    colour.copy(base).multiplyScalar(0.82 + deterministic(i, 6) * 0.32);
    mesh.setColorAt(i, colour);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData.baseMatrices = new Float32Array(mesh.instanceMatrix.array);
  const boundsY = bounds.maxY - bounds.minY;
  mesh.userData.rowProgress = new Float32Array(positions.map(([, y]) => {
    return boundsY > 1e-4 ? Math.max(0, Math.min(1, (y - bounds.minY) / boundsY)) : 0;
  }));

  plantsGroup = new THREE.Group();
  plantsGroup.add(mesh);
  plantsGroup.userData.plants = {
    positions: positions.map(([x, y]) => [x, heightAt(x, -y) + 0.02, -y]),
    height: h,
    color: isFallow ? strawColor : stageColor(month.cropId, month.stage),
    flower: !isFallow && month.cropId === "mustard" && month.stage !== "harvest" ? "#e8c93a" : null,
  };
  ensureFloatGroup();
  floatGroup.add(plantsGroup);

  if (showRoots && month.rootDepthM) {
    buildRoots(data, month, heightAt);
  }
}

function buildRoots(data, month, heightAt) {
  const bounds = currentBlock.bounds || outlineBounds(data.field.outlineM);
  const cutX = currentBlock.effectiveMaxX;
  if (!Number.isFinite(cutX)) return;
  const maxCm = Math.max(100, data.soil?.layers?.at(-1)?.bottomCm || 100);
  const rootDepth = Math.max(
    0.12,
    Math.min(1, (month.rootDepthM || 0.5) * 100 / maxCm),
  ) * currentBlock.depth;
  const step = Math.max(0.45, Math.min(1.2, currentBlock.depth / 6));
  const positions = [];
  const lines = [];
  let rootIndex = 0;

  for (let y = bounds.minY + step / 2; y <= bounds.maxY; y += step) {
    if (!pointInPolygon(cutX, y, data.field.outlineM)) continue;
    const z = -y;
    const top = heightAt(cutX, z) + 0.02;
    const len = rootDepth * (0.75 + deterministic(rootIndex, 11) * 0.35);
    const sway = (deterministic(rootIndex, 12) - 0.5) * 0.22;
    const points = [];
    for (let j = 0; j <= 4; j++) {
      const f = j / 4;
      points.push([
        cutX + 0.035,
        top - len * f,
        z + Math.sin(f * 2.4 + rootIndex) * sway * f,
      ]);
    }
    lines.push(points);
    for (let j = 1; j < 4; j++) {
      const v = points[j];
      const branch = 0.08 + deterministic(rootIndex * 7 + j, 13) * 0.13;
      lines.push([
        v,
        [v[0] + 0.02, v[1] - branch, v[2] + (j % 2 ? 1 : -1) * (0.05 + branch * 0.4)],
      ]);
    }
    rootIndex++;
  }

  if (lines.length === 0) return;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      positions.push(...line[i - 1], ...line[i]);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xecd5b7, transparent: true, opacity: 0.82 });
  rootsGroup = new THREE.Group();
  rootsGroup.add(new THREE.LineSegments(geom, mat));
  rootsGroup.userData.lines = lines;
  rootsGroup.userData.rootDepth = rootDepth;
  ensureFloatGroup();
  floatGroup.add(rootsGroup);
}

/* --------------------------------------------------- glass frame & edge trees */

function buildGlassFrame(ringM, topMin, bottomY, effectiveMaxX, cutawayFraction) {
  disposeGroup(glassFrameGroup);
  glassFrameGroup = null;
  if (cutawayFraction <= 0.01) return;

  const bounds = currentBlock.bounds || outlineBounds(ringM);
  const width = bounds.width;
  const height = bounds.height;
  const span = Math.max(width, height);
  const depth = topMin - bottomY;
  const midY = (topMin + bottomY) / 2;

  glassFrameGroup = new THREE.Group();

  // Glass slice plane at cut plane
  const gPlane = new THREE.PlaneGeometry(height * 1.05, depth * 1.05);
  gPlane.rotateY(Math.PI / 2);
  const glassMesh = new THREE.Mesh(
    gPlane,
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.16,
      roughness: 0.1,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  glassMesh.position.set(effectiveMaxX, midY, -bounds.cy);
  glassFrameGroup.add(glassMesh);

  const border = new THREE.LineSegments(
    new THREE.EdgesGeometry(gPlane),
    new THREE.LineBasicMaterial({ color: 0x173e30, transparent: true, opacity: 0.65 })
  );
  border.position.copy(glassMesh.position);
  glassFrameGroup.add(border);

  ensureFloatGroup();
  floatGroup.add(glassFrameGroup);
}

function buildEdgeTrees(ringM, heightAt) {
  disposeGroup(edgeTreesGroup);
  edgeTreesGroup = null;
  if (!ringM || ringM.length < 3) return;

  const bounds = outlineBounds(ringM);
  const treePositions = [];
  const targetCount = Math.min(12, Math.max(4, Math.floor(ringM.length * 0.75)));
  const step = Math.max(1, Math.floor(ringM.length / targetCount));

  for (let i = 0; i < ringM.length; i += step) {
    const pt = ringM[i];
    const prev = ringM[(i - 1 + ringM.length) % ringM.length];
    const next = ringM[(i + 1) % ringM.length];
    const dx = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-5) continue;
    // Inset 0.6m inward along normal into polygon
    let nx = -dy / len;
    let ny = dx / len;
    let tx = pt[0] + nx * 0.6;
    let ty = pt[1] + ny * 0.6;
    if (!pointInPolygon(tx, ty, ringM)) {
      nx = -nx;
      ny = -ny;
      tx = pt[0] + nx * 0.6;
      ty = pt[1] + ny * 0.6;
    }
    if (pointInPolygon(tx, ty, ringM)) {
      treePositions.push([tx, ty]);
    }
  }

  if (treePositions.length === 0) return;

  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 0.8, 6);
  trunkGeo.translate(0, 0.4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: 0.9 });
  const crownGeo = new THREE.ConeGeometry(0.45, 1.2, 7);
  crownGeo.translate(0, 1.2, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2e5c38, roughness: 0.8 });

  edgeTreesGroup = new THREE.Group();
  edgeTreesGroup.userData.illustrative = true;

  for (let i = 0; i < treePositions.length; i++) {
    const [x, y] = treePositions[i];
    const z = -y;
    const groundY = heightAt(x, z);
    const treeObj = new THREE.Group();
    treeObj.position.set(x, groundY, z);
    const s = 0.85 + (i % 3) * 0.15;
    treeObj.scale.set(s, s, s);
    treeObj.add(new THREE.Mesh(trunkGeo, trunkMat));
    treeObj.add(new THREE.Mesh(crownGeo, crownMat));
    edgeTreesGroup.add(treeObj);
  }

  ensureFloatGroup();
  floatGroup.add(edgeTreesGroup);
}

/* --------------------------------------------------- surroundings/shadow */

function buildShadowTexture() {
  if (shadowTextureCache.has("shadow")) return shadowTextureCache.get("shadow");
  // Soft contact shadow — darker core, gentle falloff, no hard edge — so the
  // block reads as hovering a short way above the ground.
  const cvs = document.createElement("canvas");
  cvs.width = 256;
  cvs.height = 256;
  const ctx = cvs.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
  grad.addColorStop(0, "rgba(28,40,25,0.44)");
  grad.addColorStop(0.35, "rgba(28,40,25,0.26)");
  grad.addColorStop(0.72, "rgba(28,40,25,0.09)");
  grad.addColorStop(1, "rgba(28,40,25,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(cvs);
  shadowTextureCache.set("shadow", tex);
  return tex;
}

async function buildGroundTexture(data) {
  const key = `${data.field.id}-ground`;
  if (groundTextureCache.has(key)) return groundTextureCache.get(key);
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");

  let img = null;
  for (const name of [`/assets/sentinel-${data.field.id}.jpg`, `/assets/satellite-${data.field.id}.jpg`]) {
    try {
      img = await loadImageElement(name);
      break;
    } catch (err) {
      /* next local image */
    }
  }
  if (img) {
    drawImageCover(ctx, img, 512, 512);
    ctx.fillStyle = "rgba(120,130,100,0.08)";
    ctx.fillRect(0, 0, 512, 512);
  } else {
    const grad = ctx.createLinearGradient(0, 0, 512, 512);
    grad.addColorStop(0, "#aab695");
    grad.addColorStop(0.5, "#96a682");
    grad.addColorStop(1, "#7f916d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
  }

  // Fade the photo to transparency at the edges: a ground plane, not a disc.
  ctx.globalCompositeOperation = "destination-in";
  const mask = ctx.createRadialGradient(256, 256, 90, 256, 256, 250);
  mask.addColorStop(0, "rgba(0,0,0,0.92)");
  mask.addColorStop(0.62, "rgba(0,0,0,0.62)");
  mask.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = mask;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalCompositeOperation = "source-over";

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  groundTextureCache.set(key, tex);
  return tex;
}

async function buildSurroundings(data) {
  disposeGroup(surroundingsGroup);
  surroundingsGroup = null;
  disposeGroup(shadowPlane);
  shadowPlane = null;

  const bounds = currentBlock.bounds || outlineBounds(data.field.outlineM);
  const depth = currentBlock.depth;
  const radius = Math.max(bounds.width, bounds.height);
  const bottomY = currentBlock.bottomY;

  if (showSurroundings) {
    const tex = await buildGroundTexture(data);
    const size = radius * 8;
    const geom = new THREE.PlaneGeometry(size, size, 1, 1);
    geom.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      opacity: 0.9,
    });
    const plane = new THREE.Mesh(geom, mat);
    plane.userData.ground = true;
    plane.position.set(bounds.cx, bottomY - 0.08, -bounds.cy);
    surroundingsGroup = new THREE.Group();
    surroundingsGroup.add(plane);
    scene.add(surroundingsGroup);
  }

  const shadowGap = Math.max(0.5, Math.min(2.2, radius * 0.055));
  const sgeom = new THREE.PlaneGeometry(radius * 2.4, radius * 2.4);
  sgeom.rotateX(-Math.PI / 2);
  const smat = new THREE.MeshBasicMaterial({
    map: buildShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.95,
  });
  shadowPlane = new THREE.Mesh(sgeom, smat);
  shadowPlane.position.set(bounds.cx, bottomY - shadowGap, -bounds.cy);
  scene.add(shadowPlane);

  if (scene) {
    scene.userData.shadow = {
      ring: (currentBlock.ring.length ? currentBlock.ring : outlineBounds(data.field.outlineM) && []),
      y: bottomY - 0.02,
    };
    if (!scene.userData.shadow.ring.length) {
      scene.userData.shadow.ring = data.field.outlineM.map(([x, y]) => [x, -y]);
    }
  }
}

/* -------------------------------------------------- canvas software renderer */

class SoftwareRenderer {
  constructor() {
    this.domElement = document.createElement("canvas");
    this.ctx = this.domElement.getContext("2d");
    this.capabilities = { getMaxAnisotropy: () => 1 };
    this.software = true;
    this.ratio = 1;
    this.last = "";
    this.w = 600;
    this.h = 400;
  }

  setPixelRatio(r) {
    this.ratio = Math.min(1.5, r || 1);
  }

  setSize(w, h) {
    this.w = Math.max(1, w);
    this.h = Math.max(1, h);
    this.domElement.width = Math.round(this.w * this.ratio);
    this.domElement.height = Math.round(this.h * this.ratio);
    this.domElement.style.width = `${this.w}px`;
    this.domElement.style.height = `${this.h}px`;
    this.last = "";
  }

  render(scene, camera) {
    camera.updateMatrixWorld();
    scene.updateMatrixWorld();
    const key =
      camera.matrixWorld.elements.join(",") +
      `${this.w}x${this.h}:` +
      (scene.userData.version || 0) +
      ":" +
      scene.children
        .map((o) => `${o.id}:${o.visible}:${o.geometry?.id || ""}:${o.material?.map?.id || ""}`)
        .join(",");
    if (key === this.last) return;
    this.last = key;

    const ctx = this.ctx;
    const w = this.w;
    const h = this.h;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    const gradient = ctx.createRadialGradient(w * 0.5, h * 0.4, 8, w * 0.5, h * 0.4, Math.max(w, h) * 0.8);
    gradient.addColorStop(0, "#f5f7ef");
    gradient.addColorStop(1, "#d8dfcd");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const project = (x, y, z) => {
      const v = new THREE.Vector3(x, y, z);
      if (floatGroup) floatGroup.localToWorld(v);
      v.applyMatrix4(matrix);
      return { x: (v.x * 0.5 + 0.5) * w, y: (-0.5 * v.y + 0.5) * h, z: v.z };
    };
    const path = (vertices) => {
      ctx.beginPath();
      vertices.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    };

    if (scene.userData.shadow?.ring?.length) {
      const s = scene.userData.shadow;
      ctx.save();
      path(s.ring.map(([x, z]) => project(x, s.y, z)));
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 14;
      ctx.shadowColor = "rgba(38,56,33,0.42)";
      ctx.fillStyle = "rgba(77,98,70,0.22)";
      ctx.fill();
      ctx.restore();
    }

    const faces = [];
    scene.traverse((mesh) => {
      if (!mesh.visible || !(mesh.userData.terrain || mesh.userData.soil || mesh.userData.ground || mesh.userData.water)) return;
      const g = mesh.geometry;
      const p = g?.attributes?.position;
      if (!p) return;
      const vertices = Array.from({ length: p.count }, (_, i) => project(p.getX(i), p.getY(i), p.getZ(i)));
      const count = g.index?.count ?? p.count;
      for (let i = 0; i < count; i += 3) {
        const ids = [0, 1, 2].map((k) => (g.index ? g.index.getX(i + k) : i + k));
        const v = ids.map((idx) => vertices[idx]);
        if (v.some((a) => a.z > 1 || a.z < -1) || v.every((a) => a.x < 0) || v.every((a) => a.x > w) || v.every((a) => a.y < 0) || v.every((a) => a.y > h)) continue;
        faces.push({ ids, v, z: v.reduce((s, a) => s + a.z, 0), mesh });
      }
    });
    faces.sort((a, b) => b.z - a.z);

    for (const face of faces) {
      const { mesh, ids, v } = face;
      const g = mesh.geometry;
      const uv = g.attributes.uv;
      const colour = g.attributes.color;
      const elevation = g.attributes.aElevation;
      const image = mesh.material?.map?.image;
      const [a, b, c] = v;

      if (image && uv) {
        const [[x0, y0], [x1, y1], [x2, y2]] = ids.map((i) => [
          uv.getX(i) * image.width,
          (1 - uv.getY(i)) * image.height,
        ]);
        const den = x0 * (y1 - y2) + x1 * (y2 - y0) + x2 * (y0 - y1);
        if (Math.abs(den) < 1e-9) continue;
        const aa = (a.x * (y1 - y2) + b.x * (y2 - y0) + c.x * (y0 - y1)) / den;
        const bb = (a.y * (y1 - y2) + b.y * (y2 - y0) + c.y * (y0 - y1)) / den;
        const cc = (a.x * (x2 - x1) + b.x * (x0 - x2) + c.x * (x1 - x0)) / den;
        const dd = (a.y * (x2 - x1) + b.y * (x0 - x2) + c.y * (x1 - x0)) / den;
        const ee = (a.x * (x1 * y2 - x2 * y1) + b.x * (x2 * y0 - x0 * y2) + c.x * (x0 * y1 - x1 * y0)) / den;
        const ff = (a.y * (x1 * y2 - x2 * y1) + b.y * (x2 * y0 - x0 * y2) + c.y * (x0 * y1 - x1 * y0)) / den;
        const mx = (a.x + b.x + c.x) / 3;
        const my = (a.y + b.y + c.y) / 3;
        const expanded = v.map((p) => {
          const d = Math.hypot(p.x - mx, p.y - my) || 1;
          return { x: p.x + ((p.x - mx) / d) * 0.6, y: p.y + ((p.y - my) / d) * 0.6 };
        });
        ctx.save();
        path(expanded);
        ctx.clip();
        ctx.transform(aa, bb, cc, dd, ee, ff);
        ctx.drawImage(image, 0, 0);
        ctx.restore();
      } else {
        const col = new THREE.Color(0, 0, 0);
        if (colour) {
          ids.forEach((i) => col.add(new THREE.Color(colour.getX(i), colour.getY(i), colour.getZ(i))));
          col.multiplyScalar(1 / 3);
        } else {
          col.copy(mesh.material?.color || new THREE.Color("#8c9a75"));
        }
        ctx.globalAlpha = mesh.material?.opacity ?? 1;
        ctx.fillStyle = `#${col.getHexString()}`;
        path(v);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (elevation && mesh.userData.contours) {
        const min = Math.min(...ids.map((i) => elevation.getX(i)));
        const max = Math.max(...ids.map((i) => elevation.getX(i)));
        for (let level = Math.ceil(min / 0.25) * 0.25; level < max; level += 0.25) {
          const hits = [];
          for (let j = 0; j < 3; j++) {
            const av = elevation.getX(ids[j]);
            const bv = elevation.getX(ids[(j + 1) % 3]);
            if ((av <= level && bv > level) || (bv <= level && av > level)) {
              const tt = (level - av) / (bv - av);
              const p = v[j];
              const q = v[(j + 1) % 3];
              hits.push([p.x + (q.x - p.x) * tt, p.y + (q.y - p.y) * tt]);
            }
          }
          if (hits.length === 2) {
            ctx.beginPath();
            ctx.moveTo(...hits[0]);
            ctx.lineTo(...hits[1]);
            ctx.strokeStyle = "rgba(34,79,69,0.42)";
            ctx.lineWidth = 0.9;
            ctx.stroke();
          }
        }
      }
    }

    // Roots and boundary are line overlays above the soil.
    scene.traverse((group) => {
      if (!group.visible) return;
      if (group.userData.waterline || group.userData.runoff) {
        const p = group.geometry.attributes.position;
        ctx.strokeStyle = group.userData.runoff ? '#249aff' : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < p.count; i += 2) {
          const a = project(p.getX(i), p.getY(i), p.getZ(i));
          const b = project(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1));
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      if (group.userData.lines) {
        ctx.strokeStyle = "rgba(236,213,183,0.9)";
        ctx.lineWidth = 1.1;
        for (const line of group.userData.lines) {
          ctx.beginPath();
          line.forEach((p, i) => {
            const v = project(p[0], p[1], p[2]);
            i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y);
          });
          ctx.stroke();
        }
      }
      if (group.userData.boundary) {
        ctx.beginPath();
        group.userData.boundary.forEach((p, i) => {
          const v = project(p[0], p[1], p[2]);
          i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y);
        });
        ctx.strokeStyle = "rgba(48,77,43,0.62)";
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.strokeStyle = "#d8f0a6";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (group.userData.plants) {
        const d = group.userData.plants;
        const plants = d.positions
          .map(([x, y, z], i) => ({ a: project(x, y, z), b: project(x, y + d.height * (0.8 + (i % 7) / 22), z), i }))
          .filter((p) => p.a.z > -1 && p.a.z < 1)
          .sort((a, b) => b.a.z - a.a.z);
        for (const p of plants) {
          if (p.a.x < 0 || p.a.x > w || p.a.y < 0 || p.a.y > h) continue;
          const len = Math.max(2, Math.hypot(p.a.y - p.b.y, p.a.x - p.b.x));
          ctx.strokeStyle = p.i % 3 === 0 ? "#335f2c" : d.color;
          ctx.lineWidth = Math.max(0.8, len * 0.1);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(p.a.x, p.a.y);
          ctx.lineTo(p.b.x, p.b.y);
          for (const side of [-1, 1]) {
            ctx.moveTo(p.a.x, p.a.y);
            ctx.quadraticCurveTo(p.b.x + side * len * 0.45, p.b.y + len * 0.35, p.b.x + side * len * 0.4, p.b.y + len * 0.6);
            ctx.moveTo(p.a.x, p.a.y);
            ctx.quadraticCurveTo(p.b.x + side * len * 0.22, p.b.y, p.b.x + side * len * 0.2, p.b.y + len * 0.15);
          }
          ctx.stroke();
          ctx.strokeStyle = "rgba(183,199,110,0.6)";
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(p.a.x, p.a.y);
          ctx.lineTo(p.b.x, p.b.y);
          ctx.stroke();
          if (d.flower) {
            ctx.fillStyle = d.flower;
            ctx.beginPath();
            ctx.ellipse(p.b.x, p.b.y, Math.max(1, len * 0.09), Math.max(1, len * 0.19), -0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    });
  }

  dispose() {
    this.ctx = null;
  }
}

/* --------------------------------------------------- idle float transform */

let floatGroup = null; // idle-float parent for block, plants, roots
let isDragging = false;
// STUDIO5P idle sway: the camera slowly yaws around the field centre while the
// block keeps only a residual vertical float. The camera part is a transient
// offset applied after controls.update() and restored right after the frame
// renders, so it never fights OrbitControls.
let idleHover = false, idleHoverMix = 1, idleHoverLastMs = 0; // mouse over stage → sway eases to 0 so pins sit still
let idleLastInputMs = -1e13; // last user input; sway resumes 6 s after, easing in over 1.5 s
let idleBasePos = null; // camera position saved before the transient sway offset
let idleHasOffset = false;
let idleActiveNow = false;
let idleListenersBound = false;
function ensureFloatGroup() {
  if (!scene) return;
  if (!floatGroup || floatGroup.parent !== scene) {
    if (floatGroup && floatGroup.parent) floatGroup.parent.remove(floatGroup);
    floatGroup = new THREE.Group();
    scene.add(floatGroup);
  }
}

function restoreIdleCamera() {
  if (idleHasOffset && cameraPersp && idleBasePos) {
    cameraPersp.position.copy(idleBasePos);
  }
  idleHasOffset = false;
}

// Any pointer / wheel / key / control interaction parks the sway instantly.
function markIdleInput() {
  idleLastInputMs = performance.now();
  idleActiveNow = false;
  restoreIdleCamera();
  if (floatGroup) floatGroup.position.y = 0;
  sync3DCallouts();
}

function bindIdleListeners() {
  if (idleListenersBound || !containerEl) return;
  idleListenersBound = true;
  containerEl.addEventListener("pointerdown", markIdleInput, { capture: true, passive: true });
  containerEl.addEventListener("wheel", markIdleInput, { capture: true, passive: true });
  window.addEventListener("keydown", markIdleInput);
  containerEl.addEventListener("pointerover", (e) => {
    if (e.pointerType !== "touch" && e.target.closest?.(".studio-stage-canvas-host")) idleHover = true;
  });
  containerEl.addEventListener("pointerout", (e) => {
    const host = e.target.closest?.(".studio-stage-canvas-host");
    if (host && !host.contains(e.relatedTarget)) idleHover = false;
  });
}

function unbindIdleListeners() {
  if (!idleListenersBound) return;
  idleListenersBound = false;
  try {
    containerEl?.removeEventListener("pointerdown", markIdleInput, { capture: true });
    containerEl?.removeEventListener("wheel", markIdleInput, { capture: true });
  } catch (e) {}
  try {
    window.removeEventListener("keydown", markIdleInput);
  } catch (e) {}
}

// Slow horizontal yaw sway of the camera around the field centre (±7°, 14 s
// period) plus a tiny ±1 % dolly breathing; the block itself keeps only a
// residual vertical float (≤25 % of the old bob) so its shadow stays put.
// Pauses instantly on input, stays off under prefers-reduced-motion, while
// dragging, or when the tab is hidden.
function applyIdleFloat(timeS, nowMs = performance.now()) {
  restoreIdleCamera();
  idleActiveNow = false;
  if (!floatGroup) return;
  const hidden = typeof document !== "undefined" && document.hidden;
  if (prefersReducedMotion || hidden || isDragging) {
    floatGroup.position.set(0, 0, 0);
    floatGroup.rotation.set(0, 0, 0);
    return;
  }
  const span = currentBlock.bounds
    ? Math.max(currentBlock.bounds.width, currentBlock.bounds.height)
    : 30;
  const sway = { ...idleCameraSway(timeS, (nowMs - idleLastInputMs) / 1000, { fieldSpanM: span }) };
  const hoverDt = Math.min(0.5, Math.max(0, (nowMs - (idleHoverLastMs || nowMs)) / 1000)); idleHoverLastMs = nowMs;
  idleHoverMix += ((idleHover ? 0 : 1) - idleHoverMix) * (1 - Math.exp(-hoverDt / 0.12)); // ~0.4 s settle, fps-independent
  if (idleHoverMix < 0.002) idleHoverMix = 0;
  sway.yawRad *= idleHoverMix; sway.dolly *= idleHoverMix; sway.dy *= idleHoverMix;
  if (sway.gain <= 0 || idleHoverMix === 0) {
    floatGroup.position.set(0, 0, 0);
    floatGroup.rotation.set(0, 0, 0);
    return;
  }
  idleActiveNow = true;
  floatGroup.position.set(0, sway.dy, 0);
  floatGroup.rotation.set(0, 0, 0);
  if (cameraPersp && controls && activeCamera === cameraPersp && !isTopView
    && (sway.yawRad !== 0 || sway.dolly !== 0)) {
    if (!idleBasePos) idleBasePos = new THREE.Vector3();
    idleBasePos.copy(cameraPersp.position);
    const target = controls.target;
    const offset = cameraPersp.position.clone().sub(target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += sway.yawRad;
    spherical.radius *= 1 + sway.dolly;
    offset.setFromSpherical(spherical);
    cameraPersp.position.copy(target).add(offset);
    cameraPersp.lookAt(target);
    idleHasOffset = true;
  }
}

/* --------------------------------------------------------------- three init */

function createScene() {
  scene = new THREE.Scene();
  scene.background = buildSkyTexture();
  scene.fog = new THREE.Fog(0xe2e8dc, 80, 450);

  cameraPersp = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
  cameraPersp.position.set(0, 25, 35);

  cameraOrtho = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 4000);
  cameraOrtho.position.set(0, 60, 0);
  cameraOrtho.up.set(0, 0, -1);
  cameraOrtho.lookAt(0, 0, 0);

  activeCamera = isTopView ? cameraOrtho : cameraPersp;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x7a8560, 1.75);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4df, 2.1);
  sun.position.set(-28, 48, 24);
  scene.add(sun);
  scene.userData.sun = sun;

  // Soft fill from the opposite quarter keeps the cut faces readable under the
  // single shadow-casting sun.
  const fill = new THREE.DirectionalLight(0xe6efdc, 0.85);
  fill.position.set(30, 20, 26);
  scene.add(fill);

  if (renderer && renderer.shadowMap && !isSoftwareRenderer && !isPhone()) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
  }
}

function setupControls() {
  if (controls) controls.dispose();
  controls = new OrbitControls(activeCamera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.minDistance = 5;
  controls.maxDistance = 180;
  controls.target.set(0, 0, 0);
  controls.addEventListener("change", requestRender);
  controls.addEventListener("start", () => {
    isDragging = true;
    markIdleInput();
    stopIntroAnimation(true);
    if (floatGroup) {
      // Settle the group back to rest while the user is dragging.
      floatGroup.position.set(0, 0, 0);
      floatGroup.rotation.set(0, 0, 0);
    }
    requestRender();
  });
  controls.addEventListener("end", () => {
    isDragging = false;
    startAnimation();
  });
  applyTouchMode();
}

function initThree(host) {
  leaderLayoutCache = null;
  const { width, height } = host.getBoundingClientRect();
  isSoftwareRenderer = !hasWebGL();

  if (!renderer) {
    if (!isSoftwareRenderer) {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.06;
      } catch (err) {
        isSoftwareRenderer = true;
        renderer = null;
      }
    }
    if (!renderer) {
      isSoftwareRenderer = true;
      renderer = new SoftwareRenderer();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    }
    canvas = renderer.domElement;
  }

  if (!scene) createScene();
  renderer.setSize(width, height);
  if (canvas.parentNode !== host) host.appendChild(canvas);
  if (!controls || controls.domElement !== canvas) setupControls();
  scene.userData.software = isSoftwareRenderer;

  if (typeof ResizeObserver !== "undefined") {
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = new ResizeObserver(() => onResize());
    resizeObserver.observe(host);
  }

  updateShadowLight();
  requestRender();
}

function updateShadowLight() {
  const sun = scene?.userData?.sun;
  if (!sun || !currentBlock.bounds) return;
  const b = currentBlock.bounds;
  const radius = Math.max(b.width, b.height, 10);
  sun.position.set(b.cx - radius * 0.7, radius * 1.5 + currentBlock.depth, -b.cy + radius * 0.5);
  sun.target.position.set(b.cx, currentBlock.bottomY, -b.cy);
  if (!sun.target.parent) scene.add(sun.target);
  if (sun.shadow) {
    const s = Math.max(8, radius * 0.9);
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 0.1;
    sun.shadow.camera.far = radius * 5 + currentBlock.depth * 2;
    sun.shadow.camera.updateProjectionMatrix();
  }
}

/* --------------------------------------------------------------- camera fit */

function canvasSize() {
  const rect = canvas?.getBoundingClientRect();
  const dpr = renderer?.getPixelRatio?.() || renderer?.ratio || window.devicePixelRatio || 1;
  return { width: rect?.width || canvas.width / dpr, height: rect?.height || canvas.height / dpr };
}

function hostAspect() {
  const { width, height } = canvasSize();
  return width / Math.max(1, height);
}

function studioFreeRegion() {
  const rect = canvasHostEl.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const overlay = containerEl.querySelector('.studio-overlay-tl')?.getBoundingClientRect();
  const controls = containerEl.querySelector('.studio-stage-controls')?.getBoundingClientRect();
  const overlayBottom = (overlay?.bottom || rect.top) - rect.top;
  const controlsBottom = (controls?.bottom || rect.top) - rect.top;
  if (w < 600) {
    const top = overlayBottom + 16;
    const viewportHeight = window.visualViewport?.height || document.documentElement.clientHeight;
    // PHONEFIT: the leader-label row sits below the block, so reserve the pill
    // height plus its leader gap; the block + label row then centre together
    // in the free area between the top bar and the stage bottom.
    const pinH = Math.max(28, ...[...containerEl.querySelectorAll('.studio-soil-pin')]
      .map((el) => el.getBoundingClientRect().height || 0));
    const labelAllow = pinH + 20;
    const bottom = Math.min(h, viewportHeight) - 16 - labelAllow;
    return { region: { left: 0.03, right: 0.97, top: top / h, bottom: Math.max(top + 80, bottom) / h },
      preferredCentreY: (top + bottom) / (2 * h) };
  }
  if (canvasHostEl.dataset.chrome === 'compact') {
    // Prefer the stage centre, keeping the entire sway clear of the camera pill.
    // In narrow mode, controls are on the right, so only overlayBottom matters for top.
    const top = overlayBottom + 12;
    const right = ((controls?.left || rect.right) - rect.left - 12) / w;
    const hint = canvasHostEl.querySelector('.studio-interaction-hint')?.getBoundingClientRect();
    const bottom = hint?.height ? Math.min(h - 16, hint.top - rect.top - 12) : h - 16;
    return { region: { left: 0.015, right, top: top / h, bottom: bottom / h },
      preferredCentreY: (top + bottom) / (2 * h) };
  }
  const cards = [...canvasHostEl.querySelectorAll('.studio-probe-card, .studio-transect-card, .studio-surface-legend')]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0);
  const bottom = Math.min(h - 16, ...cards.map((r) => r.top - rect.top - 16));
  const top = Math.max(overlayBottom, controlsBottom) + 16;
  return { region: {
    left: 16 / w, right: (w - 16) / w, top: top / h, bottom: Math.max(top + 40, bottom) / h,
  } };
}

function fitPerspective(data, close = false) {
  if (!cameraPersp || !data) return;
  const b = outlineBounds(data.field.outlineM);
  const depth = currentBlock.depth || blockDepthM(b);
  // Reference look: a low, nearly side-on shot of the block with a touch of
  // yaw so the far wall peeks and the floating shadow sits visible below.
  // Close-up still swings in tighter and higher.
  const elevationDeg = close ? 22 : 14;
  const yawDeg = close ? 26 : 10;
  const phone = canvasHostEl.dataset.overlaySize === 'narrow';
  const compact = canvasHostEl.dataset.chrome === 'compact';
  const outlineM = phone && currentCutaway > 0.05
    ? currentBlock.ring.map(([x,z]) => [x,-z]) : data.field.outlineM;
  const margin = close && phone ? 0.14 : isPhone() ? 0.22 : 0.18;
  const fit = fitCameraToBlock({
    outlineM,
    depthM: depth,
    fovDeg: cameraPersp.fov,
    aspect: hostAspect(),
    elevationDeg,
    yawDeg,
    margin: close ? 0.14 : margin,
  });

  // STUDIO5P: the default 3D-field framing fills ~70-75 % of the canvas width
  // on desktop and ~85-90 % on phone. The solver backs off until the whole block
  // fits, so arbitrary drawn boundaries stay fully visible. Close-up/Top unchanged.
  // Shift target down to center the block in the frame below the UI
  // STUDIO5Q: overlay clearance now caps that zoom, including terrain and sway.
  const space = studioFreeRegion();
  if (!phone) {
    const gutter = Math.max(...[...canvasHostEl.querySelectorAll('.studio-soil-pin')].map(el => el.getBoundingClientRect().width)) + 24;
    space.region.right -= gutter / canvasSize().width;
  }
  const canopy = canopyVisualHeight(data.months[currentMonthIdx], Math.max(b.width, b.height));
  // STUDIO5T: on phones the span*0.08 air above the crops (≈2× the soil depth)
  // pushed the visible block low with empty space above it. Fit the phone
  // envelope to the real canopy so the block centres in the free area; the
  // width still binds the zoom at ~88 %.
  // Compact stages target about 70 % visible width, allowing for the full sway envelope.
  const topSlack = compact
    ? Math.max(canopy, Math.max(b.width, b.height) * 0.01)
    : Math.max(canopy, Math.max(b.width, b.height) * 0.08);
  // PHONEFIT: a 0.92 sway envelope gives ~85% visible width at the resting
  // phone camera. Compact (~70%) and desktop (~60%) targets are unchanged.
  const solved = close && !compact ? null : solveFramingMultiplier({
    outlineM, depthM: depth, fovDeg: cameraPersp.fov,
    aspect: hostAspect(), elevationDeg, yawDeg, margin, targetFrac: phone ? 0.92 : compact ? 0.78 : 0.6,
    region: space.region, topM: currentBlock.topMax + topSlack,
    bottomM: currentBlock.bottomY - depth * 0.02, swayDeg: 7, maxMult: 8,
  });
  if (compact) {
    const centreY = Math.max(space.preferredCentreY, space.region.top + solved.heightFrac / 2);
    solved.viewOffsetY += (space.region.top + space.region.bottom) / 2 - centreY;
  }
  const distance = fit.distance * (solved ? solved.multiplier : 0.72);
  const el = (elevationDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const target = [fit.target[0], -depth * 0.45, fit.target[2]];
  cameraPersp.position.set(
    target[0] + Math.cos(el) * Math.sin(yaw) * distance,
    target[1] + Math.sin(el) * distance,
    target[2] + Math.cos(el) * Math.cos(yaw) * distance,
  );
  cameraPersp.near = Math.max(0.05, distance * 0.02);
  cameraPersp.far = Math.max(200, distance * 8);
  if (solved && canvasHostEl) {
    const { width: w, height: h } = canvasSize();
    cameraPersp.setViewOffset(w, h, solved.viewOffsetX * w, solved.viewOffsetY * h, w, h);
  } else if (close && !isPhone() && canvasHostEl) {
    const { width: w, height: h } = canvasSize();
    cameraPersp.setViewOffset(w, h, (0.5 - 0.66) * w, (0.5 - 0.56) * h, w, h);
  } else {
    cameraPersp.clearViewOffset();
  }
  cameraPersp.updateProjectionMatrix();

  controls.target.set(target[0], target[1], target[2]);
  controls.minDistance = close ? Math.max(2, fit.distance * 0.18) : Math.max(3, fit.distance * 0.4);
  controls.maxDistance = Math.max(fit.distance * 2.8, distance * 1.5);
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.update();
  applyTouchMode();

  return {
    target,
    distance,
    elevationDeg,
    yawDeg,
  };
}

function fitOrtho(data) {
  if (!cameraOrtho || !data) return;
  const fit = fitTopView({
    outlineM: data.field.outlineM,
    aspect: hostAspect(),
    margin: isPhone() ? 0.16 : 0.13,
    altitude: 60,
  });
  cameraOrtho.left = -fit.halfWidth;
  cameraOrtho.right = fit.halfWidth;
  cameraOrtho.top = fit.halfHeight;
  cameraOrtho.bottom = -fit.halfHeight;
  cameraOrtho.position.set(fit.target[0], fit.y, fit.target[2]);
  cameraOrtho.up.set(0, 0, -1);
  cameraOrtho.lookAt(fit.target[0], 0, fit.target[2]);
  cameraOrtho.zoom = 1;
  if (canvasHostEl.dataset.chrome === 'compact') {
    const { region } = studioFreeRegion();
    const b = outlineBounds(data.field.outlineM);
    const halfWidth = Math.max(b.width / 0.7, b.height * hostAspect() / (region.bottom - region.top)) / 2;
    const halfHeight = halfWidth / hostAspect();
    const centreY = ((region.top + region.bottom) / 2 - 0.5) * 2 * halfHeight;
    const centreX = (0.5 - (region.left + region.right) / 2) * 2 * halfWidth;
    cameraOrtho.left = -halfWidth + centreX;
    cameraOrtho.right = halfWidth + centreX;
    cameraOrtho.top = halfHeight + centreY;
    cameraOrtho.bottom = -halfHeight + centreY;
  }
  cameraOrtho.near = 0.1;
  cameraOrtho.far = 600;
  cameraOrtho.updateProjectionMatrix();

  controls.target.set(fit.target[0], 0, fit.target[2]);
  controls.minZoom = 0.55;
  controls.maxZoom = 8;
  controls.enableRotate = false;
  controls.update();
  applyTouchMode();
}

function fitCameras(data) {
  if (!data) return;
  if (isTopView) fitOrtho(data);
  else {
    fillPerspectiveAspect();
    const fit = fitPerspective(data, isCloseView);
    if (introAnim && fit) {
      introAnim.finalDistance = fit.distance;
      introAnim.finalTarget = fit.target;
    }
  }
}

function fillPerspectiveAspect() {
  if (!cameraPersp) return;
  cameraPersp.aspect = hostAspect();
  cameraPersp.updateProjectionMatrix();
}

function onResize() {
  if (!renderer || !canvasHostEl) return;
  const pageTop = canvasHostEl.getBoundingClientRect().top + window.scrollY;
  canvasHostEl.style.setProperty('--stage-top', `${Math.max(0, Math.min(pageTop, window.innerHeight * 0.5))}px`);
  updateOverlayLayout();
  applyTouchMode();
  const rect = canvasHostEl.getBoundingClientRect();
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareRenderer ? 1.5 : 2));
  renderer.setSize(w, h);
  leaderLayoutCache = null;
  if (cameraPersp) {
    cameraPersp.aspect = w / h;
    cameraPersp.updateProjectionMatrix();
  }
  if (currentData) fitCameras(currentData);
  if (scene?.userData?.sun) updateShadowLight();
  requestRender();
}

/* --------------------------------------------------------- render on demand */

let renderRequested = false;
function requestRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      if (renderer && scene && activeCamera && isVisible) {
        controls?.update();
        renderer.render(scene, activeCamera);
        updateCompass();
        sync3DCallouts();
      }
    });
  }
}


/* -------------------------------------------------- STUDIO5A UI overlays */

function placeCallout(x, y, z, id, show, checkFacingNormal = false) {
  const el = containerEl?.querySelector(`#${id}`);
  if (!el || !activeCamera || !canvasHostEl) return;
  if (!show) {
    el.style.display = 'none';
    return;
  }

  // If wall callout, hide when active camera is behind the cut wall (wall faces East +X)
  if (checkFacingNormal && activeCamera.position.x < x) {
    el.style.display = 'none';
    return;
  }

  const v = new THREE.Vector3(x, y, z);
  if (floatGroup) floatGroup.localToWorld(v);
  v.project(activeCamera);
  if (v.z > 1 || v.z < -1) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'block';
  el.style.left = `${Math.max(22, Math.min(canvasHostEl.clientWidth - 22, (v.x * 0.5 + 0.5) * canvasHostEl.clientWidth))}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * canvasHostEl.clientHeight}px`;
  if (id.startsWith('callout-')) {
    const label = el.querySelector('.callout-box').getBoundingClientRect();
    const stage = canvasHostEl.getBoundingClientRect();
    const earlierLabels = ['#callout-low-corner', '#callout-drain', '#callout-outlet'];
    const blockers = ['.studio-overlay-tl', '.studio-stage-controls', '.studio-compass',
      '.studio-interaction-hint', '.studio-touch-hint', ...earlierLabels.slice(0, earlierLabels.indexOf(`#${id}`))];
    const blocked = [...canvasHostEl.querySelectorAll(blockers.join(','))]
      .some((control) => {
        const rect = control.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && label.left < rect.right + 8 && label.right > rect.left - 8
          && label.top < rect.bottom + 8 && label.bottom > rect.top - 8;
      });
    if (blocked || label.left < stage.left + 8 || label.right > stage.right - 8
      || label.top < stage.top + 8 || label.bottom > stage.bottom - 8) el.style.display = 'none';
  }
}

function findFrontFacingWallFace(ringM, camPos, cutawayFraction, effectiveMaxX) {
  if (!ringM || ringM.length < 2) return null;

  // A sliced wall only exposes annotations from the cut side.
  if (cutawayFraction > 0.05 && camPos.x <= effectiveMaxX) return null;

  // Find exterior wall edge whose outward normal best faces camera
  const isCW = ringSignedArea(ringM) < 0;
  let bestEdge = null;
  let bestDot = -Infinity;

  for (let i = 0; i < ringM.length; i++) {
    const a = ringM[i];
    const b = ringM[(i + 1) % ringM.length];
    if (cutawayFraction > 0.05 && (Math.abs(a[0]-effectiveMaxX) > 1e-6 || Math.abs(b[0]-effectiveMaxX) > 1e-6)) continue;
    const p0 = { x: a[0], z: -a[1] };
    const p1 = { x: b[0], z: -b[1] };
    const dx = p1.x - p0.x;
    const dz = p1.z - p0.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) continue;

    // Outward normal in world (x, z)
    let nx = isCW ? dz / len : -dz / len;
    let nz = isCW ? -dx / len : dx / len;

    const midX = (p0.x + p1.x) / 2;
    const midZ = (p0.z + p1.z) / 2;
    const toCamX = camPos.x - midX;
    const toCamZ = camPos.z - midZ;
    const toCamLen = Math.hypot(toCamX, toCamZ) || 1;
    const dot = (nx * toCamX + nz * toCamZ) / toCamLen;

    if (dot > bestDot) {
      bestDot = dot;
      bestEdge = {
        edgeIndex: i,
        isCutFace: cutawayFraction > 0.05,
        x0: p0.x,
        z0: p0.z,
        x1: p1.x,
        z1: p1.z,
        midX,
        midZ,
        normalX: nx,
        normalZ: nz,
      };
    }
  }

  return bestDot > 0 ? bestEdge : null;
}

function sync3DCallouts() {
  if (!currentData || !currentBlock.bounds || !containerEl || !activeCamera || !canvasHostEl) return;
  const canvasRect = canvasHostEl.getBoundingClientRect();
  const overlayRect = containerEl.querySelector('.studio-overlay-tl')?.getBoundingClientRect();
  const depthTicks = containerEl.querySelector('.studio-depth-ticks');
  if (overlayRect) {
    canvasHostEl.style.setProperty('--studio-overlay-bottom', `${overlayRect.bottom - canvasRect.top + 16}px`);
  }
  if (depthTicks && overlayRect) {
    depthTicks.style.top = `${overlayRect.bottom - canvasRect.top + 8}px`;
  }
  const b = currentBlock.bounds;
  const cutFraction = currentCutaway;
  const sliceU = 1 - cutFraction;
  const sx = b.minX + sliceU * b.width;
  const isWater = currentSurfaceMode === "water" || currentSurfaceMode === "ponding";
  const isSoil = true; // Show callouts in default 3D view too, as per STUDIO5L

  const heightAt = makeHeightAt(currentData);

  // Transect Nodes A and A'
  for (const [i, id] of ["node-a", "node-ap"].entries()) {
    const p = currentBlock.transect[i];
    placeCallout(p?.[0] ?? 0, p ? heightAt(p[0], -p[1]) + 0.025 : 0, p ? -p[1] : 0, id, !!p);
  }

  // Hydrology callouts
  const lcx = b.minX + 0.62 * b.width;
  const lcz = -(b.minY + 0.73 * b.height);
  placeCallout(lcx, heightAt(lcx, lcz) + 0.35, lcz, 'callout-low-corner', isWater && sliceU >= 0.62);

  const drx = b.minX + 0.75 * b.width;
  const drz = -(b.minY + 0.73 * b.height);
  placeCallout(drx, heightAt(drx, drz) + 0.45, drz, 'callout-drain', isWater && proposedDrain && sliceU >= 0.75);

  const otx = b.minX + 0.88 * b.width;
  const otz = -(b.minY + 0.73 * b.height);
  placeCallout(otx, heightAt(otx, otz) + 0.55, otz, 'callout-outlet', isWater && sliceU >= 0.88);

  // Soil stratigraphic callouts pinned to the front-facing cut wall
  const ringM = (currentBlock.ring || []).map(([x, negZ]) => [x, -negZ]);
  const camPos = activeCamera.position;
  const wallFace = findFrontFacingWallFace(ringM, camPos, cutFraction, currentBlock.effectiveMaxX ?? sx);

  const topsoilEl = containerEl.querySelector('#callout-topsoil');
  const rootzoneEl = containerEl.querySelector('#callout-rootzone');
  const aquiferEl = containerEl.querySelector('#callout-aquifer');
  const svgLeaders = containerEl.querySelector('#svg-callout-leaders');

  const wallMesh = blockGroup?.children.find(mesh => mesh.userData.anchorTops);
  if (!isSoil || !wallFace || !wallMesh) {
    if (topsoilEl) topsoilEl.style.visibility = 'hidden';
    if (rootzoneEl) rootzoneEl.style.visibility = 'hidden';
    if (aquiferEl) aquiferEl.style.visibility = 'hidden';
    if (svgLeaders) svgLeaders.innerHTML = '';
    leaderLayoutCache = null;
    return;
  }

  // Match the visible texture bands (0–24%, 24–58%, 84–100%) at the local wall height.
  const x = (wallFace.x0 + wallFace.x1) / 2;
  const z = (wallFace.z0 + wallFace.z1) / 2;
  const wallTop = wallMesh.userData.anchorTops[wallFace.edgeIndex];
  const projectToScreen = (v) => {
    if (floatGroup) floatGroup.localToWorld(v);
    v.project(activeCamera);
    const { width, height } = canvasSize();
    return { x:(v.x * 0.5 + 0.5) * width, y:(0.5 - v.y * 0.5) * height,
      visible:v.z >= -1 && v.z <= 1 };
  };
  const elements = [topsoilEl, rootzoneEl, aquiferEl];
  const anchors = [0.12, 0.41, 0.92].map((fraction,i) => ({
    id:elements[i].dataset.band,
    ...projectToScreen(new THREE.Vector3(x, wallTop - fraction * (wallTop-currentBlock.bottomY), z)),
  }));
  if (isTopView || anchors.some(a => !a.visible)) {
    elements.forEach(el => { el.style.visibility = 'hidden'; });
    svgLeaders.replaceChildren();
    leaderLayoutCache = null;
    return;
  }
  const projected = currentBlock.ring.flatMap(([x,z]) => [currentBlock.topMax, currentBlock.bottomY]
    .map(y => projectToScreen(new THREE.Vector3(x,y,z))));
  const block = { left:Math.min(...projected.map(p => p.x)), right:Math.max(...projected.map(p => p.x)),
    top:Math.min(...projected.map(p => p.y)), bottom:Math.max(...projected.map(p => p.y)) };
  const { width, height } = canvasSize();
  const obstacles = [...canvasHostEl.querySelectorAll('.studio-overlay-tl, .studio-stage-controls, .studio-compass, .studio-interaction-hint, .studio-touch-hint, .studio-probe-card, .studio-transect-card, .studio-surface-legend')]
    .filter(el => !el.closest('dialog') && getComputedStyle(el).visibility !== 'hidden')
    .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height)
    .map(r => ({left:r.left-canvasRect.left-6, right:r.right-canvasRect.left+6,
      top:r.top-canvasRect.top-6, bottom:r.bottom-canvasRect.top+6}));
  const sizes = elements.map(el => {
    const r = el.querySelector('.studio-soil-pin').getBoundingClientRect();
    return {width:r.width, height:r.height};
  });
  const key = JSON.stringify([width,height,sizes,obstacles]);
  const moved = !leaderLayoutCache || key !== leaderLayoutCache.key
    || anchors.some((a,i) => Math.hypot(a.x-leaderLayoutCache.anchors[i].x,a.y-leaderLayoutCache.anchors[i].y) > 0.5);
  if (moved) {
    const labels = layoutLeaderLabels(anchors, sizes, {left:8,top:8,right:width-8,bottom:height-8,block}, obstacles);
    elements.forEach(el => { el.style.visibility = 'hidden'; });
    const lines = [];
    labels.forEach((p,i) => {
      const el = elements[i], a = anchors[i], pin = el.querySelector('.studio-soil-pin');
      el.style.visibility = 'visible';
      el.style.left = `${a.x}px`;
      el.style.top = `${a.y}px`;
      pin.style.left = `${p.x-a.x}px`;
      pin.style.top = `${p.y-a.y}px`;
      lines.push(`<polyline class="callout-leader-line" points="${p.points.map(p => p.join(',')).join(' ')}"/>`);
    });
    svgLeaders.innerHTML = lines.join('');
    leaderLayoutCache = {key,anchors};
  }
  positionSoilPopover();
}

function renderTransectSVG() {
  const svg = containerEl?.querySelector('#svg-transect');
  if (!svg || !currentData || !currentBlock.bounds) return;
  const b = currentBlock.bounds;
  const heightAt = makeHeightAt(currentData);
  let lastFiniteH = 0;

  const [a, end] = currentBlock.transect;
  if (!a || !end) { svg.innerHTML = ""; return; }
  const profile = sampleTransectProfile({
    u0: (a[0] - b.minX) / b.width,
    v0: (a[1] - b.minY) / b.height,
    u1: (end[0] - b.minX) / b.width,
    v1: (end[1] - b.minY) / b.height,
    steps: 36,
    sampleElevationFn: (u, v) => {
      const x = b.minX + u * b.width;
      const z = -(b.minY + v * b.height);
      const h = heightAt(x, z); return Number.isFinite(h) ? (lastFiniteH = h) : lastFiniteH; // off-grid samples are NaN
    },
    rainMm: rainScenarioMm,
    proposedDrain,
    outletBlocked,
    width: 290,
    height: 64,
  });

  if (!Number.isFinite(profile.minE) || !Number.isFinite(profile.reliefM)) { svg.innerHTML = ""; return; }
  const W = 290, H = 64, px = 12;
  const waterE = profile.minE + 0.12 + (rainScenarioMm / 240) * (proposedDrain && !outletBlocked ? 0.35 : 0.85);
  const wY = Math.max(10, profile.Y(waterE));

  svg.innerHTML = `
    ${rainScenarioMm > 5 ? `<rect x="${px + 120}" y="${wY.toFixed(1)}" width="${W - px * 2 - 120}" height="${Math.max(0, H - 5 - wY).toFixed(1)}" fill="#38bdf8" opacity="0.55"/>` : ''}
    <path d="${profile.areaD}" fill="#b59d7e" opacity="0.55"/>
    <path d="${profile.lineD}" fill="none" stroke="#173e30" stroke-width="2.2"/>
    <circle cx="${profile.X(0).toFixed(1)}" cy="${profile.Y(profile.pts[0].elev).toFixed(1)}" r="3.5" fill="#173e30"/>
    <circle cx="${profile.X(1).toFixed(1)}" cy="${profile.Y(profile.pts[profile.pts.length - 1].elev).toFixed(1)}" r="3.5" fill="#173e30"/>
  `;

  const reliefLbl = containerEl?.querySelector('#transect-relief-lbl');
  if (reliefLbl) {
    reliefLbl.textContent = `${t("Relief", "ঢাল")}: ${profile.reliefM.toFixed(1)} m · ${t("Exag", "স্কেল")} ${heightExaggeration.toFixed(1)}×`;
  }
}

function dropProbePin(worldX, groundY, worldZ) {
  if (!scene) return;
  if (!probePinMesh) {
    const pinGroup = new THREE.Group();
    // Head sphere
    const headGeo = new THREE.SphereGeometry(0.28, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.3,
      metalness: 0.2,
      emissive: 0xd97706,
      emissiveIntensity: 0.3,
    });
    const headMesh = new THREE.Mesh(headGeo, headMat);
    headMesh.position.y = 1.0;
    pinGroup.add(headMesh);

    // Stem / Needle cone
    const stemGeo = new THREE.ConeGeometry(0.08, 1.0, 12);
    stemGeo.translate(0, 0.5, 0);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0xfffdf5,
      roughness: 0.2,
      metalness: 0.8,
    });
    const stemMesh = new THREE.Mesh(stemGeo, stemMat);
    pinGroup.add(stemMesh);

    probePinMesh = pinGroup;
    ensureFloatGroup();
    floatGroup.add(probePinMesh);
  }

  probePinMesh.position.set(worldX, groundY, worldZ);
  probePinMesh.visible = true;
}

function updateProbeCard() {
  if (!currentData || !containerEl) return;
  const b = currentBlock.bounds || outlineBounds(currentData.field.outlineM);
  const heightAt = makeHeightAt(currentData);

  const probe = lookupProbePoint({
    u: probeUV.u,
    v: probeUV.v,
    field: currentData.field,
    sampleElevationFn: (u, v) => {
      const x = b.minX + u * b.width;
      const z = -(b.minY + v * b.height);
      return heightAt(x, z);
    },
    ndviObservation: nearestForMonth(currentData.vegetation || [], currentMonthIdx)?.observation,
    moistureObservation: nearestForMonth(currentData.moisture || [], currentMonthIdx)?.observation,
    groundClass: currentData.ground,
    rainMm: rainScenarioMm,
    proposedDrain,
    outletBlocked,
    s1WaterMask: null,
  });

  const latlonEl = containerEl.querySelector('#probe-latlon');
  if (latlonEl) latlonEl.textContent = `${probe.lat.toFixed(4)}°N, ${probe.lon.toFixed(4)}°E`;

  const elevEl = containerEl.querySelector('#probe-elev');
  if (elevEl) elevEl.textContent = `${num(probe.elevationM, 2)} m`;

  const pondEl = containerEl.querySelector('#probe-pond');
  if (pondEl) {
    pondEl.textContent = `${num(probe.pondingCm, 0)} cm`;
    pondEl.title = probe.pondSource;
  }

  const ndviEl = containerEl.querySelector('#probe-ndvi');
  if (ndviEl) ndviEl.textContent = probe.ndvi !== null && probe.ndvi !== undefined ? num(probe.ndvi, 2) : "—";

  // Dispatch custom event for STUDIO5B
  try {
    const event = new CustomEvent('studio:probe', {
      detail: probe,
      bubbles: true,
    });
    containerEl.dispatchEvent(event);
  } catch (e) {}
}

/* --------------------------------------------------- STUDIO5M intro animation */

function triggerIntroAnimation(force = false) {
  if (!force && shouldSkipIntro({ prefersReducedMotion, isHidden: document.hidden || !isVisible })) return;
  if (!force) {
    try {
      const key = `ropon_studio_intro_${currentViewMode}`;
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch (e) {}
  }

  if (isTopView || !currentData) return;

  const b = outlineBounds(currentData.field.outlineM);
  const depth = currentBlock.depth || blockDepthM(b);
  const elevationDeg = isCloseView ? 22 : 14;
  const yawDeg = isCloseView ? 26 : 10;
  const fit = fitPerspective(currentData, isCloseView);
  if (!fit) return;

  introAnim = {
    startTime: performance.now(),
    duration: 3500, // 3.5s total
    finalDistance: fit.distance,
    finalTarget: fit.target,
    finalElevationDeg: fit.elevationDeg,
    finalYawDeg: fit.yawDeg,
    depth,
  };

  // Immediate start state: land low, crops 0, callouts hidden
  if (blockGroup) {
    blockGroup.position.y = -depth;
  }
  if (plantsGroup) {
    const mesh = plantsGroup.children.find((c) => c.isInstancedMesh);
    if (mesh && mesh.userData.baseMatrices) {
      const arr = mesh.instanceMatrix.array;
      for (let i = 0; i < arr.length; i += 16) {
        for (let c = 0; c < 12; c++) arr[i + c] = 0;
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Callouts & SVG leaders hidden initially
  const topsoilEl = containerEl?.querySelector("#callout-topsoil");
  const rootzoneEl = containerEl?.querySelector("#callout-rootzone");
  const aquiferEl = containerEl?.querySelector("#callout-aquifer");
  const svgLeaders = containerEl?.querySelector("#svg-callout-leaders");
  const nodeA = containerEl?.querySelector("#node-a");
  const nodeAp = containerEl?.querySelector("#node-ap");

  if (topsoilEl) topsoilEl.style.opacity = "0";
  if (rootzoneEl) rootzoneEl.style.opacity = "0";
  if (aquiferEl) aquiferEl.style.opacity = "0";
  if (svgLeaders) svgLeaders.style.opacity = "0";
  if (nodeA) nodeA.style.opacity = "0";
  if (nodeAp) nodeAp.style.opacity = "0";

  updateIntroFrame(0);
}

function stopIntroAnimation(snapToEnd = true) {
  if (!introAnim) return;
  const anim = introAnim;
  introAnim = null;

  if (snapToEnd) {
    if (blockGroup) {
      blockGroup.position.y = 0;
    }
    if (waterMesh) {
      waterMesh.position.y = 0;
    }
    if (plantsGroup) {
      const mesh = plantsGroup.children.find((c) => c.isInstancedMesh);
      if (mesh && mesh.userData.baseMatrices) {
        mesh.instanceMatrix.array.set(mesh.userData.baseMatrices);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    const topsoilEl = containerEl?.querySelector("#callout-topsoil");
    const rootzoneEl = containerEl?.querySelector("#callout-rootzone");
    const aquiferEl = containerEl?.querySelector("#callout-aquifer");
    const svgLeaders = containerEl?.querySelector("#svg-callout-leaders");
    const nodeA = containerEl?.querySelector("#node-a");
    const nodeAp = containerEl?.querySelector("#node-ap");

    if (topsoilEl) { topsoilEl.style.opacity = "1"; topsoilEl.style.transform = ""; }
    if (rootzoneEl) { rootzoneEl.style.opacity = "1"; rootzoneEl.style.transform = ""; }
    if (aquiferEl) { aquiferEl.style.opacity = "1"; aquiferEl.style.transform = ""; }
    if (svgLeaders) { svgLeaders.style.opacity = "1"; }
    if (nodeA) { nodeA.style.opacity = "1"; nodeA.style.transform = ""; }
    if (nodeAp) { nodeAp.style.opacity = "1"; nodeAp.style.transform = ""; }

    const finalParams = introCameraParams({
      progress: 1.0,
      finalDistance: anim.finalDistance,
      finalTarget: anim.finalTarget,
      finalElevationDeg: anim.finalElevationDeg,
      finalYawDeg: anim.finalYawDeg,
    });
    if (cameraPersp && controls) {
      cameraPersp.position.set(finalParams.position[0], finalParams.position[1], finalParams.position[2]);
      controls.target.set(finalParams.target[0], finalParams.target[1], finalParams.target[2]);
      controls.update();
    }
    sync3DCallouts();
    requestRender();
  }
}

function updateIntroFrame(elapsedMs) {
  if (!introAnim) return;
  const tSec = elapsedMs / 1000;
  const progress = Math.min(1, elapsedMs / introAnim.duration);

  // 1. Camera params: swing 70-90° (default 80°) while descending
  const cam = introCameraParams({
    progress,
    finalDistance: introAnim.finalDistance,
    finalTarget: introAnim.finalTarget,
    finalElevationDeg: introAnim.finalElevationDeg,
    finalYawDeg: introAnim.finalYawDeg,
  });
  if (cameraPersp && controls) {
    cameraPersp.position.set(cam.position[0], cam.position[1], cam.position[2]);
    controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
    controls.update();
  }

  // 2. Land rises in: translate-y from below over the first 1 s
  if (blockGroup) {
    const landP = Math.min(1, tSec / 1.0);
    const landEase = easeOutCubic(landP);
    blockGroup.position.y = -introAnim.depth * (1 - landEase);
  }

  // 3. Crops grow up (instance scale 0->1, staggered by row) during 0.6-2.2 s
  if (plantsGroup) {
    const mesh = plantsGroup.children.find((c) => c.isInstancedMesh);
    if (mesh && mesh.userData.baseMatrices && mesh.userData.rowProgress) {
      const base = mesh.userData.baseMatrices;
      const rows = mesh.userData.rowProgress;
      const arr = mesh.instanceMatrix.array;
      const count = rows.length;
      for (let i = 0; i < count; i++) {
        const offset = i * 16;
        const scale = sampleRowCropScale(tSec, rows[i], 0.6, 2.2);
        for (let c = 0; c < 12; c++) {
          arr[offset + c] = base[offset + c] * scale;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // 4. Soil bands/water table reveal top->bottom during 1.0-2.6 s
  if (waterMesh) {
    const waterP = Math.max(0, Math.min(1, (tSec - 1.0) / 1.6));
    waterMesh.position.y = -introAnim.depth * 0.4 * (1 - easeOutCubic(waterP));
  }

  // 5. Soil callouts + leader lines fade/slide in after 2.6 s (2.6-3.2 s)
  const topsoilEl = containerEl?.querySelector("#callout-topsoil");
  const rootzoneEl = containerEl?.querySelector("#callout-rootzone");
  const aquiferEl = containerEl?.querySelector("#callout-aquifer");
  const svgLeaders = containerEl?.querySelector("#svg-callout-leaders");
  const nodeA = containerEl?.querySelector("#node-a");
  const nodeAp = containerEl?.querySelector("#node-ap");

  if (tSec < 2.6) {
    if (topsoilEl) topsoilEl.style.opacity = "0";
    if (rootzoneEl) rootzoneEl.style.opacity = "0";
    if (aquiferEl) aquiferEl.style.opacity = "0";
    if (svgLeaders) svgLeaders.style.opacity = "0";
  } else {
    const calloutP = Math.min(1, (tSec - 2.6) / 0.6);
    const easeCallout = easeOutCubic(calloutP);
    const slideOffset = (1 - easeCallout) * 16;
    if (topsoilEl) {
      topsoilEl.style.opacity = String(easeCallout);
      topsoilEl.style.transform = `translateX(${slideOffset}px)`;
    }
    if (rootzoneEl) {
      rootzoneEl.style.opacity = String(easeCallout);
      rootzoneEl.style.transform = `translateX(${slideOffset}px)`;
    }
    if (aquiferEl) {
      aquiferEl.style.opacity = String(easeCallout);
      aquiferEl.style.transform = `translateX(${slideOffset}px)`;
    }
    if (svgLeaders) {
      svgLeaders.style.opacity = String(easeCallout);
    }
  }

  // A/A' pins pop in last (3.0-3.5 s)
  if (tSec < 3.0) {
    if (nodeA) nodeA.style.opacity = "0";
    if (nodeAp) nodeAp.style.opacity = "0";
  } else {
    const pinP = Math.min(1, (tSec - 3.0) / 0.5);
    const easePin = easeOutCubic(pinP);
    if (nodeA) {
      nodeA.style.opacity = String(easePin);
      nodeA.style.transform = `scale(${0.5 + 0.5 * easePin})`;
    }
    if (nodeAp) {
      nodeAp.style.opacity = String(easePin);
      nodeAp.style.transform = `scale(${0.5 + 0.5 * easePin})`;
    }
  }

  sync3DCallouts();

  if (progress >= 1.0) {
    stopIntroAnimation(true);
    // STUDIO5P: fade the idle sway in over 1.5 s from the exact end framing.
    idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
  }
}

function startAnimation() {
  // Idle float animates the block even when there is no wind sway; wind sway
  // only runs when there are crops and the user has not asked for reduced motion.
  const needsFloat = !isSoftwareRenderer && !prefersReducedMotion;
  const needsWind = needsFloat && !!plantsGroup;
  if (!needsFloat && !needsWind && !introAnim) {
    stopAnimation();
    requestRender();
    return;
  }
  if (animFrameId) return;
  const loop = (time) => {
    animFrameId = requestAnimationFrame(loop);
    if (!renderer || !scene || !activeCamera || !isVisible) return;
    const t = time / 1000;
    if (needsWind) {
      for (const shader of plantShaders) {
        if (shader?.uniforms?.uTime) shader.uniforms.uTime.value = t;
      }
    }

    if (!prefersReducedMotion && blockGroup) blockGroup.traverse((object) => {
      const shader = object.material?.userData?.flowShader;
      if (shader) shader.uniforms.flowTime.value = t;
    });
    if (introAnim) {
      const now = performance.now();
      restoreIdleCamera();
      updateIntroFrame(now - introAnim.startTime);
    }

    // Smooth camera easing towards focused band
    if (cameraEasing && cameraPersp && controls) {
      const now = performance.now();
      const elapsed = now - cameraEasing.startTime;
      const progress = Math.min(1, elapsed / cameraEasing.duration);
      // Smooth cubic ease out: 1 - Math.pow(1 - progress, 3)
      const ease = 1 - Math.pow(1 - progress, 3);
      cameraPersp.position.lerpVectors(cameraEasing.startPos, cameraEasing.endPos, ease);
      controls.target.lerpVectors(cameraEasing.startTarget, cameraEasing.endTarget, ease);
      if (progress >= 1) {
        cameraEasing = null;
      }
    }

    controls?.update();
    // Idle sway is a transient offset on top of the user's camera: applied
    // after controls.update() and restored right after the frame renders.
    if (!introAnim) applyIdleFloat(t);
    else restoreIdleCamera();
    renderer.render(scene, activeCamera);
    updateCompass();
    if (idleActiveNow) sync3DCallouts();
    restoreIdleCamera();
  };
  animFrameId = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

function updateCompass() {
  const compassEl = document.querySelector(".studio-compass");
  if (!compassEl || !activeCamera) return;
  const dir = new THREE.Vector3();
  activeCamera.getWorldDirection(dir);
  const deg = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
  compassEl.style.transform = `rotate(${deg}deg)`;
}

function showFallbackMessage(msg) {
  const host = document.querySelector(".studio-stage-canvas-host");
  if (host) host.innerHTML = `<div class="studio-fallback-msg">${esc(msg)}</div>`;
}

/* ------------------------------------------------------ observation/sparkline */

function renderSparkline(vegetation, activeMonthIdx) {
  if (!vegetation || vegetation.length === 0) {
    return `<div class="note">${t("No optical vegetation observations available", "স্যাটেলাইট পর্যবেক্ষণ পাওয়া যায়নি")}</div>`;
  }
  const sorted = [...vegetation].sort((a, b) => a.date.localeCompare(b.date));
  const w = 290;
  const h = 42;
  const pts = sorted.map((v, i) => {
    const x = 15 + (i / Math.max(1, sorted.length - 1)) * (w - 30);
    const ndvi = v.ndvi !== null && v.ndvi !== undefined ? v.ndvi : 0.5;
    const y = h - 6 - Math.max(0, Math.min(1, ndvi)) * (h - 12);
    return { x, y, ...v };
  });
  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const nearest = nearestForMonth(sorted, activeMonthIdx);
  const nearestIdx = nearest ? nearest.index : 0;
  const dots = pts
    .map(
      (p, i) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === nearestIdx ? 5 : 3}" class="sparkline-dot ${i === nearestIdx ? "active" : ""}" data-spark-idx="${i}"><title>${p.date}: NDVI ${p.ndvi !== null && p.ndvi !== undefined ? num(p.ndvi, 2) : "—"} (${p.source})</title></circle>`,
    )
    .join("");
  return `<div class="sparkline-container">
    <svg class="sparkline-svg" viewBox="0 0 ${w} ${h}">
      <polyline points="${polyline}" class="sparkline-line" />
      ${dots}
    </svg>
    <div class="sparkline-dates"><span>${sorted[0].date}</span><span>${sorted[sorted.length - 1].date}</span></div>
  </div>`;
}

function rotationPickerHtml() {
  const options = Array.isArray(rotationOptions) && rotationOptions.length
    ? rotationOptions
    : currentData?.rotation
      ? [{ ...currentData.rotation, active: true }]
      : [];
  return options
    .map((r, i) => {
      const active = !!r.active;
      const score = r.score == null ? "—" : num(r.score);
      return `<button type="button" class="studio-rotation-option ${active ? "active" : ""}" data-studio-rot-id="${esc(r.id)}" aria-pressed="${active ? "true" : "false"}">
        <span class="studio-rot-rank">${String(i + 1).padStart(2, "0")}</span>
        <span class="studio-rot-label"><strong>${esc(t(r.label, r.bn))}</strong>${active ? `<small class="note">${t("Previewing", "প্রদর্শন চলছে")}</small>` : ""}</span>
        <small class="studio-rot-score">${score}/100</small>
      </button>`;
    })
    .join("");
}

/* ------------------------------------------------------------ HTML template */

export function surfaceLegendHtml(legend) {
  const rows = legend.classes.filter((c) => !c.unknown || c.pct > 0);
  let offset = 0;
  const arcs = rows.filter((c) => c.pct > 0).map((c, i) => {
    const arc = `<circle data-arc="${i}" cx="36" cy="36" r="26" fill="none" stroke="${c.color}" stroke-width="10" pathLength="100" stroke-dasharray="${c.pct} ${100 - c.pct}" stroke-dashoffset="${-offset}" transform="rotate(-90 36 36)"/>`;
    offset += c.pct;
    return arc;
  }).join('');
  const scaleToggle = legend.mode === 'ndvi' ? `
      <div class="studio-scale-toggle" role="group" aria-label="${esc(t('NDVI scale', 'NDVI স্কেল'))}">
        <button type="button" data-relative-toggle="absolute" aria-pressed="${legend.scale === 'absolute'}">${esc(t('Absolute', 'পরম'))}</button>
        <button type="button" data-relative-toggle="relative" aria-pressed="${legend.scale !== 'absolute'}">${esc(t('Within this field', 'এই মাঠের মধ্যে'))}</button>
      </div>` : '';
  const callout = legend.callout === 'soilgrids-coarse' ? `
      <p class="studio-surface-callout">${esc(t('SoilGrids is a 250 m map — too coarse to show differences inside this field. For within-field differences see', 'SoilGrids একটি ২৫০ মি মানচিত্র — এই মাঠের ভেতরের পার্থক্য দেখানোর মতো সূক্ষ্ম নয়। মাঠের ভেতরের পার্থক্যের জন্য দেখুন'))} <button type="button" class="linklike" data-surface-goto="productivity">${esc(t('Productivity zones', 'উৎপাদনশীলতার অঞ্চল'))}</button> ${esc(t('or', 'অথবা'))} <button type="button" class="linklike" data-soil-test>${esc(t('add your soil test', 'আপনার মাটি পরীক্ষা যোগ করুন'))}</button>.</p>` : '';
  return `<summary><span>${t('Colour key', 'রঙের নির্দেশিকা')} · ${esc(legend.title)}</span>${truth(legend.truth, { source: legend.source, date: legend.date })}</summary>
    <div class="studio-surface-legend-body">
      ${legend.headline ? `<p class="studio-surface-headline">${esc(legend.headline)}</p>` : ''}
      ${scaleToggle}
      <div class="studio-surface-shares">
        <svg class="studio-surface-donut" width="72" height="72" viewBox="0 0 72 72" role="img" aria-label="${esc(t('Share of field area', 'জমির ক্ষেত্রফলের অংশ'))}">
          <title>${esc(rows.map((c) => `${c.label}: ${c.pct.toFixed(1)} %`).join('; '))}</title>
          ${arcs}<text x="36" y="40" text-anchor="middle">100%</text>
        </svg>
        <ul>${rows.map((c) => `<li><i style="background:${c.color}" aria-hidden="true"></i><span>${esc(c.label)}</span><b data-pct="${c.pct.toFixed(1)}">${c.pct.toFixed(1)} %</b></li>`).join('')}</ul>
      </div>
      ${callout}
      ${legend.flowRows ? `<ul class="studio-flow-key">${legend.flowRows.map((row) => `<li><i style="background:${row.color}" aria-hidden="true"></i>${esc(row.label)}</li>`).join('')}</ul>` : ''}
      ${legend.remote ? `<p class="studio-surface-observed">${truth('REMOTE_OBSERVED')} ${esc(t('Remote observed (S1)', 'দূরবর্তী পর্যবেক্ষণ (S1)'))} · ${esc(legend.remote)}</p>` : ''}
      <p class="studio-surface-note">${esc(legend.note)}</p>
      <p class="studio-surface-source">${esc(legend.source)} · ${esc(legend.date)}</p>
    </div>`;
}

function updateSurfaceLegend(prevLegend = null) {
  if (!containerEl || !currentSurface) return false;
  const legend = currentSurface.legend;
  const card = containerEl.querySelector('.studio-surface-legend');
  const mini = containerEl.querySelector('.studio-surface-mini');
  if (mini) mini.innerHTML = `<b>${esc(legend.title)}</b>${legend.classes.filter((c) => c.pct > 0).map((c) =>
    `<span><i style="background:${c.color}" aria-hidden="true"></i>${esc(c.label)} ${c.pct.toFixed(1)} %</span>`).join('')}${truth(legend.truth)}<span>${esc(legend.source)} · ${esc(legend.date)}</span>`;
  const myToken = ++legendSwitchToken;
  const animate = !prefersReducedMotion && card && prevLegend && prevLegend !== legend
    && card.querySelector('.studio-surface-shares li');
  if (!animate) {
    const previousHeight = card?.offsetHeight;
    if (card) {
      card.innerHTML = surfaceLegendHtml(legend);
      card.dataset.mode = currentSurface.mode;
      card.dataset.month = currentSurface.context.month.month;
    }
    layoutSurfaceLegend();
    return card?.dataset.size === 'wide' && previousHeight !== card.offsetHeight;
  }
  // Animated handoff, phase 1: old rows fade/slide out, then the swap runs.
  for (const li of card.querySelectorAll('.studio-surface-shares li')) li.classList.add('legend-row-leave');
  card.querySelector('summary span:first-child')?.classList.add('legend-text-leave');
  setTimeout(() => {
    if (myToken !== legendSwitchToken || !card.isConnected || !containerEl || !currentSurface) return;
    swapLegendHtml(card, legend, prevLegend, myToken);
  }, LEGEND_ROW_OUT_MS);
  return false;
}

// Animated handoff, phase 2: swap the markup, ease the body height from the
// old to the new size (no layout jump), stagger the new rows in, and tween
// the donut arcs + percentage counts from the previous shares.
function swapLegendHtml(card, legend, prevLegend, myToken) {
  const body = card.querySelector('.studio-surface-legend-body');
  if (body) {
    // A superseded swap may have left a frozen max-height behind; clear it so
    // the old height measures true.
    body.classList.remove('legend-height-anim');
    body.style.maxHeight = '';
  }
  const oldHeight = body ? body.offsetHeight : 0;
  card.innerHTML = surfaceLegendHtml(legend);
  card.dataset.mode = currentSurface.mode;
  card.dataset.month = currentSurface.context.month.month;
  const newBody = card.querySelector('.studio-surface-legend-body');
  const newHeight = newBody ? newBody.offsetHeight : 0;
  // The summary bar is constant height, so a body change is a card change.
  const heightChanged = oldHeight > 0 && newHeight > 0 && Math.abs(newHeight - oldHeight) > 4;
  if (newBody && heightChanged) {
    newBody.classList.add('legend-height-anim');
    newBody.style.maxHeight = `${oldHeight}px`;
    void newBody.offsetHeight;
    newBody.style.maxHeight = `${newHeight}px`;
    setTimeout(() => {
      if (myToken !== legendSwitchToken) return;
      newBody.classList.remove('legend-height-anim');
      newBody.style.maxHeight = '';
    }, LEGEND_HEIGHT_MS + 60);
  }
  for (const el of card.querySelectorAll('summary span:first-child, .studio-surface-headline, .studio-surface-note, .studio-surface-source, .studio-scale-toggle, .studio-surface-callout, .studio-flow-key, .studio-surface-observed')) {
    el.classList.add('legend-fade-in');
  }
  card.querySelectorAll('.studio-surface-shares li').forEach((li, i) => {
    li.classList.add('legend-row-enter');
    li.style.animationDelay = `${i * LEGEND_ROW_STAGGER_MS}ms`;
  });
  startLegendCountTween(card, prevLegend, legend, myToken);
  layoutSurfaceLegend();
  if (heightChanged && card.dataset.size === 'wide') onResize();
}

// Row lists exactly as surfaceLegendHtml renders them: arcs skip zero-share
// classes, count rows keep them, so each tween stays index-aligned with the DOM.
function legendArcRows(legend) {
  if (!legend) return [];
  return legend.classes.filter((c) => (!c.unknown || c.pct > 0) && c.pct > 0)
    .map((c) => ({ pct: c.pct, color: c.color }));
}

function legendCountRows(legend) {
  if (!legend) return [];
  return legend.classes.filter((c) => !c.unknown || c.pct > 0).map((c) => c.pct);
}

// Tween donut arcs (stroke-dasharray/offset) and row percentages from the
// previous legend's shares to the new ones over 500 ms.
function startLegendCountTween(card, prevLegend, legend, myToken) {
  const svg = card.querySelector('.studio-surface-donut');
  const circles = svg ? [...svg.querySelectorAll('circle[data-arc]')] : [];
  const counts = [...card.querySelectorAll('.studio-surface-shares li b[data-pct]')];
  if (!circles.length && !counts.length) return;
  const fromArcs = legendArcRows(prevLegend);
  const toArcs = legendArcRows(legend);
  const fromCounts = legendCountRows(prevLegend);
  const toCounts = legendCountRows(legend);
  const applyFrame = (raw) => {
    const frames = interpolateDonutArcs(fromArcs, toArcs, raw);
    circles.forEach((circle, i) => {
      const frame = frames[i] || { pct: 0, offset: 0, color: toArcs[i]?.color || '#a5a9a5' };
      circle.setAttribute('stroke-dasharray', `${frame.pct} ${100 - frame.pct}`);
      circle.setAttribute('stroke-dashoffset', `${-frame.offset}`);
      if (circle.getAttribute('stroke') !== frame.color) circle.setAttribute('stroke', frame.color);
    });
    counts.forEach((el, i) => {
      el.textContent = `${tweenValue(fromCounts[i] ?? 0, toCounts[i] ?? 0, raw).toFixed(1)} %`;
    });
  };
  applyFrame(0); // paint the previous shares synchronously: no one-frame flash
  const tween = createTween({
    duration: LEGEND_DONUT_MS,
    ease: easeInOutCubic,
    onUpdate: (_eased, raw) => {
      if (myToken !== legendSwitchToken) {
        tween.cancel();
        return;
      }
      applyFrame(raw);
    },
  });
  tween.start();
}

function layoutSurfaceLegend() {
  if (!containerEl || !canvasHostEl) return;
  const size = studioOverlayBreakpoint(canvasHostEl.clientWidth, canvasHostEl.clientHeight);
  const card = containerEl.querySelector('.studio-surface-legend');
  const bar = containerEl.querySelector('.studio-surface-bar');
  const mini = containerEl.querySelector('.studio-surface-mini');
  if (!card || !bar) return;
  const changed = card.dataset.size !== size;
  card.dataset.size = size;
  const target = size === 'wide' ? canvasHostEl : size === 'medium' ? bar : containerEl.querySelector('.studio-layers-content');
  if (card.parentNode !== target) {
    if (size === 'narrow') containerEl.querySelector('.studio-surface-selector').after(card);
    else target.appendChild(card);
  }
  bar.hidden = size !== 'medium';
  if (mini) mini.hidden = size !== 'narrow';
  if (changed) card.open = size !== 'wide';
  const summary = card.querySelector('summary');
  summary.tabIndex = size === 'wide' ? 0 : -1;
  summary.setAttribute('aria-disabled', String(size !== 'wide'));
  const probe = containerEl.querySelector('#probe-card');
  canvasHostEl.style.setProperty('--studio-probe-height', `${size === 'wide' ? probe?.offsetHeight || 0 : 0}px`);
}

export function studioOverlayBreakpoint(width, height = Infinity) {
  return width >= 900 && height >= 640 ? "wide" : width >= 600 ? "medium" : "narrow";
}

export function clampStudioPopover({ anchorX, anchorY, width, height, bounds }) {
  const w = Math.min(width, Math.max(0, bounds.right - bounds.left));
  const h = Math.min(height, Math.max(0, bounds.bottom - bounds.top));
  const x = anchorX + 30 + w <= bounds.right ? anchorX + 30 : anchorX - w - 30;
  return {
    left: Math.max(bounds.left, Math.min(bounds.right - w, x)),
    top: Math.max(bounds.top, Math.min(bounds.bottom - h, anchorY - h / 2)),
    width: w, height: h,
  };
}

function soilPinLabel(band, detail) {
  const name = band === "topsoil" ? t("Topsoil", "উপরের মাটি")
    : band === "rootzone" ? t("Root zone", "শিকড় অঞ্চল") : t("Subsoil", "নিচের মাটি");
  const value = band === "rootzone" ? detail.value.split(": ").pop().split(" (")[0]
    : band === "aquifer" ? detail.value.split(" (")[0] : detail.value.split(" · ")[0];
  return `${name} · ${value}`;
}

function soilDetailHtml(band, detail) {
  const truthLabel = band === "aquifer" && detail.isButton
    ? t("Unknown — add local reading", "অজানা — স্থানীয় তথ্য দিন") : detail.truthLabel;
  const title = { topsoil: t("Topsoil", "উপরের মাটি"), rootzone: t("Root zone", "শিকড় স্তর"), aquifer: t("Deep soil & water table", "গভীর মাটি ও পানির স্তর") }[band];
  const depth = String(detail.eyebrow || "").split(" · ")[0];
  // Only sources that really are NASA get the badge (root zone = NASA POWER soil moisture).
  const nasa = band === "rootzone" ? t("NASA soil moisture", "নাসার মাটির আর্দ্রতা") : "";
  return `<div class="callout-box ${band}${nasa ? " has-nasa" : ""}" title="${esc(truthLabel)}">
    <div class="callout-head"><span class="callout-title">${esc(title)}</span><span class="callout-depth">${esc(depth)}</span>${nasa ? `<span class="nasa-chip">${esc(nasa)}</span>` : ""}</div>
    <div class="callout-val">${detail.isButton
      ? `<button type="button" class="callout-btn" data-soil-test>${esc(detail.value)}</button>`
      : esc(detail.value)}</div>
    ${detail.isButton ? "" : `<small>${esc(truthLabel)}</small>`}
    ${detail.askReading ? `<button type="button" class="callout-btn" data-soil-test>${esc(t("Add your well reading", "আপনার কূপের মাপ দিন"))}</button>` : ""}
    ${detail.cropValue ? `<div class="callout-val callout-crop">${esc(detail.cropValue)}</div><small>${esc(detail.cropTruthLabel)}</small>` : ""}
  </div>`;
}

function updateSoilDetails(data) {
  for (const band of ["topsoil", "rootzone", "aquifer"]) {
    containerEl.querySelectorAll(`[data-soil-detail="${band}"], [data-soil-row="${band}"]`).forEach((el) => {
      el.innerHTML = soilDetailHtml(band, data[band]);
    });
    const label = containerEl.querySelector(`[data-pin-label="${band}"]`);
    if (label) label.textContent = soilPinLabel(band, data[band]);
  }
  positionSoilPopover();
}

function updateOverlayLayout() {
  if (!canvasHostEl || !containerEl) return;
  const width = canvasHostEl.clientWidth;
  const breakpoint = studioOverlayBreakpoint(width, canvasHostEl.clientHeight);
  const changed = canvasHostEl.dataset.overlaySize !== breakpoint;
  canvasHostEl.dataset.overlaySize = breakpoint;
  canvasHostEl.dataset.chrome = breakpoint === 'wide' ? 'full' : 'compact';
  canvasHostEl.dataset.showCaption = String(breakpoint === 'wide');
  const layers = containerEl.querySelector('.studio-soil-layers');
  const inspection = containerEl.querySelector('.studio-inspection');
  if (changed) {
    const sheet = containerEl.querySelector('#studio-layers-sheet');
    const overlay = containerEl.querySelector('.studio-overlay-tl');
    const caption = overlay.querySelector('.studio-caption-copy');
    if (breakpoint === 'wide' && sheet.open) sheet.dispatchEvent(new Event('cancel', { cancelable: true }));
    // the fallow/harvest notice stays visible on the stage in every layout (owner: golden harvest looked like missing crops)
    for (const selector of ['.studio-surface-selector', '.studio-slice-card', '.studio-crop-chip']) {
      const el = containerEl.querySelector(selector);
      if (breakpoint !== 'wide') sheet.querySelector('.studio-layers-content').appendChild(el);
      else overlay.insertBefore(el, caption);
    }
    const hint = containerEl.querySelector('.studio-interaction-hint');
    (breakpoint === 'wide' ? caption : canvasHostEl).appendChild(hint);
    if (layers) {
      layers.open = breakpoint === 'wide' ? wideLayersOpen : true;
      const summary = layers.querySelector('summary');
      summary.tabIndex = breakpoint === 'wide' ? 0 : -1;
      summary.setAttribute('aria-disabled', String(breakpoint !== 'wide'));
    }
    for (const id of ['probe', 'transect']) {
      const card = containerEl.querySelector(`#${id}-card`);
      if (!card || !inspection) continue;
      (breakpoint === 'wide' ? canvasHostEl : inspection).appendChild(card);
      card.hidden = breakpoint !== 'wide' && containerEl.querySelector(`#tab-${id}`)?.getAttribute('aria-selected') !== 'true';
      if (breakpoint === 'wide') {
        card.removeAttribute('role');
        card.removeAttribute('aria-labelledby');
        card.removeAttribute('tabindex');
      } else {
        card.setAttribute('role', 'tabpanel');
        card.setAttribute('aria-labelledby', `tab-${id}`);
        card.tabIndex = 0;
      }
    }
  }
  const hint = containerEl.querySelector('.studio-interaction-hint');
  if (width < 600 && hint) hint.hidden = true;
  if (width >= 600 && !hintShown && hint) {
    hintShown = true;
    try {
      hint.hidden = sessionStorage.getItem('ropon_studio_overlay_hint') === '1';
      sessionStorage.setItem('ropon_studio_overlay_hint', '1');
    } catch { hint.hidden = false; }
  }
  layoutSurfaceLegend();
}

function highlightSoilBand(band) {
  hoveredBandId = band;
  containerEl.querySelectorAll('.studio-soil-pin, .studio-callout-legend-item').forEach((el) => {
    el.classList.toggle('highlight', (el.dataset.soilPin || el.dataset.band) === band);
  });
  requestRender();
}

function closeSoilPopover(returnFocus = true) {
  clearTimeout(soilCloseTimer);
  if (!openSoilBand) return;
  soilPinned = false;
  suppressSoilHover = true;
  openSoilBand = null;
  containerEl.querySelector('#studio-soil-popover').hidden = true;
  containerEl.querySelectorAll('[data-soil-pin]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
  highlightSoilBand(null);
  if (returnFocus && popoverTrigger?.isConnected) {
    restoringPopoverFocus = true;
    popoverTrigger.focus({ preventScroll: true });
    restoringPopoverFocus = false;
  }
  popoverTrigger = null;
}

function openSoilPopover(band, trigger) {
  clearTimeout(soilCloseTimer);
  suppressSoilHover = false;
  openSoilBand = band;
  popoverTrigger = trigger;
  containerEl.querySelector('#studio-soil-popover').hidden = false;
  containerEl.querySelectorAll('[data-soil-detail]').forEach((el) => { el.hidden = el.dataset.soilDetail !== band; });
  containerEl.querySelectorAll('[data-soil-pin]').forEach((el) => {
    el.setAttribute('aria-expanded', String(el.dataset.soilPin === band));
  });
  highlightSoilBand(band);
  positionSoilPopover();
}

function positionSoilPopover() {
  if (!openSoilBand || !canvasHostEl) return;
  const popover = containerEl.querySelector('#studio-soil-popover');
  const pin = containerEl.querySelector(`#soil-pin-${openSoilBand}`);
  const rect = canvasHostEl.getBoundingClientRect();
  const anchor = pin.getBoundingClientRect();
  // Use the clear region below the controls, including the title and one-time hint.
  const controlsBottom = Math.max(...[...canvasHostEl.querySelectorAll('.studio-overlay-tl, .studio-stage-controls, .studio-compass')]
    .map((el) => el.getBoundingClientRect().bottom - rect.top));
  const bounds = { left: 8, top: controlsBottom + 8, right: rect.width - 8, bottom: rect.height - 8 };
  popover.style.width = `${Math.min(320, bounds.right - bounds.left)}px`;
  popover.style.maxHeight = `${Math.max(0, bounds.bottom - bounds.top)}px`;
  const placed = clampStudioPopover({ anchorX: anchor.left - rect.left + anchor.width / 2,
    anchorY: anchor.top - rect.top + anchor.height / 2, width: popover.offsetWidth, height: popover.offsetHeight, bounds });
  popover.style.left = `${placed.left}px`;
  popover.style.top = `${placed.top}px`;
}

function bindStageOverlays(options) {
  const stage = canvasHostEl;
  const sheet = containerEl.querySelector('#studio-layers-sheet');
  const layersButton = containerEl.querySelector('[data-studio-layers]');
  const fullscreenButton = containerEl.querySelector('[data-studio-ctrl="fullscreen"]');
  let fullscreen = false;
  let previousOverflow = '';
  const pushOverlay = (kind) => history.pushState({ ...history.state, studioOverlay: kind }, '');
  const backFrom = (kind) => {
    if (history.state?.studioOverlay === kind) history.back();
  };
  const closeLayers = (fromHistory = false) => {
    if (!sheet.open) return;
    sheet.close();
    layersButton.setAttribute('aria-expanded', 'false');
    layersButton.focus({ preventScroll: true });
    if (!fromHistory) backFrom('layers');
  };
  const closeFullscreen = (fromHistory = false) => {
    if (!fullscreen) return;
    fullscreen = false;
    isFullscreenStage = false;
    applyTouchMode();
    if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
    if (stage.classList.contains('studio-fullscreen-fallback')) {
      stage.classList.remove('studio-fullscreen-fallback');
      document.documentElement.style.overflow = previousOverflow;
    }
    fullscreenButton.setAttribute('aria-pressed', 'false');
    fullscreenButton.focus({ preventScroll: true });
    onResize();
    if (!fromHistory) backFrom('fullscreen');
  };
  layersButton.addEventListener('click', () => {
    closeSoilPopover(false);
    sheet.showModal();
    layersButton.setAttribute('aria-expanded', 'true');
    pushOverlay('layers');
  }, options);
  sheet.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeLayers();
  }, options);
  sheet.querySelector('[data-close-layers]').addEventListener('click', () => closeLayers(), options);
  sheet.addEventListener('click', (e) => {
    const rect = sheet.getBoundingClientRect();
    if (e.target === sheet && (e.clientY < rect.top || e.clientX < rect.left || e.clientX > rect.right)) closeLayers();
  }, options);
  const handle = sheet.querySelector('.studio-sheet-handle');
  let dragY = null;
  handle.addEventListener('pointerdown', (e) => {
    dragY = e.clientY;
    handle.setPointerCapture(e.pointerId);
  }, options);
  handle.addEventListener('pointerup', (e) => {
    if (dragY !== null && e.clientY - dragY > 48) closeLayers();
    dragY = null;
  }, options);
  handle.addEventListener('pointercancel', () => { dragY = null; }, options);
  fullscreenButton.onclick = async () => {
    if (fullscreen) { closeFullscreen(); return; }
    closeSoilPopover(false);
    fullscreen = true;
    // No page to scroll in fullscreen: restore full one-finger orbit.
    isFullscreenStage = true;
    touchGesture = null;
    applyTouchMode();
    pushOverlay('fullscreen');
    fullscreenButton.setAttribute('aria-pressed', 'true');
    try {
      await stage.requestFullscreen();
      if (!fullscreen || isDisposed) {
        if (document.fullscreenElement === stage) document.exitFullscreen().catch(() => {});
        return;
      }
    } catch {
      if (!fullscreen || isDisposed) return;
      previousOverflow = document.documentElement.style.overflow;
      document.documentElement.style.overflow = 'hidden';
      stage.classList.add('studio-fullscreen-fallback');
      fullscreenButton.focus({ preventScroll: true });
    }
    onResize();
  };
  document.addEventListener('fullscreenchange', () => {
    if (fullscreen && document.fullscreenElement !== stage) closeFullscreen();
    else onResize();
  }, options);
  window.addEventListener('popstate', (e) => {
    if (sheet.open && e.state?.studioOverlay !== 'layers') closeLayers(true);
    if (fullscreen && !['layers', 'fullscreen'].includes(e.state?.studioOverlay)) closeFullscreen(true);
  }, options);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (sheet.open) { e.preventDefault(); closeLayers(); }
      else if (fullscreen) { e.preventDefault(); closeFullscreen(); }
    }
    const modal = sheet.open ? sheet : stage.classList.contains('studio-fullscreen-fallback') ? stage : null;
    if (e.key !== 'Tab' || !modal) return;
    const targets = [...modal.querySelectorAll('button, select, input, [tabindex="0"]')]
      .filter((el) => !el.disabled && el.getClientRects().length);
    const first = targets[0], last = targets[targets.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }, options);
  stageOverlayCleanup = () => {
    closeLayers(true);
    closeFullscreen(true);
    if (history.state?.studioOverlay) {
      const { studioOverlay, ...rest } = history.state;
      history.replaceState(rest, '');
    }
  };
}

function bindOverlayEvents() {
  overlayEvents?.abort();
  overlayEvents = new AbortController();
  const options = { signal: overlayEvents.signal };
  bindStageOverlays(options);
  window.visualViewport?.addEventListener('resize', onResize, options);
  containerEl.addEventListener('focusin', (e) => {
    const pin = e.target.closest('[data-soil-pin]');
    if (pin && !restoringPopoverFocus) openSoilPopover(pin.dataset.soilPin, pin);
    const row = e.target.closest('.studio-callout-legend-item');
    if (row) highlightSoilBand(row.dataset.band);
  }, options);
  containerEl.addEventListener('pointerover', (e) => {
    const pin = e.target.closest('[data-soil-pin]');
    if (e.target.closest('#studio-soil-popover')) clearTimeout(soilCloseTimer);
    if (pin && e.pointerType !== 'touch' && !suppressSoilHover && !(soilPinned && openSoilBand)) openSoilPopover(pin.dataset.soilPin, pin);
    const row = e.target.closest('.studio-callout-legend-item');
    if (row) highlightSoilBand(row.dataset.band);
  }, options);
  document.addEventListener('pointermove', (e) => {
    // Closing a card can expose a pin under the stationary pointer.
    if (!e.target.closest('[data-soil-pin]')) suppressSoilHover = false;
  }, options);
  containerEl.addEventListener('pointerout', (e) => {
    const row = e.target.closest('.studio-callout-legend-item');
    if (row && !row.contains(e.relatedTarget)) highlightSoilBand(openSoilBand);
    const from = e.target.closest('[data-soil-pin], #studio-soil-popover');
    if (from && e.pointerType !== 'touch' && openSoilBand && !soilPinned
        && !e.relatedTarget?.closest?.('[data-soil-pin], #studio-soil-popover')) {
      clearTimeout(soilCloseTimer);
      soilCloseTimer = setTimeout(() => { if (!soilPinned) closeSoilPopover(false); }, 300);
    }
  }, options);
  containerEl.addEventListener('focusout', () => {
    if (!openSoilBand) highlightSoilBand(null);
  }, options);
  document.addEventListener('pointerdown', (e) => {
    if (document.querySelector('#modal-soil-input[open]')) return;
    if (!e.target.closest('#studio-soil-popover, [data-soil-pin]')) closeSoilPopover();
  }, options);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && openSoilBand && !document.querySelector('#modal-soil-input[open]')) {
      e.preventDefault();
      closeSoilPopover();
    }
  }, options);
  containerEl.addEventListener('click', (e) => {
    const pin = e.target.closest('[data-soil-pin]');
    if (pin) { openSoilPopover(pin.dataset.soilPin, pin); soilPinned = true; }
    if (e.target.closest('[data-close-soil]')) closeSoilPopover();
    if (e.target.closest('[data-dismiss-touch-hint]')) {
      containerEl.querySelector('.studio-touch-hint').hidden = true;
    }
    if (e.target.closest('[data-dismiss-hint]')) {
      containerEl.querySelector('.studio-interaction-hint').hidden = true;
      onResize();
    }
    if (e.target.closest('[data-soil-test]')) {
      const dialog = document.querySelector('#modal-soil-input');
      if (dialog && typeof dialog.showModal === 'function') {
        try { dialog.showModal(); } catch { dialog.setAttribute('open', 'true'); }
      } else if (dialog) {
        dialog.classList.remove('hidden');
        dialog.style.display = 'flex';
      }
    }
    const relativeToggle = e.target.closest('[data-relative-toggle]');
    if (relativeToggle) {
      ndviRelativeOverride = relativeToggle.dataset.relativeToggle === 'relative';
      if (currentData) {
        buildFieldBlock(currentData, currentCutaway).then(() => {
          buildPlantsAndRoots(currentData, currentMonthIdx);
          updateProbeCard();
          requestRender();
        });
      }
    }
    const surfaceGoto = e.target.closest('[data-surface-goto]');
    if (surfaceGoto) setSurfaceMode(surfaceGoto.dataset.surfaceGoto);
    const tab = e.target.closest('[data-inspection-tab]');
    if (tab) selectInspectionTab(tab);
  }, options);
  containerEl.querySelector('.studio-inspection-tabs')?.addEventListener('keydown', (e) => {
    const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')];
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const index = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
      : (tabs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    selectInspectionTab(tabs[index]);
    tabs[index].focus();
  }, options);
  containerEl.querySelector('.studio-soil-layers')?.addEventListener('toggle', (e) => {
    if (canvasHostEl.dataset.overlaySize === 'wide') wideLayersOpen = e.target.open;
    else if (!e.target.open) e.target.open = true;
  }, options);
  containerEl.querySelector('.studio-surface-legend')?.addEventListener('toggle', () => {
    if (canvasHostEl.dataset.overlaySize === 'wide') onResize();
    else containerEl.querySelector('.studio-surface-legend').open = true;
  }, options);
}

function selectInspectionTab(tab) {
  containerEl.querySelectorAll('[data-inspection-tab]').forEach((el) => {
    const selected = el === tab;
    el.setAttribute('aria-selected', String(selected));
    el.tabIndex = selected ? 0 : -1;
    containerEl.querySelector(`#${el.dataset.inspectionTab}-card`).hidden = !selected;
  });
}

function fallowOverlayChipHtml(data, monthIdx) {
  if (!data?.months) return "";
  const m = data.months[monthIdx];
  if (!m || (m.stage !== "fallow" && m.stage !== "harvest")) return "";
  const isFallow = m.stage === "fallow";

  let nextCropMonth = null;
  let nextMonthIdx = -1;
  for (let step = 1; step <= 12; step++) {
    const idx = (monthIdx + step) % 12;
    const cand = data.months[idx];
    if (cand && cand.cropId && cand.stage !== "fallow" && (!isFallow ? cand.cropId !== m.cropId : true)) {
      nextCropMonth = cand;
      nextMonthIdx = idx;
      break;
    }
  }
  if (!nextCropMonth) return "";

  const mEn = Number.isInteger(nextMonthIdx) && nextMonthIdx >= 0 && nextMonthIdx < 12 ? MONTHS_EN[nextMonthIdx] : (nextCropMonth.month || "");
  const mBn = Number.isInteger(nextMonthIdx) && nextMonthIdx >= 0 && nextMonthIdx < 12 ? MONTHS_BN[nextMonthIdx] : (nextCropMonth.month || "");
  const cropEn = nextCropMonth.cropName || nextCropMonth.cropId || "Crop";
  const cropBn = nextCropMonth.cropNameBn || nextCropMonth.cropName || nextCropMonth.cropId || "ফসল";

  const prefixEn = isFallow ? "Fallow this month" : "Harvested";
  const prefixBn = isFallow ? "এই মাসে পতিত" : "ফসল কাটা সম্পন্ন";

  const labelText = t(
    `${prefixEn} · Next crop: ${cropEn} (${mEn})`,
    `${prefixBn} · পরবর্তী ফসল: ${cropBn} (${mBn})`,
  );
  const btnText = t("Show next crop", "পরবর্তী ফসল দেখুন");

  return `<div class="studio-fallow-chip" data-next-month="${nextMonthIdx}">
    <span class="studio-fallow-chip-text">${esc(labelText)}</span>
    <button type="button" class="studio-fallow-chip-btn" data-studio-action="goto-month" data-month-target="${nextMonthIdx}">${esc(btnText)}</button>
  </div>`;
}

function depthTicksHtml() {
  const ticks = [0, 15, 30, 60, 100];
  return `<div class="studio-depth-ticks" aria-hidden="true">${ticks
    .map(
      (cm) =>
        `<span class="studio-depth-tick" data-depth-cm="${cm}" style="top:${cm}%"><i></i><b>${cm}</b><small>cm</small></span>`,
    )
    .join("")}</div>`;
}

function monthPillHtml(month) {
  return `<span class="studio-month-full">${esc(t(monthChipText(month, "en"), monthChipText(month, "bn")))}</span><span class="studio-month-short" aria-hidden="true">${esc(t(monthChipText(month, "en", true), monthChipText(month, "bn", true)))}</span>`;
}

export function studio3dHtml(data, activeMonth = 0, opts = {}) {
  currentData = data;
  currentMonthIdx = activeMonth;
  rotationOptions = opts.rotations || null;
  activeRotationId = rotationOptions?.find((r) => r.active)?.id || data.rotation.id;
  onRotationSelect = opts.onRotationSelect || null;

  const m = data.months[currentMonthIdx] || data.months[0];
  const truthTags = data.truth || {};
  const soilSummary = data.soil
    ? `${data.soil.layers.length} ${t("layers", "স্তর")} · ${data.soil.source}`
    : t("Soil profile not prepared", "মাটির গভীরতার তথ্য প্রস্তুত নয়");

  const near = nearestForMonth(data.vegetation || [], currentMonthIdx);
  const observedValue = near?.observation?.ndvi;
  const observedDate = near?.observation?.date || "";
  const litresDisplay = num(m.shortfallLitres || 0);
  const chipTextEn = monthChipText(m, "en");
  const chipTextBn = monthChipText(m, "bn");

  const calloutData = buildCalloutData({
    data,
    monthIdx: currentMonthIdx,
    soilOverrides,
    waterTable: waterTableData || null,
    t,
  });

  const srSummary = t(
    `Month: ${m.month}, Crop: ${m.cropName}, Stage: ${m.stage}, Rain: ${num(m.rainMm, 1)} mm, Need: ${num(m.needMm, 1)} mm, Shortfall: ${num(m.shortfallMm, 1)} mm (${litresDisplay} litres)`,
    `মাস: ${m.month}, ফসল: ${m.cropNameBn}, অবস্থা: ${m.stage}, বৃষ্টি: ${num(m.rainMm, 1)} মিমি, প্রয়োজন: ${num(m.needMm, 1)} মিমি, ঘাটতি: ${num(m.shortfallMm, 1)} মিমি (${litresDisplay} লিটার)`,
  );

  return `
  <div class="studio-container" id="studio-3d-root">
    <aside class="studio-rail">
      <section class="studio-rail-section">
        <h3>${t("Rotation Scenario", "ফসলচক্র")} ${truth(truthTags.plants || "SCENARIO")}</h3>
        <div class="studio-rotations-picker" role="radiogroup" aria-label="${t("Rotation options", "ফসলচক্র বিকল্প")}">
          ${rotationPickerHtml()}
        </div>
      </section>

      <section class="studio-rail-section">
        <h3>${t("3D Surface Layers", "সারফেস লেয়ার")}</h3>
        <div class="studio-layers-radio">
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="crops" ${currentSurfaceMode === "crops" ? "checked" : ""}><span>${t("Crop season (3D Plants)", "মৌসুমি ফসল (৩ডি উদ্ভিদ)")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="photo" ${currentSurfaceMode === "photo" ? "checked" : ""}><span>${t("High-res photo (Esri / Sentinel)", "স্যাটেলাইট ছবি")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="ndvi" ${currentSurfaceMode === "ndvi" ? "checked" : ""}><span>${t("Greenness (NDVI grid)", "সবুজভাব (NDVI)")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="moisture" ${currentSurfaceMode === "moisture" ? "checked" : ""}><span>${t("Moisture (NDMI)", "আর্দ্রতা (NDMI)")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="water" ${currentSurfaceMode === "water" || currentSurfaceMode === "ponding" ? "checked" : ""}><span>${t("Water flow & ponding", "পানির প্রবাহ ও জমা পানি")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="elevation" ${currentSurfaceMode === "elevation" || currentSurfaceMode === "hypso" ? "checked" : ""}><span>${t("Elevation & contours", "উচ্চতা ও কনট্যুর")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="productivity" ${currentSurfaceMode === "productivity" ? "checked" : ""}><span>${t("Productivity zones", "উৎপাদনশীলতার অঞ্চল")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="fertility" ${currentSurfaceMode === "fertility" ? "checked" : ""}><span>${t("Soil fertility (SoilGrids)", "মাটির উর্বরতা (SoilGrids)")}</span></label>
        </div>
        <div class="studio-terrain-tools">
          <label for="studio-height-slider">${t("Height exaggeration", "উচ্চতা বাড়িয়ে দেখানো")} <output id="studio-height-output">${num(heightExaggeration, 1)}×</output></label>
          <input type="range" id="studio-height-slider" min="1" max="4.5" step="0.25" value="${heightExaggeration}">
          <small class="note">${t("30 m NASADEM, flat at plot scale", "৩০ মি নাসাডেম, জমির মাপে সমতল")}</small>
        </div>
        <div class="note studio-illustrative-note" style="margin-top:6px;font-size:11px;">
          ${currentSurfaceMode === "crops" ? t("Illustrative crops · not observed", "কাল্পনিক ফসল · সরাসরি দেখা নয়") : ""}
        </div>
      </section>

      <section class="studio-rail-section">
        <h3>${t("Field Observation", "মাঠ পর্যবেক্ষণ")} ${truth(truthTags.vegetation || "REMOTE_OBSERVED")}</h3>
        <div class="studio-obs-row">
          <div>
            <div class="studio-obs-label">${t("NDVI Vegetation Index", "NDVI সবুজভাব")}</div>
            <div class="studio-obs-date">${esc(observedDate || t("No observation", "পর্যবেক্ষণ নেই"))}</div>
          </div>
          <strong class="studio-obs-value">${observedValue !== null && observedValue !== undefined ? num(observedValue, 2) : "—"}</strong>
        </div>
        ${renderSparkline(data.vegetation, currentMonthIdx)}
        <div class="studio-soil-summary">
          <span>${t("Soil Profile", "মাটির স্তর")}</span>
          <small class="note">${esc(soilSummary)}</small>
        </div>
      </section>

      <section class="studio-rail-section">
        <h3>${t("Weather & Water Need", "আবহাওয়া ও পানির চাহিদা")} ${truth(truthTags.weather || "MODELED")}</h3>
        <div class="studio-weather-grid">
          <div class="studio-weather-item"><dt>${t("Rainfall", "বৃষ্টি")}</dt><dd>${num(m.rainMm, 1)} <small>mm</small></dd></div>
          <div class="studio-weather-item"><dt>${t("Mean Temp", "তাপমাত্রা")}</dt><dd>${num(m.tmeanC, 1)} <small>°C</small></dd></div>
          <div class="studio-weather-item"><dt>${t("Reference ETo", "বাষ্পীভবন ETo")}</dt><dd>${num(m.et0Mm, 1)} <small>mm</small></dd></div>
          <div class="studio-weather-item"><dt>${t("Crop Need", "ফসলের চাহিদা")}</dt><dd>${num(m.needMm, 1)} <small>mm</small></dd></div>
          <div class="studio-litres-highlight">
            <div style="font-size:11px;color:var(--text-dim);">${t("Water Shortfall for This Plot", "এই জমির জন্য পানির ঘাটতি")}</div>
            <strong>${num(m.shortfallMm, 1)} mm &nbsp;·&nbsp; ${litresDisplay} ${t("Litres", "লিটার")}</strong>
          </div>
        </div>
      </section>
    </aside>

    <div class="studio-stage-wrap">
      <div class="studio-calendar-bar">
        <button type="button" class="studio-play-btn" data-studio-action="toggle-play" aria-label="${isPlaying ? t("Pause", "থামান") : t("Play", "চালান")}">
          ${isPlaying ? "⏸" : "▶"}
        </button>
        <div class="studio-month-slider-wrap">
          <input type="range" id="studio-month-slider" min="0" max="11" step="1" value="${currentMonthIdx}" aria-label="${t("Month selection", "মাস নির্বাচন")}" aria-valuetext="${esc(t(chipTextEn, chipTextBn))}">
          <div class="studio-month-slider-labels" aria-hidden="true">
            ${t(MONTHS_EN, MONTHS_BN).map((label) => `<span>${label}</span>`).join("")}
          </div>
        </div>
        <div class="studio-month-current-pill" title="${esc(t(chipTextEn, chipTextBn))}" data-chip-en="${esc(chipTextEn)}" data-chip-bn="${esc(chipTextBn)}">
          ${monthPillHtml(m)}
        </div>
      </div>
      <div class="studio-stage-canvas-host" tabindex="0" role="region" aria-label="${t("3D Field Studio Stage", "৩ডি মাঠ স্টুডিও মঞ্চ")}">
        <button class="studio-compass" title="${t("Click to face North", "উত্তরমুখী হতে চাপুন")}" aria-label="${t("North Arrow", "উত্তর নির্দেশক")}">
          <div class="studio-compass-arrow"></div>
          <div class="studio-compass-s"></div>
        </button>
        <div class="studio-touch-hint" hidden><span>${t("Swipe sideways to turn · two fingers to zoom", "পাশে সোয়াইপ করলে ঘোরে · দুই আঙুলে জুম হয়")}</span><button type="button" data-dismiss-touch-hint aria-label="${t("Dismiss hint", "ইঙ্গিত বন্ধ করুন")}">×</button></div>

        <!-- Top-Left Surface Layer Switcher & Preset Views -->
        <div class="studio-overlay-tl">
          <div class="studio-view-toggle">
            <button id="btn-view-3d" type="button" class="studio-view-btn ${currentViewMode === "3d" ? "active" : ""}" data-studio-view="3d"><span class="studio-view-long">${t("3D field", "৩ডি মাঠ")}</span><span class="studio-view-short">${t("3D", "৩ডি")}</span></button>
            <button id="btn-view-cutaway" type="button" class="studio-view-btn ${currentViewMode === "cutaway" ? "active" : ""}" data-studio-view="cutaway"><span class="studio-view-long">${t("Root Slice", "মাটির স্তর ও শিকড়")}</span><span class="studio-view-short">${t("Slice", "ছেদ")}</span></button>
            <button id="btn-view-2d" type="button" class="studio-view-btn ${currentViewMode === "top" ? "active" : ""}" data-studio-view="top"><span class="studio-view-long">${t("Top view", "উপরের দৃশ্য")}</span><span class="studio-view-short">${t("Top", "উপর")}</span></button>
          </div>
          <button type="button" class="studio-layers-button" data-studio-layers aria-label="${t("Layers", "লেয়ার")}" aria-haspopup="dialog" aria-expanded="false" aria-controls="studio-layers-sheet">
            <span>${t("Layers", "লেয়ার")}</span>
          </button>

          <!-- Top-Centre Fallow / Harvested Notification Chip -->
          <div id="studio-overlay-fallow-host" class="studio-overlay-tc">
            ${fallowOverlayChipHtml(data, currentMonthIdx)}
          </div>

          <div class="studio-surface-selector">
            <span class="eyebrow" style="font-size:10px;text-transform:uppercase;">${t("Surface:", "সারফেস:")}</span>
            <select id="select-surface-mode" aria-label="${t("Surface mode", "সারফেস মোড")}">
              <option value="crops" ${currentSurfaceMode === "crops" ? "selected" : ""}>${t("Crop canopy + true colour", "ফসল ক্যানোপি + আসল রঙ")}</option>
              <option value="elevation" ${currentSurfaceMode === "elevation" || currentSurfaceMode === "hypso" ? "selected" : ""}>${t("NASADEM elevation + contours", "নাসাডেম উচ্চতা ও কনট্যুর")}</option>
              <option value="ndvi" ${currentSurfaceMode === "ndvi" ? "selected" : ""}>${t("Sentinel-2 NDVI vigour/bare-field", "সেন্টিনেল-২ এনডিভিআই / খালি জমি")}</option>
              <option value="moisture" ${currentSurfaceMode === "moisture" ? "selected" : ""}>${t("Sentinel-2 moisture (NDMI)", "সেন্টিনেল-২ আর্দ্রতা (NDMI)")}</option>
              <option value="water" ${currentSurfaceMode === "water" || currentSurfaceMode === "ponding" ? "selected" : ""}>${t("Water flow & ponding", "পানির প্রবাহ ও জমা পানি")}</option>
              <option value="productivity" ${currentSurfaceMode === "productivity" ? "selected" : ""}>${t("Productivity zones", "উৎপাদনশীলতার অঞ্চল")}</option>
              <option value="fertility" ${currentSurfaceMode === "fertility" ? "selected" : ""}>${t("Soil fertility (SoilGrids)", "মাটির উর্বরতা (SoilGrids)")}</option>
            </select>
          </div>

          <div class="studio-slice-card">
            <span class="studio-slice-end studio-slice-end-left">${t("Slice field", "মাঠ কাটুন")}</span>
            <input type="range" id="studio-cutaway-slider" min="0" max="0.8" step="0.05" value="${currentCutaway}" aria-label="${t("Slice field to full field", "খণ্ডিত থেকে পুরো মাঠ")}">
            <span class="studio-slice-end studio-slice-end-right">${t("Full field", "পুরো মাঠ")}</span>
          </div>

          <span class="studio-crop-chip">● ${t("Illustrative crop preview · not observed plants", "কাল্পনিক ফসল পূর্বদর্শন · পর্যবেক্ষিত উদ্ভিদ নয়")}</span>
          <div class="studio-caption-copy" ${currentViewMode === "cutaway" ? 'style="display:none;"' : ""}>
            <h2>${t("Your field. Brought to life.", "আপনার জমি। জীবন্ত রূপে।")}</h2>
            <div class="studio-interaction-hint" hidden>
              <span role="tooltip">${t("Drag to rotate · scroll to zoom · tap to inspect", "ঘোরাতে টানুন · জুম করতে স্ক্রল · পরীক্ষা করতে ট্যাপ")}</span>
              <button type="button" data-dismiss-hint aria-label="${t("Dismiss hint", "ইঙ্গিত বন্ধ করুন")}">×</button>
            </div>
          </div>
        </div>

        <dialog id="studio-layers-sheet" class="studio-layers-sheet" aria-labelledby="studio-layers-title">
          <div class="studio-sheet-handle" aria-hidden="true"><span></span></div>
          <div class="studio-sheet-heading">
            <h2 id="studio-layers-title">${t("Layers", "লেয়ার")}</h2>
            <button type="button" data-close-layers aria-label="${t("Close layers", "লেয়ার বন্ধ করুন")}">×</button>
          </div>
          <div class="studio-layers-content"></div>
        </dialog>

        <div class="studio-stage-controls">
          <button class="studio-ctrl-btn" data-studio-ctrl="zoom-in" title="${t("Zoom In", "কাছে আনুন")}" aria-label="${t("Zoom In", "কাছে আনুন")}">+</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="zoom-out" title="${t("Zoom Out", "দূরে নিন")}" aria-label="${t("Zoom Out", "দূরে নিন")}">−</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="reset" title="${t("Reset Camera", "ক্যামেরা রিসেট")}" aria-label="${t("Reset Camera", "ক্যামেরা রিসেট")}">↺</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="fullscreen" title="${t("Toggle Fullscreen", "ফুলস্ক্রিন")}" aria-label="${t("Toggle Fullscreen", "ফুলস্ক্রিন")}">⛶</button>
        </div>

        ${depthTicksHtml()}

        <!-- Architectural Callouts overlay -->
        <svg id="svg-callout-leaders" class="studio-callout-svg" aria-hidden="true"></svg>
        <div id="overlay-callouts" class="studio-callout-overlay">
          <div id="node-a" class="callout-3d"><div class="transect-node">A</div></div>
          <div id="node-ap" class="callout-3d"><div class="transect-node">A'</div></div>

          <div id="callout-low-corner" class="callout-3d">
            <div class="callout-box water">${t("Low basin corner · Water collects first", "নিচু অংশ · পানি আগে জমে")}</div>
            <div class="callout-line"></div><div class="callout-dot"></div>
          </div>

          <div id="callout-drain" class="callout-3d">
            <div class="callout-box warn" id="callout-drain-txt">${t("Proposed drain trench", "পরিকল্পিত নালা")}</div>
            <div class="callout-line"></div><div class="callout-dot"></div>
          </div>

          <div id="callout-outlet" class="callout-3d">
            <div class="callout-box warn" id="callout-outlet-txt">${t("Canal outlet · Verify locally", "খালের মুখ · স্থানীয়ভাবে যাচাই করুন")}</div>
            <div class="callout-line"></div><div class="callout-dot"></div>
          </div>

          ${["topsoil", "rootzone", "aquifer"].map((band, i) => `
            <div id="callout-${band}" class="callout-3d" data-band="${band}">
              <button type="button" class="studio-soil-dot" data-soil-pin="${band}"
                aria-label="${esc(calloutData[band].eyebrow)}" aria-expanded="false" aria-controls="studio-soil-popover"></button>
              <button type="button" class="studio-soil-pin" id="soil-pin-${band}" data-soil-pin="${band}"
                aria-label="${esc(calloutData[band].eyebrow)}" aria-expanded="false" aria-controls="studio-soil-popover">
                ${[t("Topsoil", "উপরের মাটি"), t("Root zone", "শিকড় স্তর"), t("Deep soil", "গভীর মাটি")][i]}
              </button>
              <span class="studio-pin-label" data-pin-label="${band}">${esc(soilPinLabel(band, calloutData[band]))}</span>
            </div>`).join("")}
        </div>
        <div id="studio-soil-popover" class="studio-soil-popover" role="dialog" aria-label="${t("Soil layer details", "মাটির স্তরের বিবরণ")}" hidden>
          <button type="button" data-close-soil class="studio-popover-close" aria-label="${t("Close", "বন্ধ করুন")}">×</button>
          ${["topsoil", "rootzone", "aquifer"].map((band) => `<div data-soil-detail="${band}" hidden>${soilDetailHtml(band, calloutData[band])}</div>`).join("")}
        </div>

        <div class="studio-model-caption" aria-hidden="true">
          <b>${t("FIELD MODEL", "মাঠ মডেল")}</b>
          <span>${t("Selected boundary + terrain", "নির্বাচিত সীমানা + ভূমি")}</span>
          <span>${t("Illustrative plants &amp; enlarged soil section", "কাল্পনিক উদ্ভিদ ও বড় করে দেখানো মাটির অংশ")}</span>
        </div>
      </div>

      <div class="studio-surface-bar">
        <details class="studio-surface-legend">${surfaceLegendHtml(surfaceLegend(currentSurfaceMode, {
          month: m, rotation: data.rotation, soil: data.soil, soilOverrides,
          lang: t('en', 'bn'), cells: [], relative: relativeOptionFor(currentSurfaceMode),
        }))}</details>
      </div>
      <div class="studio-surface-mini" hidden></div>

      <details class="studio-soil-layers" open>
        <summary>${t("Soil layers", "মাটির স্তরসমূহ")}</summary>
        <div class="studio-callout-legend" id="studio-mobile-legend">
          ${["topsoil", "rootzone", "aquifer"].map((band, i) => `
            <div class="studio-callout-legend-item" data-band="${band}" tabindex="0" aria-label="${esc(calloutData[band].eyebrow)}">
              <div data-soil-row="${band}">${soilDetailHtml(band, calloutData[band])}</div>
            </div>`).join("")}
        </div>
      </details>
      <div class="studio-inspection">
        <div class="studio-inspection-tabs" role="tablist" aria-label="${t("Field inspection", "মাঠ পরিদর্শন")}">
          <button type="button" id="tab-probe" role="tab" aria-selected="true" aria-controls="probe-card" data-inspection-tab="probe">${t("Point probe", "পয়েন্ট প্রোব")}</button>
          <button type="button" id="tab-transect" role="tab" aria-selected="false" aria-controls="transect-card" tabindex="-1" data-inspection-tab="transect">${t("Cross-section A–A′", "আড়াআড়ি ছেদ A–A′")}</button>
        </div>
        <!-- Tap Point Probe Card -->
        <div class="studio-probe-card" id="probe-card">
          <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e2e4d8;padding-bottom:3px;margin-bottom:4px;">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--deep,#173e30);">${t("Point Probe (Click Field)", "পয়েন্ট প্রোব (জমিতে চাপুন)")}</span>
            <span id="probe-latlon" class="mono" style="font-size:10px;color:var(--text-dim,#536456);">25.8317°N, 89.2355°E</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:6px;font-size:11px;" class="mono">
            <div><span style="font-size:9px;color:var(--text-dim,#536456);display:block;">${t("Elev", "উচ্চতা")}</span><strong id="probe-elev">32.8 m</strong></div>
            <div><span style="font-size:9px;color:var(--text-dim,#536456);display:block;">${t("Ponding", "জমা পানি")}</span><strong id="probe-pond" style="color:#234f61;">0 cm</strong></div>
            <div><span style="font-size:9px;color:var(--text-dim,#536456);display:block;">${t("NDVI", "সবুজ")}</span><strong id="probe-ndvi" style="color:#315d42;">0.72</strong></div>
          </div>
        </div>

        <!-- Transect SVG cross-section Profile Card -->
        <div class="studio-transect-card" id="transect-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:var(--deep,#173e30);">${t("Transect Profile · A → A'", "ট্রানসেক্ট প্রোফাইল · A → A'")}</span>
            <span id="transect-relief-lbl" class="mono" style="font-size:10px;color:var(--text-dim,#536456);">${t("Relief: 2.5 m", "ঢাল: ২.৫ মি")}</span>
          </div>
          <svg id="svg-transect" viewBox="0 0 290 68" style="width:100%;height:64px;display:block;"></svg>
        </div>

      </div>

      <!-- Interaction deck below viewport: Slice slider, Rain scenario slider, Relief scale slider + Roots & Bunds toggles -->
      <div class="studio-dock-deck">
        <div class="studio-dock-item">
          <div class="studio-dock-head">
            <label for="studio-height-slider-stage">${t("Terrain height", "ভূমির উচ্চতা")}</label>
            <output id="studio-height-output-stage" class="mono">${num(heightExaggeration, 0)}×</output>
          </div>
          <input type="range" id="studio-height-slider-stage" min="1" max="4.5" step="0.25" value="${heightExaggeration}" aria-label="${t("Terrain height exaggeration", "ভূমির উচ্চতা বাড়ানো")}">
          <div class="studio-dock-sub">
            <span>${t("True scale · NASADEM ~30 m", "প্রকৃত স্কেল · নাসাডেম ~৩০ মি")}</span>
            <label class="studio-terrain-surround" style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;margin:0;padding:0;">
              <input type="checkbox" id="studio-surroundings-chk" ${showSurroundings ? "checked" : ""}>
              <span>${t("Surroundings", "আশেপাশে")}</span>
            </label>
          </div>
        </div>

        <div class="studio-dock-item">
          <div class="studio-dock-head">
            <label for="slider-slice">${t("Subsurface Cutaway Slice", "মাটির নিচের স্তর কাটুন")}</label>
            <span id="lbl-slice-pct" class="mono" style="color:#315d42;">${Math.round((1 - currentCutaway) * 100)}%</span>
          </div>
          <input id="slider-slice" type="range" min="0" max="80" value="${Math.round(currentCutaway * 100)}" class="w-full">
          <div class="studio-dock-sub">
            <span>${t("Full Parcel", "পুরো জমি")}</span>
            <span>${t("Deep Cutaway", "গভীর অংশ")}</span>
          </div>
        </div>

        <div class="studio-dock-item">
          <div class="studio-dock-head">
            <label for="slider-rain">${t("Rainfall / Flood Scenario", "বৃষ্টিপাত / বন্যা পরিস্থিতি")} ${truth("SCENARIO")}</label>
            <span id="lbl-rain-mm" class="mono" style="color:#234f61;">${rainScenarioMm} mm</span>
          </div>
          <input id="slider-rain" type="range" min="0" max="240" step="5" value="${rainScenarioMm}" class="w-full">
          <div class="studio-dock-sub">
            <span>0 mm (${t("Dry Spell", "শুষ্ক")})</span>
            <span>240 mm (${t("Deluge", "অতিবৃষ্টি")})</span>
          </div>
        </div>

        <div class="studio-dock-item">
          <div class="studio-dock-head">
            <label for="slider-exag">${t("Vertical Relief Scale", "উচ্চতা স্কেল")}</label>
            <span id="lbl-exag-val" class="mono" style="color:#173e30;">${heightExaggeration.toFixed(1)}×</span>
          </div>
          <input id="slider-exag" type="range" min="1.0" max="4.5" step="0.25" value="${heightExaggeration}" class="w-full">
          <div class="studio-dock-toggles">
            <label>
              <input id="chk-show-roots" type="checkbox" ${showRoots ? "checked" : ""}>
              <span>${t("Show roots", "শিকড় দেখুন")}</span>
            </label>
            <label>
              <input id="chk-show-bunds" type="checkbox" ${showBunds ? "checked" : ""}>
              <span>${t("Show bunds", "আইল ও গাছ")}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="studio-sr-only" aria-live="polite" id="studio-sr-summary">${esc(srSummary)}</div>

    </div>
  </div>`;
}

/* ---------------------------------------------------------- mount + events */

function updateDepthTicks() {
  const ticks = containerEl?.querySelector(".studio-depth-ticks");
  if (!ticks) return;
  ticks.classList.toggle("visible", currentCutaway > 0.02);
}

export async function mountStudio3d(container, data, opts = {}) {
  if (!container) return;
  containerEl = container;
  currentData = data;
  if (opts.rotations) rotationOptions = opts.rotations;
  if (opts.onRotationSelect) onRotationSelect = opts.onRotationSelect;
  isDisposed = false;
  prefersReducedMotion = whenReducedMotion();

  const host = containerEl.querySelector(".studio-stage-canvas-host");
  if (!host) return;
  canvasHostEl = host;
  // Fit the stage into the visible window below where it starts (owner: 3D must not be cut off on first view).
  const pageTop = host.getBoundingClientRect().top + window.scrollY;
  host.style.setProperty('--stage-top', `${Math.max(0, Math.min(pageTop, window.innerHeight * 0.5))}px`);
  openSoilBand = null;
  suppressSoilHover = false;
  updateOverlayLayout();

  let loader = host.querySelector(".studio-loading-overlay");
  if (!loader) {
    loader = document.createElement("div");
    loader.className = "studio-loading-overlay";
    loader.innerHTML = `<div class="studio-loading-spinner"></div><div class="studio-loading-text">${t("Building your field…", "জমির ৩ডি মডেল তৈরি হচ্ছে…")}</div>`;
    host.appendChild(loader);
  }

  try {
    initThree(host);

    if (loader) loader.querySelector(".studio-loading-text").textContent = t("Sampling terrain…", "ভূ-উচ্চতা মাপা হচ্ছে…");
    if (!elevationSampler) elevationSampler = await createElevationSampler(data);

    // Default vertical auto-exaggeration so relief is visible (~0.25 * block width)
    const b = outlineBounds(data.field.outlineM);
    const reliefM = Math.max(0.2, (data.field.elevMax || 30) - (data.field.elevMin || 28));
    heightExaggeration = computeAutoExaggeration(reliefM, b.width);
    const exagLbl = `${heightExaggeration.toFixed(1)}×`;
    const outRail = containerEl.querySelector("#studio-height-output");
    const outStage = containerEl.querySelector("#studio-height-output-stage");
    const outExag = containerEl.querySelector("#lbl-exag-val");
    if (outRail) outRail.textContent = exagLbl;
    if (outStage) outStage.textContent = exagLbl;
    if (outExag) outExag.textContent = exagLbl;
    containerEl.querySelectorAll("#studio-height-slider, #studio-height-slider-stage, #slider-exag").forEach((s) => {
      s.value = String(heightExaggeration);
    });

    if (loader) loader.querySelector(".studio-loading-text").textContent = t("Building your field…", "জমির ৩ডি মডেল তৈরি হচ্ছে…");
    await buildFieldBlock(data, currentCutaway);

    if (loader) loader.querySelector(".studio-loading-text").textContent = t("Placing crops…", "ফসল সাজানো হচ্ছে…");
    buildPlantsAndRoots(data, currentMonthIdx);
    await buildSurroundings(data);

    fitCameras(data);
    updateShadowLight();
    updateDepthTicks();

    if (loader?.parentNode) loader.parentNode.removeChild(loader);

    requestRender();
    bindEvents(container);
    setupVisibilityObserver(container);
    startAnimation();
    // STUDIO5T: let the skeleton cross-fade on the first painted frame.
    if (typeof opts.onFirstFrame === "function") {
      const onFirstFrame = opts.onFirstFrame;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        try {
          onFirstFrame();
        } catch {
          // Reveal is best-effort; rotations.js also force-reveals on timeout.
        }
      }));
    }
    triggerIntroAnimation();
    // When the intro is skipped the sway fades in from the default framing.
    if (!introAnim) idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
    bindIdleListeners();
  } catch (err) {
    console.error("Studio3D initialization error:", err);
    showFallbackMessage(t("Failed to initialize 3D Studio.", "৩ডি স্টুডিও চালু করা যায়নি।"));
  }
}

export async function setStudioMonth(monthIdx) {
  currentMonthIdx = monthIdx;
  state.month = monthIdx;
  if (!currentData) return;

  await buildFieldBlock(currentData, currentCutaway);
  buildPlantsAndRoots(currentData, currentMonthIdx);

  const m = currentData.months[currentMonthIdx];
  if (!m) return;

  const pill = containerEl?.querySelector(".studio-month-current-pill");
  if (pill) {
    const en = monthChipText(m, "en");
    const bn = monthChipText(m, "bn");
    pill.dataset.chipEn = en;
    pill.dataset.chipBn = bn;
    pill.title = t(en, bn);
    pill.innerHTML = monthPillHtml(m);
  }

  const slider = containerEl?.querySelector("#studio-month-slider");
  if (slider && +slider.value !== monthIdx) slider.value = monthIdx;
  slider?.setAttribute("aria-valuetext", t(monthChipText(m, "en"), monthChipText(m, "bn")));

  // The sparkline sorts by date, so pick the nearest observation from the same
  // sorted order; its index is what marks the active dot.
  const sortedVegetation = [...(currentData.vegetation || [])].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const near = nearestForMonth(sortedVegetation, currentMonthIdx);
  const valueEl = containerEl?.querySelector(".studio-obs-value");
  const dateEl = containerEl?.querySelector(".studio-obs-date");
  if (valueEl) {
    valueEl.textContent =
      near?.observation?.ndvi !== null && near?.observation?.ndvi !== undefined
        ? num(near.observation.ndvi, 2)
        : "—";
  }
  if (dateEl) dateEl.textContent = near?.observation?.date || t("No observation", "পর্যবেক্ষণ নেই");

  const dots = containerEl?.querySelectorAll(".sparkline-dot");
  if (dots?.length) {
    dots.forEach((d, i) => {
      const active = !!near && i === near.index;
      d.classList.toggle("active", active);
      d.setAttribute("r", active ? "5" : "3");
    });
  }

  const weatherGrid = containerEl?.querySelector(".studio-weather-grid");
  if (weatherGrid) {
    const litresDisplay = num(m.shortfallLitres || 0);
    weatherGrid.innerHTML = `
      <div class="studio-weather-item"><dt>${t("Rainfall", "বৃষ্টি")}</dt><dd>${num(m.rainMm, 1)} <small>mm</small></dd></div>
      <div class="studio-weather-item"><dt>${t("Mean Temp", "তাপমাত্রা")}</dt><dd>${num(m.tmeanC, 1)} <small>°C</small></dd></div>
      <div class="studio-weather-item"><dt>${t("Reference ETo", "বাষ্পীভবন ETo")}</dt><dd>${num(m.et0Mm, 1)} <small>mm</small></dd></div>
      <div class="studio-weather-item"><dt>${t("Crop Need", "ফসলের চাহিদা")}</dt><dd>${num(m.needMm, 1)} <small>mm</small></dd></div>
      <div class="studio-litres-highlight">
        <div style="font-size:11px;color:var(--text-dim);">${t("Water Shortfall for This Plot", "এই জমির জন্য পানির ঘাটতি")}</div>
        <strong>${num(m.shortfallMm, 1)} mm &nbsp;·&nbsp; ${litresDisplay} ${t("Litres", "লিটার")}</strong>
      </div>`;
  }

  const srSummary = containerEl?.querySelector("#studio-sr-summary");
  if (srSummary) {
    srSummary.textContent = t(
      `Month: ${m.month}, Crop: ${m.cropName}, Stage: ${m.stage}, Rain: ${num(m.rainMm, 1)} mm, Need: ${num(m.needMm, 1)} mm, Shortfall: ${num(m.shortfallMm, 1)} mm (${num(m.shortfallLitres || 0)} litres)`,
      `মাস: ${m.month}, ফসল: ${m.cropNameBn}, অবস্থা: ${m.stage}, বৃষ্টি: ${num(m.rainMm, 1)} মিমি, প্রয়োজন: ${num(m.needMm, 1)} মিমি, ঘাটতি: ${num(m.shortfallMm, 1)} মিমি (${num(m.shortfallLitres || 0)} লিটার)`,
    );
  }

  // Update stratigraphic callouts and mobile legend for active month
  const calloutData = buildCalloutData({
    data: currentData,
    monthIdx: currentMonthIdx,
    soilOverrides,
    waterTable: waterTableData || null,
    t,
  });
  if (calloutData && containerEl) updateSoilDetails(calloutData);

  // Update fallow / harvested top-centre notification chip
  const fallowHost = containerEl?.querySelector("#studio-overlay-fallow-host");
  if (fallowHost) {
    fallowHost.innerHTML = fallowOverlayChipHtml(currentData, currentMonthIdx);
  }

  requestRender();
  startAnimation();
}

function bindEvents(container) {
  // Radio layer switcher in rail
  containerEl.querySelectorAll('input[name="studio-layer"]').forEach((radio) => {
    radio.onchange = async (e) => {
      setSurfaceMode(e.target.value);
    };
  });

  // Surface mode dropdown
  const surfaceSelect = containerEl.querySelector("#select-surface-mode");
  if (surfaceSelect) {
    surfaceSelect.onchange = (e) => {
      setSurfaceMode(e.target.value);
    };
  }

  const updateTitleVisibility = () => {
    const caption = containerEl?.querySelector(".studio-caption-copy");
    if (caption) {
      caption.style.display = currentViewMode === "cutaway" ? "none" : "";
    }
  };

  // Camera presets: 3D Block | Root Slice | Top 2D
  const btn3d = containerEl.querySelector("#btn-view-3d");
  if (btn3d) {
    btn3d.onclick = () => {
      if (currentViewMode === "cutaway") resetSliceToFull();
      currentViewMode = "3d";
      isTopView = false;
      isCloseView = false;
      updateTitleVisibility();
      containerEl.querySelectorAll(".studio-view-btn").forEach((b) => b.classList.remove("active"));
      btn3d.classList.add("active");
      activeCamera = cameraPersp;
      controls.object = activeCamera;
      controls.enableRotate = true;
      fillPerspectiveAspect();
      fitPerspective(currentData, false);
      requestRender();
    };
  }

  const btnCut = containerEl.querySelector("#btn-view-cutaway");
  if (btnCut) {
    btnCut.onclick = async () => {
      currentViewMode = "cutaway";
      isTopView = false;
      isCloseView = true;
      updateTitleVisibility();
      currentCutaway = 0.42; // Open slice
      containerEl.querySelectorAll(".studio-view-btn").forEach((b) => b.classList.remove("active"));
      btnCut.classList.add("active");
      const cutSlider = containerEl.querySelector("#studio-cutaway-slider");
      if (cutSlider) cutSlider.value = "0.42";
      const deckSlice = containerEl.querySelector("#slider-slice");
      if (deckSlice) deckSlice.value = "42";
      const lblSlice = containerEl.querySelector("#lbl-slice-pct");
      if (lblSlice) lblSlice.textContent = "58%";
      updateDepthTicks();
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      activeCamera = cameraPersp;
      controls.object = activeCamera;
      controls.enableRotate = true;
      fillPerspectiveAspect();
      fitPerspective(currentData, true);
      requestRender();
    };
  }

  const btn2d = containerEl.querySelector("#btn-view-2d");
  if (btn2d) {
    btn2d.onclick = () => {
      if (currentViewMode === "cutaway") resetSliceToFull();
      currentViewMode = "top";
      isTopView = true;
      isCloseView = false;
      updateTitleVisibility();
      containerEl.querySelectorAll(".studio-view-btn").forEach((b) => b.classList.remove("active"));
      btn2d.classList.add("active");
      activeCamera = cameraOrtho;
      controls.object = activeCamera;
      controls.enableRotate = false;
      fitOrtho(currentData);
      requestRender();
    };
  }

  // Slice sliders (top-left bar & bottom deck)
  const cutawaySlider = containerEl.querySelector("#studio-cutaway-slider");
  const deckSlice = containerEl.querySelector("#slider-slice");

  const onSliceChange = async (valFrac) => {
    currentCutaway = valFrac;
    if (cutawaySlider) cutawaySlider.value = String(currentCutaway);
    if (deckSlice) deckSlice.value = String(Math.round(currentCutaway * 100));
    const lbl = containerEl.querySelector("#lbl-slice-pct");
    if (lbl) lbl.textContent = `${Math.round((1 - currentCutaway) * 100)}%`;
    updateDepthTicks();
    await buildFieldBlock(currentData, currentCutaway);
    buildPlantsAndRoots(currentData, currentMonthIdx);
    requestRender();
  };

  if (cutawaySlider) {
    cutawaySlider.oninput = (e) => onSliceChange(parseFloat(e.target.value));
  }
  if (deckSlice) {
    deckSlice.oninput = (e) => onSliceChange(parseFloat(e.target.value) / 100);
  }

  // Rainfall scenario slider
  const rainSlider = containerEl.querySelector("#slider-rain");
  if (rainSlider) {
    rainSlider.oninput = async (e) => {
      rainScenarioMm = parseInt(e.target.value, 10);
      const rainLbl = containerEl.querySelector("#lbl-rain-mm");
      if (rainLbl) rainLbl.textContent = `${rainScenarioMm} mm`;
      await buildFieldBlock(currentData, currentCutaway);
      renderTransectSVG();
      updateProbeCard();
      requestRender();
    };
  }

  // Height / Vertical relief sliders
  const heightSliders = containerEl.querySelectorAll(
    "#studio-height-slider, #studio-height-slider-stage, #slider-exag"
  );
  heightSliders.forEach((slider) => {
    slider.oninput = async (e) => {
      heightExaggeration = parseFloat(e.target.value);
      containerEl.querySelectorAll(
        "#studio-height-slider, #studio-height-slider-stage, #slider-exag"
      ).forEach((s) => {
        if (s !== e.target) s.value = String(heightExaggeration);
      });
      const outRail = containerEl.querySelector("#studio-height-output");
      const outStage = containerEl.querySelector("#studio-height-output-stage");
      const outExag = containerEl.querySelector("#lbl-exag-val");
      const label = `${heightExaggeration.toFixed(1)}×`;
      if (outRail) outRail.textContent = label;
      if (outStage) outStage.textContent = label;
      if (outExag) outExag.textContent = label;
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      await buildSurroundings(currentData);
      renderTransectSVG();
      requestRender();
    };
  });

  // Toggles for roots and bunds
  const chkRoots = containerEl.querySelector("#chk-show-roots");
  if (chkRoots) {
    chkRoots.onchange = (e) => {
      showRoots = e.target.checked;
      buildPlantsAndRoots(currentData, currentMonthIdx);
      requestRender();
    };
  }

  const chkBunds = containerEl.querySelector("#chk-show-bunds");
  if (chkBunds) {
    chkBunds.onchange = async (e) => {
      showBunds = e.target.checked;
      await buildFieldBlock(currentData, currentCutaway);
      requestRender();
    };
  }

  const surroundChk = containerEl.querySelector("#studio-surroundings-chk");
  if (surroundChk) {
    surroundChk.onchange = async (e) => {
      showSurroundings = e.target.checked;
      await buildSurroundings(currentData);
      requestRender();
    };
  }

  // View toggle & camera buttons
  containerEl.querySelectorAll("[data-studio-ctrl]").forEach((btn) => {
    btn.onclick = () => {
      const act = btn.dataset.studioCtrl;
      if (act === "zoom-in") {
        if (isTopView) {
          cameraOrtho.zoom = Math.min(8, cameraOrtho.zoom * 1.25);
          cameraOrtho.updateProjectionMatrix();
        } else {
          const offset = cameraPersp.position.clone().sub(controls.target).multiplyScalar(0.8);
          cameraPersp.position.copy(controls.target).add(offset);
        }
      } else if (act === "zoom-out") {
        if (isTopView) {
          cameraOrtho.zoom = Math.max(0.55, cameraOrtho.zoom * 0.8);
          cameraOrtho.updateProjectionMatrix();
        } else {
          const offset = cameraPersp.position.clone().sub(controls.target).multiplyScalar(1.25);
          cameraPersp.position.copy(controls.target).add(offset);
        }
      } else if (act === "reset") {
        if (currentViewMode !== "3d") containerEl.querySelector("#btn-view-3d")?.click();
        if (currentCutaway > 0) resetSliceToFull();
        fitCameras(currentData);
        triggerIntroAnimation(true);
      }
      requestRender();
    };
  });

  const compass = containerEl.querySelector(".studio-compass");
  if (compass) {
    compass.onclick = () => {
      fitCameras(currentData);
      requestRender();
    };
  }

  const monthSlider = containerEl.querySelector("#studio-month-slider");
  if (monthSlider) monthSlider.oninput = (e) => setStudioMonth(parseInt(e.target.value, 10));

  const playBtn = containerEl.querySelector("[data-studio-action='toggle-play']");
  if (playBtn) playBtn.onclick = () => togglePlay();

  // Raycasting for tap / click probe card + drop pin + hover bands
  if (canvas) {
    let downPos = { x: 0, y: 0 };
    canvas.addEventListener("pointerdown", (e) => {
      downPos = { x: e.clientX, y: e.clientY };
      stopIntroAnimation(true);
    });
    canvas.addEventListener("wheel", () => {
      stopIntroAnimation(true);
    }, { passive: true });

    canvas.addEventListener("pointermove", (e) => {
      if (!currentData || !currentBlock.bounds || !activeCamera || isDragging) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, activeCamera);
      const hits = blockGroup ? raycaster.intersectObjects(blockGroup.children, true) : [];
      let nextBand = null;
      if (hits.length > 0) {
        canvas.style.cursor = "pointer";
        const hit = hits[0];
        // Check if hitting cut wall (face normal pointing roughly in +X)
        if (hit.face && hit.face.normal && hit.face.normal.x > 0.6) {
          const depth = currentBlock.topMin - currentBlock.bottomY;
          const relY = currentBlock.topMin - hit.point.y;
          const frac = depth > 0 ? relY / depth : 0;
          if (frac <= 0.15) nextBand = "topsoil";
          else if (frac <= 0.55) nextBand = "rootzone";
          else nextBand = "aquifer";
        }
      } else {
        canvas.style.cursor = "default";
      }

      if (openSoilBand) nextBand = openSoilBand; // card open: highlight follows the card
      if (nextBand !== hoveredBandId) {
        hoveredBandId = nextBand;
        // Highlight corresponding callouts in DOM
        containerEl.querySelectorAll('.studio-soil-pin, .studio-callout-legend-item').forEach((el) => {
          el.classList.remove('highlight');
        });
        if (hoveredBandId) {
          containerEl.querySelector(`#soil-pin-${hoveredBandId}`)?.classList.add('highlight');
          containerEl.querySelector(`.studio-callout-legend-item[data-band="${hoveredBandId}"]`)?.classList.add('highlight');
        }
        // Update side material map
        if (blockGroup) {
          const sideTex = buildSideTexture(currentData);
          blockGroup.traverse((child) => {
            if (child.isMesh && child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              for (const m of mats) {
                if (m.name === "side" || m.userData?.isSide) {
                  m.map = sideTex;
                  m.needsUpdate = true;
                }
              }
            }
          });
        }
        requestRender();
      }
    });

    canvas.addEventListener("pointerleave", () => {
      canvas.style.cursor = "default";
      if (openSoilBand) { highlightSoilBand(openSoilBand); return; } // keep the open card's band lit
      if (hoveredBandId !== null) {
        hoveredBandId = null;
        containerEl.querySelectorAll('.studio-soil-pin, .studio-callout-legend-item').forEach((el) => {
          el.classList.remove('highlight');
        });
        requestRender();
      }
    });

    canvas.addEventListener("pointerup", (e) => {
      if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
      if (!currentData || !currentBlock.bounds || !activeCamera) return;
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, activeCamera);
      const hits = blockGroup ? raycaster.intersectObjects(blockGroup.children, true) : [];
      if (hits.length > 0) {
        const pt = hits[0].point;
        const b = currentBlock.bounds;
        probeUV = {
          u: Math.max(0, Math.min(1, (pt.x - b.minX) / Math.max(1e-6, b.width))),
          v: Math.max(0, Math.min(1, (-pt.z - b.minY) / Math.max(1e-6, b.height))),
        };
        // Drop small 3D pin on tapped surface
        dropProbePin(pt.x, pt.y, pt.z);
        updateProbeCard();
        requestRender();
      }
    });

    // STUDIO5T gesture split: decide from the first ~10 px whether a one-finger
    // drag rotates (horizontal) or scrolls the page (vertical, native). These
    // listeners never preventDefault, so the browser keeps scrolling. Taps
    // still probe via the pointerup handler above; two fingers stay with
    // OrbitControls (pinch zoom + tilt). Mouse is unaffected.
    // The canvas element is reused across rotation switches (no dispose), so
    // bind once — a stacked touchmove would rotate twice per event.
    if (canvas.dataset.touchSplitBound !== "1") {
    canvas.dataset.touchSplitBound = "1";
    canvas.addEventListener("touchstart", (e) => {
      if (!touchSplitEnabled) return;
      showTouchHint();
      if (e.touches.length === 1) {
        const t0 = e.touches[0];
        touchGesture = { mode: "undecided", startX: t0.clientX, startY: t0.clientY, lastX: t0.clientX };
      } else if (e.touches.length >= 2) {
        // OrbitControls owns the pinch from here (it dispatched "start" and
        // will dispatch "end"); leave isDragging alone.
        touchGesture = { mode: "pinch" };
      }
    }, { passive: true });

    canvas.addEventListener("touchmove", (e) => {
      if (!touchSplitEnabled || !touchGesture || e.touches.length !== 1) return;
      const t0 = e.touches[0];
      if (touchGesture.mode === "undecided") {
        const intent = touchGestureIntent(t0.clientX - touchGesture.startX, t0.clientY - touchGesture.startY);
        if (intent === "undecided") return;
        if (intent === "scroll" || controls?.enableRotate === false) {
          touchGesture.mode = "scroll";
          return;
        }
        touchGesture.mode = "rotate";
        touchGesture.lastX = t0.clientX;
        // Mirror the OrbitControls "start" listener.
        isDragging = true;
        markIdleInput();
        stopIntroAnimation(true);
        if (floatGroup) {
          floatGroup.position.set(0, 0, 0);
          floatGroup.rotation.set(0, 0, 0);
        }
      }
      if (touchGesture.mode === "rotate") {
        rotateAzimuthByPixels(t0.clientX - touchGesture.lastX);
        touchGesture.lastX = t0.clientX;
      }
    }, { passive: true });

    const endTouchGesture = (e) => {
      if (!touchGesture) return;
      if (touchGesture.mode === "rotate") endTouchRotate();
      if (e.touches.length === 1) {
        // One finger left after a pinch: allow a fresh one-finger gesture.
        const t0 = e.touches[0];
        touchGesture = { mode: "undecided", startX: t0.clientX, startY: t0.clientY, lastX: t0.clientX };
      } else if (e.touches.length === 0) {
        touchGesture = null;
      }
    };
    canvas.addEventListener("touchend", endTouchGesture, { passive: true });
    canvas.addEventListener("touchcancel", () => {
      if (touchGesture?.mode === "rotate") endTouchRotate();
      touchGesture = null;
    }, { passive: true });
    }
  }

  bindOverlayEvents();

  // Initial draw of transect and probe
  renderTransectSVG();
  updateProbeCard();

  // Dismiss intro on any user keydown or control click within container
  containerEl.addEventListener("keydown", () => stopIntroAnimation(true));
  containerEl.addEventListener("click", (e) => {
    // Show next crop button on fallow overlay chip
    const gotoBtn = e.target.closest("[data-studio-action='goto-month']");
    if (gotoBtn) {
      const targetM = parseInt(gotoBtn.dataset.monthTarget, 10);
      if (Number.isInteger(targetM) && targetM >= 0 && targetM < 12) {
        setStudioMonth(targetM);
      }
    }
    // Rotation option picker buttons in rail
    const rotBtn = e.target.closest("[data-studio-rot-id]");
    if (rotBtn) {
      const id = rotBtn.dataset.studioRotId;
      if (id && typeof onRotationSelect === "function") {
        onRotationSelect(id);
      }
    }
    if (e.target.closest("button, input, select, label, .studio-ctrl-btn, .studio-view-btn")) {
      if (!e.target.closest("[data-studio-ctrl='reset']")) {
        stopIntroAnimation(true);
      }
    }
  });
}

/* ------------------------------------------------------------- STUDIO5A APIs */

export function setSoilOverrides(overrides) {
  soilOverrides = overrides ? { ...overrides } : null;
  sideTextureCache.clear();
  if (containerEl && currentData) {
    updateSoilDetails(buildCalloutData({ data: currentData, monthIdx: currentMonthIdx, soilOverrides, waterTable: waterTableData || null, t }));
    buildFieldBlock(currentData, currentCutaway).then(() => {
      updateProbeCard();
      requestRender();
    });
  }
}

export function setPlantingLayout(layout) {
  plantingLayout = layout || "rows";
  if (containerEl && currentData) {
    buildFieldBlock(currentData, currentCutaway).then(() => {
      buildPlantsAndRoots(currentData, currentMonthIdx);
      requestRender();
    });
  }
}

export function setSurfaceMode(mode) {
  const next = mode || "crops";
  const prevMode = currentSurface?.mode || currentSurfaceMode;
  const sameTarget = next === currentSurfaceMode && !!currentSurface;
  currentSurfaceMode = next;
  currentLayer = currentSurfaceMode;
  if (containerEl) {
    const select = containerEl.querySelector("#select-surface-mode");
    if (select && select.value !== currentSurfaceMode) select.value = currentSurfaceMode;
    containerEl.querySelectorAll('input[name="studio-layer"]').forEach((r) => {
      r.checked = r.value === currentSurfaceMode;
    });
    const illustrative = containerEl.querySelector(".studio-illustrative-note");
    if (illustrative) {
      illustrative.textContent = currentSurfaceMode === "crops" ? t("Illustrative crops · not observed", "কাল্পনিক ফসল · সরাসরি দেখা নয়") : "";
    }
    // Re-selecting the active target is a no-op (an in-flight switch already owns it).
    if (currentData && !sameTarget) {
      switchSurfaceMode(prevMode);
    }
  }
}

function togglePlay() {
  isPlaying = !isPlaying;
  const playBtn = containerEl?.querySelector("[data-studio-action='toggle-play']");
  if (playBtn) {
    playBtn.textContent = isPlaying ? "⏸" : "▶";
    playBtn.setAttribute("aria-label", isPlaying ? t("Pause", "থামান") : t("Play", "চালান"));
  }

  if (isPlaying) {
    if (prefersReducedMotion) {
      isPlaying = false;
      if (playBtn) playBtn.textContent = "▶";
      return;
    }
    if (currentMonthIdx >= 11) currentMonthIdx = 0;
    playTimer = setInterval(() => {
      if (currentMonthIdx >= 11) {
        clearInterval(playTimer);
        isPlaying = false;
        if (playBtn) playBtn.textContent = "▶";
        return;
      }
      setStudioMonth(currentMonthIdx + 1);
    }, 1500);
  } else if (playTimer) clearInterval(playTimer);
}

function setupVisibilityObserver(container) {
  if (intersectionObserver) intersectionObserver.disconnect();
  document.removeEventListener("visibilitychange", onVisibilityChange);
  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = entry.isIntersecting && !document.hidden;
        if (isVisible) {
          idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
          startAnimation();
          requestRender();
        } else {
          stopAnimation();
        }
      },
      { threshold: 0.1 },
    );
    intersectionObserver.observe(container);
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
}

function onVisibilityChange() {
  isVisible = !document.hidden;
  if (isVisible) {
    idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
    startAnimation();
    requestRender();
  } else {
    stopIntroAnimation(true);
    stopAnimation();
  }
}

export function disposeStudio3d() {
  isDisposed = true;
  stopIntroAnimation(true);
  stopAnimation();
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);
  stageOverlayCleanup?.();
  stageOverlayCleanup = null;
  overlayEvents?.abort();
  overlayEvents = null;
  openSoilBand = null;
  popoverTrigger = null;
  unbindIdleListeners();
  idleHasOffset = false;
  idleBasePos = null;
  surfaceSwitchToken++;
  legendSwitchToken++;
  cancelSurfaceFade();

  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of materials) m.dispose();
      }
    });
  }

  textureCache.forEach((tex) => tex.dispose());
  textureCache.clear();
  sideTextureCache.forEach((tex) => tex.dispose());
  sideTextureCache.clear();
  skyTextureCache.forEach((tex) => tex.dispose());
  skyTextureCache.clear();
  groundTextureCache.forEach((tex) => tex.dispose());
  groundTextureCache.clear();
  shadowTextureCache.forEach((tex) => tex.dispose());
  shadowTextureCache.clear();

  if (controls) {
    controls.dispose();
    controls = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
  canvas = null;
  touchSplitEnabled = false;
  isFullscreenStage = false;
  touchGesture = null;
  if (touchHintTimer) clearTimeout(touchHintTimer);
  touchHintTimer = null;
  scene = null;
  containerEl = null;
  canvasHostEl = null;
  currentData = null;
  currentSurface = null;
  elevationSampler = null;
  plantShaders = [];
  blockGroup = null;
  plantsGroup = null;
  rootsGroup = null;
  surroundingsGroup = null;
  shadowPlane = null;
  floatGroup = null;
  isDragging = false;
}

// Leaving Slice view (or Reset) must close the cut and hide the depth ruler (owner bug, 11 Nov).
async function resetSliceToFull() {
  if (!containerEl) return;
  currentCutaway = 0;
  const cut = containerEl.querySelector("#studio-cutaway-slider");
  if (cut) cut.value = "0";
  const deck = containerEl.querySelector("#slider-slice");
  if (deck) deck.value = "0";
  const lbl = containerEl.querySelector("#lbl-slice-pct");
  if (lbl) lbl.textContent = "100%";
  updateDepthTicks();
  if (currentData) {
    await buildFieldBlock(currentData, 0);
    buildPlantsAndRoots(currentData, currentMonthIdx);
  }
  requestRender();
}
