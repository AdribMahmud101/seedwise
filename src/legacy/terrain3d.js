// src/legacy/terrain3d.js
// 3D Terrain view using vendored Three.js and NASADEM elevation grids.
// Loaded strictly on demand (dynamic import).

let THREE = null;
let OrbitControls = null;
let currentScene = null;
let currentRenderer = null;
let currentCamera = null;
let currentControls = null;
let currentAnimationId = null;
let terrainDataCache = {};
let intersectionObserver = null;
let isPaused = false;
let renderRequested = false;

// Check if WebGL is available in the current browser/environment
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

// Dynamically load Three.js and OrbitControls from public/assets/three/
export async function loadThreeLibraries() {
  if (THREE && OrbitControls) return { THREE, OrbitControls };
  // Use runtime dynamic import to ensure Turbopack / Next bundler does not bundle three.js into initial chunk
  const dynamicImport = new Function("path", "return import(path)");
  const threeModule = await dynamicImport("/assets/three/three.module.min.js");
  const controlsModule = await dynamicImport("/assets/three/OrbitControls.js");
  THREE = threeModule;
  OrbitControls = controlsModule.OrbitControls;
  return { THREE, OrbitControls };
}

// Convert Lat/Lon to Slippy tile numbers
function latlonToTile(lat, lon, z) {
  const latRad = (lat * Math.PI) / 180;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n,
  );
  return { x, y };
}

// Fetch NASADEM terrain JSON for the site
export async function fetchTerrainData(siteId) {
  if (terrainDataCache[siteId]) return terrainDataCache[siteId];
  const url =
    typeof document !== "undefined" && document.baseURI
      ? new URL(`terrain/${siteId}.json`, document.baseURI).href
      : `/terrain/${siteId}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load terrain data for ${siteId}`);
  const data = await res.json();
  terrainDataCache[siteId] = data;
  return data;
}

/**
 * 5x5 moving-average spatial smoothing filter to reduce NASADEM elevation noise
 * (e.g. tree canopies, buildings, SRTM speckle) on floodplains.
 * Preserves boundary grid dimensions while computing local window averages.
 */
export function smoothElevationGrid(grid, kernelSize = 5) {
  if (!grid || !grid.length) return grid;
  const h = grid.length;
  const w = grid[0].length;
  const half = Math.floor(kernelSize / 2);
  const smoothed = [];

  for (let r = 0; r < h; r++) {
    const row = new Array(w);
    for (let c = 0; c < w; c++) {
      let sum = 0;
      let count = 0;
      for (let dr = -half; dr <= half; dr++) {
        for (let dc = -half; dc <= half; dc++) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= 0 && nr < h && nc >= 0 && nc < w) {
            sum += grid[nr][nc];
            count++;
          }
        }
      }
      row[c] = count > 0 ? sum / count : grid[r][c];
    }
    smoothed.push(row);
  }
  return smoothed;
}

/**
 * Computes a boolean mask indicating cells in the lowest 10% of elevations.
 * Guarantees that the shaded low area covers <= 10% of total cells.
 */
export function computeLowAreaMask(grid, thresholdPercent = 0.10) {
  if (!grid || !grid.length) return [];
  const h = grid.length;
  const w = grid[0].length;
  const flat = [].concat(...grid);
  const sorted = [...flat].sort((a, b) => a - b);
  const minVal = sorted[0];
  const maxVal = sorted[sorted.length - 1];

  if (minVal === maxVal) {
    return Array.from({ length: h }, () => Array(w).fill(false));
  }

  const cutoffIndex = Math.floor(sorted.length * thresholdPercent);
  const cutoffVal = sorted[cutoffIndex];

  // Try <= threshold if count is <= cutoffIndex
  const countLessEq = sorted.filter((v) => v <= cutoffVal).length;
  if (countLessEq <= cutoffIndex) {
    return grid.map((row) => row.map((v) => v <= cutoffVal));
  }

  // Try < threshold if non-empty and <= cutoffIndex
  const countLess = sorted.filter((v) => v < cutoffVal).length;
  if (countLess > 0 && countLess <= cutoffIndex) {
    return grid.map((row) => row.map((v) => v < cutoffVal));
  }

  // Strict rank-based selection if ties exceed cutoffIndex
  const ranked = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      ranked.push({ r, c, val: grid[r][c] });
    }
  }
  ranked.sort((a, b) => a.val - b.val);
  const mask = Array.from({ length: h }, () => Array(w).fill(false));
  for (let i = 0; i < cutoffIndex; i++) {
    mask[ranked[i].r][ranked[i].c] = true;
  }
  return mask;
}

/**
 * Crop terrain around the field polygon center (~1.5 km square box).
 */
export function cropTerrainAroundField(terrain, fieldPoly, targetBoxSizeMetres = 1500) {
  const [minLon, minLat, maxLon, maxLat] = terrain.bounds;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;

  let centerLat = terrain.centre[0];
  let centerLon = terrain.centre[1];

  if (fieldPoly && fieldPoly.length >= 3) {
    centerLat = fieldPoly.reduce((sum, p) => sum + p[0], 0) / fieldPoly.length;
    centerLon = fieldPoly.reduce((sum, p) => sum + p[1], 0) / fieldPoly.length;
  }

  const centerCol = ((centerLon - minLon) / lonSpan) * (terrain.width - 1);
  const centerRow = ((maxLat - centerLat) / latSpan) * (terrain.height - 1);

  const cellRadius = Math.round(targetBoxSizeMetres / 2 / (terrain.cellSizeMetres || 46.88));
  const minCol = Math.max(0, Math.round(centerCol) - cellRadius);
  const maxCol = Math.min(terrain.width - 1, Math.round(centerCol) + cellRadius);
  const minRow = Math.max(0, Math.round(centerRow) - cellRadius);
  const maxRow = Math.min(terrain.height - 1, Math.round(centerRow) + cellRadius);

  const croppedBounds = [
    minLon + (minCol / (terrain.width - 1)) * lonSpan,
    maxLat - (maxRow / (terrain.height - 1)) * latSpan,
    minLon + (maxCol / (terrain.width - 1)) * lonSpan,
    maxLat - (minRow / (terrain.height - 1)) * latSpan,
  ];

  const croppedGrid = [];
  for (let r = minRow; r <= maxRow; r++) {
    const row = [];
    for (let c = minCol; c <= maxCol; c++) {
      row.push(terrain.grid[r][c]);
    }
    croppedGrid.push(row);
  }

  return {
    site: terrain.site,
    centre: [centerLat, centerLon],
    bounds: croppedBounds,
    width: maxCol - minCol + 1,
    height: maxRow - minRow + 1,
    cellSizeMetres: terrain.cellSizeMetres,
    grid: croppedGrid,
  };
}

// Build canvas texture draping tiles or fallback imagery
export async function createDrapedTexture(terrain, layerMode, activeDate, fieldPoly, lowAreaMask) {
  const canvas = document.createElement("canvas");
  const size = 1024;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const [minLon, minLat, maxLon, maxLat] = terrain.bounds;
  const lonSpan = maxLon - minLon;
  const latSpan = maxLat - minLat;

  // Background fallback color
  ctx.fillStyle = layerMode === "ndvi" ? "#497b49" : "#37452d";
  ctx.fillRect(0, 0, size, size);

  if (layerMode === "photo") {
    // Single satellite image fallback
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = () => resolve(); // Non-blocking fallback
        img.src = `/assets/satellite-${terrain.site}.jpg`;
      });
      if (img.width > 0) {
        ctx.drawImage(img, 0, 0, size, size);
      }
    } catch {
      // Continue with background color
    }
  } else {
    // Drape z=14 tiles
    const z = 14;
    const minTile = latlonToTile(maxLat, minLon, z);
    const maxTile = latlonToTile(minLat, maxLon, z);

    const tilePromises = [];
    for (let ty = minTile.y; ty <= maxTile.y; ty++) {
      for (let tx = minTile.x; tx <= maxTile.x; tx++) {
        tilePromises.push(
          new Promise((resolve) => {
            const tileImg = new Image();
            tileImg.crossOrigin = "anonymous";
            tileImg.onload = () => resolve({ tx, ty, img: tileImg });
            tileImg.onerror = () => resolve(null);
            tileImg.src = `/tiles/${layerMode}/${activeDate}/${z}/${tx}/${ty}.png`;
          }),
        );
      }
    }

    const loadedTiles = await Promise.all(tilePromises);
    const n = 2 ** z;
    for (const t of loadedTiles) {
      if (!t || !t.img) continue;
      const tileLonMin = (t.tx / n) * 360 - 180;
      const tileLonMax = ((t.tx + 1) / n) * 360 - 180;
      const tileLatRadMin = Math.atan(Math.sinh(Math.PI * (1 - (2 * (t.ty + 1)) / n)));
      const tileLatRadMax = Math.atan(Math.sinh(Math.PI * (1 - (2 * t.ty) / n)));
      const tileLatMin = (tileLatRadMin * 180) / Math.PI;
      const tileLatMax = (tileLatRadMax * 180) / Math.PI;

      // Map to canvas (0,0 is top-left: maxLat, minLon)
      const px = ((tileLonMin - minLon) / lonSpan) * size;
      const py = ((maxLat - tileLatMax) / latSpan) * size;
      const pw = ((tileLonMax - tileLonMin) / lonSpan) * size;
      const ph = ((tileLatMax - tileLatMin) / latSpan) * size;

      ctx.drawImage(t.img, px, py, pw, ph);
    }
  }

  // Draw shaded low elevation areas ("Lower ground — water may collect after heavy rain (check locally)")
  // Shaded only for lowest 10% of cells inside the cropped area
  if (lowAreaMask && lowAreaMask.length) {
    const maskH = lowAreaMask.length;
    const maskW = lowAreaMask[0].length;
    const lowCanvas = document.createElement("canvas");
    lowCanvas.width = maskW;
    lowCanvas.height = maskH;
    const lowCtx = lowCanvas.getContext("2d");
    if (lowCtx) {
      const imgData = lowCtx.createImageData(maskW, maskH);
      for (let r = 0; r < maskH; r++) {
        for (let c = 0; c < maskW; c++) {
          const idx = (r * maskW + c) * 4;
          if (lowAreaMask[r][c]) {
            // Semi-transparent deep blue/cyan for water collection areas
            imgData.data[idx] = 40;     // R
            imgData.data[idx + 1] = 130; // G
            imgData.data[idx + 2] = 200; // B
            imgData.data[idx + 3] = 130; // Alpha
          } else {
            imgData.data[idx + 3] = 0;
          }
        }
      }
      lowCtx.putImageData(imgData, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(lowCanvas, 0, 0, size, size);
    }
  }

  // Draw field outline on the texture
  if (fieldPoly && fieldPoly.length >= 3) {
    ctx.beginPath();
    fieldPoly.forEach(([lat, lon], idx) => {
      const cx = ((lon - minLon) / lonSpan) * size;
      const cy = ((maxLat - lat) / latSpan) * size;
      if (idx === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    });
    ctx.closePath();

    // High-visibility crisp border for the field boundary
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.stroke();

    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#e8b839"; // Accent gold
    ctx.stroke();

    ctx.fillStyle = "rgba(232, 184, 57, 0.22)";
    ctx.fill();
  }

  return canvas;
}

// Dispose current 3D scene cleanly
export function dispose3DView() {
  if (currentAnimationId) {
    cancelAnimationFrame(currentAnimationId);
    currentAnimationId = null;
  }
  if (intersectionObserver) {
    intersectionObserver.disconnect();
    intersectionObserver = null;
  }
  if (currentControls) {
    currentControls.dispose();
    currentControls = null;
  }
  if (currentRenderer) {
    if (currentRenderer.domElement && currentRenderer.domElement.parentElement) {
      currentRenderer.domElement.parentElement.removeChild(currentRenderer.domElement);
    }
    currentRenderer.dispose();
    currentRenderer = null;
  }
  currentScene = null;
  currentCamera = null;
  isPaused = false;
  renderRequested = false;
}

// Reset camera to default view
export function reset3DView() {
  if (!currentCamera || !currentControls) return;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targetCamPos = { x: 0, y: 18, z: 22.5 };
  const targetLookAt = { x: 0, y: 0, z: 0 };

  currentCamera.position.set(targetCamPos.x, targetCamPos.y, targetCamPos.z);
  currentControls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
  currentControls.update();
  requestRender3D();
}

// On-demand rendering (renders only on interaction / animation frame)
function requestRender3D() {
  if (isPaused) return;
  if (!renderRequested) {
    renderRequested = true;
    currentAnimationId = requestAnimationFrame(() => {
      renderRequested = false;
      if (currentControls && currentControls.enableDamping) {
        currentControls.update();
      }
      if (currentRenderer && currentScene && currentCamera) {
        currentRenderer.render(currentScene, currentCamera);
      }
    });
  }
}

// Update DOM chips and legends with polished descriptions
function updateTerrainViewDOM(containerEl) {
  if (!containerEl) return;
  const doc = containerEl.ownerDocument || (typeof document !== "undefined" ? document : null);
  if (!doc) return;


}

// Mount and render the 3D scene in the target container element
export async function mount3DView(containerEl, {
  siteId,
  layerMode = "natural",
  activeDate = "2024-03-09",
  fieldPoly = [],
  onLoaded = null,
} = {}) {
  dispose3DView();
  if (!containerEl) return;

  const width = containerEl.clientWidth || 600;
  const height = containerEl.clientHeight || 380;

  // Load Three.js modules dynamically
  await loadThreeLibraries();
  const rawTerrain = await fetchTerrainData(siteId);

  // 1. Smooth before display with 5x5 mean filter
  const smoothedGrid = smoothElevationGrid(rawTerrain.grid, 5);
  const smoothedTerrain = {
    ...rawTerrain,
    grid: smoothedGrid,
  };

  // 2. Crop terrain mesh to ~1.5 km box around field polygon center
  const croppedTerrain = cropTerrainAroundField(smoothedTerrain, fieldPoly, 1500);

  // 3. Lowest 10% low area mask inside the cropped area
  const lowAreaMask = computeLowAreaMask(croppedTerrain.grid, 0.10);

  // Update DOM chip and legend text
  updateTerrainViewDOM(containerEl);

  // Setup Three.js Scene, Camera, Renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4ec); // Theme background
  currentScene = scene;

  // Camera positioned so the ~1.5 km mesh and ~170 m field fill ~1/3 of the view
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
  camera.position.set(0, 18, 22.5);
  currentCamera = camera;

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  containerEl.appendChild(renderer.domElement);
  currentRenderer = renderer;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xfff6dd, 0.7);
  dirLight.position.set(40, 80, 50);
  scene.add(dirLight);

  // OrbitControls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotate = false; // No auto-spin per spec §8
  controls.maxPolarAngle = Math.PI / 2.05; // Prevent camera going beneath terrain
  controls.minDistance = 10;
  controls.maxDistance = 120;
  currentControls = controls;

  // Render on user interaction
  controls.addEventListener("change", () => {
    requestRender3D();
  });

  // Build Cropped Terrain Mesh
  const gridW = croppedTerrain.width;
  const gridH = croppedTerrain.height;
  const meshSize = 80; // World unit dimension for cropped area
  const geometry = new THREE.PlaneGeometry(meshSize, meshSize, gridW - 1, gridH - 1);
  geometry.rotateX(-Math.PI / 2); // Rotate to lay horizontal (XZ plane, Y is up)

  // Vertical exaggeration: 2.5x
  // Cropped area domain is ~1500 m. Elevation range ~5 m across cropped floodplain.
  // In world units (meshSize = 80), heightScale gives 2.5x vertical exaggeration:
  // (80 / 1500) * 2.5 ~= 0.133 world units per metre.
  const grid = croppedTerrain.grid;
  const flat = [].concat(...grid);
  const avgHeight = flat.reduce((a, b) => a + b, 0) / flat.length;
  const heightScale = (meshSize / 1500) * 2.5;

  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const row = Math.floor(i / gridW);
    const col = i % gridW;
    const h = (grid[row]?.[col] ?? avgHeight) - avgHeight;
    posAttr.setY(i, h * heightScale);
  }
  geometry.computeVertexNormals();

  // Create draped canvas texture for the cropped terrain
  const textureCanvas = await createDrapedTexture(
    croppedTerrain,
    layerMode,
    activeDate,
    fieldPoly,
    lowAreaMask,
  );
  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.85,
    metalness: 0.1,
    flatShading: false,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Field boundary outline thicker (>= 3 px look), lifted slightly above surface
  if (fieldPoly && fieldPoly.length >= 3) {
    const [minLon, minLat, maxLon, maxLat] = croppedTerrain.bounds;
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;

    const linePoints = [];
    fieldPoly.forEach(([lat, lon]) => {
      const u = (lon - minLon) / lonSpan;
      const v = (maxLat - lat) / latSpan;
      const x = (u - 0.5) * meshSize;
      const z = (v - 0.5) * meshSize;

      // Sample height from cropped grid
      const col = Math.min(Math.max(Math.floor(u * (gridW - 1)), 0), gridW - 1);
      const row = Math.min(Math.max(Math.floor(v * (gridH - 1)), 0), gridH - 1);
      const h = (grid[row]?.[col] ?? avgHeight) - avgHeight;
      const y = h * heightScale + 0.35; // Lift above surface to prevent Z-fighting
      linePoints.push(new THREE.Vector3(x, y, z));
    });

    // 3D Tube ribbon for thick (>= 3px look) outline in existing accent gold (#e8b839)
    try {
      const curvePath = new THREE.CurvePath();
      for (let i = 0; i < linePoints.length; i++) {
        const nextPt = linePoints[(i + 1) % linePoints.length];
        curvePath.add(new THREE.LineCurve3(linePoints[i], nextPt));
      }
      curvePath.closePath();
      const tubeGeometry = new THREE.TubeGeometry(curvePath, 64, 0.22, 6, true);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: 0xe8b839, // Existing outline colour (accent gold)
      });
      const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
      scene.add(tubeMesh);
    } catch {
      // Fallback to line
      const loopPoints = [...linePoints, linePoints[0].clone()];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(loopPoints);
      const lineMaterial = new THREE.LineBasicMaterial({
        color: 0xe8b839,
        linewidth: 3,
      });
      const line = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(line);
    }
  }

  // Pause rendering when element is off-screen / hidden
  intersectionObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      isPaused = !entry.isIntersecting;
      if (!isPaused) requestRender3D();
    });
  });
  intersectionObserver.observe(containerEl);

  // Initial render
  requestRender3D();

  if (typeof onLoaded === "function") {
    onLoaded();
  }
}

// Window resize handler for 3D container
export function resize3DView(containerEl) {
  if (!currentRenderer || !currentCamera || !containerEl) return;
  const width = containerEl.clientWidth || 600;
  const height = containerEl.clientHeight || 380;
  currentCamera.aspect = width / height;
  currentCamera.updateProjectionMatrix();
  currentRenderer.setSize(width, height);
  requestRender3D();
}
