/**
 * STUDIO2 · 3D Field Studio
 * Plots farmer parcel as extruded 3D block with soil layers cutaway,
 * monthly crop growth, and NASA/Sentinel data overlays.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { t, truth, esc, num } from "./ui.js";

// Global persistent state across view repaints
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
let currentLayer = "crops"; // 'photo' | 'ndvi' | 'moisture' | 'crops'
let currentCutaway = 0; // 0..1
let showSurroundings = true;
let isTopView = false;
let isPlaying = false;
let playTimer = null;
let containerEl = null;
let canvasHostEl = null;
let isDisposed = false;
let isVisible = true;
let intersectionObserver = null;

// Mesh refs
let blockGroup = null;
let extrudedMesh = null;
let plantsInstancedMesh = null;
let rootsGroup = null;
let surroundingsMesh = null;
let soilBandsGroup = null;
let topMesh = null;

// Texture caches
const textureCache = new Map();

/**
 * Check WebGL capability
 */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

/**
 * Texture color for soil texture class
 */
const SOIL_TEXTURE_COLORS = {
  "clay": "#4a3525",
  "silty clay": "#533e2c",
  "sandy clay": "#5c4735",
  "clay loam": "#66503c",
  "silty clay loam": "#6e5944",
  "sandy clay loam": "#79644f",
  "loam": "#836d56",
  "silt loam": "#8d7860",
  "silt": "#98836a",
  "sandy loam": "#a38e75",
  "loamy sand": "#ae9a81",
  "sand": "#baa68d",
  "default": "#7a5f45"
};

/**
 * Compute bounding radius of 2D polygon outline
 */
function getOutlineBounds(outlineM) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of outlineM) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const rx = (maxX - minX) / 2;
  const ry = (maxY - minY) / 2;
  const r = Math.max(rx, ry, 15);
  return { minX, maxX, minY, maxY, cx, cy, radius: r, width: maxX - minX, height: maxY - minY };
}

/**
 * Build top surface canvas texture based on active layer
 */
async function buildTopTexture(data, layer, monthIdx) {
  const cacheKey = `${layer}-${monthIdx}-${data.field.id}`;
  if (textureCache.has(cacheKey)) {
    return textureCache.get(cacheKey);
  }

  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 512;
  const ctx = cvs.getContext("2d");

  const bounds = getOutlineBounds(data.field.outlineM);

  if (layer === "photo") {
    // Online Wayback Esri tile / Offline fallback natural Sentinel-2 tile
    const [w, s, e, n] = data.field.bboxLatLon || [89.269, 25.539, 89.271, 25.541];
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    let loaded = false;

    if (isOnline) {
      try {
        const z = 18;
        const lat2tile = (lat, zoom) => Math.floor(((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * Math.pow(2, zoom));
        const lon2tile = (lon, zoom) => Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
        const x = lon2tile((w + e) / 2, z);
        const y = lat2tile((s + n) / 2, z);
        const url = `https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/64776/${z}/${y}/${x}`;
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise((res, rej) => {
          img.onload = () => res();
          img.onerror = rej;
          img.src = url;
        });
        ctx.drawImage(img, 0, 0, 512, 512);
        loaded = true;
      } catch (err) {
        // Fall back to offline
      }
    }

    if (!loaded) {
      // Natural offline tile or fallback green/earth canvas
      ctx.fillStyle = "#5c6b48";
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = "#4a5839";
      for (let i = 0; i < 40; i++) {
        ctx.fillRect((i * 37) % 512, (i * 59) % 512, 40, 20);
      }
    }
  } else if (layer === "ndvi") {
    // Greenness NDVI palette: #313695 (< -0.5), #a50026 (-0.5..0), #fee08b (0..0.2), #d9ef8b (0.2..0.4), #66bd63 (0.4..0.6), #006837 (> 0.6)
    const vegVal = data.vegetation?.length ? data.vegetation[0].ndvi ?? 0.6 : 0.6;
    ctx.fillStyle = "#d9ef8b";
    if (vegVal > 0.6) ctx.fillStyle = "#006837";
    else if (vegVal > 0.4) ctx.fillStyle = "#66bd63";
    else if (vegVal > 0.2) ctx.fillStyle = "#d9ef8b";
    else if (vegVal > 0.0) ctx.fillStyle = "#fee08b";
    else if (vegVal > -0.5) ctx.fillStyle = "#a50026";
    else ctx.fillStyle = "#313695";

    ctx.fillRect(0, 0, 512, 512);

    // Grid lines for cell simulation
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, 512);
      ctx.moveTo(0, p); ctx.lineTo(512, p);
      ctx.stroke();
    }
  } else if (layer === "moisture") {
    // NDMI moisture palette: dry yellow-brown to moist deep blue
    const mVal = data.moisture?.length ? data.moisture[0].ndmi ?? 0.2 : 0.2;
    if (mVal > 0.3) ctx.fillStyle = "#2c7bb6";
    else if (mVal > 0.1) ctx.fillStyle = "#abd9e9";
    else if (mVal > -0.1) ctx.fillStyle = "#ffffbf";
    else ctx.fillStyle = "#fdae61";

    ctx.fillRect(0, 0, 512, 512);

    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0); ctx.lineTo(p, 512);
      ctx.moveTo(0, p); ctx.lineTo(512, p);
      ctx.stroke();
    }
  } else {
    // Default "crops" layer ground: tilled soil / bare earth bed
    ctx.fillStyle = "#5c4735";
    ctx.fillRect(0, 0, 512, 512);
    // Add furrow lines
    ctx.strokeStyle = "rgba(45, 30, 20, 0.4)";
    ctx.lineWidth = 4;
    for (let y = 16; y < 512; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(cvs);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textureCache.set(cacheKey, texture);
  return texture;
}

/**
 * Build 3D extruded field block with soil bands
 */
async function buildFieldBlock(data, cutawayFraction) {
  if (blockGroup) {
    scene.remove(blockGroup);
    // Recursively dispose children
    blockGroup.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
    blockGroup = null;
  }

  blockGroup = new THREE.Group();
  const outlineM = data.field.outlineM;
  if (!outlineM || outlineM.length < 3) return;

  const bounds = getOutlineBounds(outlineM);

  // Apply cutaway slice along X axis if cutawayFraction > 0
  // Slicing: cutawayFraction 0..1 chops the block from maxX back to minX
  const effectiveMaxX = bounds.maxX - cutawayFraction * (bounds.maxX - bounds.minX);

  const shape = new THREE.Shape();
  // Filter or clip polygon against effectiveMaxX for cutaway
  const pts = [];
  for (let i = 0; i < outlineM.length; i++) {
    const [x, y] = outlineM[i];
    const clippedX = Math.min(x, effectiveMaxX);
    pts.push([clippedX, y]);
  }

  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    shape.lineTo(pts[i][0], pts[i][1]);
  }
  shape.closePath();

  // Total block depth in metres (1.5 m soil depth)
  const totalDepthM = 1.5;

  const extrudeSettings = {
    steps: 1,
    depth: totalDepthM,
    bevelEnabled: false,
  };

  const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // ExtrudeGeometry extrudes in Z. We want Y to be up, so rotate -90 deg on X
  geom.rotateX(Math.PI / 2);

  const topTex = await buildTopTexture(data, currentLayer, currentMonthIdx);

  // Materials: 0 is front/back (top/bottom), 1 is sides
  const topMat = new THREE.MeshStandardMaterial({
    map: topTex,
    roughness: 0.85,
    metalness: 0.05,
  });

  const sideMat = new THREE.MeshStandardMaterial({
    color: "#6e5944",
    roughness: 0.9,
    metalness: 0.05,
  });

  extrudedMesh = new THREE.Mesh(geom, [topMat, sideMat]);
  extrudedMesh.position.set(0, 0, 0);
  blockGroup.add(extrudedMesh);

  // Soil layer labels and bands if soil exists
  if (data.soil?.layers && data.soil.layers.length > 0) {
    soilBandsGroup = new THREE.Group();
    // Create colored lines or depth marks along the cut face if cutaway > 0
    data.soil.layers.forEach((layer) => {
      const topY = -(layer.topCm / 100);
      const btmY = -(layer.bottomCm / 100);
      const col = SOIL_TEXTURE_COLORS[layer.textureClass?.toLowerCase()] || SOIL_TEXTURE_COLORS.default;
      // Line across cutaway face
      const lineGeom = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(effectiveMaxX, topY, bounds.minY),
        new THREE.Vector3(effectiveMaxX, topY, bounds.maxY),
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
      const line = new THREE.Line(lineGeom, lineMat);
      soilBandsGroup.add(line);
    });
    blockGroup.add(soilBandsGroup);
  }

  scene.add(blockGroup);
}

/**
 * Build InstancedMesh plants and roots
 */
function buildPlantsAndRoots(data, monthIdx) {
  if (plantsInstancedMesh) {
    scene.remove(plantsInstancedMesh);
    plantsInstancedMesh.geometry.dispose();
    plantsInstancedMesh.material.dispose();
    plantsInstancedMesh = null;
  }
  if (rootsGroup) {
    scene.remove(rootsGroup);
    rootsGroup.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    });
    rootsGroup = null;
  }

  const month = data.months?.[monthIdx];
  if (!month || month.stage === "fallow" || !month.cropId) return;

  const outlineM = data.field.outlineM;
  const bounds = getOutlineBounds(outlineM);
  const effectiveMaxX = bounds.maxX - currentCutaway * (bounds.maxX - bounds.minX);

  // Plant density cap based on device memory / cores
  const isPhone = typeof window !== "undefined" && window.innerWidth <= 600;
  const devMem = (typeof navigator !== "undefined" && navigator.deviceMemory) || 4;
  const maxPlants = isPhone || devMem <= 4 ? 4000 : 18000;

  // Real spacing: rice ~0.2m, mustard ~0.3m, potato ~0.6m
  let spacingM = 0.4;
  if (month.cropId === "mustard") spacingM = 0.3;
  else if (month.cropId === "boro" || month.cropId === "aman") spacingM = 0.25;
  else if (month.cropId === "potato") spacingM = 0.5;

  const cols = Math.floor(bounds.width / spacingM);
  const rows = Math.floor(bounds.height / spacingM);
  const totalGridPoints = cols * rows;
  const step = Math.max(1, Math.ceil(Math.sqrt(totalGridPoints / maxPlants)));
  const actualSpacing = spacingM * step;

  // Simple point-in-polygon check for plants inside outlineM
  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  const validPositions = [];
  for (let x = bounds.minX + actualSpacing / 2; x <= effectiveMaxX; x += actualSpacing) {
    for (let y = bounds.minY + actualSpacing / 2; y <= bounds.maxY; y += actualSpacing) {
      if (pointInPoly(x, y, outlineM)) {
        validPositions.push([x, y]);
      }
    }
  }

  const count = validPositions.length;
  if (count === 0) return;

  // Height = canopyHeightM * stageFraction; stubble if harvest; bare if fallow
  let h = (month.canopyHeightM || 0.5) * (month.stageFraction || 0.5);
  if (month.stage === "harvest") h = 0.08; // stubble
  h = Math.max(0.05, h);

  // Plant geometry: simple conical / cylindrical crop stalk
  const plantGeom = new THREE.ConeGeometry(actualSpacing * 0.35, h, 5);
  plantGeom.translate(0, h / 2, 0); // Ground base at y=0

  // Color: green -> gold at mature, pale golden brown at harvest
  let cropColor = "#3d8b37";
  if (month.stage === "mature") cropColor = "#d4af37"; // gold
  else if (month.stage === "harvest") cropColor = "#c2a649"; // stubble
  else if (month.stage === "establish") cropColor = "#7cb342";

  const plantMat = new THREE.MeshStandardMaterial({
    color: cropColor,
    roughness: 0.7,
    metalness: 0.1,
  });

  plantsInstancedMesh = new THREE.InstancedMesh(plantGeom, plantMat, count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i++) {
    const [x, z] = validPositions[i];
    // In our scene, Y is up, and outline (x, y) maps to X and -Z
    dummy.position.set(x, 0, -z);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    plantsInstancedMesh.setMatrixAt(i, dummy.matrix);
  }

  plantsInstancedMesh.instanceMatrix.needsUpdate = true;
  scene.add(plantsInstancedMesh);

  // Roots on the cut face if cutaway > 0 and rootDepthM exists
  if (currentCutaway > 0.05 && month.rootDepthM) {
    rootsGroup = new THREE.Group();
    const rootDepth = month.rootDepthM * (month.stageFraction || 0.5);
    const rootMat = new THREE.LineBasicMaterial({ color: 0xecd5b7, opacity: 0.8, transparent: true });

    // Show roots along the cut plane (x = effectiveMaxX)
    for (let i = 0; i < validPositions.length; i += 4) {
      const [x, z] = validPositions[i];
      if (Math.abs(x - effectiveMaxX) < actualSpacing * 1.5) {
        const rootGeom = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(effectiveMaxX, 0, -z),
          new THREE.Vector3(effectiveMaxX + (Math.random() - 0.5) * 0.2, -rootDepth * (0.8 + Math.random() * 0.4), -z + (Math.random() - 0.5) * 0.2),
        ]);
        const line = new THREE.Line(rootGeom, rootMat);
        rootsGroup.add(line);
      }
    }
    scene.add(rootsGroup);
  }
}

/**
 * Build Surroundings ground ring
 */
function buildSurroundings(data) {
  if (surroundingsMesh) {
    scene.remove(surroundingsMesh);
    surroundingsMesh.geometry.dispose();
    surroundingsMesh.material.dispose();
    surroundingsMesh = null;
  }
  if (!showSurroundings) return;

  const bounds = getOutlineBounds(data.field.outlineM);
  const outerR = bounds.radius * 3.5;
  const innerR = bounds.radius * 1.05;

  const ringGeom = new THREE.RingGeometry(innerR, outerR, 32);
  ringGeom.rotateX(-Math.PI / 2); // Lay flat on XZ plane

  const ringMat = new THREE.MeshStandardMaterial({
    color: "#4e5e40",
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.65,
  });

  surroundingsMesh = new THREE.Mesh(ringGeom, ringMat);
  surroundingsMesh.position.set(0, -0.01, 0);
  scene.add(surroundingsMesh);
}

/**
 * Initialize Three.js scene, renderer, cameras, lights, controls
 */
function initThree(host) {
  if (renderer && canvas && host.contains(canvas)) {
    return;
  }

  const width = host.clientWidth || 600;
  const height = host.clientHeight || 450;

  scene = new THREE.Scene();
  scene.background = new THREE.Color("#e8eee6"); // Soft haze

  // Cameras
  const aspect = width / height;
  cameraPersp = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
  cameraPersp.position.set(0, 35, 45);

  const orthoDist = 30;
  cameraOrtho = new THREE.OrthographicCamera(
    -orthoDist * aspect,
    orthoDist * aspect,
    orthoDist,
    -orthoDist,
    0.1,
    1000
  );
  cameraOrtho.position.set(0, 60, 0);
  cameraOrtho.up.set(0, 0, -1); // North up
  cameraOrtho.lookAt(0, 0, 0);

  activeCamera = isTopView ? cameraOrtho : cameraPersp;

  // Renderer
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    const isPhone = typeof window !== "undefined" && window.innerWidth <= 600;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isPhone ? 1.5 : 2.0));
    canvas = renderer.domElement;
  }
  renderer.setSize(width, height);
  host.appendChild(canvas);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xfff8eb, 0.9);
  dirLight.position.set(25, 40, 20);
  scene.add(dirLight);

  // Controls
  if (controls) controls.dispose();
  controls = new OrbitControls(activeCamera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.05; // Do not go under ground
  controls.minDistance = 5;
  controls.maxDistance = 180;
  controls.target.set(0, 0, 0);
  controls.addEventListener("change", requestRender);

  // Handle WebGL context lost
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    showFallbackMessage(t("3D context lost. Please reload or continue with the calendar.", "৩ডি সংযোগ বিচ্ছিন্ন হয়েছে। পৃষ্ঠাটি রিলোড করুন।"));
  });

  startLoop();
}

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

function startLoop() {
  function loop() {
    if (controls?.autoRotate) controls.update();
    if (renderer && scene && activeCamera && isVisible) {
      renderer.render(scene, activeCamera);
      updateCompass();
    }
    animFrameId = requestAnimationFrame(loop);
  }
  if (!animFrameId) loop();
}

function stopLoop() {
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }
}

/**
 * Compass tracking bearing
 */
function updateCompass() {
  const compassEl = document.querySelector(".studio-compass");
  if (!compassEl || !activeCamera) return;
  const dir = new THREE.Vector3();
  activeCamera.getWorldDirection(dir);
  const angleRad = Math.atan2(dir.x, -dir.z);
  const deg = (angleRad * 180) / Math.PI;
  compassEl.style.transform = `rotate(${deg}deg)`;
}

function showFallbackMessage(msg) {
  const host = document.querySelector(".studio-stage-canvas-host");
  if (host) {
    host.innerHTML = `<div class="studio-fallback-msg">${esc(msg)}</div>`;
  }
}

/**
 * Render observation sparkline SVG
 */
function renderSparkline(vegetation, activeMonthIdx) {
  if (!vegetation || vegetation.length === 0) {
    return `<div class="note">${t("No optical vegetation observations available", "স্যাটেলাইট পর্যবেক্ষণ পাওয়া যায়নি")}</div>`;
  }
  const sorted = [...vegetation].sort((a, b) => a.date.localeCompare(b.date));
  const w = 290, h = 42;
  const pts = sorted.map((v, i) => {
    const x = 15 + (i / Math.max(1, sorted.length - 1)) * (w - 30);
    const ndvi = v.ndvi !== null ? v.ndvi : 0.5;
    const y = h - 6 - Math.max(0, Math.min(1, ndvi)) * (h - 12);
    return { x, y, ...v };
  });

  const polyline = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Find nearest point to the active month
  const targetPrefix = `2024-${String(activeMonthIdx + 1).padStart(2, "0")}`;
  let nearestIdx = 0;
  let minDiff = Infinity;
  pts.forEach((p, i) => {
    const diff = Math.abs(new Date(p.date) - new Date(`${targetPrefix}-15`));
    if (diff < minDiff) {
      minDiff = diff;
      nearestIdx = i;
    }
  });

  const dots = pts
    .map(
      (p, i) =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${i === nearestIdx ? 5 : 3}" class="sparkline-dot ${i === nearestIdx ? "active" : ""}" data-spark-idx="${i}"><title>${p.date}: NDVI ${p.ndvi !== null ? num(p.ndvi, 2) : "—"} (${p.source})</title></circle>`
    )
    .join("");

  return `<div class="sparkline-container">
    <svg class="sparkline-svg" viewBox="0 0 ${w} ${h}">
      <polyline points="${polyline}" class="sparkline-line" />
      ${dots}
    </svg>
    <div style="display:flex;justify-content:space-between;font:11px Mono,monospace;color:var(--text-dim);margin-top:2px;">
      <span>${sorted[0].date}</span>
      <span>${sorted[sorted.length - 1].date}</span>
    </div>
  </div>`;
}

/**
 * Full HTML component for the 3D Studio
 */
export function studio3dHtml(data, activeMonth = 0) {
  currentData = data;
  currentMonthIdx = activeMonth;
  const m = data.months[currentMonthIdx] || data.months[0];
  const truthTags = data.truth || {};

  // Soil info
  const soilSummary = data.soil
    ? `${data.soil.layers.length} ${t("layers", "স্তর")} · ${data.soil.source}`
    : t("Soil profile not prepared", "মাটির গভীরতার তথ্য প্রস্তুত নয়");

  // Vegetation point nearest current month
  const nearestVeg = data.vegetation?.length ? data.vegetation[0] : null;

  // Shortfall Litres: formatted nicely
  const litresDisplay = num(m.shortfallLitres || 0);

  // Visually hidden live summary for screen readers
  const srSummary = t(
    `Month: ${m.month}, Crop: ${m.cropName}, Stage: ${m.stage}, Rain: ${num(m.rainMm, 1)} mm, Need: ${num(m.needMm, 1)} mm, Shortfall: ${num(m.shortfallMm, 1)} mm (${litresDisplay} litres)`,
    `মাস: ${m.month}, ফসল: ${m.cropNameBn}, অবস্থা: ${m.stage}, বৃষ্টি: ${num(m.rainMm, 1)} মিমি, প্রয়োজন: ${num(m.needMm, 1)} মিমি, ঘাটতি: ${num(m.shortfallMm, 1)} মিমি (${litresDisplay} লিটার)`
  );

  return `
  <div class="studio-container" id="studio-3d-root">
    <!-- Left rail: layer list + field observation + month weather -->
    <aside class="studio-rail">
      <!-- Rotation selector -->
      <section class="studio-rail-section">
        <h3>${t("Rotation Scenario", "ফসলচক্র")} ${truth(truthTags.plants || "SCENARIO")}</h3>
        <div class="studio-rotations-picker">
          <div class="studio-rotation-option active">
            <span><strong>${esc(t(data.rotation.label, data.rotation.bn))}</strong></span>
            <small class="note">${t("Previewing", "প্রদর্শন চলছে")}</small>
          </div>
        </div>
      </section>

      <!-- Layers Radio -->
      <section class="studio-rail-section">
        <h3>${t("3D Surface Layers", "সারফেস লেয়ার")}</h3>
        <div class="studio-layers-radio">
          <label class="studio-layer-radio-item">
            <input type="radio" name="studio-layer" value="crops" ${currentLayer === "crops" ? "checked" : ""}>
            <span>${t("Crop season (3D Plants)", "মৌসুমি ফসল (৩ডি উদ্ভিদ)")}</span>
          </label>
          <label class="studio-layer-radio-item">
            <input type="radio" name="studio-layer" value="photo" ${currentLayer === "photo" ? "checked" : ""}>
            <span>${t("High-res photo (Esri / Sentinel)", "স্যাটেলাইট ছবি")}</span>
          </label>
          <label class="studio-layer-radio-item">
            <input type="radio" name="studio-layer" value="ndvi" ${currentLayer === "ndvi" ? "checked" : ""}>
            <span>${t("Greenness (NDVI grid)", "সবুজভাব (NDVI)")}</span>
          </label>
          <label class="studio-layer-radio-item">
            <input type="radio" name="studio-layer" value="moisture" ${currentLayer === "moisture" ? "checked" : ""}>
            <span>${t("Moisture (NDMI grid)", "আর্দ্রতা (NDMI)")}</span>
          </label>
        </div>
        <div class="note" style="margin-top:6px;font-size:11px;">
          ${currentLayer === "crops" ? t("Illustrative crops · not observed", "কাল্পনিক ফসল · সরাসরি দেখা নয়") : ""}
        </div>
      </section>

      <!-- Field Observation -->
      <section class="studio-rail-section">
        <h3>${t("Field Observation", "মাঠ পর্যবেক্ষণ")} ${truth(truthTags.vegetation || "REMOTE_OBSERVED")}</h3>
        <div style="font-size:12px;display:flex;justify-content:space-between;margin-bottom:4px;">
          <span>${t("NDVI Vegetation Index", "NDVI সবুজভাব")}</span>
          <strong>${nearestVeg?.ndvi !== null && nearestVeg?.ndvi !== undefined ? num(nearestVeg.ndvi, 2) : "—"}</strong>
        </div>
        ${renderSparkline(data.vegetation, currentMonthIdx)}
        <div style="margin-top:10px;font-size:12px;display:flex;justify-content:space-between;">
          <span>${t("Soil Profile", "মাটির স্তর")}</span>
          <small class="note">${esc(soilSummary)}</small>
        </div>
      </section>

      <!-- Month Weather & Litres -->
      <section class="studio-rail-section">
        <h3>${t("Weather & Water Need", "আবহাওয়া ও পানির চাহিদা")} ${truth(truthTags.weather || "MODELED")}</h3>
        <div class="studio-weather-grid">
          <div class="studio-weather-item">
            <dt>${t("Rainfall", "বৃষ্টি")}</dt>
            <dd>${num(m.rainMm, 1)} <small>mm</small></dd>
          </div>
          <div class="studio-weather-item">
            <dt>${t("Mean Temp", "তাপমাত্রা")}</dt>
            <dd>${num(m.tmeanC, 1)} <small>°C</small></dd>
          </div>
          <div class="studio-weather-item">
            <dt>${t("Reference ETo", "বাষ্পীভবন ETo")}</dt>
            <dd>${num(m.et0Mm, 1)} <small>mm</small></dd>
          </div>
          <div class="studio-weather-item">
            <dt>${t("Crop Need", "ফসলের চাহিদা")}</dt>
            <dd>${num(m.needMm, 1)} <small>mm</small></dd>
          </div>
          <div class="studio-litres-highlight">
            <div style="font-size:11px;color:var(--text-dim);">${t("Water Shortfall for This Plot", "এই জমির জন্য পানির ঘাটতি")}</div>
            <strong>${num(m.shortfallMm, 1)} mm &nbsp;·&nbsp; ${litresDisplay} ${t("Litres", "লিটার")}</strong>
          </div>
        </div>
      </section>
    </aside>

    <!-- Right stage: 3D stage, view switch, calendar bar with play -->
    <div class="studio-stage-wrap">
      <div class="studio-stage-canvas-host" tabindex="0" role="region" aria-label="${t("3D Field Studio Stage", "৩ডি মাঠ স্টুডিও মঞ্চ")}">
        <!-- Compass -->
        <button class="studio-compass" title="${t("Click to face North", "উত্তরমুখী হতে চাপুন")}" aria-label="${t("North Arrow", "উত্তর নির্দেশক")}">
          <div class="studio-compass-arrow"></div>
          <div class="studio-compass-s"></div>
        </button>

        <!-- Surroundings toggle -->
        <div class="studio-surround-bar">
          <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
            <input type="checkbox" id="studio-surroundings-chk" ${showSurroundings ? "checked" : ""}>
            <span>${t("Surroundings", "আশেপাশের জমি")}</span>
          </label>
        </div>

        <!-- Controls (+/-/Reset/Fullscreen) -->
        <div class="studio-stage-controls">
          <button class="studio-ctrl-btn" data-studio-ctrl="zoom-in" title="${t("Zoom In", "কাছে আনুন")}" aria-label="${t("Zoom In", "কাছে আনুন")}">+</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="zoom-out" title="${t("Zoom Out", "দূরে নিন")}" aria-label="${t("Zoom Out", "দূরে নিন")}">−</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="reset" title="${t("Reset Camera", "ক্যামেরা রিসেট")}" aria-label="${t("Reset Camera", "ক্যামেরা রিসেট")}">↺</button>
          <button class="studio-ctrl-btn" data-studio-ctrl="fullscreen" title="${t("Toggle Fullscreen", "ফুলস্ক্রিন")}" aria-label="${t("Toggle Fullscreen", "ফুলস্ক্রিন")}">⛶</button>
        </div>

        <!-- View Switch (3D / Top) -->
        <div class="studio-view-toggle">
          <button class="studio-view-btn ${!isTopView ? "active" : ""}" data-studio-view="3d">${t("3D View", "৩ডি দৃশ্য")}</button>
          <button class="studio-view-btn ${isTopView ? "active" : ""}" data-studio-view="top">${t("Top View", "উপরের দৃশ্য")}</button>
        </div>

        <!-- Soil Cutaway Slider -->
        <div class="studio-cutaway-bar">
          <label for="studio-cutaway-slider">${t("Soil Cutaway", "মাটির স্তর খণ্ড")}</label>
          <input type="range" id="studio-cutaway-slider" min="0" max="0.8" step="0.05" value="${currentCutaway}">
        </div>
      </div>

      <!-- Live text summary for screen readers -->
      <div class="studio-sr-only" aria-live="polite" id="studio-sr-summary">${esc(srSummary)}</div>

      <!-- Calendar bar with play / month slider -->
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
        <div class="studio-month-current-pill">
          ${esc(t(m.month, m.month))} · <strong>${esc(t(m.cropName, m.cropNameBn))}</strong> (${esc(m.stage)})
        </div>
      </div>
    </div>
  </div>`;
}

/**
 * Mount and attach the 3D scene to the container element
 */
export async function mountStudio3d(container, data) {
  if (!container) return;
  containerEl = container;
  currentData = data;
  isDisposed = false;

  const host = container.querySelector(".studio-stage-canvas-host");
  if (!host) return;
  canvasHostEl = host;

  if (!hasWebGL()) {
    showFallbackMessage(t("WebGL is not supported on this device. You can still use the 2D month calendar below.", "আপনার ব্রাউজারে WebGL সক্রিয় নয়। আপনি নিচের ক্যালেন্ডার ব্যবহার করতে পারেন।"));
    return;
  }

  // Show loading indicator if not initialized
  let loader = host.querySelector(".studio-loading-overlay");
  if (!loader && !renderer) {
    loader = document.createElement("div");
    loader.className = "studio-loading-overlay";
    loader.innerHTML = `
      <div class="studio-loading-spinner"></div>
      <div class="studio-loading-text">${t("Loading 3D engine…", "৩ডি ইঞ্জিন লোড হচ্ছে…")}</div>
    `;
    host.appendChild(loader);
  }

  try {
    initThree(host);

    if (loader) {
      loader.querySelector(".studio-loading-text").textContent = t("Building your field…", "জমির ৩ডি মডেল তৈরি হচ্ছে…");
    }

    await buildFieldBlock(data, currentCutaway);

    if (loader) {
      loader.querySelector(".studio-loading-text").textContent = t("Placing crops…", "ফসল সাজানো হচ্ছে…");
    }

    buildPlantsAndRoots(data, currentMonthIdx);
    buildSurroundings(data);

    if (loader && loader.parentNode) {
      loader.parentNode.removeChild(loader);
    }

    requestRender();
    bindEvents(container);
    setupVisibilityObserver(container);
  } catch (err) {
    console.error("Studio3D initialization error:", err);
    showFallbackMessage(t("Failed to initialize 3D Studio.", "৩ডি স্টুডিও চালু করা যায়নি।"));
  }
}

/**
 * Set active month in 3D studio (0..11)
 */
export async function setStudioMonth(monthIdx) {
  currentMonthIdx = monthIdx;
  if (!currentData) return;

  // Update plants & roots
  buildPlantsAndRoots(currentData, currentMonthIdx);
  // If layer needs update
  if (currentLayer !== "crops") {
    await buildFieldBlock(currentData, currentCutaway);
  }

  // Update UI elements in DOM without full reload
  const m = currentData.months[currentMonthIdx];
  if (!m) return;

  const pill = containerEl?.querySelector(".studio-month-current-pill");
  if (pill) {
    pill.innerHTML = `${esc(t(m.month, m.month))} · <strong>${esc(t(m.cropName, m.cropNameBn))}</strong> (${esc(m.stage)})`;
  }

  const slider = containerEl?.querySelector("#studio-month-slider");
  if (slider && +slider.value !== monthIdx) {
    slider.value = monthIdx;
  }

  // Update weather and shortfall litres
  const weatherGrid = containerEl?.querySelector(".studio-weather-grid");
  if (weatherGrid) {
    const litresDisplay = num(m.shortfallLitres || 0);
    weatherGrid.innerHTML = `
      <div class="studio-weather-item">
        <dt>${t("Rainfall", "বৃষ্টি")}</dt>
        <dd>${num(m.rainMm, 1)} <small>mm</small></dd>
      </div>
      <div class="studio-weather-item">
        <dt>${t("Mean Temp", "তাপমাত্রা")}</dt>
        <dd>${num(m.tmeanC, 1)} <small>°C</small></dd>
      </div>
      <div class="studio-weather-item">
        <dt>${t("Reference ETo", "বাষ্পীভবন ETo")}</dt>
        <dd>${num(m.et0Mm, 1)} <small>mm</small></dd>
      </div>
      <div class="studio-weather-item">
        <dt>${t("Crop Need", "ফসলের চাহিদা")}</dt>
        <dd>${num(m.needMm, 1)} <small>mm</small></dd>
      </div>
      <div class="studio-litres-highlight">
        <div style="font-size:11px;color:var(--text-dim);">${t("Water Shortfall for This Plot", "এই জমির জন্য পানির ঘাটতি")}</div>
        <strong>${num(m.shortfallMm, 1)} mm &nbsp;·&nbsp; ${litresDisplay} ${t("Litres", "লিটার")}</strong>
      </div>
    `;
  }

  // Update live reader summary
  const srSummary = containerEl?.querySelector("#studio-sr-summary");
  if (srSummary) {
    srSummary.textContent = t(
      `Month: ${m.month}, Crop: ${m.cropName}, Stage: ${m.stage}, Rain: ${num(m.rainMm, 1)} mm, Need: ${num(m.needMm, 1)} mm, Shortfall: ${num(m.shortfallMm, 1)} mm (${num(m.shortfallLitres || 0)} litres)`,
      `মাস: ${m.month}, ফসল: ${m.cropNameBn}, অবস্থা: ${m.stage}, বৃষ্টি: ${num(m.rainMm, 1)} মিমি, প্রয়োজন: ${num(m.needMm, 1)} মিমি, ঘাটতি: ${num(m.shortfallMm, 1)} মিমি (${num(m.shortfallLitres || 0)} লিটার)`
    );
  }

  requestRender();
}

/**
 * Event bindings for buttons, sliders, keyboard
 */
function bindEvents(container) {
  // Layer change
  container.querySelectorAll('input[name="studio-layer"]').forEach((radio) => {
    radio.onchange = async (e) => {
      currentLayer = e.target.value;
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      requestRender();
    };
  });

  // Cutaway slider
  const cutawaySlider = container.querySelector("#studio-cutaway-slider");
  if (cutawaySlider) {
    cutawaySlider.oninput = async (e) => {
      currentCutaway = parseFloat(e.target.value);
      await buildFieldBlock(currentData, currentCutaway);
      buildPlantsAndRoots(currentData, currentMonthIdx);
      requestRender();
    };
  }

  // Surroundings checkbox
  const surroundChk = container.querySelector("#studio-surroundings-chk");
  if (surroundChk) {
    surroundChk.onchange = (e) => {
      showSurroundings = e.target.checked;
      buildSurroundings(currentData);
      requestRender();
    };
  }

  // View toggle
  container.querySelectorAll("[data-studio-view]").forEach((btn) => {
    btn.onclick = () => {
      const mode = btn.dataset.studioView;
      isTopView = mode === "top";
      container.querySelectorAll("[data-studio-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      activeCamera = isTopView ? cameraOrtho : cameraPersp;
      if (controls) {
        controls.object = activeCamera;
        controls.reset();
        if (isTopView) {
          cameraOrtho.position.set(0, 60, 0);
          cameraOrtho.lookAt(0, 0, 0);
        } else {
          cameraPersp.position.set(0, 35, 45);
          cameraPersp.lookAt(0, 0, 0);
        }
      }
      requestRender();
    };
  });

  // Controls: zoom in, out, reset, fullscreen
  container.querySelectorAll("[data-studio-ctrl]").forEach((btn) => {
    btn.onclick = () => {
      const act = btn.dataset.studioCtrl;
      if (act === "zoom-in") {
        if (isTopView) {
          cameraOrtho.zoom *= 1.25;
          cameraOrtho.updateProjectionMatrix();
        } else {
          cameraPersp.position.multiplyScalar(0.8);
        }
      } else if (act === "zoom-out") {
        if (isTopView) {
          cameraOrtho.zoom *= 0.8;
          cameraOrtho.updateProjectionMatrix();
        } else {
          cameraPersp.position.multiplyScalar(1.25);
        }
      } else if (act === "reset") {
        if (controls) controls.reset();
        if (isTopView) {
          cameraOrtho.position.set(0, 60, 0);
          cameraOrtho.zoom = 1;
          cameraOrtho.updateProjectionMatrix();
          cameraOrtho.lookAt(0, 0, 0);
        } else {
          cameraPersp.position.set(0, 35, 45);
          cameraPersp.lookAt(0, 0, 0);
        }
      } else if (act === "fullscreen") {
        const stage = container.querySelector(".studio-stage-wrap");
        if (!document.fullscreenElement) {
          stage?.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
      requestRender();
    };
  });

  // Compass click: reset orientation
  const compass = container.querySelector(".studio-compass");
  if (compass) {
    compass.onclick = () => {
      if (controls) {
        controls.reset();
      }
      requestRender();
    };
  }

  // Month slider
  const monthSlider = container.querySelector("#studio-month-slider");
  if (monthSlider) {
    monthSlider.oninput = (e) => {
      setStudioMonth(parseInt(e.target.value, 10));
    };
  }

  // Play / Pause button
  const playBtn = container.querySelector("[data-studio-action='toggle-play']");
  if (playBtn) {
    playBtn.onclick = () => {
      togglePlay();
    };
  }

  // Keyboard navigation on canvas host
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
        cameraPersp?.position.multiplyScalar(0.9);
        requestRender();
        e.preventDefault();
      } else if (e.key === "-" || e.key === "_") {
        cameraPersp?.position.multiplyScalar(1.1);
        requestRender();
        e.preventDefault();
      }
    };
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
    // If reduced motion preferred, do not autoplay
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  } else {
    if (playTimer) clearInterval(playTimer);
  }
}

/**
 * Setup IntersectionObserver and Tab visibility handling
 */
function setupVisibilityObserver(container) {
  if (intersectionObserver) intersectionObserver.disconnect();

  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        isVisible = entry.isIntersecting && !document.hidden;
        if (isVisible) {
          startLoop();
          requestRender();
        } else {
          stopLoop();
        }
      },
      { threshold: 0.1 }
    );
    intersectionObserver.observe(container);
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
}

function onVisibilityChange() {
  isVisible = !document.hidden;
  if (isVisible) {
    startLoop();
    requestRender();
  } else {
    stopLoop();
  }
}

/**
 * Dispose studio3d resources when leaving #rotations
 */
export function disposeStudio3d() {
  isDisposed = true;
  stopLoop();
  if (playTimer) clearInterval(playTimer);
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  document.removeEventListener("visibilitychange", onVisibilityChange);

  // Dispose scene objects
  if (scene) {
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material.dispose();
      }
    });
  }

  // Clear textures
  textureCache.forEach((tex) => tex.dispose());
  textureCache.clear();

  if (controls) {
    controls.dispose();
    controls = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  if (canvas && canvas.parentNode) {
    canvas.parentNode.removeChild(canvas);
  }
  canvas = null;
  scene = null;
  containerEl = null;
  canvasHostEl = null;
}
