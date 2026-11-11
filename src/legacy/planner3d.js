/**
 * Limited Planner renderer, forked from planner-3d-base:src/legacy/studio3d.js.
 * Keep the approved block, terrain, soil, crop geometry and floating motion
 * independent of the rotation studio.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildStudioData, FAO56_CROP_LIMITS } from "./studiodata.js";
import {
  outlineBounds, ringSignedArea, idleCameraSway,
  IDLE_RESUME_DELAY_S,
  fitTopView, plannerRowLayout,
  computeFieldFraming,
  computeFieldZones, buildZoneGeometry, pickDrainEdge, zonePopoverData,
  drainSurfacePolygons,
  fieldZoneClearance,
  plannerMeasurementAnchors, plannerSpacingAnchors,
  easeOutCubic, easeInOutCubic,
  zonePixelsPerMetre, clampZonePopover,
} from "./planner3d-helpers.js";
import { t, num } from "./ui.js";
import {
  introCameraParams,
  shouldSkipIntro,
  sampleRowCropScale,
} from "./studio3d-helpers.js";
import {
  computeMicroRelief,
  rimErosionNoise,
  generateUndersideGeometry,
} from "./landshape.js";

let renderer = null;
let canvas = null;
let scene = null;
let cameraPersp = null;
let cameraOrtho = null;
let activeCamera = null;
let controls = null;
let animFrameId = null;
let renderFrameId = null;
let currentData = null;
let canvasHostEl = null;
let isTopView = false;
let isVisible = true;
let inViewport = true;
let intersectionObserver = null;
let resizeObserver = null;
let motionQuery = null;
let elevationSampler = null;
let elevationKey = null;
let prefersReducedMotion = false;
let buildToken = 0;
let blockGroup = null;
let plantsGroup = null;
let shadowPlane = null;
let introAnim = null;
let transitionAnim = null;

// Field zones (bund / drain / path / other) drawn from the field's own widths.
let zonesGroup = null;
let zonePickMeshes = [];
let zoneKindMats = new Map();
let drainWaterMats = [];
let currentZoneModel = null;
let lastZoneKey = null;
let zonesFade = null;
let plantsPulse = null;
let selectedZoneKind = null;
let hoveredZoneKind = null;
let zonePopoverEl = null;
let zonePopoverAnchor = null;
let zoneLegendEl = null;
let zoneTapStart = null;
let lastZoneHoverMs = 0;

// Scale (dimension) annotations: screen-space SVG projected from 3D anchors.
let measurementsVisible = true;
let measurementAnchors = [];
let measurementLayoutCache = null;
let measurementSvgEl = null;

// Crop-specific botanical config for enhanced realism
const CROP_CONFIG = Object.freeze({
  rice: { family: 'grasses', leafCount: 8, panicleCount: { grow: 3, mature: 4 }, stemWidth: 0.035, leafWidth: 0.055, leafLean: 0.38, heightFactor: 0.82 },
  aman: { family: 'grasses', leafCount: 8, panicleCount: { grow: 3, mature: 4 }, stemWidth: 0.035, leafWidth: 0.055, leafLean: 0.38, heightFactor: 0.82 },
  boro: { family: 'grasses', leafCount: 8, panicleCount: { grow: 3, mature: 4 }, stemWidth: 0.035, leafWidth: 0.055, leafLean: 0.38, heightFactor: 0.82 },
  potato: { family: 'solanaceae', leafCount: 5, stemCount: 1, bushy: true, tuberShape: 'ridge', stemWidth: 0.06, leafSize: 0.36, heightFactor: 0.45 },
  mustard: { family: 'brassica', leafCount: 4, hasFlowers: true, flowerColor: '#e8c93a', stemWidth: 0.04, leafSize: 0.26, leafLean: 0.65, heightFactor: 0.92 },
  mungbean: { family: 'legume', leafCount: 3, leafletsPerLeaf: 3, trifoliate: true, stemWidth: 0.024, leafSize: 0.22, heightFactor: 0.45 },
  lentil: { family: 'legume', leafCount: 3, leafletsPerLeaf: 3, trifoliate: true, stemWidth: 0.024, leafSize: 0.22, heightFactor: 0.45 },
  wheat: { family: 'grasses', leafCount: 8, ear: true, stemWidth: 0.035, leafWidth: 0.08, leafLean: 0.5, heightFactor: 0.95 },
  maize: { family: 'grasses', leafCount: 6, ear: true, largeLeaves: true, stemWidth: 0.07, leafWidth: 0.22, leafLean: 0.5, heightFactor: 0.95 },
});

const currentBlock = {
  depth: 1.5, bottomY: -1.5, topMin: 0, topMax: 0, bounds: null,
};
const textureCache = new Map();
const sideTextureCache = new Map();
const skyTextureCache = new Map();
const shadowTextureCache = new Map();

function isPhone() {
  return typeof window !== "undefined" && window.innerWidth <= 600;
}

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

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image unavailable: ${url}`));
    img.src = url;
  });
}

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
  const fieldId = data?.field?.id || "planner";
  const outlineM = data?.field?.outlineM || [];
  const isLowGround = data?.ground?.class === "low";
  const scaleX = 111195.08 * Math.cos((lat * Math.PI) / 180);
  if (["aman", "boro", "rice"].includes(data.months[0]?.cropId)) return () => 0;
  const base = elevationSampler ? elevationSampler(lon, lat) : 0;
  const hasBase = Number.isFinite(base);

  return (x, z) => {
    // Studio world: x east, z south. Local outline y is north, so z = -y.
    let macro = 0;
    if (elevationSampler && hasBase) {
      const el = elevationSampler(lon + x / scaleX, lat + -z / 111195.08);
      if (Number.isFinite(el)) macro = el - base;
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

function buildTopTexture(data) {
  const month = data.months[0];
  const cacheKey = month.cropId;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");

  // Crop-season ground: tilled soil with a very light crop-tinted wash. A
  // desaturated base keeps the 3D clumps readable against the surface instead
  // of hiding them in a solid mat of the same green.
  ctx.fillStyle = "#493122";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16000; i++) {
    const x = deterministic(i, 11) * 512, y = deterministic(i, 12) * 512;
    ctx.fillStyle = i % 2 ? 'rgba(21,14,9,0.23)' : 'rgba(133,97,60,0.22)';
    ctx.fillRect(x, y, 1 + deterministic(i, 13) * 3, 1.5);
  }

  const texture = new THREE.CanvasTexture(cvs);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  textureCache.set(cacheKey, texture);
  return texture;
}

function buildSideTexture(data) {
  const key = `${data.field.id}-soil`;
  if (sideTextureCache.has(key)) return sideTextureCache.get(key);

  // Soil wall: a smooth vertical gradient from a dark organic topsoil to a
  // sandy tan at depth, with the soil-profile horizons folded in as subtle
  // colour shifts and faint non-straight strata — never the flat brown bands
  // the reference image calls out.
  const cvs = document.createElement("canvas");
  cvs.width = 1024;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");
  const layers = data.soil?.layers || [];
  const lastCm = Math.max(100, (layers.at?.(-1)?.bottomCm) || 100);

  const base = ctx.createLinearGradient(0, 0, 0, 512);
  base.addColorStop(0.0, "#2f2516");
  base.addColorStop(0.12, "#48341f");
  base.addColorStop(0.26, "#6b4d31");
  base.addColorStop(0.5, "#8d6c47");
  base.addColorStop(0.72, "#b08862");
  base.addColorStop(0.9, "#c7a278");
  base.addColorStop(1.0, "#d2b185");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);

  // Fold soil-profile horizons in as a very soft colour wash so the horizons
  // are suggested without the eye reading hard brown stripes.
  for (const layer of layers) {
    const y0 = (layer.topCm / lastCm) * 512;
    const y1 = (layer.bottomCm / lastCm) * 512;
    const h = Math.max(1, y1 - y0);
    const wash = ctx.createLinearGradient(0, y0, 0, y1);
    const col = soilBandColor(layer);
    wash.addColorStop(0, `${col}26`);
    wash.addColorStop(0.5, `${col}18`);
    wash.addColorStop(1, `${col}26`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, y0, 1024, h);
  }

  // Deterministic fine grain (dark and pale flecks) keeps the wall from reading
  // as a flat gradient at close range.
  let seed = 907;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 24000; i++) {
    const x = rnd() * 1024;
    const y = rnd() * 512;
    const r = rnd() * 1.5 + 0.3;
    ctx.fillStyle = rnd() > 0.55 ? "rgba(32,22,14,0.18)" : "rgba(238,218,186,0.14)";
    ctx.fillRect(x, y, r * 2, r);
  }

  // A handful of wavy strata, just a few pixels of contrast, so the wall feels
  // sedimentary without introducing the hard flat bands of the previous build.
  for (const seedY of [70, 148, 232, 318, 402]) {
    ctx.beginPath();
    for (let x = 0; x <= 1024; x += 8) {
      const y = seedY + Math.sin(x * 0.018 + seedY) * 4 + Math.sin(x * 0.049) * 1.8;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(38,24,14,0.18)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  // Scattered pale pebble flecks catch the eye at depth, implying coarser
  // material lower down.
  for (let i = 0; i < 180; i++) {
    ctx.fillStyle = "rgba(220,195,160,0.32)";
    ctx.beginPath();
    ctx.ellipse(rnd() * 1024, 100 + rnd() * 400, 1 + rnd() * 3.5, 1 + rnd() * 1.8, rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
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
    if (child.isInstancedMesh) child.dispose();
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of materials) m.dispose();
    }
  });
  if (group.parent) group.parent.remove(group);
}

function buildSurfaceGeometry(ringM, heightAt, bounds, drain = null) {
  const ring = ringM.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(ring, []).flatMap(ids => {
    const parts = drainSurfacePolygons(ids.map(i => ringM[i]), drain);
    return parts.flatMap(poly => poly.slice(1, -1).map((_, i) =>
      [poly[0], poly[i + 1], poly[i + 2]].map(([x, y]) => new THREE.Vector2(x, y))));
  });
  const positions = [];
  const uvs = [];
  const n = 28;
  const width = Math.max(1e-6, bounds.width);
  const depth = Math.max(1e-6, bounds.height);

  const pushPoint = (p) => {
    const x = p.x;
    const z = -p.y;
    const h = heightAt(x, z);
    positions.push(x, h, z);
    uvs.push((x - bounds.minX) / width, (-z - bounds.minY) / depth);
  };

  for (const [a, b, c] of triangles) {
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
  geom.computeVertexNormals();
  return geom;
}

function buildWallMesh(ringM, heightAt, bottomY, sideMaterial, fieldId = "planner") {
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

      // Eroded rim: deterministic subtle crumble/overhang and height variation along outline
      const noise0 = rimErosionNoise(fieldId, edge, t0);
      const noise1 = rimErosionNoise(fieldId, edge, t1);
      const top0 = heightAt(x0, z0) - 0.03 + noise0.dh;
      const top1 = heightAt(x1, z1) - 0.03 + noise1.dh;

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

function buildFieldBlock(data) {
  disposeGroup(blockGroup);
  blockGroup = null;

  const outlineM = data.field.outlineM;
  if (!outlineM || outlineM.length < 3) return;
  const bounds = outlineBounds(outlineM);
  const depth = blockDepthM(bounds);
  // Keep entered outline corners so the ground and zone offsets share one boundary.
  const ringM = outlineM;
  const heightAt = makeHeightAt(data);
  const topMat = new THREE.MeshStandardMaterial({
    map: buildTopTexture(data), roughness: 0.93, metalness: 0.01,
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

  const topGeom = buildSurfaceGeometry(ringM, heightAt, bounds, zoneModelFor(data).geom?.drain);
  const topMesh = new THREE.Mesh(topGeom, topMat);
  topMesh.userData.terrain = true;
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
  buildCropGround(data, heightAt, bounds, ringM);
  buildFieldZones(data, heightAt, ringM, bounds);
  if (undersideMesh) blockGroup.add(undersideMesh);
  ensureFloatGroup();
  floatGroup.add(blockGroup);

  currentBlock.depth = depth;
  currentBlock.bottomY = bottomY;
  currentBlock.topMin = topMin;
  currentBlock.topMax = topMax;
  currentBlock.bounds = bounds;
}

function buildWaterTexture() {
  if (textureCache.has('paddy-water')) return textureCache.get('paddy-water');
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 512;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#6aada4';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i++) {
    const x = deterministic(i, 21) * 512, y = deterministic(i, 22) * 512;
    ctx.strokeStyle = i % 3 ? 'rgba(209,235,220,0.22)' : 'rgba(32,91,82,0.12)';
    ctx.lineWidth = 0.6 + deterministic(i, 23);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 7, y - 2, x + 12 + deterministic(i, 24) * 14, y);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(cvs);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set('paddy-water', texture);
  return texture;
}

function buildCropGround(data, heightAt, bounds, ringM) {
  const cropId = data.months[0]?.cropId;
  const layout = plannerRowLayout(data.field.outlineM, data.planner.row, data.planner.spacing,
    data.planner.usable, zoneModelFor(data, heightAt).geom);
  if (['aman', 'boro', 'rice'].includes(cropId)) {
    const water = new THREE.Mesh(buildSurfaceGeometry(ringM, () => 0.035, bounds, zoneModelFor(data).geom?.drain),
      new THREE.MeshStandardMaterial({ map: buildWaterTexture(), roughness: 0.16, metalness: 0.12,
        transparent: true, opacity: 0.72, side: THREE.DoubleSide }));
    water.receiveShadow = true;
    blockGroup.add(water);
  } else if (cropId === 'potato') {
    const soil = new THREE.MeshStandardMaterial({ color: 0x59402c, roughness: 0.96 });
    const alongX = bounds.width >= bounds.height;
    const rowSpacing = alongX ? layout.spacingY : layout.spacingX;
    const plantSpacing = alongX ? layout.spacingX : layout.spacingY;
    // A short ridge per sampled position follows concave outlines without crossing missing rows.
    const geometry = new THREE.CylinderGeometry(rowSpacing * 0.22, rowSpacing * 0.22, plantSpacing * 0.98, 10);
    const ridges = new THREE.InstancedMesh(geometry, soil, layout.positions.length);
    const dummy = new THREE.Object3D();
    layout.positions.forEach(([x, y], i) => {
      dummy.rotation.set(alongX ? 0 : Math.PI / 2, 0, alongX ? Math.PI / 2 : 0);
      dummy.position.set(x, heightAt(x, -y) - rowSpacing * 0.07, -y);
      dummy.scale.setScalar(Math.min(1, fieldZoneClearance(x, y, zoneModelFor(data).geom, data.field.outlineM) /
        Math.max(0.01, Math.hypot(rowSpacing * 0.22, plantSpacing * 0.49))));
      dummy.updateMatrix();
      ridges.setMatrixAt(i, dummy.matrix);
    });
    ridges.castShadow = ridges.receiveShadow = true;
    blockGroup.add(ridges);
  }
}

/* ------------------------------------------------------- field zones */

// DEM-only vertex heights for drain placement: crop-independent (rice rendering
// flattens the surface, but the field's low edge does not move with the crop).
function drainHeightsDEM(data) {
  if (!elevationSampler) return null;
  const [lat, lon] = data?.field?.centroid || [0, 0];
  const outlineM = data?.field?.outlineM || [];
  if (outlineM.length < 3) return null;
  const scaleX = 111195.08 * Math.cos((lat * Math.PI) / 180);
  const base = elevationSampler(lon, lat);
  if (!Number.isFinite(base)) return null;
  const heights = outlineM.map(([x, y]) => {
    const el = elevationSampler(lon + x / scaleX, lat + y / 111195.08);
    return Number.isFinite(el) ? el - base : NaN;
  });
  if (heights.some((h) => !Number.isFinite(h))) return null;
  return heights;
}

function zoneModelFor(data, heightAt) {
  if (currentZoneModel && currentZoneModel.data === data) return currentZoneModel;
  const outlineM = data?.field?.outlineM || [];
  const inputs = data?.net?.inputs || {};
  let drainIndex = -1;
  if (outlineM.length >= 3) {
    const dem = drainHeightsDEM(data);
    const spread = dem ? Math.max(...dem) - Math.min(...dem) : 0;
    const pick = spread > 0.01 ? pickDrainEdge(outlineM, dem) : pickDrainEdge(outlineM, null);
    drainIndex = pick.index;
  }
  const grossM2 = data?.field?.areaHa > 0 ? data.field.areaHa * 10000 : undefined;
  // NETAREA1C: bund/drain draw at >= ~6 px at the default zoom (capped at x6),
  // like the studio; markers still label the real widths.
  const spanM = outlineM.length >= 3
    ? Math.max(outlineBounds(outlineM).width, outlineBounds(outlineM).height) : 0;
  const stageMinPx = Math.min(canvasHostEl?.clientWidth || 0, canvasHostEl?.clientHeight || 0);
  const pixelsPerMetre = zonePixelsPerMetre(stageMinPx, spanM);
  const zones = computeFieldZones(outlineM, inputs, { drainEdgeIndex: drainIndex, grossM2, pixelsPerMetre });
  const geom = buildZoneGeometry(outlineM, inputs, { drainEdgeIndex: drainIndex, display: true, pixelsPerMetre });
  currentZoneModel = { data, zones, geom, edited: !!data?.net?.edited, drainIndex };
  return currentZoneModel;
}

function zoneReadabilityNote() {
  const z = currentZoneModel?.zones;
  if (!z) return "";
  if (!((z.bund && z.bund.enlarged) || (z.drain && z.drain.enlarged))) return "";
  return t("Bund and drain drawn wider for readability; numbers use your real widths.",
    "দেখার সুবিধায় আল ও নালা চওড়া দেখানো হয়েছে; সংখ্যায় আপনার প্রকৃত প্রস্থ।");
}

function zoneCanvasTexture(key, draw) {
  if (textureCache.has(key)) return textureCache.get(key);
  const cvs = document.createElement("canvas");
  cvs.width = cvs.height = 256;
  draw(cvs.getContext("2d"));
  const tex = new THREE.CanvasTexture(cvs);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  textureCache.set(key, tex);
  return tex;
}

// Compacted bund soil: earthen ridge tone (studio NETAREA2B), with lengthwise striations.
function bundTexture() {
  return zoneCanvasTexture("zone-bund", (ctx) => {
    ctx.fillStyle = "#65503b";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const x = deterministic(i, 31) * 256, y = deterministic(i, 32) * 256;
      ctx.fillStyle = i % 3 ? "rgba(38,28,18,0.35)" : "rgba(178,144,100,0.3)";
      ctx.fillRect(x, y, 2 + deterministic(i, 33) * 6, 1.4);
    }
    ctx.strokeStyle = "rgba(48,36,24,0.4)";
    ctx.lineWidth = 1;
    for (let y = 8; y < 256; y += 14) {
      ctx.beginPath();
      ctx.moveTo(0, y + deterministic(y, 34) * 4);
      ctx.lineTo(256, y + deterministic(y, 35) * 4);
      ctx.stroke();
    }
  });
}

// Muddy drain bed with a wet sheen down the middle.
function drainBedTexture() {
  return zoneCanvasTexture("zone-drain-bed", (ctx) => {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, "#8a6f4d");
    grad.addColorStop(0.28, "#5c4735");
    grad.addColorStop(0.5, "#2e2115");
    grad.addColorStop(0.72, "#5c4735");
    grad.addColorStop(1, "#8a6f4d");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 700; i++) {
      const x = deterministic(i, 36) * 256, y = deterministic(i, 37) * 256;
      ctx.fillStyle = i % 2 ? "rgba(18,12,7,0.3)" : "rgba(160,130,95,0.2)";
      ctx.fillRect(x, y, 2, 1 + deterministic(i, 38) * 3);
    }
  });
}

// Drain water: deep teal that stays distinct from the pale flooded paddy,
// with paler flow streaks so the channel reads as water, not shadow.
function drainWaterTexture() {
  return zoneCanvasTexture("zone-drain-water", (ctx) => {
    ctx.fillStyle = "#2f5d66";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      const x = deterministic(i, 39) * 256, y = deterministic(i, 40) * 256;
      ctx.strokeStyle = i % 3 ? "rgba(205,232,228,0.4)" : "rgba(16,48,52,0.3)";
      ctx.lineWidth = 0.8 + deterministic(i, 41);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + 9, y - 2, x + 16 + deterministic(i, 42) * 18, y);
      ctx.stroke();
    }
  });
}

// Worn walking soil: lighter than the field, with footprint noise.
function pathTexture() {
  return zoneCanvasTexture("zone-path", (ctx) => {
    ctx.fillStyle = "#a38e75";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 500; i++) {
      const x = deterministic(i, 43) * 256, y = deterministic(i, 44) * 256;
      ctx.fillStyle = i % 2 ? "rgba(70,52,34,0.22)" : "rgba(230,214,184,0.25)";
      ctx.fillRect(x, y, 1 + deterministic(i, 45) * 3, 1.5);
    }
    for (let i = 0; i < 26; i++) {
      const x = 12 + deterministic(i, 46) * 232;
      const y = 12 + deterministic(i, 47) * 232;
      ctx.fillStyle = "rgba(74,56,36,0.5)";
      ctx.beginPath();
      ctx.ellipse(x, y, 4.5, 7, (deterministic(i, 48) - 0.5) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

// Other patch: grass with a hatched overlay so it reads as set aside.
function otherTexture() {
  return zoneCanvasTexture("zone-other", (ctx) => {
    ctx.fillStyle = "#6f8f3d";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1200; i++) {
      const x = deterministic(i, 49) * 256, y = deterministic(i, 50) * 256;
      ctx.fillStyle = i % 2 ? "rgba(40,70,25,0.35)" : "rgba(190,220,130,0.3)";
      ctx.fillRect(x, y, 1.5, 2 + deterministic(i, 51) * 3);
    }
    ctx.strokeStyle = "rgba(240,246,220,0.55)";
    ctx.lineWidth = 2;
    for (let d = -256; d < 512; d += 22) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + 256, 256);
      ctx.stroke();
    }
  });
}

function sampleRingStations(ringM, stepM) {
  const stations = [];
  const area = ringSignedArea(ringM);
  for (let i = 0; i < ringM.length; i++) {
    const a = ringM[i], b = ringM[(i + 1) % ringM.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(len > 1e-6)) continue;
    const steps = Math.max(1, Math.min(80, Math.ceil(len / stepM)));
    const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len;
    for (let s = 0; s < steps; s++) {
      const tt = s / steps;
      stations.push({ x: a[0] + (b[0] - a[0]) * tt, y: a[1] + (b[1] - a[1]) * tt,
        nx: area >= 0 ? -dy : dy, ny: area >= 0 ? dx : -dx });
    }
  }
  return stations;
}

function sampleLineStations(ax, ay, bx, by, stepM) {
  const len = Math.hypot(bx - ax, by - ay);
  if (!(len > 1e-6)) return [];
  const steps = Math.max(1, Math.min(120, Math.ceil(len / stepM)));
  const dx = (bx - ax) / len, dy = (by - ay) / len;
  const stations = [];
  for (let s = 0; s <= steps; s++) {
    const tt = s / steps;
    stations.push({ x: ax + (bx - ax) * tt, y: ay + (by - ay) * tt, nx: -dy, ny: dx });
  }
  return stations;
}

// Ribbon of `across` columns over spine stations; liftFn(t01, x, y, ground, i)
// returns the absolute surface height. Closed wraps the last quad to the first.
function buildRibbonGeometry(stations, { width, across = 5, closed = false, heightAt, liftFn, uRepeat = 0.25 }) {
  const n = stations.length;
  const cols = Math.max(2, across);
  const positions = [];
  const uvs = [];
  const indices = [];
  let travelled = 0;
  for (let i = 0; i < n; i++) {
    const st = stations[i];
    if (i > 0) {
      travelled += Math.hypot(st.x - stations[i - 1].x, st.y - stations[i - 1].y);
    }
    for (let c = 0; c < cols; c++) {
      const t01 = c / (cols - 1);
      const off = (t01 - 0.5) * width;
      const x = st.x + st.nx * off;
      const y = st.y + st.ny * off;
      const ground = heightAt(x, -y);
      positions.push(x, liftFn(t01, x, y, ground, i), -y);
      uvs.push(travelled * uRepeat, t01);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) {
    const r0 = i * cols, r1 = ((i + 1) % n) * cols;
    for (let c = 0; c < cols - 1; c++) {
      indices.push(r0 + c, r1 + c, r0 + c + 1, r0 + c + 1, r1 + c, r1 + c + 1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

function zoneMaterial(kind, params) {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.userData.finalOpacity = params.opacity ?? 1;
  if (!zoneKindMats.has(kind)) zoneKindMats.set(kind, []);
  zoneKindMats.get(kind).push(mat);
  return mat;
}

function addZoneMesh(kind, mesh, { pick = true, shadow = false } = {}) {
  mesh.userData.zoneKind = kind;
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  zonesGroup.add(mesh);
  if (pick) zonePickMeshes.push(mesh);
  return mesh;
}

function buildBundMesh(zones, heightAt, ringM) {
  const zone = zones.bund;
  if (!zone) return;
  const width = zone.displayWidthM;
  const ring = ringSignedArea(ringM) < 0 ? [...ringM].reverse() : ringM;
  const stations = sampleRingStations(ring, isPhone() ? 2.2 : 1.5)
    .map((st) => ({ ...st, x: st.x + st.nx * width * 0.5, y: st.y + st.ny * width * 0.5 }));
  if (stations.length < 3) return;
  const geom = buildRibbonGeometry(stations, { width, across: 5, closed: true, heightAt,
    liftFn: (t01, x, y, ground, i) =>
      ground + 0.015 + 0.28 * Math.pow(Math.max(0, Math.sin(Math.PI * t01)), 0.75) +
      (deterministic(i, 52) - 0.5) * 0.02 });
  const mat = zoneMaterial("bund", { map: bundTexture(), roughness: 1, metalness: 0 });
  addZoneMesh("bund", new THREE.Mesh(geom, mat), { shadow: !isPhone() });
  // Sparse grass tufts along the ridge crown.
  const tuftCount = Math.min(isPhone() ? 80 : 160, Math.max(8, Math.floor(zone.lengthM / 2)));
  const tuftGeom = new THREE.ConeGeometry(0.07, 0.22, 4);
  const tuftMat = zoneMaterial("bund", { color: 0x5c7a3a, roughness: 0.95 });
  const tufts = new THREE.InstancedMesh(tuftGeom, tuftMat, tuftCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < tuftCount; i++) {
    const st = stations[Math.floor((i / tuftCount) * stations.length)];
    const jx = (deterministic(i, 53) - 0.5) * width * 0.5;
    const x = st.x + st.nx * jx;
    const y = st.y + st.ny * jx;
    dummy.position.set(x, heightAt(x, -y) + 0.28, -y);
    dummy.rotation.set(0, deterministic(i, 54) * Math.PI, 0);
    dummy.scale.setScalar(0.7 + deterministic(i, 55) * 0.7);
    dummy.updateMatrix();
    tufts.setMatrixAt(i, dummy.matrix);
  }
  tufts.instanceMatrix.needsUpdate = true;
  tufts.userData.zoneKind = "bund";
  zonesGroup.add(tufts);
}

function buildDrainMesh(zones, geom, heightAt, paddyY = 0) {
  const zone = zones.drain;
  const line = geom?.drain;
  if (!zone || !line) return;
  const width = zone.displayWidthM;
  const stations = sampleLineStations(line.ax, line.ay, line.bx, line.by, isPhone() ? 2 : 1.2);
  if (stations.length < 2) return;
  // The ground and paddy surface omit this channel; muddy banks surround a bed 0.3 m deep.
  // Banks stay visible above flooded paddy water; the bed keeps its true depth.
  const edgeLift = paddyY > 0 ? paddyY + 0.06 : 0.06;
  const bedLift = -0.3;
  const bedGeom = buildRibbonGeometry(stations, { width, across: 7, heightAt,
    liftFn: (t01, x, y, ground) =>
      ground + edgeLift - (edgeLift - bedLift) * Math.pow(Math.max(0, Math.sin(Math.PI * t01)), 1.1) });
  const bedMat = zoneMaterial("drain", { map: drainBedTexture(), roughness: 0.65, metalness: 0.05 });
  addZoneMesh("drain", new THREE.Mesh(bedGeom, bedMat));
  // The water covers the middle three-fifths so muddy banks flank the channel.
  const waterGeom = buildRibbonGeometry(stations, { width: width * 0.6, across: 2, heightAt,
    liftFn: (t01, x, y, ground) => ground - 0.12, uRepeat: 0.1 });
  const waterTex = drainWaterTexture();
  const waterMat = zoneMaterial("drain", { map: waterTex, roughness: 0.25, metalness: 0.05,
    transparent: true, opacity: 0.78, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1 });
  waterMat.userData.water = true;
  addZoneMesh("drain", new THREE.Mesh(waterGeom, waterMat));
  drainWaterMats.push({ mat: waterMat, tex: waterTex });
}

function buildPathMesh(zones, geom, heightAt, paddyY = 0) {
  const zone = zones.path;
  const line = geom?.path;
  if (!zone || !line) return;
  const stations = sampleLineStations(line.ax, line.ay, line.bx, line.by, isPhone() ? 2 : 1.5);
  if (stations.length < 2) return;
  const geomPath = buildRibbonGeometry(stations, { width: zone.displayWidthM, across: 3, heightAt,
    liftFn: (t01, x, y, ground) => ground + (paddyY > 0 ? paddyY + 0.02 : 0.02), uRepeat: 0.12 });
  const mat = zoneMaterial("path", { map: pathTexture(), roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1 });
  addZoneMesh("path", new THREE.Mesh(geomPath, mat));
}

function buildOtherMesh(zones, geom, heightAt, paddyY = 0) {
  const zone = zones.other;
  const rect = geom?.other;
  if (!zone || !rect) return;
  const plane = buildSurfaceGeometry(rect.polygon,
    (x, z) => heightAt(x, z) + (paddyY > 0 ? paddyY + 0.03 : 0.03), rect);
  const mat = zoneMaterial("other", { map: otherTexture(), roughness: 0.9, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -1 });
  const mesh = new THREE.Mesh(plane, mat);
  addZoneMesh("other", mesh);
}

function disposeZones() {
  cancelAnimationFrame(zonesFade?.frameId);
  zonesFade = null;
  drainWaterMats = [];
  zonePickMeshes = [];
  zoneKindMats = new Map();
  selectedZoneKind = null;
  hoveredZoneKind = null;
  closeZonePopover();
  disposeGroup(zonesGroup);
  zonesGroup = null;
}

function buildFieldZones(data, heightAt, ringM, bounds = null) {
  const model = zoneModelFor(data, heightAt);
  const key = JSON.stringify([data.net, model.drainIndex, data.field.centroid, data.field.outlineM, data.months[0]?.cropId]);
  if (lastZoneKey === key && zonesGroup) {
    // Widths unchanged (usable/crop move only): keep meshes and popover steady.
    const wrap = canvasHostEl?.closest(".planner3d-stage-wrap");
    if (zonePopoverEl && zonePopoverEl.parentElement !== wrap) closeZonePopover();
    if (!zoneLegendEl?.isConnected ||
        zoneLegendEl.parentElement?.closest?.(".planner3d-stage-wrap") !== wrap) renderZoneLegend();
    return;
  }
  const first = lastZoneKey === null;
  disposeZones();
  ensureFloatGroup();
  zonesGroup = new THREE.Group();
  floatGroup.add(zonesGroup);
  // Flooded paddy waterline (mirrors buildCropGround): zones must clear it.
  const paddyY = ["aman", "boro", "rice"].includes(data.months[0]?.cropId)
    ? 0.035 : 0;
  buildBundMesh(model.zones, heightAt, ringM);
  buildDrainMesh(model.zones, model.geom, heightAt, paddyY);
  buildPathMesh(model.zones, model.geom, heightAt, paddyY);
  buildOtherMesh(model.zones, model.geom, heightAt, paddyY);
  renderZoneLegend();
  if (!first && !prefersReducedMotion) startZonesFade();
  lastZoneKey = key;
}

function startZonesFade() {
  const mats = [...zoneKindMats.values()].flat().filter((m) => m && !m.userData.windShader);
  if (!mats.length) return;
  for (const m of mats) {
    m.transparent = true;
    m.opacity = 0;
  }
  const start = performance.now();
  const duration = 450;
  const tick = () => {
    if (!zonesFade) return;
    const progress = Math.min(1, (performance.now() - start) / duration);
    const eased = easeOutCubic(progress);
    for (const m of mats) m.opacity = (m.userData.finalOpacity ?? 1) * eased;
    requestRender();
    if (progress < 1) zonesFade.frameId = requestAnimationFrame(tick);
    else {
      for (const m of mats) {
        m.opacity = m.userData.finalOpacity ?? 1;
        if (m.opacity >= 1) m.transparent = false;
      }
      zonesFade = null;
      requestRender();
    }
  };
  zonesFade = { frameId: requestAnimationFrame(tick) };
}

// Brief crossfade when the usable share moves rows without changing the crop.
function pulsePlantsMaterial(mesh) {
  if (!mesh?.material || prefersReducedMotion) return;
  cancelAnimationFrame(plantsPulse?.frameId);
  const mat = mesh.material;
  mat.transparent = true;
  const start = performance.now();
  const duration = 280;
  const tick = () => {
    if (!plantsPulse) return;
    const progress = Math.min(1, (performance.now() - start) / duration);
    mat.opacity = 1 - Math.sin(progress * Math.PI) * 0.55;
    requestRender();
    if (progress < 1) plantsPulse.frameId = requestAnimationFrame(tick);
    else {
      mat.opacity = 1;
      mat.transparent = false;
      plantsPulse = null;
      requestRender();
    }
  };
  plantsPulse = { frameId: requestAnimationFrame(tick) };
}

function updateZoneWater(timeMs) {
  const tm = timeMs / 1000;
  for (const { mat, tex } of drainWaterMats) {
    if (!prefersReducedMotion) tex.offset.x = (tm * 0.04) % 1;
    if (!zonesFade) mat.opacity = prefersReducedMotion ? 0.72 : 0.7 + 0.07 * Math.sin(tm * 1.3);
  }
  // NETAREA1C: the selected zone pulses gently (studio NETAREA2B); the loop
  // never runs under prefers-reduced-motion, so this stays a static glow there.
  if (selectedZoneKind && !prefersReducedMotion) {
    const pulse = 0.85 + 0.35 * Math.sin(tm * 4);
    for (const mat of zoneKindMats.get(selectedZoneKind) || []) {
      if (!mat.emissive || mat.userData.water) continue;
      mat.emissiveIntensity = pulse;
    }
  }
}

/* ------------------------------------------------- zone picking + popover */

function applyZoneHighlight() {
  for (const [kind, mats] of zoneKindMats) {
    const selected = kind === selectedZoneKind;
    const on = selected || kind === hoveredZoneKind;
    // NETAREA1C: a selection dims the other zones (studio NETAREA2B); hover only glows.
    const dimmed = !!selectedZoneKind && !selected;
    for (const m of mats) {
      if (m.color) {
        if (!m.userData.baseColor) m.userData.baseColor = m.color.clone();
        if (dimmed) m.color.copy(m.userData.baseColor).multiplyScalar(0.72);
        else m.color.copy(m.userData.baseColor);
      }
      if (!m.emissive) continue;
      m.emissive.set(!on ? 0x000000 : m.userData.water ? 0x3f9b9a : selected ? 0x8a7a2a : 0x3a3a20);
      m.emissiveIntensity = !on ? 0 : m.userData.water ? 0.35 : selected ? 1 : 0.55;
    }
  }
  zoneLegendEl?.querySelectorAll("[data-zone-kind]").forEach((chip) => {
    const on = chip.dataset.zoneKind === (selectedZoneKind || hoveredZoneKind);
    chip.classList.toggle("active", on);
    chip.setAttribute("aria-pressed", String(chip.dataset.zoneKind === selectedZoneKind));
  });
  requestRender();
}

function pickZoneAt(clientX, clientY) {
  if (!zonePickMeshes.length || !canvas || !activeCamera) return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const pointer = new THREE.Vector2(
    ((clientX - rect.left) / rect.width) * 2 - 1,
    -((clientY - rect.top) / rect.height) * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, activeCamera);
  const hits = raycaster.intersectObjects(zonePickMeshes, false);
  return hits.length ? hits[0].object.userData.zoneKind : null;
}

function escHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function openZonePopover(kind, anchor) {
  const model = currentZoneModel;
  const data = model && zonePopoverData(kind, model.zones, model.edited);
  if (!data || !canvasHostEl) return;
  closeZonePopover();
  selectedZoneKind = kind;
  const wrap = canvasHostEl.closest(".planner3d-stage-wrap") || canvasHostEl;
  const el = document.createElement("div");
  el.className = "zone-popover";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `${data.name} parameters`);
  el.innerHTML =
    `<div class="zone-popover-head"><strong>${escHtml(t(data.name, data.name))}</strong>` +
    `<button type="button" class="zone-popover-close" aria-label="${escHtml(t("Close", "বন্ধ করুন"))}">×</button></div>` +
    `<dl class="zone-popover-grid">` +
    `<div><dt>${escHtml(t("Width", "প্রস্থ"))}</dt><dd>${escHtml(num(data.widthM, 2))} m</dd></div>` +
    `<div><dt>${escHtml(t("Length", "দৈর্ঘ্য"))}</dt><dd>${escHtml(num(data.lengthM, 1))} m</dd></div>` +
    `<div><dt>${escHtml(t("Area", "আয়তন"))}</dt><dd>${escHtml(num(data.areaM2, 1))} m² · ${escHtml(num(data.decimals, 2))} ${escHtml(t("decimals", "শতক"))}</dd></div>` +
    `<div><dt>${escHtml(t("Share of field", "জমির অংশ"))}</dt><dd>${escHtml(num(data.sharePct, 1))} %</dd></div>` +
    `<div><dt>${escHtml(t("Source", "উৎস"))}</dt><dd>${escHtml(data.source)}</dd></div></dl>` +
    `<a class="zone-popover-edit" href="${escHtml(data.editHref)}">${escHtml(t("Edit on My field", "আমার জমিতে বদলান"))}</a>`;
  el.querySelector(".zone-popover-close").addEventListener("click", (event) => {
    event.stopPropagation();
    selectZone(null);
  });
  wrap.appendChild(el);
  zonePopoverEl = el;
  const wrapRect = wrap.getBoundingClientRect();
  const hostRect = canvasHostEl.getBoundingClientRect();
  // Wrap-relative anchor; phones render the popover in-flow (see CSS) and ignore it.
  zonePopoverAnchor = {
    x: (anchor?.clientX ?? hostRect.left + hostRect.width / 2) - wrapRect.left,
    y: (anchor?.clientY ?? hostRect.top + hostRect.height * 0.3) - wrapRect.top,
  };
  positionZonePopover();
  applyZoneHighlight();
}

// NETAREA1C: keep the open popover fully inside the visible stage (studio
// NETAREA2B clamp); re-run on resize since the wrap size can change.
function positionZonePopover() {
  const el = zonePopoverEl;
  if (!el || !canvasHostEl) return;
  const wrap = canvasHostEl.closest(".planner3d-stage-wrap") || canvasHostEl;
  const wrapRect = wrap.getBoundingClientRect();
  const bounds = { left: 8, top: 8, right: wrapRect.width - 8, bottom: wrapRect.height - 8 };
  const placed = clampZonePopover({ anchorX: zonePopoverAnchor?.x ?? bounds.left,
    anchorY: zonePopoverAnchor?.y ?? bounds.top,
    width: el.offsetWidth, height: el.offsetHeight, bounds });
  el.style.maxHeight = `${Math.max(0, bounds.bottom - bounds.top)}px`;
  el.style.left = `${placed.left}px`;
  el.style.top = `${placed.top}px`;
}

function closeZonePopover() {
  zonePopoverEl?.remove();
  zonePopoverEl = null;
  zonePopoverAnchor = null;
  document.removeEventListener("keydown", onZoneKeyDown, true);
  document.removeEventListener("pointerdown", onZoneOutsideDown, true);
  window.removeEventListener("resize", positionZonePopover);
}

function selectZone(kind, anchor = null) {
  selectedZoneKind = kind;
  if (!kind) {
    closeZonePopover();
    applyZoneHighlight();
    return;
  }
  openZonePopover(kind, anchor);
  document.addEventListener("keydown", onZoneKeyDown, true);
  document.addEventListener("pointerdown", onZoneOutsideDown, true);
  window.addEventListener("resize", positionZonePopover);
}

function onZoneKeyDown(event) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    selectZone(null);
    canvasHostEl?.focus({ preventScroll: true });
  }
}

function onZoneOutsideDown(event) {
  if (zonePopoverEl && !zonePopoverEl.contains(event.target) &&
      !event.target.closest?.("[data-zone-kind]")) {
    selectZone(null);
  }
}

function renderZoneLegend() {
  zoneLegendEl?.remove();
  zoneLegendEl = null;
  const model = currentZoneModel;
  const wrap = canvasHostEl?.closest(".planner3d-stage-wrap");
  if (!model || !wrap) return;
  const entries = ["bund", "drain", "path", "other"]
    .map((kind) => [kind, model.zones[kind]])
    .filter(([, zone]) => zone);
  const el = document.createElement("div");
  el.className = "zone-legend";
  el.setAttribute("role", "group");
  el.setAttribute("aria-label", t("Field zones", "জমির অংশ"));
  for (const [kind, zone] of entries) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.dataset.zoneKind = kind;
    chip.setAttribute("aria-pressed", "false");
    chip.textContent = kind === "other"
      ? `${zone.name} ${num(zone.decimals, 1)} ${t("dec", "শতক")}`
      : `${zone.name} ${num(zone.widthM, 1)} m`;
    chip.addEventListener("click", (event) => {
      event.stopPropagation();
      if (selectedZoneKind === kind) {
        selectZone(null);
        return;
      }
      const rect = chip.getBoundingClientRect();
      selectZone(kind, { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 });
    });
    el.appendChild(chip);
  }
  const measureChip = document.createElement("button");
  measureChip.type = "button";
  measureChip.dataset.measurements = "toggle";
  measureChip.setAttribute("aria-pressed", String(measurementsVisible));
  measureChip.textContent = t("Measurements", "মাপ");
  measureChip.addEventListener("click", (event) => {
    event.stopPropagation();
    measurementsVisible = !measurementsVisible;
    measureChip.setAttribute("aria-pressed", String(measurementsVisible));
    measurementLayoutCache = null;
    syncPlannerMeasurements();
    requestRender();
  });
  el.appendChild(measureChip);
  // NETAREA1C: honesty note under the chips, matching the studio wording.
  const readability = zoneReadabilityNote();
  if (readability) {
    const note = document.createElement("small");
    note.className = "zone-legend-note";
    note.textContent = readability;
    el.appendChild(note);
  }
  const footer = wrap.querySelector(".planner3d-footer");
  if (footer) footer.prepend(el);
  else {
    el.classList.add("zone-legend-overlay");
    wrap.appendChild(el);
  }
  zoneLegendEl = el;
}

function bindZonePicking() {
  if (!canvas || canvas.userData?.zonePickingBound) return;
  canvas.userData = canvas.userData || {};
  canvas.userData.zonePickingBound = true;
  canvas.addEventListener("pointerdown", (event) => {
    zoneTapStart = { x: event.clientX, y: event.clientY, at: performance.now() };
  });
  canvas.addEventListener("pointerup", (event) => {
    const start = zoneTapStart;
    zoneTapStart = null;
    if (!start) return;
    const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (moved > 10 || performance.now() - start.at > 700) return;
    const kind = pickZoneAt(event.clientX, event.clientY);
    if (kind) selectZone(kind, { clientX: event.clientX, clientY: event.clientY });
    else if (selectedZoneKind) selectZone(null);
  });
  canvas.addEventListener("pointercancel", () => { zoneTapStart = null; });
  canvas.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse" || event.buttons || isDragging) return;
    const now = performance.now();
    if (now - lastZoneHoverMs < 70) return;
    lastZoneHoverMs = now;
    const kind = pickZoneAt(event.clientX, event.clientY);
    if (kind !== hoveredZoneKind) {
      hoveredZoneKind = kind;
      if (canvasHostEl) canvasHostEl.style.cursor = kind ? "pointer" : "";
      applyZoneHighlight();
    }
  });
  canvas.addEventListener("pointerleave", () => {
    hoveredZoneKind = null;
    if (canvasHostEl) canvasHostEl.style.cursor = "";
    applyZoneHighlight();
  });
}

/* ------------------------------------------- scale (dimension) annotations */

function measurementTitle(id) {
  if (id === "edge") return t("Field edge", "জমির ধার");
  if (id === "row-spacing") return t("Row spacing", "সারির দূরত্ব");
  if (id === "plant-spacing") return t("Within-row spacing", "সারিতে গাছের দূরত্ব");
  if (id === "bund") return t("Bund", "আল");
  if (id === "drain") return t("Drain", "নালা");
  if (id === "path") return t("Path", "রাস্তা");
  return id;
}

function ensureMeasurementOverlay() {
  if (!canvasHostEl) return;
  if (measurementSvgEl?.isConnected && measurementSvgEl.parentElement === canvasHostEl) return;
  measurementSvgEl?.remove();
  measurementSvgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  measurementSvgEl.setAttribute("class", "planner3d-measurements");
  measurementSvgEl.setAttribute("aria-label", t("Field measurements", "জমির মাপ"));
  canvasHostEl.appendChild(measurementSvgEl);
  measurementLayoutCache = null;
}

// Recompute anchors after every rebuild so spacing markers track the sliders.
function updateMeasurementAnchors() {
  measurementLayoutCache = null;
  if (!currentData) {
    measurementAnchors = [];
    return;
  }
  const outlineM = currentData.field?.outlineM || [];
  const zones = currentZoneModel?.zones || null;
  const geom = currentZoneModel?.geom || null;
  const markers = plannerMeasurementAnchors(outlineM, zones, geom);
  const planner = currentData.planner || {};
  markers.push(...plannerSpacingAnchors(outlineM, planner.row, planner.spacing, geom, planner.usable));
  measurementAnchors = markers;
}

// Screen-space dimension overlay projected from 3D anchors. Stability follows
// the soil-pin approach: the SVG is rewritten only when the layout key changes
// or an endpoint moved more than half a CSS pixel, so markers glide with the
// camera instead of trembling. Anchors behind the camera, off-screen, or
// occluded by the field block are hidden; labels de-overlap each other.
function syncPlannerMeasurements() {
  const overlay = measurementSvgEl;
  if (!overlay?.isConnected || !activeCamera || !currentData || !blockGroup || !canvasHostEl) return;
  overlay.hidden = !measurementsVisible;
  if (!measurementsVisible) {
    overlay.replaceChildren();
    return;
  }
  const width = Math.max(1, canvasHostEl.clientWidth || 600);
  const height = Math.max(1, canvasHostEl.clientHeight || 400);
  const heightAt = makeHeightAt(currentData);
  floatGroup?.updateWorldMatrix(true, true);
  activeCamera.updateMatrixWorld();
  const raycaster = new THREE.Raycaster();
  const project = (point, id) => {
    const [x, y] = point;
    const world = new THREE.Vector3(x, heightAt(x, -y) + (["bund", "edge"].includes(id) ? 0.36 : 0.065), -y);
    floatGroup?.localToWorld(world);
    const camSpace = world.clone().applyMatrix4(activeCamera.matrixWorldInverse);
    if (camSpace.z >= -0.01) return null;
    const p = world.clone().project(activeCamera);
    if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || p.z > 1 || p.z < -1) return null;
    return { x: (p.x * 0.5 + 0.5) * width, y: (0.5 - p.y * 0.5) * height, ndc: p, world };
  };
  const projected = measurementAnchors.map((m) => ({ ...m,
    a: project(m.a, m.id), b: project(m.b, m.id),
    center: project(m.a.map((v, i) => (v + m.b[i]) / 2), m.id),
  })).filter((m) => m.a && m.b && m.center);
  const wrap = canvasHostEl.closest(".planner3d-stage-wrap") || canvasHostEl;
  const rect = canvasHostEl.getBoundingClientRect();
  const obstacles = [...wrap.querySelectorAll(".zone-popover")]
    .map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height)
    .map((r) => ({ left: r.left - rect.left, right: r.right - rect.left,
      top: r.top - rect.top, bottom: r.bottom - rect.top }));
  const key = JSON.stringify([width, height, projected.map((m) => [m.id, m.label]), obstacles]);
  const cached = measurementLayoutCache;
  if (cached?.key === key && cached.projected.length === projected.length &&
      projected.every((m, i) => ["a", "b"].every((end) =>
        Math.hypot(m[end].x - cached.projected[i][end].x, m[end].y - cached.projected[i][end].y) <= 0.5))) return;
  const visible = projected.filter((m) => ["a", "b", "center"].every((end) => {
    const anchor = m[end];
    raycaster.setFromCamera(new THREE.Vector2(anchor.ndc.x, anchor.ndc.y), activeCamera);
    const distance = anchor.world.distanceTo(raycaster.ray.origin);
    return !raycaster.intersectObjects(blockGroup.children, true).some((hit) =>
      hit.object.visible && hit.object.isMesh && hit.distance < distance - 0.12);
  }));
  const labels = [];
  const overlaps = (a, b) => a.left < b.right + 4 && a.right > b.left - 4 && a.top < b.bottom + 4 && a.bottom > b.top - 4;
  overlay.setAttribute("viewBox", `0 0 ${width} ${height}`);
  overlay.innerHTML = `<defs><marker id="planner3d-dimension-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 0 L 5 3 L 1 6" fill="none" stroke="currentColor"/></marker></defs>` + visible.map((m) => {
    const textWidth = Math.max(42, m.label.length * 7 + 8);
    let label = null;
    for (const [dx, dy] of [[0, -18], [0, 25], [55, -18], [-55, -18], [0, -42], [0, 49]]) {
      const x = Math.max(textWidth / 2 + 8, Math.min(width - textWidth / 2 - 8, m.center.x + dx));
      const y = Math.max(18, Math.min(height - 12, m.center.y + dy));
      const box = { left: x - textWidth / 2, right: x + textWidth / 2, top: y - 12, bottom: y + 4 };
      if (![...obstacles, ...labels].some((r) => overlaps(box, r))) {
        label = { x, y, ...box };
        labels.push(box);
        break;
      }
    }
    if (!label) return "";
    return `<g data-measurement="${m.id}"><title>${escHtml(measurementTitle(m.id))}: ${escHtml(m.label)}</title>` +
      `<line class="planner3d-dimension-halo" x1="${m.a.x}" y1="${m.a.y}" x2="${m.b.x}" y2="${m.b.y}"/>` +
      `<line class="planner3d-dimension-line" x1="${m.a.x}" y1="${m.a.y}" x2="${m.b.x}" y2="${m.b.y}" marker-start="url(#planner3d-dimension-arrow)" marker-end="url(#planner3d-dimension-arrow)"/>` +
      `<path class="planner3d-dimension-leader" d="M${m.center.x},${m.center.y} L${label.x},${label.y + 4}"/>` +
      `<text x="${label.x}" y="${label.y}">${escHtml(m.label)}</text></g>`;
  }).join("");
  measurementLayoutCache = { key, projected };
}

function mergeClumpParts(parts) {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  parts.forEach((geometry, i) => {
    if (geometry !== nonIndexed[i]) geometry.dispose();
  });
  let total = 0;
  for (const g of nonIndexed) total += g.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3).fill(1);
  let offset = 0;
  for (const g of nonIndexed) {
    positions.set(g.attributes.position.array, offset * 3);
    if (g.attributes.color) colors.set(g.attributes.color.array, offset * 3);
    offset += g.attributes.position.count;
    g.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}

// Low-poly crop geometry shared by every instance of a clump.
function buildClumpGeometry(cropId, heightM, spreadM, stage = "grow", lod = "high") {
  const h = Math.max(0.06, heightM);
  const r = Math.max(0.08, spreadM * 0.46);
  const isLow = lod === "low";

  // Use crop-specific config for enhanced realism
  const config = CROP_CONFIG[cropId] || CROP_CONFIG.rice;

  const parts = [];
  const paint = (geometry, color) => {
    const c = new THREE.Color(color);
    const colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) c.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    parts.push(geometry);
  };
  const stem = (from, to, radius = h * 0.012) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    const geometry = new THREE.CylinderGeometry(radius * 0.65, radius, direction.length(), 5);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()));
    geometry.translate(...a.add(b).multiplyScalar(0.5).toArray());
    paint(geometry, '#45862b');
  };
  // Folded, tapered leaf ribbons catch light along their midrib and arch at the tips.
  const leaf = (base, angle, length, width, rise, color) => {
    const vertices = [];
    const point = (t, side) => {
      const w = Math.sin(Math.PI * t) * width * side;
      return [base[0] + Math.cos(angle) * length * t - Math.sin(angle) * w,
        base[1] + Math.sin(t * Math.PI * 0.72) * rise + (side === 0 ? width * 0.18 * Math.sin(Math.PI * t) : 0),
        base[2] + Math.sin(angle) * length * t + Math.cos(angle) * w];
    };
    for (let k = 0; k < 7; k++) {
      for (const side of [-1, 1]) {
        const a = point(k / 7, 0), b = point(k / 7, side);
        const c = point((k + 1) / 7, 0), d = point((k + 1) / 7, side);
        vertices.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    paint(geometry, color);
  };

  if (cropId === 'aman' || cropId === 'boro' || cropId === 'rice') {
    for (let k = 0; k < 12; k++) {
      const angle = k * 2.39996;
      leaf([Math.cos(angle) * r * 0.08, 0, Math.sin(angle) * r * 0.08], angle,
        r * (0.9 + (k % 3) * 0.18), h * 0.036, h * (0.76 + (k % 4) * 0.08),
        ['#389c28', '#66be32', '#269137'][k % 3]);
    }
    return mergeClumpParts(parts);
  }

  if (cropId === 'mustard') {
    stem([0, 0, 0], [0, h, 0]);
    for (let k = 0; k < 6; k++) {
      const angle = k * 2.39996;
      leaf([0, h * (0.12 + k * 0.1), 0], angle, r * (0.92 - k * 0.09), r * 0.22,
        h * 0.13, k % 2 ? '#438f31' : '#287b35');
    }
    for (let branch = 0; branch < 5; branch++) {
      const angle = branch * 2.39996;
      const x = branch ? Math.cos(angle) * r * 0.55 : 0;
      const z = branch ? Math.sin(angle) * r * 0.55 : 0;
      const y = h * (branch ? 0.78 + (branch % 2) * 0.1 : 1);
      stem([0, h * 0.48, 0], [x, y, z], h * 0.008);
      for (let flower = 0; flower < 7; flower++) {
        const a = flower * 2.39996;
        const fx = x + Math.cos(a) * r * 0.18, fz = z + Math.sin(a) * r * 0.18;
        for (let petal = 0; petal < 4; petal++) {
          const pa = petal * Math.PI / 2;
          const geometry = new THREE.SphereGeometry(r * 0.065, 5, 3);
          geometry.scale(1, 0.38, 1);
          geometry.translate(fx + Math.cos(pa) * r * 0.06, y + flower * h * 0.008, fz + Math.sin(pa) * r * 0.06);
          paint(geometry, petal % 2 ? '#ffe443' : '#f5c91b');
        }
      }
    }
    return mergeClumpParts(parts);
  }

  if (cropId === 'potato' || cropId === 'mungbean' || cropId === 'lentil') {
    const potato = cropId === 'potato';
    for (let branch = 0; branch < (potato ? 5 : 3); branch++) {
      const angle = branch * 2.39996;
      const bx = Math.cos(angle) * r * 0.38, bz = Math.sin(angle) * r * 0.38;
      const by = h * (0.45 + (branch % 3) * 0.16);
      stem([0, 0, 0], [bx, by, bz]);
      if (potato) {
        for (let k = 0; k < 3; k++) {
          const t = 0.35 + k * 0.23;
          for (const side of [-1, 1]) {
            leaf([bx * t, by * t, bz * t], angle + side * 1.1, r * 0.65, r * 0.23, h * 0.15,
              k % 2 ? '#287432' : '#195e29');
          }
        }
      }
      for (const side of [-1, 0, 1]) {
        leaf([bx, by, bz], angle + side * 1.13, r * (side === 0 ? 0.77 : 0.62),
          r * (potato ? 0.22 : 0.29), h * 0.18, potato ? '#24752e' : side === 0 ? '#45a343' : '#31883c');
      }
    }
    return mergeClumpParts(parts);
  }

  if (cropId === "wheat" || cropId === "maize") {
    const parts = []; const isMaize = cropId === "maize";
    const stem = new THREE.CylinderGeometry(r * config.stemWidth, r * config.stemWidth * 2, h * config.heightFactor, 4);
    stem.translate(0, h * 0.47, 0); parts.push(stem);
    const blades = isLow ? 4 : (isMaize ? config.leafCount : 8);
    for (let k = 0; k < blades; k++) {
      const ang = (k / blades) * Math.PI * 2;
      const blade = new THREE.ConeGeometry(r * config.leafWidth, h * (isMaize ? 0.45 : 0.35), 3);
      blade.rotateZ(config.leafLean * Math.cos(ang)); blade.rotateX(config.leafLean * Math.sin(ang));
      blade.translate(Math.cos(ang) * r * 0.25, h * (0.3 + (k / blades) * 0.4), Math.sin(ang) * r * 0.25); parts.push(blade);
    }
    const ear = new THREE.ConeGeometry(r * (isMaize ? 0.16 : 0.08), h * 0.28, 4);
    ear.translate(0, h * 0.95, 0); parts.push(ear);
    return mergeClumpParts(parts);
  }

  const g = new THREE.ConeGeometry(r * 0.4, h, 5); g.translate(0, h / 2, 0); return g;
}

function deterministic(i, seed) {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function buildPlants(data) {
  const prevSig = plantsGroup?.userData?.plantSig || null;
  const prevCrop = plantsGroup?.userData?.plants?.cropId || null;
  disposeGroup(plantsGroup);
  plantsGroup = null;

  const month = data.months[0];
  if (!month || month.stage === "fallow" || !month.cropId) return;

  const outlineM = data.field.outlineM;
  const bounds = currentBlock.bounds || outlineBounds(outlineM);
  const heightAt = makeHeightAt(data);
  const layout = plannerRowLayout(outlineM, data.planner.row, data.planner.spacing,
    data.planner.usable, zoneModelFor(data, heightAt).geom);
  const { positions, spacingX, spacingY } = layout;
  canvasHostEl.dataset.rowCount = layout.rowCount;
  
  // Cap instance count for performance, with honest note
  const cappedPositions = positions;
  const totalCount = positions.length;
  canvasHostEl.dataset.plantCount = positions.length;
  canvasHostEl.dataset.totalPositions = layout.totalPositions;
  const { displayScale, rowStep, plantStep } = layout;
  const broadcast = month.cropId === 'mustard';
  const note = document.documentElement.lang === 'bn'
    ? `বোঝার সুবিধায় গাছ ×${displayScale} বড়; প্রতি ${rowStep} সারি ও ${plantStep} গাছ পরপর দেখানো। ${broadcast ? 'বীজের হিসাব ছিটিয়ে বপনের হার অনুযায়ী।' : 'গাছের হিসাব প্রকৃত দূরত্ব অনুযায়ী।'}`
    : `Plants enlarged ×${displayScale}; every ${rowStep}th row and ${plantStep}th plant drawn for readability; ${broadcast ? 'seed uses the broadcast rate' : 'counts use true spacing'}.`;
  canvasHostEl.dataset.plantSampleNote = note;
  const zoneNote = zoneReadabilityNote();
  const chip = canvasHostEl.closest('.planner3d-stage-wrap')?.querySelector('.planner3d-crop-chip');
  if (chip) chip.textContent = zoneNote ? `${note} ${zoneNote}` : note;
  if (cappedPositions.length === 0) return;

  const h = month.canopyHeightM * month.stageFraction * displayScale;
  if (!(h > 0)) return;

  // Use LOD based on instance count: high detail for <10k, low for more
  const lod = 'high';
  const alongX = bounds.width >= bounds.height;
  const trueSpacingX = (alongX ? data.planner.spacing : data.planner.row) / 100;
  const trueSpacingY = (alongX ? data.planner.row : data.planner.spacing) / 100;
  const ridgeHeight = (alongX ? spacingY : spacingX) * 0.15;
  const spread = (month.cropId === 'potato' ? 0.8 : month.cropId === 'mungbean' ? 0.65 : 0.55) * displayScale;
  const geom = buildClumpGeometry(month.cropId, h, spread, month.stage, lod);
  const zoneGeom = zoneModelFor(data).geom;
  const vertices = geom.getAttribute('position');
  let footprintRadius = 0;
  let windMargin = 0.01;
  for (let i = 0; i < vertices.count; i++) {
    footprintRadius = Math.max(footprintRadius, Math.hypot(vertices.getX(i), vertices.getZ(i)));
    if (!prefersReducedMotion) windMargin = Math.max(windMargin,
      0.04 * (0.5 + 0.5 * vertices.getY(i)) * Math.SQRT2 + 0.01);
  }
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    vertexColors: true,
    flatShading: false,
    side: THREE.DoubleSide,
  });
  
  // Add wind animation shader for subtle motion
  if (!prefersReducedMotion) {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uWindStrength = { value: 0.04 };
      shader.vertexShader = `
        uniform float uTime;
        uniform float uWindStrength;
        ${shader.vertexShader}
      `.replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
         float wind = uWindStrength * sin(uTime * 1.3 + position.y * 0.5 + instanceMatrix[3].x * 0.1) * (0.5 + 0.5 * position.y);
         transformed.x += cos(uTime * 0.7 + instanceMatrix[3].x * 0.05) * wind;
         transformed.z += sin(uTime * 0.7 + instanceMatrix[3].x * 0.05) * wind;`
      );
      mat.userData.windShader = shader;
    };
  }
  
  const mesh = new THREE.InstancedMesh(geom, mat, cappedPositions.length);
  mesh.castShadow = !isPhone();
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const base = new THREE.Color(0xffffff);
  const colour = new THREE.Color();

  // Crop-specific size adjustments
  const cropScale = 1;
  // Stage scaling: seedlings smaller, harvest stumps shorter
  const stageScale = month.stage === "establish" ? 0.42 : month.stage === "harvest" ? 0.55 : 1.0;

  for (let i = 0; i < cappedPositions.length; i++) {
    const [x, y] = cappedPositions[i];
    const z = -y;
    const jitter = 0.82 + deterministic(i, 1) * 0.38;
    const yaw = deterministic(i, 2) * Math.PI * 2;
    dummy.position.set(
      x + (zoneGeom ? 0 : (deterministic(i, 3) - 0.5) * trueSpacingX * 0.18),
      heightAt(x, z) + (month.cropId === "potato" ? ridgeHeight : 0.015),
      z + (zoneGeom ? 0 : (deterministic(i, 4) - 0.5) * trueSpacingY * 0.18),
    );
    dummy.rotation.set(0, yaw, 0);
    const clearance = fieldZoneClearance(x, y, zoneGeom, outlineM);
    const horizontalScale = Math.min(jitter * cropScale * stageScale,
      Math.max(0, clearance - windMargin) / Math.max(footprintRadius, 0.01));
    const sx = horizontalScale;
    const sz = horizontalScale;
    const sy = (0.9 + deterministic(i, 5) * 0.24) * cropScale * stageScale;
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
  mesh.userData.rowProgress = new Float32Array(cappedPositions.map(([, y]) => {
    return boundsY > 1e-4 ? Math.max(0, Math.min(1, (y - bounds.minY) / boundsY)) : 0;
  }));

  plantsGroup = new THREE.Group();
  ensureFloatGroup();
  plantsGroup.add(mesh);
  plantsGroup.userData.plantSig =
    `${cappedPositions.length}:${cappedPositions[0]?.join(",")}:${cappedPositions.at(-1)?.join(",")}`;
  const sameCrop = prevCrop === month.cropId;
  if (prevSig && prevSig !== plantsGroup.userData.plantSig && sameCrop &&
      !transitionAnim && !introAnim) {
    pulsePlantsMaterial(mesh);
  }
  plantsGroup.userData.plants = {
    positions: cappedPositions.map(([x, y]) => [x, heightAt(x, -y) + 0.02, -y]),
    height: h,
    color: stageColor(month.cropId, month.stage),
    flower: month.cropId === "mustard" && month.stage !== "harvest" ? "#e8c93a" : null,
    cropId: month.cropId,
    stage: month.stage,
    totalCount,
    cappedCount: cappedPositions.length,
  };
  floatGroup.add(plantsGroup);

}

/**
 * Start a smooth crop change transition.
 * Old plants shrink/fade out, new plants grow in with row-wise stagger.
 */
function startCropTransition(oldCropId, newCropId, newData) {
  if (prefersReducedMotion || !plantsGroup || !oldCropId || oldCropId === newCropId) {
    buildPlants(newData);
    return;
  }
  const oldGroup = plantsGroup;
  plantsGroup = null;
  // Build new plants (initially hidden/at zero scale)
  buildPlants(newData);
  const newMesh = plantsGroup?.children.find(c => c.isInstancedMesh);
  if (!newMesh) {
    disposeGroup(oldGroup);
    return;
  }
  const oldMat = oldGroup.children[0].material;
  const newMat = newMesh.material;
  const newBase = newMesh.userData.baseMatrices;
  const newRowProgress = newMesh.userData.rowProgress || [];
  const newCount = newMesh.count;
  // Make materials transparent for fade
  oldMat.transparent = newMat.transparent = true;
  newMat.opacity = 0;
  const startTime = performance.now();
  const duration = 700; // ms for crop change
  transitionAnim = { oldGroup, newMesh, frameId: null };
  const animate = () => {
    if (!transitionAnim) return;
    const progress = Math.min(1, (performance.now() - startTime) / duration);
    const eased = easeInOutCubic(progress);
    // Old plants: shrink and fade
    oldMat.opacity = 1 - eased;
    // New plants: grow in with row-wise stagger
    const newArr = newMesh.instanceMatrix.array;
    for (let i = 0; i < newCount; i++) {
      const rowDelay = (newRowProgress[i] || 0) * 0.3; // 30% stagger between rows
      const scale = easeOutCubic((eased - rowDelay) / (1 - rowDelay));
      for (let c = 0; c < 12; c++) newArr[i * 16 + c] = newBase[i * 16 + c] * scale;
    }
    newMesh.instanceMatrix.needsUpdate = true;
    newMat.opacity = eased;
    if (progress < 1) transitionAnim.frameId = requestAnimationFrame(animate);
    else finishCropTransition();
    requestRender();
  };
  animate();
}

function finishCropTransition() {
  if (!transitionAnim) return;
  const { oldGroup, newMesh, frameId } = transitionAnim;
  cancelAnimationFrame(frameId);
  newMesh.instanceMatrix.array.set(newMesh.userData.baseMatrices);
  newMesh.instanceMatrix.needsUpdate = true;
  newMesh.material.opacity = 1;
  newMesh.material.transparent = false;
  // Clean up old mesh
  disposeGroup(oldGroup);
  transitionAnim = null;
}

/**
 * Update wind shaders for all plant meshes with animation.
 */
function updateWindShaders(time) {
  if (prefersReducedMotion) return;
  const t = time / 1000;
  if (plantsGroup) {
    const mesh = plantsGroup.children.find(c => c.isInstancedMesh && c.material?.userData?.windShader);
    if (mesh?.material?.userData?.windShader?.uniforms?.uTime) {
      mesh.material.userData.windShader.uniforms.uTime.value = t;
    }
  }
}

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

function buildShadow(data) {
  disposeGroup(shadowPlane);
  shadowPlane = null;

  const bounds = currentBlock.bounds || outlineBounds(data.field.outlineM);
  const radius = Math.max(bounds.width, bounds.height);
  const bottomY = currentBlock.bottomY;

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

}

let floatGroup = null; // idle-float parent for block and plants
let isDragging = false;
// STUDIO5P idle sway: same slow horizontal camera motion as the studio at the
// planner's ±5° amplitude. The camera part is a transient offset applied after
// controls.update() and restored right after the frame renders, so it never
// fights OrbitControls.
let idleLastInputMs = -1e13; // last user input; sway resumes 6 s after, easing in over 1.5 s
let idleBasePos = null; // camera position saved before the transient sway offset
let idleHasOffset = false;
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

// Any pointer / wheel / key interaction parks the sway instantly.
function markIdleInput() {
  idleLastInputMs = performance.now();
  restoreIdleCamera();
  if (floatGroup) floatGroup.position.y = 0;
}

function bindIdleListeners() {
  if (idleListenersBound || !canvasHostEl) return;
  idleListenersBound = true;
  canvasHostEl.addEventListener("pointerdown", markIdleInput, { capture: true, passive: true });
  canvasHostEl.addEventListener("wheel", markIdleInput, { capture: true, passive: true });
  window.addEventListener("keydown", markIdleInput);
}

function unbindIdleListeners() {
  if (!idleListenersBound) return;
  idleListenersBound = false;
  try {
    canvasHostEl?.removeEventListener("pointerdown", markIdleInput, { capture: true });
    canvasHostEl?.removeEventListener("wheel", markIdleInput, { capture: true });
  } catch (e) {}
  try {
    window.removeEventListener("keydown", markIdleInput);
  } catch (e) {}
}

// Slow horizontal yaw sway of the camera around the field centre (±5°, 14 s
// period) plus a tiny ±1 % dolly breathing; the block itself keeps only a
// residual vertical float (≤25 % of the old bob) so its shadow stays put.
// Pauses instantly on input, stays off under prefers-reduced-motion, while
// dragging, or when the tab is hidden.
function applyIdleFloat(timeS, nowMs = performance.now()) {
  restoreIdleCamera();
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
  const sway = idleCameraSway(timeS, (nowMs - idleLastInputMs) / 1000, { fieldSpanM: span });
  if (sway.gain <= 0) {
    floatGroup.position.set(0, 0, 0);
    floatGroup.rotation.set(0, 0, 0);
    return;
  }
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
  // Field units can span kilometres; distance fog would hide the crop colours.

  cameraPersp = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
  cameraPersp.position.set(0, 25, 35);

  cameraOrtho = new THREE.OrthographicCamera(-30, 30, 30, -30, 0.1, 4000);
  cameraOrtho.position.set(0, 60, 0);
  cameraOrtho.up.set(0, 0, -1);
  cameraOrtho.lookAt(0, 0, 0);

  activeCamera = isTopView ? cameraOrtho : cameraPersp;

  const hemi = new THREE.HemisphereLight(0xeaf5ff, 0x617248, 2.1);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfffaf0, 2.8);
  sun.position.set(-28, 48, 24);
  scene.add(sun);
  scene.userData.sun = sun;

  // Soft fill from the opposite quarter keeps the cut faces readable under the
  // single shadow-casting sun.
  const fill = new THREE.DirectionalLight(0xe6efdc, 0.85);
  fill.position.set(30, 20, 26);
  scene.add(fill);

  if (renderer && renderer.shadowMap && !isPhone()) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
  }
}

function setupControls() {
  if (controls) controls.dispose();
  controls = new OrbitControls(activeCamera, canvas);
  controls.enableDamping = !prefersReducedMotion;
  controls.enablePan = false;
  controls.enableRotate = !isTopView;
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

function fitPerspective(data) {
  if (!cameraPersp || !data) return;
  const b = outlineBounds(data.field.outlineM);
  const depth = currentBlock.depth || blockDepthM(b);
  const elevationDeg = 36;
  const yawDeg = 24;
  const framing = computeFieldFraming({
    bounds: b, aspect: hostAspect(), fovDeg: cameraPersp.fov,
    depthM: depth - currentBlock.topMin,
    topM: currentBlock.topMax + Math.max(b.width, b.height) * 0.12,
    targetWidthRatio: 0.88, elevationDeg, yawDeg,
  });
  // Closer default on bigger previews (owner: field looked small); phones keep more margin.
  const hostW = renderer?.domElement?.clientWidth || 0;
  const zoom = hostW >= 820 ? 0.7 : hostW >= 560 ? 0.8 : 0.9;
  const target = framing.target;
  const distance = framing.distance * zoom;
  cameraPersp.position.set(...framing.position.map((v, i) => target[i] + (v - target[i]) * zoom));
  cameraPersp.near = Math.max(0.05, distance * 0.02);
  cameraPersp.far = Math.max(200, distance * 8);
  cameraPersp.updateProjectionMatrix();

  controls.target.set(target[0], target[1], target[2]);
  controls.minDistance = Math.max(2, framing.distance * 0.18);
  controls.maxDistance = framing.distance * 2.8;
  controls.maxPolarAngle = Math.PI / 2 - 0.04;
  controls.update();

  return {
    target,
    distance,
    elevationDeg,
    yawDeg,
  };
}

function fitOrtho(data) {
  if (!cameraOrtho || !data) return;
  const b = outlineBounds(data.field.outlineM);
  const fit = fitTopView({
    outlineM: data.field.outlineM,
    aspect: hostAspect(),
    margin: isPhone() ? 0.16 : 0.13,
    altitude: Math.max(60, currentBlock.topMax + b.radius * 2),
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
  cameraOrtho.far = Math.max(600, fit.y + currentBlock.depth * 2);
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
    fitPerspective(data);
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

/* ----------------------------------------------------- Planner lifecycle */

function initThree(host) {
  if (renderer && host === canvasHostEl) return;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    canvas = renderer.domElement;
    canvas.className = "planner3d-webgl-canvas";
    canvas.setAttribute("aria-hidden", "true");
    createScene();
    setupControls();
  }
  host.appendChild(canvas);
  canvasHostEl = host;
  bindZonePicking();
  ensureMeasurementOverlay();
  resizeObserver?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(host);
  }
  intersectionObserver?.disconnect();
  inViewport = true;
  if (typeof IntersectionObserver !== "undefined") {
    intersectionObserver = new IntersectionObserver(([entry]) => {
      inViewport = entry.isIntersecting;
      onVisibilityChange();
    }, { threshold: 0.1 });
    intersectionObserver.observe(host);
  }
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("pointerdown", () => stopIntroAnimation(true));
  canvas.addEventListener("wheel", () => stopIntroAnimation(true), { passive: true });
  host.addEventListener("click", () => stopIntroAnimation(true));
  host.onkeydown = (event) => {
    stopIntroAnimation(true);
    if (!host.closest(".planner3d-ready")) return;
    if (event.key === "+" || event.key === "=") zoomPlanner3d(1);
    else if (event.key === "-") zoomPlanner3d(-1);
    else if (!isTopView && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      const offset = cameraPersp.position.clone().sub(controls.target);
      const spherical = new THREE.Spherical().setFromVector3(offset);
      if (event.key === "ArrowLeft") spherical.theta -= Math.PI / 12;
      if (event.key === "ArrowRight") spherical.theta += Math.PI / 12;
      if (event.key === "ArrowUp") spherical.phi -= Math.PI / 12;
      if (event.key === "ArrowDown") spherical.phi += Math.PI / 12;
      spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.08, controls.maxPolarAngle);
      cameraPersp.position.copy(controls.target).add(offset.setFromSpherical(spherical));
      controls.update();
      requestRender();
    } else return;
    event.preventDefault();
  };
  onResize();
}

/* --------------------------------------------------- Planner intro animation */

function triggerIntroAnimation(force = false) {
  if (!force && shouldSkipIntro({ prefersReducedMotion, isHidden: document.hidden || !isVisible })) return;
  if (!force) {
    try {
      const key = "ropon_planner_intro_3d";
      if (sessionStorage.getItem(key) === "1") return;
      sessionStorage.setItem(key, "1");
    } catch (e) {}
  }

  if (isTopView || !currentData) return;

  const b = outlineBounds(currentData.field.outlineM);
  const depth = currentBlock.depth || blockDepthM(b);
  const fit = fitPerspective(currentData);
  if (!fit) return;

  introAnim = {
    startTime: performance.now(),
    duration: 2000, // 2s total for planner
    finalDistance: fit.distance,
    finalTarget: fit.target,
    finalElevationDeg: fit.elevationDeg,
    finalYawDeg: fit.yawDeg,
    depth,
  };

  // Immediate initial state
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

  updateIntroFrame(0);
}

function stopIntroAnimation(snapToEnd = true) {
  if (!introAnim) return;
  const anim = introAnim;
  introAnim = null;

  if (snapToEnd) {
    if (plantsGroup) {
      const mesh = plantsGroup.children.find((c) => c.isInstancedMesh);
      if (mesh && mesh.userData.baseMatrices) {
        mesh.instanceMatrix.array.set(mesh.userData.baseMatrices);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }

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
    requestRender();
  }
}

function updateIntroFrame(elapsedMs) {
  if (!introAnim) return;
  const tSec = elapsedMs / 1000;
  const progress = Math.min(1, elapsedMs / introAnim.duration);

  // Camera swing
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

  // Crops grow up during 0.4 - 1.8 s
  if (plantsGroup) {
    const mesh = plantsGroup.children.find((c) => c.isInstancedMesh);
    if (mesh && mesh.userData.baseMatrices && mesh.userData.rowProgress) {
      const base = mesh.userData.baseMatrices;
      const rows = mesh.userData.rowProgress;
      const arr = mesh.instanceMatrix.array;
      const count = rows.length;
      for (let i = 0; i < count; i++) {
        const offset = i * 16;
        const scale = sampleRowCropScale(tSec, rows[i], 0.4, 1.8);
        for (let c = 0; c < 12; c++) {
          arr[offset + c] = base[offset + c] * scale;
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  if (progress >= 1.0) {
    stopIntroAnimation(true);
    // STUDIO5P: fade the idle sway in over 1.5 s from the exact end framing.
    idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
  }
}

function requestRender() {
  if (renderFrameId !== null || !renderer) return;
  renderFrameId = requestAnimationFrame(() => {
    renderFrameId = null;
    if (!renderer || !scene || !activeCamera || !isVisible) return;
    controls.update();
    renderer.render(scene, activeCamera);
    syncPlannerMeasurements();
  });
}

function startAnimation() {
  if (prefersReducedMotion || !isVisible || !renderer || !currentData) {
    stopAnimation();
    requestRender();
    return;
  }
  if (animFrameId !== null) return;
  const loop = (time) => {
    animFrameId = requestAnimationFrame(loop);
    if (introAnim) {
      const now = performance.now();
      restoreIdleCamera();
      updateIntroFrame(now - introAnim.startTime);
    }
    controls.update();
    // Update wind shaders for subtle plant motion
    updateWindShaders(time);
    updateZoneWater(time);
    // Idle sway is a transient offset on top of the user's camera: applied
    // after controls.update() and restored right after the frame renders.
    if (!introAnim) applyIdleFloat(time / 1000);
    else restoreIdleCamera();
    renderer.render(scene, activeCamera);
    syncPlannerMeasurements();
    restoreIdleCamera();
  };
  animFrameId = requestAnimationFrame(loop);
}

function stopAnimation() {
  if (animFrameId !== null) cancelAnimationFrame(animFrameId);
  animFrameId = null;
}

function onVisibilityChange() {
  isVisible = inViewport && !document.hidden;
  if (isVisible) {
    idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
    startAnimation();
  } else {
    stopIntroAnimation(true);
    stopAnimation();
  }
}

function onMotionChange() {
  prefersReducedMotion = motionQuery?.matches || false;
  if (controls) controls.enableDamping = !prefersReducedMotion;
  idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
  applyIdleFloat(0);
  startAnimation();
  requestRender();
}

export function setPlanner3dView(view) {
  isTopView = view === "top";
  if (!renderer) return;
  activeCamera = isTopView ? cameraOrtho : cameraPersp;
  controls.object = activeCamera;
  controls.enableRotate = !isTopView;
  fitCameras(currentData);
  requestRender();
}

export function zoomPlanner3d(direction) {
  if (!renderer) return;
  const factor = direction > 0 ? 0.8 : 1.25;
  if (isTopView) {
    cameraOrtho.zoom = THREE.MathUtils.clamp(cameraOrtho.zoom / factor, controls.minZoom, controls.maxZoom);
    cameraOrtho.updateProjectionMatrix();
  } else {
    const offset = cameraPersp.position.clone().sub(controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance));
    cameraPersp.position.copy(controls.target).add(offset);
  }
  controls.update();
  requestRender();
}

export async function mountPlanner3d(host, input) {
  const token = ++buildToken;
  const data = buildStudioData(input);
  const cropId = input.planner.crop === "rice" ? "aman" : input.planner.crop;
  // Planner owns the crop and spacing; no rotation or calendar selection applies.
  data.months = [{ cropId, stage: "grow",
    stageFraction: 0.75, canopyHeightM: FAO56_CROP_LIMITS[cropId].heightM }];
  data.planner = { ...input.planner };
  data.net = input.net || null;
  const key = JSON.stringify([data.field.centroid, data.field.bboxLatLon, data.field.outlineM]);
  const refit = key !== elevationKey || host !== canvasHostEl;
  if (!motionQuery) {
    motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    prefersReducedMotion = motionQuery.matches;
    motionQuery.addEventListener("change", onMotionChange);
  }
  initThree(host);
  if (key !== elevationKey) {
    const sampler = await createElevationSampler(data);
    if (token !== buildToken || !host.isConnected) return;
    elevationSampler = sampler;
    elevationKey = key;
  }
  if (token !== buildToken || !host.isConnected) return;
  
  finishCropTransition();
  const oldCropId = currentData?.months[0]?.cropId;
  currentData = data;
  
  buildFieldBlock(data);
  
  // Handle crop transition if crop changed
  if (oldCropId && oldCropId !== cropId) {
    startCropTransition(oldCropId, cropId, data);
  } else {
    buildPlants(data);
  }
  
  buildShadow(data);
  updateMeasurementAnchors();
  if (refit || isTopView !== (input.planner.view === "top")) setPlanner3dView(input.planner.view);
  updateShadowLight();
  host.closest(".planner3d-stage-wrap").classList.add("planner3d-ready");
  requestRender();
  onVisibilityChange();
  if (!isTopView) triggerIntroAnimation();
  // When the intro is skipped the sway fades in from the default framing.
  if (!introAnim) idleLastInputMs = performance.now() - IDLE_RESUME_DELAY_S * 1000;
  bindIdleListeners();
}

export function disposePlanner3d() {
  ++buildToken;
  finishCropTransition();
  stopIntroAnimation(true);
  stopAnimation();
  cancelAnimationFrame(plantsPulse?.frameId);
  plantsPulse = null;
  disposeZones();
  zoneLegendEl?.remove();
  zoneLegendEl = null;
  measurementSvgEl?.remove();
  measurementSvgEl = null;
  measurementAnchors = [];
  measurementLayoutCache = null;
  measurementsVisible = true;
  currentZoneModel = null;
  lastZoneKey = null;
  if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
  renderFrameId = null;
  intersectionObserver?.disconnect();
  resizeObserver?.disconnect();
  intersectionObserver = resizeObserver = null;
  document.removeEventListener("visibilitychange", onVisibilityChange);
  motionQuery?.removeEventListener("change", onMotionChange);
  motionQuery = null;
  unbindIdleListeners();
  idleHasOffset = false;
  idleBasePos = null;
  if (canvasHostEl) {
    canvasHostEl.onkeydown = null;
    canvasHostEl.closest(".planner3d-stage-wrap")?.classList.remove("planner3d-ready");
  }
  scene?.traverse((obj) => {
    if (obj.isInstancedMesh) obj.dispose();
    obj.geometry?.dispose();
    if (obj.material) {
      for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) material.dispose();
    }
    obj.shadow?.map?.dispose();
  });
  for (const cache of [textureCache, sideTextureCache, skyTextureCache, shadowTextureCache]) {
    cache.forEach((texture) => texture.dispose());
    cache.clear();
  }
  controls?.dispose();
  renderer?.dispose();
  renderer?.forceContextLoss();
  canvas?.remove();
  renderer = canvas = scene = controls = currentData = canvasHostEl = null;
  cameraPersp = cameraOrtho = activeCamera = null;
  blockGroup = plantsGroup = shadowPlane = floatGroup = null;
  elevationSampler = elevationKey = null;
  currentBlock.bounds = null;
  isDragging = false;
}
