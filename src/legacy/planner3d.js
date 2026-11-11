/**
 * Limited Planner renderer, forked from planner-3d-base:src/legacy/studio3d.js.
 * Keep the approved block, terrain, soil, crop geometry and floating motion
 * independent of the rotation studio.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildStudioData, FAO56_CROP_LIMITS } from "./studiodata.js";
import {
  outlineBounds, ringSignedArea, canopyVisualHeight, idleCameraSway,
  IDLE_RESUME_DELAY_S,
  fitCameraToBlock, fitTopView, plannerRowLayout,
  capPlantPositions, MAX_PLANTS_PER_FIELD, computeFieldFraming,
  easeOutCubic, easeInOutCubic, rowStaggerProgress, matchPlantPositions,
} from "./planner3d-helpers.js";
import {
  introCameraParams,
  shouldSkipIntro,
  sampleRowCropScale,
} from "./studio3d-helpers.js";
import {
  smoothOutline,
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
  ctx.fillStyle = "#a8906b";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "rgba(142,112,76,0.55)";
  for (let y = 14; y < 512; y += 28) ctx.fillRect(0, y, 512, 6);
  const tint = stageColor(month.cropId, month.stage);
  const r = parseInt(tint.slice(1, 3), 16);
  const g = parseInt(tint.slice(3, 5), 16);
  const b = parseInt(tint.slice(5, 7), 16);
  ctx.fillStyle = `rgba(${r},${g},${b},0.14)`;
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "rgba(64,44,26,0.38)";
  ctx.lineWidth = 2.5;
  for (let y = 18; y < 512; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
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

function buildSurfaceGeometry(ringM, heightAt, bounds) {
  const ring = ringM.map(([x, y]) => new THREE.Vector2(x, y));
  const triangles = THREE.ShapeUtils.triangulateShape(ring, []);
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
  // Organic outline smoothing pass (Chaikin / quadratic pass <= 1.5 m)
  const ringM = smoothOutline(outlineM, 1.5);
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

  const topGeom = buildSurfaceGeometry(ringM, heightAt, bounds);
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
  if (undersideMesh) blockGroup.add(undersideMesh);
  ensureFloatGroup();
  floatGroup.add(blockGroup);

  currentBlock.depth = depth;
  currentBlock.bottomY = bottomY;
  currentBlock.topMin = topMin;
  currentBlock.topMax = topMax;
  currentBlock.bounds = bounds;
}

function mergeClumpParts(parts) {
  const nonIndexed = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  parts.forEach((geometry, i) => {
    if (geometry !== nonIndexed[i]) geometry.dispose();
  });
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
function buildClumpGeometry(cropId, heightM, spreadM, stage = "grow", lod = "high") {
  const h = Math.max(0.06, heightM);
  const r = Math.max(0.08, spreadM * 0.46);
  const isLow = lod === "low";

  // Use crop-specific config for enhanced realism
  const config = CROP_CONFIG[cropId] || CROP_CONFIG.rice;

  if (cropId === "aman" || cropId === "boro" || cropId === "rice") {
    const parts = [];
    const blades = isLow ? 5 : 8;
    for (let k = 0; k < blades; k++) {
      const angle = (k / blades) * Math.PI * 2 + Math.sin(k * 11.3) * 0.22;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const bladeH = h * (config.heightFactor + Math.abs(Math.sin(k * 3.7)) * 0.28);
      const baseW = Math.max(0.012, r * config.leafWidth);
      const midW = baseW * 0.68;
      const tipW = baseW * 0.16;
      const lean = r * (config.leafLean + Math.abs(Math.cos(k * 2.1)) * 0.26);
      const bx0 = -baseW * s, bz0 = baseW * c;
      const bx1 = baseW * s, bz1 = -baseW * c;
      const mx = lean * c * 0.55, mz = lean * s * 0.55;
      const mX0 = mx - midW * s, mZ0 = mz + midW * c;
      const mX1 = mx + midW * s, mZ1 = mz - midW * c;
      const tx = lean * c, tz = lean * s;
      const tX0 = tx - tipW * s, tZ0 = tz + tipW * c;
      const tX1 = tx + tipW * s, tZ1 = tz - tipW * c;
      const g = new THREE.BufferGeometry();
      const verts = [
        bx0, 0, bz0,       bx1, 0, bz1,       mX0, bladeH * 0.5, mZ0,
        bx1, 0, bz1,       mX1, bladeH * 0.5, mZ1,  mX0, bladeH * 0.5, mZ0,
        mX0, bladeH * 0.5, mZ0, mX1, bladeH * 0.5, mZ1, tX0, bladeH, tZ0,
        mX1, bladeH * 0.5, mZ1, tX1, bladeH, tZ1,     tX0, bladeH, tZ0,
      ];
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      parts.push(g);
    }
    if (stage !== "establish") {
      const panicles = isLow ? 2 : (stage === "mature" ? 4 : 3);
      for (let p = 0; p < panicles; p++) {
        const panAngle = (p / panicles) * Math.PI * 2 + 0.35;
        const pc = Math.cos(panAngle), ps = Math.sin(panAngle);
        const panH = h * 0.28;
        const pan = new THREE.ConeGeometry(r * 0.08, panH, 4);
        pan.rotateZ(0.48 * pc); pan.rotateX(0.48 * ps);
        pan.translate(pc * r * 0.38, h * 0.92, ps * r * 0.38);
        parts.push(pan);
      }
    }
    const base = new THREE.ConeGeometry(r * 0.26, h * 0.5, 5);
    base.translate(0, h * 0.25, 0); parts.push(base);
    return mergeClumpParts(parts);
  }

  if (cropId === "mustard") {
    const parts = [];
    const stem = new THREE.CylinderGeometry(r * config.stemWidth, r * config.stemWidth * 2, h * config.heightFactor, 4);
    stem.translate(0, h * 0.46, 0); parts.push(stem);
    const leafCount = isLow ? 2 : config.leafCount;
    for (let k = 0; k < leafCount; k++) {
      const ang = (k / leafCount) * Math.PI * 2 + k * 0.5;
      const leaf = new THREE.ConeGeometry(r * config.leafSize, h * 0.35, 3);
      leaf.rotateZ(config.leafLean * Math.cos(ang)); leaf.rotateX(config.leafLean * Math.sin(ang));
      leaf.translate(Math.cos(ang) * r * 0.3, h * 0.22, Math.sin(ang) * r * 0.3); parts.push(leaf);
    }
    if (stage !== "establish") {
      const topCluster = new THREE.IcosahedronGeometry(r * 0.32, 0);
      topCluster.scale(1.1, 0.65, 1.1); topCluster.translate(0, h * 0.92, 0); parts.push(topCluster);
      if (!isLow) {
        for (let c = 0; c < 3; c++) {
          const ca = (c / 3) * Math.PI * 2;
          const sideCl = new THREE.IcosahedronGeometry(r * 0.16, 0);
          sideCl.translate(Math.cos(ca) * r * 0.2, h * 0.82, Math.sin(ca) * r * 0.2); parts.push(sideCl);
        }
      }
    }
    return mergeClumpParts(parts);
  }

  if (cropId === "potato") {
    const parts = []; const stem = new THREE.CylinderGeometry(r * config.stemWidth, r * config.stemWidth * 2, h * config.heightFactor, 4);
    stem.translate(0, h * 0.22, 0); parts.push(stem);
    const leaflets = isLow ? 3 : config.leafCount;
    for (let k = 0; k < leaflets; k++) {
      const ang = (k / leaflets) * Math.PI * 2 + (k % 2) * 0.3;
      const dist = r * (0.35 + (k % 2) * 0.25);
      const leaf = new THREE.IcosahedronGeometry(r * config.leafSize, 0);
      leaf.scale(1.1, 0.45, 0.85); leaf.rotateY(ang);
      leaf.translate(Math.cos(ang) * dist, h * (0.32 + (k % 3) * 0.18), Math.sin(ang) * dist); parts.push(leaf);
    }
    const center = new THREE.IcosahedronGeometry(r * 0.48, 0); center.scale(1, 0.55, 1);
    center.translate(0, h * 0.55, 0); parts.push(center);
    return mergeClumpParts(parts);
  }

  if (cropId === "mungbean" || cropId === "lentil") {
    const parts = []; const center = new THREE.ConeGeometry(r * 0.24, h * config.heightFactor, 4);
    center.translate(0, h * 0.22, 0); parts.push(center);
    const clusters = isLow ? 2 : 3;
    for (let t = 0; t < clusters; t++) {
      const baseAng = (t / clusters) * Math.PI * 2 + t * 0.2; const dist = r * 0.42;
      const clusterH = h * (0.35 + (t % 2) * 0.18);
      for (let l = -1; l <= 1; l++) {
        const leafAng = baseAng + l * 0.45;
        const leaf = new THREE.IcosahedronGeometry(r * config.leafSize, 0);
        leaf.scale(1, 0.4, 0.7); leaf.rotateY(leafAng);
        leaf.translate(Math.cos(baseAng) * dist + Math.cos(leafAng) * r * 0.15, clusterH,
          Math.sin(baseAng) * dist + Math.sin(leafAng) * r * 0.15); parts.push(leaf);
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
  disposeGroup(plantsGroup);
  plantsGroup = null;

  const month = data.months[0];
  if (!month || month.stage === "fallow" || !month.cropId) return;

  const outlineM = data.field.outlineM;
  const bounds = currentBlock.bounds || outlineBounds(outlineM);
  const heightAt = makeHeightAt(data);
  const layout = plannerRowLayout(outlineM, data.planner.row, data.planner.spacing, data.planner.usable);
  const { positions, spacingX, spacingY } = layout;
  canvasHostEl.dataset.rowCount = layout.rowCount;
  
  // Cap instance count for performance, with honest note
  const { positions: cappedPositions, totalCount, sampleStep, sampleRatioNote } = capPlantPositions(
    positions,
    isPhone() ? 4000 : 32000
  );
  canvasHostEl.dataset.plantCount = cappedPositions.length;
  if (totalCount > cappedPositions.length && canvasHostEl) {
    canvasHostEl.dataset.plantSampleNote = sampleRatioNote;
  } else if (canvasHostEl) {
    delete canvasHostEl.dataset.plantSampleNote;
  }
  
  if (cappedPositions.length === 0) return;

  const fieldSpan = Math.max(bounds.width, bounds.height);
  const h = canopyVisualHeight(month, fieldSpan);
  if (!(h > 0)) return;

  // Use LOD based on instance count: high detail for <10k, low for more
  const lod = cappedPositions.length > 10000 ? "low" : "high";
  const spacing = Math.min(spacingX, spacingY);
  
  const geom = buildClumpGeometry(month.cropId, h, spacing, month.stage, lod);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0,
    flatShading: true,
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
         float wind = uWindStrength * sin(uTime * 1.3 + position.y * 0.5 + instanceMatrix[12] * 0.1) * (0.5 + 0.5 * position.y);
         transformed.x += cos(uTime * 0.7 + instanceMatrix[12] * 0.05) * wind;
         transformed.z += sin(uTime * 0.7 + instanceMatrix[12] * 0.05) * wind;`
      );
      mat.userData.windShader = shader;
    };
  }
  
  const mesh = new THREE.InstancedMesh(geom, mat, cappedPositions.length);
  mesh.castShadow = !isPhone();
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  const base = new THREE.Color(stageColor(month.cropId, month.stage));
  const colour = new THREE.Color();

  // Crop-specific size adjustments
  const cropScale = month.cropId === "potato" ? 1.35 : month.cropId === "mustard" ? 1.15 : 1.0;
  // Stage scaling: seedlings smaller, harvest stumps shorter
  const stageScale = month.stage === "establish" ? 0.42 : month.stage === "harvest" ? 0.55 : 1.0;

  for (let i = 0; i < cappedPositions.length; i++) {
    const [x, y] = cappedPositions[i];
    const z = -y;
    const jitter = 0.82 + deterministic(i, 1) * 0.38;
    const yaw = deterministic(i, 2) * Math.PI * 2;
    dummy.position.set(
      x + (deterministic(i, 3) - 0.5) * spacing * 0.18,
      heightAt(x, z) + 0.015,
      z + (deterministic(i, 4) - 0.5) * spacing * 0.18,
    );
    dummy.rotation.set(0, yaw, 0);
    const sx = jitter * cropScale * stageScale;
    const sz = jitter * cropScale * stageScale;
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
  if (prefersReducedMotion || !oldCropId || oldCropId === newCropId) {
    // No animation needed
    return;
  }

  const oldPlants = plantsGroup?.userData.plants;
  const oldMesh = plantsGroup?.children.find(c => c.isInstancedMesh);
  
  if (!oldMesh || !oldPlants) {
    // No old plants to transition from
    return;
  }

  // Build new plants (initially hidden/at zero scale)
  buildPlants(newData);
  const newMesh = plantsGroup?.children.find(c => c.isInstancedMesh);
  
  if (!newMesh) return;

  const oldMat = oldMesh.material;
  const newMat = newMesh.material;
  const oldBase = oldMesh.userData.baseMatrices;
  const newBase = newMesh.userData.baseMatrices;
  const newRowProgress = newMesh.userData.rowProgress || [];
  const newCount = newMesh.count;

  // Make materials transparent for fade
  oldMat.transparent = true;
  oldMat.opacity = 1.0;
  newMat.transparent = true;
  newMat.opacity = 0.0;

  const startTime = performance.now();
  const duration = 700; // ms for crop change

  transitionAnim = { startTime, duration, oldMesh, newMesh, oldMat, newMat, newRowProgress, newCount };

  const animate = () => {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeInOutCubic(progress);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      // Clean up old mesh
      transitionAnim = null;
      if (oldMesh && oldMesh.parent) oldMesh.parent.remove(oldMesh);
      oldMesh.geometry.dispose();
      oldMat.dispose();
      return;
    }

    // Old plants: shrink and fade
    oldMat.opacity = 1.0 - eased;
    
    // New plants: grow in with row-wise stagger
    const newArr = newMesh.instanceMatrix.array;
    for (let i = 0; i < newCount; i++) {
      const rowP = newRowProgress[i] || 0;
      const rowDelay = rowP * 0.3; // 30% stagger between rows
      const rowEased = easeOutCubic(Math.min(1, (eased - rowDelay) / (1 - rowDelay + 0.001)));
      const scale = rowEased;
      
      const offset = i * 16;
      for (let c = 0; c < 12; c++) {
        newArr[offset + c] = newBase[offset + c] * scale;
      }
    }
    newMesh.instanceMatrix.needsUpdate = true;
    newMat.opacity = eased;
    requestRender();
  };

  requestAnimationFrame(animate);
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

  if (renderer && renderer.shadowMap && !isPhone()) {
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
  // Use computeFieldFraming for consistent ~85% width fill
  const elevationDeg = 14;
  const yawDeg = 10;
  const margin = isPhone() ? 0.22 : 0.18;
  
  // Get framing that fills ~85% of viewport width
  const framing = computeFieldFraming({
    bounds: b,
    aspect: hostAspect(),
    fovDeg: cameraPersp.fov,
    targetWidthRatio: 0.85,
    elevationDeg,
    yawDeg,
  });

  const distance = framing.distance * 0.92;
  const el = (elevationDeg * Math.PI) / 180;
  const yaw = (yawDeg * Math.PI) / 180;
  const target = [framing.target[0], -depth * 0.45, framing.target[2]];
  cameraPersp.position.set(
    target[0] + Math.cos(el) * Math.sin(yaw) * distance,
    target[1] + Math.sin(el) * distance,
    target[2] + Math.cos(el) * Math.cos(yaw) * distance,
  );
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
    // Idle sway is a transient offset on top of the user's camera: applied
    // after controls.update() and restored right after the frame renders.
    if (!introAnim) applyIdleFloat(time / 1000);
    else restoreIdleCamera();
    renderer.render(scene, activeCamera);
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
  data.months = [{ cropId, stage: cropId === "mustard" ? "mature" : "grow",
    stageFraction: 1, canopyHeightM: FAO56_CROP_LIMITS[cropId].heightM }];
  data.planner = { ...input.planner };
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
  
  const oldCropId = currentData?.months[0]?.cropId;
  currentData = data;
  
  buildFieldBlock(data);
  
  // Handle crop transition if crop changed
  if (oldCropId && oldCropId !== cropId) {
    buildPlants(data);
    startCropTransition(oldCropId, cropId, data);
  } else {
    buildPlants(data);
  }
  
  buildShadow(data);
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
  stopIntroAnimation(true);
  stopAnimation();
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
