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
import { t, truth, esc, num } from "./ui.js";
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
} from "./studio3d-helpers.js";

export {
  nearestObservation,
  monthChipText,
  plantPositionsInPolygon,
  outlineBounds,
  clipRing,
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
let showSurroundings = true;
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

function stageColor(cropId, stage) {
  if (stage === "fallow") return "#8f7352";
  if (stage === "harvest") return cropId === "potato" ? "#b89a66" : "#c8b273";
  if (stage === "mature") {
    if (cropId === "mustard") return "#e8c93a";
    if (cropId === "potato") return "#6f8f3d";
    return "#cfa44e";
  }
  if (stage === "establish") return "#a8d47a";
  if (cropId === "potato") return "#4f8f3a";
  if (cropId === "mustard") return "#9fc24b";
  if (cropId === "mungbean") return "#5fa044";
  return "#4f9a3d";
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
  if (!elevationSampler) return () => 0;
  const base = elevationSampler(lon, lat);
  if (!Number.isFinite(base)) return () => 0;
  const scaleX = 111195.08 * Math.cos((lat * Math.PI) / 180);
  return (x, z) => {
    // Studio world: x east, z south. Local outline y is north, so z = -y.
    const el = elevationSampler(lon + x / scaleX, lat + -z / 111195.08);
    return Number.isFinite(el) ? (el - base) * heightExaggeration : 0;
  };
}

/* -------------------------------------------------------- surface texture */

function nearestForMonth(list, monthIdx) {
  const month = currentData?.months?.[monthIdx];
  const year = Number(month?.month?.slice(0, 4)) || 2024;
  return nearestObservation(list || [], monthIdx, year);
}

async function buildTopTexture(data, layer, monthIdx) {
  const month = data.months?.[monthIdx];
  const cacheKey = `${data.field.id}-${data.rotation?.id || "field"}-${layer}-${monthIdx}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");

  if (layer === "photo") {
    let img = null;
    for (const name of [`/assets/satellite-${data.field.id}.jpg`, `/assets/sentinel-${data.field.id}.jpg`]) {
      try {
        img = await loadImageElement(name);
        break;
      } catch (err) {
        /* try the next local image */
      }
    }
    if (img) {
      drawImageCover(ctx, img, 512, 512);
      // Keep the selected polygon legible over the older photo.
      ctx.fillStyle = "rgba(62, 82, 43, 0.10)";
      ctx.fillRect(0, 0, 512, 512);
    } else {
      ctx.fillStyle = "#5c6b48";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#4a5839";
      for (let i = 0; i < 40; i++) ctx.fillRect((i * 37) % 512, (i * 59) % 512, 40, 20);
    }
  } else if (layer === "ndvi") {
    const near = nearestForMonth(data.vegetation || [], monthIdx);
    const v = near?.observation?.ndvi ?? 0.5;
    const col =
      v > 0.6 ? "#006837" : v > 0.4 ? "#66bd63" : v > 0.2 ? "#d9ef8b" : v > 0 ? "#fee08b" : v > -0.5 ? "#a50026" : "#313695";
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }
  } else if (layer === "moisture") {
    const near = nearestForMonth(data.moisture || [], monthIdx);
    const v = near?.observation?.ndmi ?? 0.1;
    const col = v > 0.3 ? "#2c7bb6" : v > 0.1 ? "#abd9e9" : v > -0.1 ? "#ffffbf" : "#fdae61";
    ctx.fillStyle = col;
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }
  } else if (month?.stage === "fallow" || !month?.cropId) {
    // Fallow ground: bare tilled soil with visible furrows.
    ctx.fillStyle = "#8a6c4b";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(55,36,22,0.45)";
    ctx.lineWidth = 4;
    for (let y = 16; y < 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
  } else {
    // Crop-season ground: a dark version of the crop colour, so clumps read as
    // a canopy instead of green dots floating on bare soil.
    ctx.fillStyle = stageColor(month.cropId, month.stage);
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = "rgba(24,35,18,0.34)";
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = "rgba(28,42,22,0.45)";
    ctx.lineWidth = 5;
    for (let y = 16; y < 512; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(160,185,110,0.12)";
    ctx.lineWidth = 2;
    for (let y = 22; y < 512; y += 30) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(cvs);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  textureCache.set(cacheKey, texture);
  return texture;
}

/* -------------------------------------------------------- soil side bands */

function buildSideTexture(data) {
  const key = `${data.field.id}-soil`;
  if (sideTextureCache.has(key)) return sideTextureCache.get(key);

  const cvs = document.createElement("canvas");
  cvs.width = 128;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");
  const layers = data.soil?.layers || [];

  if (layers.length === 0) {
    ctx.fillStyle = "#6e5944";
    ctx.fillRect(0, 0, 128, 512);
  } else {
    const lastCm = layers[layers.length - 1].bottomCm || 100;
    const total = Math.max(100, lastCm);
    for (const layer of layers) {
      const y0 = (layer.topCm / total) * 512;
      const y1 = (layer.bottomCm / total) * 512;
      ctx.fillStyle = soilBandColor(layer);
      ctx.fillRect(0, y0, 128, Math.max(1, y1 - y0));
      // A bright then dark separator makes each horizon legible at plot scale.
      ctx.fillStyle = "rgba(246,232,204,0.42)";
      ctx.fillRect(0, y1 - 3, 128, 2);
      ctx.fillStyle = "rgba(18,12,8,0.62)";
      ctx.fillRect(0, y1 - 1, 128, 4);
    }
    // Fine grain and small root/stone flecks keep the wall from looking flat.
    ctx.fillStyle = "rgba(20,15,10,0.08)";
    for (let y = 2; y < 512; y += 6) ctx.fillRect(0, y, 128, 1);
    ctx.fillStyle = "rgba(232,213,183,0.22)";
    for (let i = 0; i < 90; i++) {
      const x = (i * 37) % 128;
      const y = (i * 83) % 512;
      ctx.fillRect(x, y, 1 + (i % 3), 1);
    }
  }

  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(2, 1);
  tex.anisotropy = 4;
  sideTextureCache.set(key, tex);
  return tex;
}

/* ---------------------------------------------------------- block geometry */

function blockDepthM(bounds) {
  // ~1/6 of the plot width, with a floor so tiny plots still read as a block.
  return Math.max(1.5, Math.max(bounds.width, bounds.height) / 6);
}

function disposeGroup(group) {
  if (!group) return;
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) m.dispose();
    }
  });
  if (group.parent) group.parent.remove(group);
}

function buildSurfaceGeometry(ringM, heightAt, bounds) {
  const ring = ringM.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(ring, []);
  const positions = [];
  const uvs = [];
  const elevations = [];
  const n = isSoftwareRenderer ? 14 : 28;
  const width = Math.max(1e-6, bounds.width);
  const depth = Math.max(1e-6, bounds.height);

  const pushPoint = (p) => {
    const x = p.x;
    const z = -p.y;
    const h = heightAt(x, z);
    positions.push(x, h, z);
    uvs.push((x - bounds.minX) / width, (-z - bounds.minY) / depth);
    elevations.push(h / Math.max(0.01, heightExaggeration));
  };

  for (const ids of triangles) {
    const [a, b, c] = ids.map((i) => ring[i]);
    if (!a || !b || !c) continue;
    const point = (i, j) =>
      new THREE.Vector2(
        a.x + ((b.x - a.x) * i) / n + ((c.x - a.x) * j) / n,
        a.y + ((b.y - a.y) * i) / n + ((c.y - a.y) * j) / n,
      );
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        pushPoint(point(i, j));
        pushPoint(point(i + 1, j));
        pushPoint(point(i, j + 1));
        if (i + j < n - 1) {
          pushPoint(point(i + 1, j));
          pushPoint(point(i + 1, j + 1));
          pushPoint(point(i, j + 1));
        }
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setAttribute("aElevation", new THREE.Float32BufferAttribute(elevations, 1));

  if (currentLayer === "elevation") {
    const heights = elevations;
    const min = Math.min(...heights);
    const max = Math.max(...heights);
    const colors = [];
    const lo = new THREE.Color("#28758b");
    const mid = new THREE.Color("#aecf9e");
    const hi = new THREE.Color("#c3995e");
    for (const h of heights) {
      const a = max > min ? (h - min) / (max - min) : 0.5;
      const c = a < 0.5 ? lo.clone().lerp(mid, a * 2) : mid.clone().lerp(hi, (a - 0.5) * 2);
      colors.push(c.r, c.g, c.b);
    }
    geom.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }

  geom.computeVertexNormals();
  return geom;
}

function buildWallMesh(ringM, heightAt, bottomY, sideMaterial) {
  const positions = [];
  const uvs = [];
  const indices = [];
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
      const top0 = heightAt(x0, z0) - 0.03;
      const top1 = heightAt(x1, z1) - 0.03;
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
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildBoundaryLine(ringM, heightAt) {
  const points = ringM.map(([x, y]) => new THREE.Vector3(x, heightAt(x, -y) + 0.09, -y));
  if (points.length) points.push(points[0].clone());
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0xd8f0a6, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geom, mat);
  line.userData.boundary = points.map((p) => [p.x, p.y, p.z]);
  return line;
}

function makeElevationMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
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
         float d=abs(fract(vElev/0.5-0.5)-0.5);
         float edge=max(fwidth(vElev/0.5),0.006);
         diffuseColor.rgb*=1.0-(1.0-smoothstep(0.0,edge,d))*0.35*uContours;`,
      );
    mat.userData.shader = shader;
  };
  return mat;
}

async function buildFieldBlock(data, cutawayFraction) {
  const token = ++buildToken;
  disposeGroup(blockGroup);
  blockGroup = null;

  const outlineM = data.field.outlineM;
  if (!outlineM || outlineM.length < 3) return;
  const bounds = outlineBounds(outlineM);
  const depth = blockDepthM(bounds);
  const effectiveMaxX = bounds.maxX - cutawayFraction * Math.max(1e-6, bounds.maxX - bounds.minX);
  const ringM = cutawayFraction > 0.001 ? clipRing(outlineM, effectiveMaxX) : outlineM.map((p) => [p[0], p[1]]);
  if (ringM.length < 3) return;

  const heightAt = makeHeightAt(data);
  const topTex = currentLayer === "elevation" ? null : await buildTopTexture(data, currentLayer, currentMonthIdx);
  if (token !== buildToken) return; // a newer slider/layer rebuild won

  const topMat =
    currentLayer === "elevation"
      ? makeElevationMaterial()
      : new THREE.MeshStandardMaterial({
          map: topTex,
          roughness: 0.93,
          metalness: 0.01,
          side: THREE.DoubleSide,
        });
  const sideTex = buildSideTexture(data);
  const sideMat = new THREE.MeshStandardMaterial({
    map: sideTex,
    // The cut faces sit away from the sun; a small self-lit contribution keeps
    // the horizon bands readable without flattening the top surface.
    emissive: 0xffffff,
    emissiveMap: sideTex,
    emissiveIntensity: 0.42,
    roughness: 0.97,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const topGeom = buildSurfaceGeometry(ringM, heightAt, bounds);
  const topMesh = new THREE.Mesh(topGeom, topMat);
  topMesh.userData.terrain = true;
  topMesh.userData.contours = currentLayer === "elevation";
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

  const wallMesh = buildWallMesh(ringM, heightAt, bottomY, sideMat);
  const boundary = buildBoundaryLine(ringM, heightAt);

  blockGroup = new THREE.Group();
  blockGroup.add(topMesh, wallMesh, boundary);
  scene.add(blockGroup);

  currentBlock.depth = depth;
  currentBlock.bottomY = bottomY;
  currentBlock.topMin = topMin;
  currentBlock.topMax = topMax;
  currentBlock.effectiveMaxX = effectiveMaxX;
  currentBlock.bounds = bounds;
  currentBlock.ring = ringM.map(([x, y]) => [x, -y]);

  if (scene) {
    scene.userData.fieldMode = true;
    scene.userData.shadow = { ring: currentBlock.ring, y: bottomY - 0.02 };
    scene.userData.version = (scene.userData.version || 0) + 1;
  }
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
function buildClumpGeometry(cropId, heightM, spreadM) {
  const h = Math.max(0.06, heightM);
  // Clumps are a little wider than the grid gap so the canopy closes over the
  // soil, while their centres remain inset inside the field boundary.
  const r = Math.max(0.08, spreadM * 0.46);

  if (cropId === "aman" || cropId === "boro") {
    // Rice: five crossed, tapered blades give a tuft silhouette.
    const parts = [];
    for (let k = 0; k < 5; k++) {
      const angle = (k / 5) * Math.PI * 2;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const w = r * 0.19;
      const lean = r * 0.5;
      const g = new THREE.BufferGeometry();
      const verts = [
        -w * c, 0, -w * s,
        w * c, 0, w * s,
        lean * c, h, lean * s,
      ];
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.computeVertexNormals();
      parts.push(g);
    }
    const base = new THREE.ConeGeometry(r * 0.22, h * 0.7, 3);
    base.translate(0, h * 0.35, 0);
    parts.push(base);
    return mergeClumpParts(parts);
  }

  if (cropId === "mustard") {
    const stem = new THREE.ConeGeometry(r * 0.16, h * 0.9, 4);
    stem.translate(0, h * 0.45, 0);
    const bloom = new THREE.IcosahedronGeometry(r * 0.66, 0);
    bloom.scale(1, 0.55, 1);
    bloom.translate(0, h * 0.92, 0);
    return mergeClumpParts([stem, bloom]);
  }

  if (cropId === "potato" || cropId === "mungbean") {
    // Leafy mound built from two overlapping low-poly lobes.
    const a = new THREE.IcosahedronGeometry(r * 0.78, 0);
    a.scale(1, 0.55, 1);
    a.translate(0, h * 0.42, 0);
    const b = new THREE.IcosahedronGeometry(r * 0.52, 0);
    b.scale(1, 0.6, 1);
    b.translate(r * 0.28, h * 0.55, -r * 0.18);
    return mergeClumpParts([a, b]);
  }

  const g = new THREE.ConeGeometry(r * 0.4, h, 5);
  g.translate(0, h / 2, 0);
  return g;
}

function deterministic(i, seed) {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function cropSpacing(cropId) {
  if (cropId === "mustard") return { row: 0.34, plant: 0.22 };
  if (cropId === "boro" || cropId === "aman") return { row: 0.38, plant: 0.25 };
  if (cropId === "potato") return { row: 0.52, plant: 0.36 };
  if (cropId === "mungbean") return { row: 0.38, plant: 0.26 };
  return { row: 0.42, plant: 0.28 };
}

function buildPlantsAndRoots(data, monthIdx) {
  disposeGroup(plantsGroup);
  plantsGroup = null;
  disposeGroup(rootsGroup);
  rootsGroup = null;
  plantShaders = [];

  const month = data.months?.[monthIdx];
  if (!month || month.stage === "fallow" || !month.cropId) return;
  if (currentLayer !== "crops") return;

  const outlineM = data.field.outlineM;
  const bounds = currentBlock.bounds || outlineBounds(outlineM);
  const heightAt = makeHeightAt(data);
  const maxPlants = isPhone() || (navigator.deviceMemory || 4) <= 4 ? 4000 : 18000;
  const step = cropSpacing(month.cropId);
  const rowsAlongX = bounds.width >= bounds.height;
  let rowSpacing = rowsAlongX ? step.row : step.plant;
  let plantSpacing = rowsAlongX ? step.plant : step.row;

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

  let h = Math.max(0.06, (month.canopyHeightM || 0.35) * (month.stageFraction || 0.5));
  if (month.stage === "harvest") h = Math.min(h, 0.16);

  const geom = buildClumpGeometry(month.cropId, h, Math.max(rowSpacing, plantSpacing));
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
  const base = new THREE.Color(stageColor(month.cropId, month.stage));
  const colour = new THREE.Color();

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
    dummy.scale.set(jitter, 0.9 + deterministic(i, 5) * 0.24, jitter);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    colour.copy(base).multiplyScalar(0.82 + deterministic(i, 6) * 0.32);
    mesh.setColorAt(i, colour);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  plantsGroup = new THREE.Group();
  plantsGroup.add(mesh);
  plantsGroup.userData.plants = {
    positions: positions.map(([x, y]) => [x, heightAt(x, -y) + 0.02, -y]),
    height: h,
    color: stageColor(month.cropId, month.stage),
    flower: month.cropId === "mustard" && month.stage !== "harvest" ? "#e8c93a" : null,
  };
  scene.add(plantsGroup);

  if (currentCutaway > 0.04 && month.rootDepthM) {
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
  scene.add(rootsGroup);
}

/* --------------------------------------------------- surroundings/shadow */

function buildShadowTexture() {
  if (shadowTextureCache.has("shadow")) return shadowTextureCache.get("shadow");
  const cvs = document.createElement("canvas");
  cvs.width = 256;
  cvs.height = 256;
  const ctx = cvs.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 128);
  grad.addColorStop(0, "rgba(35,45,30,0.38)");
  grad.addColorStop(0.55, "rgba(35,45,30,0.18)");
  grad.addColorStop(1, "rgba(35,45,30,0)");
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

  const sgeom = new THREE.PlaneGeometry(radius * 2.1, radius * 2.1);
  sgeom.rotateX(-Math.PI / 2);
  const smat = new THREE.MeshBasicMaterial({
    map: buildShadowTexture(),
    transparent: true,
    depthWrite: false,
    opacity: 0.9,
  });
  shadowPlane = new THREE.Mesh(sgeom, smat);
  shadowPlane.position.set(bounds.cx, bottomY - 0.035, -bounds.cy);
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
      const v = new THREE.Vector3(x, y, z).applyMatrix4(matrix);
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
      if (!mesh.visible || !(mesh.userData.terrain || mesh.userData.soil || mesh.userData.ground)) return;
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
        ctx.fillStyle = `#${col.getHexString()}`;
        path(v);
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }

      if (elevation && mesh.userData.contours) {
        const min = Math.min(...ids.map((i) => elevation.getX(i)));
        const max = Math.max(...ids.map((i) => elevation.getX(i)));
        for (let level = Math.ceil(min / 0.5) * 0.5; level < max; level += 0.5) {
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

/* --------------------------------------------------------------- three init */

function createScene() {
  scene = new THREE.Scene();
  scene.background = buildSkyTexture();

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
}

function initThree(host) {
  const width = Math.max(1, host.clientWidth || 600);
  const height = Math.max(1, host.clientHeight || 450);
  isSoftwareRenderer = !hasWebGL();

  if (!renderer) {
    if (!isSoftwareRenderer) {
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone() ? 1.5 : 2));
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

function hostAspect() {
  if (!canvasHostEl) return 1.5;
  const w = canvasHostEl.clientWidth || 600;
  const h = canvasHostEl.clientHeight || 400;
  return Math.max(0.35, w / Math.max(1, h));
}

function fitPerspective(data, close = false) {
  if (!cameraPersp || !data) return;
  const b = outlineBounds(data.field.outlineM);
  const depth = currentBlock.depth || blockDepthM(b);
  const margin = isPhone() ? 0.18 : 0.12;
  const fit = fitCameraToBlock({
    outlineM: data.field.outlineM,
    depthM: depth,
    fovDeg: cameraPersp.fov,
    aspect: hostAspect(),
    elevationDeg: close ? 22 : 35,
    yawDeg: close ? 26 : 18,
    margin: close ? 0.14 : margin,
  });

  const distance = close ? fit.distance * 0.72 : fit.distance;
  const el = ((close ? 22 : 35) * Math.PI) / 180;
  const yaw = ((close ? 26 : 18) * Math.PI) / 180;
  const target = [fit.target[0], -depth / 2, fit.target[2]];
  cameraPersp.position.set(
    target[0] + Math.cos(el) * Math.sin(yaw) * distance,
    target[1] + Math.sin(el) * distance,
    target[2] + Math.cos(el) * Math.cos(yaw) * distance,
  );
  cameraPersp.near = Math.max(0.05, distance * 0.02);
  cameraPersp.far = Math.max(200, distance * 8);
  cameraPersp.updateProjectionMatrix();

  controls.target.set(target[0], target[1], target[2]);
  controls.minDistance = close ? Math.max(2, fit.distance * 0.18) : Math.max(3, fit.distance * 0.62);
  controls.maxDistance = fit.distance * 2.8;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.update();
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
  cameraOrtho.near = 0.1;
  cameraOrtho.far = 600;
  cameraOrtho.updateProjectionMatrix();

  controls.target.set(fit.target[0], 0, fit.target[2]);
  controls.minZoom = 0.55;
  controls.maxZoom = 8;
  controls.enableRotate = false;
  controls.update();
}

function fitCameras(data) {
  if (!data) return;
  if (isTopView) fitOrtho(data);
  else {
    fillPerspectiveAspect();
    fitPerspective(data, isCloseView);
  }
}

function fillPerspectiveAspect() {
  if (!cameraPersp) return;
  cameraPersp.aspect = hostAspect();
  cameraPersp.updateProjectionMatrix();
}

function onResize() {
  if (!renderer || !canvasHostEl) return;
  const w = Math.max(1, canvasHostEl.clientWidth || 600);
  const h = Math.max(1, canvasHostEl.clientHeight || 400);
  renderer.setSize(w, h);
  if (cameraPersp) {
    cameraPersp.aspect = Math.max(0.35, w / Math.max(1, h));
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
      }
    });
  }
}

function startAnimation() {
  const wind = !isSoftwareRenderer && !prefersReducedMotion && !!plantsGroup;
  if (!wind) {
    stopAnimation();
    requestRender();
    return;
  }
  if (animFrameId) return;
  const loop = (time) => {
    animFrameId = requestAnimationFrame(loop);
    if (!renderer || !scene || !activeCamera || !isVisible) return;
    for (const shader of plantShaders) {
      if (shader?.uniforms?.uTime) shader.uniforms.uTime.value = time / 1000;
    }
    controls?.update();
    renderer.render(scene, activeCamera);
    updateCompass();
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

function depthTicksHtml() {
  const ticks = [0, 15, 30, 60, 100];
  return `<div class="studio-depth-ticks" aria-hidden="true">${ticks
    .map(
      (cm) =>
        `<span class="studio-depth-tick" data-depth-cm="${cm}" style="top:${cm}%"><i></i><b>${cm}</b><small>cm</small></span>`,
    )
    .join("")}</div>`;
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
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="crops" ${currentLayer === "crops" ? "checked" : ""}><span>${t("Crop season (3D Plants)", "মৌসুমি ফসল (৩ডি উদ্ভিদ)")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="photo" ${currentLayer === "photo" ? "checked" : ""}><span>${t("High-res photo (Esri / Sentinel)", "স্যাটেলাইট ছবি")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="ndvi" ${currentLayer === "ndvi" ? "checked" : ""}><span>${t("Greenness (NDVI grid)", "সবুজভাব (NDVI)")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="moisture" ${currentLayer === "moisture" ? "checked" : ""}><span>${t("Moisture (NDMI grid)", "আর্দ্রতা (NDMI)")}</span></label>
          <label class="studio-layer-radio-item"><input type="radio" name="studio-layer" value="elevation" ${currentLayer === "elevation" ? "checked" : ""}><span>${t("Elevation & contours", "উচ্চতা ও কনট্যুর")}</span></label>
        </div>
        <div class="studio-terrain-tools">
          <label for="studio-height-slider">${t("Height exaggeration", "উচ্চতা বাড়িয়ে দেখানো")} <output id="studio-height-output">${num(heightExaggeration, 1)}×</output></label>
          <input type="range" id="studio-height-slider" min="1" max="4" step="0.5" value="${heightExaggeration}">
          <small class="note">${t("30 m NASADEM, flat at plot scale", "৩০ মি নাসাডেম, জমির মাপে সমতল")}</small>
        </div>
        <div class="note studio-illustrative-note" style="margin-top:6px;font-size:11px;">
          ${currentLayer === "crops" ? t("Illustrative crops · not observed", "কাল্পনিক ফসল · সরাসরি দেখা নয়") : ""}
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
      <div class="studio-stage-canvas-host" tabindex="0" role="region" aria-label="${t("3D Field Studio Stage", "৩ডি মাঠ স্টুডিও মঞ্চ")}">
        <button class="studio-compass" title="${t("Click to face North", "উত্তরমুখী হতে চাপুন")}" aria-label="${t("North Arrow", "উত্তর নির্দেশক")}">
          <div class="studio-compass-arrow"></div>
          <div class="studio-compass-s"></div>
        </button>

        <div class="studio-overlay-tl">
          <div class="studio-view-toggle">
            <button class="studio-view-btn ${!isTopView && !isCloseView ? "active" : ""}" data-studio-view="3d">${t("3D View", "৩ডি দৃশ্য")}</button>
            <button class="studio-view-btn ${isCloseView ? "active" : ""}" data-studio-view="close">${t("Close-up", "কাছের দৃশ্য")}</button>
            <button class="studio-view-btn ${isTopView ? "active" : ""}" data-studio-view="top">${t("Top View", "উপরের দৃশ্য")}</button>
          </div>
          <label class="studio-surround-bar">
            <input type="checkbox" id="studio-surroundings-chk" ${showSurroundings ? "checked" : ""}>
            <span>${t("Surroundings", "আশেপাশের জমি")}</span>
          </label>
        </div>

        <div class="studio-stage-controls">
          <button class="studio-ctrl-btn" data-studio-ctrl="zoom-in" title="${t("Zoom In", "কাছে আনুন")}" aria-label="${t("Zoom In", "কাছে আনুন")}">+</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="zoom-out" title="${t("Zoom Out", "দূরে নিন")}" aria-label="${t("Zoom Out", "দূরে নিন")}">−</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="reset" title="${t("Reset Camera", "ক্যামেরা রিসেট")}" aria-label="${t("Reset Camera", "ক্যামেরা রিসেট")}">↺</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="fullscreen" title="${t("Toggle Fullscreen", "ফুলস্ক্রিন")}" aria-label="${t("Toggle Fullscreen", "ফুলস্ক্রিন")}">⛶</button>
        </div>

        ${depthTicksHtml()}

        <div class="studio-cutaway-bar">
          <label for="studio-cutaway-slider">${t("Soil cutaway", "মাটির স্তর খণ্ড")}</label>
          <input type="range" id="studio-cutaway-slider" min="0" max="0.8" step="0.05" value="${currentCutaway}">
          <small class="studio-cutaway-note">${t("Soil depth exaggerated", "মাটির গভীরতা বড় করে দেখানো")}</small>
        </div>
      </div>

      <div class="studio-sr-only" aria-live="polite" id="studio-sr-summary">${esc(srSummary)}</div>

      <div class="studio-calendar-bar">
        <button class="studio-play-btn" data-studio-action="toggle-play" aria-label="${isPlaying ? t("Pause", "থামান") : t("Play", "চালান")}">
          ${isPlaying ? "⏸" : "▶"}
        </button>
        <div class="studio-month-slider-wrap">
          <input type="range" id="studio-month-slider" min="0" max="11" step="1" value="${currentMonthIdx}" aria-label="${t("Month selection", "মাস নির্বাচন")}">
          <div class="studio-month-slider-labels">
            <span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span>
          </div>
        </div>
        <div class="studio-month-current-pill" data-chip-en="${esc(chipTextEn)}" data-chip-bn="${esc(chipTextBn)}">
          ${esc(t(chipTextEn, chipTextBn))}
        </div>
      </div>
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

  const host = container.querySelector(".studio-stage-canvas-host");
  if (!host) return;
  canvasHostEl = host;

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
  } catch (err) {
    console.error("Studio3D initialization error:", err);
    showFallbackMessage(t("Failed to initialize 3D Studio.", "৩ডি স্টুডিও চালু করা যায়নি।"));
  }
}

export async function setStudioMonth(monthIdx) {
  currentMonthIdx = monthIdx;
  if (!currentData) return;

  buildPlantsAndRoots(currentData, currentMonthIdx);
  if (currentLayer !== "crops") await buildFieldBlock(currentData, currentCutaway);

  const m = currentData.months[currentMonthIdx];
  if (!m) return;

  const pill = containerEl?.querySelector(".studio-month-current-pill");
  if (pill) {
    const en = monthChipText(m, "en");
    const bn = monthChipText(m, "bn");
    pill.dataset.chipEn = en;
    pill.dataset.chipBn = bn;
    pill.textContent = t(en, bn);
  }

  const slider = containerEl?.querySelector("#studio-month-slider");
  if (slider && +slider.value !== monthIdx) slider.value = monthIdx;

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

  requestRender();
  startAnimation();
}

function bindEvents(container) {
  container.querySelectorAll('input[name="studio-layer"]').forEach((radio) => {
    radio.onchange = async (e) => {
      currentLayer = e.target.value;
      const illustrative = container.querySelector(".studio-illustrative-note");
      if (illustrative) {
        illustrative.textContent =
          currentLayer === "crops" ? t("Illustrative crops · not observed", "কাল্পনিক ফসল · সরাসরি দেখা নয়") : "";
      }
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      requestRender();
      startAnimation();
    };
  });

  const cutawaySlider = container.querySelector("#studio-cutaway-slider");
  if (cutawaySlider) {
    cutawaySlider.oninput = async (e) => {
      currentCutaway = parseFloat(e.target.value);
      updateDepthTicks();
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      requestRender();
    };
  }

  const heightSlider = container.querySelector("#studio-height-slider");
  if (heightSlider) {
    heightSlider.oninput = async (e) => {
      heightExaggeration = parseFloat(e.target.value);
      const out = container.querySelector("#studio-height-output");
      if (out) out.textContent = `${num(heightExaggeration, 1)}×`;
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      await buildSurroundings(currentData);
      fitCameras(currentData);
      requestRender();
    };
  }

  const surroundChk = container.querySelector("#studio-surroundings-chk");
  if (surroundChk) {
    surroundChk.onchange = async (e) => {
      showSurroundings = e.target.checked;
      await buildSurroundings(currentData);
      requestRender();
    };
  }

  container.querySelectorAll("[data-studio-view]").forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.studioView;
      isTopView = mode === "top";
      isCloseView = mode === "close";
      container.querySelectorAll("[data-studio-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeCamera = isTopView ? cameraOrtho : cameraPersp;
      controls.object = activeCamera;
      controls.enableRotate = !isTopView;
      if (isTopView) fitOrtho(currentData);
      else {
        fillPerspectiveAspect();
        fitPerspective(currentData, isCloseView);
      }
      requestRender();
      startAnimation();
    };
  });

  container.querySelectorAll("[data-studio-ctrl]").forEach((btn) => {
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
        fitCameras(currentData);
      } else if (act === "fullscreen") {
        const stage = container.querySelector(".studio-stage-wrap");
        if (!document.fullscreenElement) stage?.requestFullscreen().catch(() => {});
        else document.exitFullscreen().catch(() => {});
      }
      requestRender();
    };
  });

  const compass = container.querySelector(".studio-compass");
  if (compass) {
    compass.onclick = () => {
      fitCameras(currentData);
      requestRender();
    };
  }

  const monthSlider = container.querySelector("#studio-month-slider");
  if (monthSlider) monthSlider.oninput = (e) => setStudioMonth(parseInt(e.target.value, 10));

  const playBtn = container.querySelector("[data-studio-action='toggle-play']");
  if (playBtn) playBtn.onclick = () => togglePlay();

  container.querySelectorAll("[data-studio-rot-id]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.studioRotId;
      if (!id || id === activeRotationId) return;
      if (typeof onRotationSelect === "function") onRotationSelect(id);
    };
  });

  const host = container.querySelector(".studio-stage-canvas-host");
  if (host) {
    host.onkeydown = (e) => {
      if (e.key === "ArrowLeft") {
        controls?.rotateLeft(0.08);
        requestRender();
        e.preventDefault();
      } else if (e.key === "ArrowRight") {
        controls?.rotateLeft(-0.08);
        requestRender();
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        controls?.rotateUp(0.08);
        requestRender();
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        controls?.rotateUp(-0.08);
        requestRender();
        e.preventDefault();
      } else if (e.key === "+" || e.key === "=") {
        const offset = cameraPersp.position.clone().sub(controls.target).multiplyScalar(0.9);
        cameraPersp.position.copy(controls.target).add(offset);
        requestRender();
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        const offset = cameraPersp.position.clone().sub(controls.target).multiplyScalar(1.1);
        cameraPersp.position.copy(controls.target).add(offset);
        requestRender();
        e.preventDefault();
      }
    };
    host.addEventListener("pointerenter", () => {
      host.classList.add("show-depth-ticks");
    });
    host.addEventListener("pointerleave", () => {
      host.classList.remove("show-depth-ticks");
    });
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
    startAnimation();
    requestRender();
  } else {
    stopAnimation();
  }
}

export function disposeStudio3d() {
  isDisposed = true;
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
  scene = null;
  containerEl = null;
  canvasHostEl = null;
  currentData = null;
  elevationSampler = null;
  plantShaders = [];
  blockGroup = null;
  plantsGroup = null;
  rootsGroup = null;
  surroundingsGroup = null;
  shadowPlane = null;
}
