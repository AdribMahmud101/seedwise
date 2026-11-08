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

// Build canvas texture draping tiles or fallback imagery
export async function createDrapedTexture(terrain, layerMode, activeDate, fieldPoly) {
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
      await new Promise((resolve, reject) => {
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

  // Draw shaded low elevation areas ("Possible water collects here")
  // 15th percentile threshold
  const grid = terrain.grid;
  const flat = [].concat(...grid).sort((a, b) => a - b);
  const p15 = flat[Math.floor(flat.length * 0.15)];

  const lowCanvas = document.createElement("canvas");
  lowCanvas.width = terrain.width;
  lowCanvas.height = terrain.height;
  const lowCtx = lowCanvas.getContext("2d");
  if (lowCtx) {
    const imgData = lowCtx.createImageData(terrain.width, terrain.height);
    for (let r = 0; r < terrain.height; r++) {
      for (let c = 0; c < terrain.width; c++) {
        const val = grid[r][c];
        const idx = (r * terrain.width + c) * 4;
        if (val <= p15) {
          // Semi-transparent deep blue/cyan for water collection areas
          imgData.data[idx] = 40;     // R
          imgData.data[idx + 1] = 130; // G
          imgData.data[idx + 2] = 200; // B
          imgData.data[idx + 3] = 110; // Alpha
        } else {
          imgData.data[idx + 3] = 0;
        }
      }
    }
    lowCtx.putImageData(imgData, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lowCanvas, 0, 0, size, size);
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
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#e8b839"; // Accent gold
    ctx.stroke();

    ctx.fillStyle = "rgba(232, 184, 57, 0.18)";
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
  const targetCamPos = { x: 0, y: 55, z: 75 };
  const targetLookAt = { x: 0, y: 0, z: 0 };

  if (prefersReduced) {
    currentCamera.position.set(targetCamPos.x, targetCamPos.y, targetCamPos.z);
    currentControls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
    currentControls.update();
    requestRender3D();
  } else {
    currentCamera.position.set(targetCamPos.x, targetCamPos.y, targetCamPos.z);
    currentControls.target.set(targetLookAt.x, targetLookAt.y, targetLookAt.z);
    currentControls.update();
    requestRender3D();
  }
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
  const terrain = await fetchTerrainData(siteId);

  // Setup Three.js Scene, Camera, Renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf2f4ec); // Theme background
  currentScene = scene;

  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
  camera.position.set(0, 55, 75);
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
  controls.minDistance = 20;
  controls.maxDistance = 180;
  currentControls = controls;

  // Render on user interaction
  controls.addEventListener("change", () => {
    requestRender3D();
  });

  // Build Terrain Mesh (≤ 128x128 vertices)
  const gridW = terrain.width; // 128
  const gridH = terrain.height; // 128
  const meshSize = 80; // World unit dimension
  const geometry = new THREE.PlaneGeometry(meshSize, meshSize, gridW - 1, gridH - 1);
  geometry.rotateX(-Math.PI / 2); // Rotate to lay horizontal (XZ plane, Y is up)

  // Compute elevation scaling with 2.5x vertical exaggeration
  // Real world domain: ~6000 m across. Elevation range ~25 m.
  // Ratio = 25m / 6000m = ~0.004. With 2.5x exaggeration = 0.01 of width.
  // In world units (meshSize = 80), heightScale = 0.5 world units per meter.
  const grid = terrain.grid;
  const flat = [].concat(...grid);
  const avgHeight = flat.reduce((a, b) => a + b, 0) / flat.length;
  const heightScale = 0.45; // 2.5x exaggeration relative to natural horizontal perspective

  const posAttr = geometry.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    // PlaneGeometry vertices row-by-row (top to bottom, left to right in XZ)
    const row = Math.floor(i / gridW);
    const col = i % gridW;
    const h = (grid[row]?.[col] ?? avgHeight) - avgHeight;
    posAttr.setY(i, h * heightScale);
  }
  geometry.computeVertexNormals();

  // Create draped canvas texture
  const textureCanvas = await createDrapedTexture(terrain, layerMode, activeDate, fieldPoly);
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

  // Field boundary outline 3D ribbon / line lifted slightly above surface
  if (fieldPoly && fieldPoly.length >= 3) {
    const [minLon, minLat, maxLon, maxLat] = terrain.bounds;
    const lonSpan = maxLon - minLon;
    const latSpan = maxLat - minLat;

    const linePoints = [];
    fieldPoly.forEach(([lat, lon]) => {
      const u = (lon - minLon) / lonSpan;
      const v = (maxLat - lat) / latSpan;
      const x = (u - 0.5) * meshSize;
      const z = (v - 0.5) * meshSize;

      // Sample height from grid
      const col = Math.min(Math.max(Math.floor(u * (gridW - 1)), 0), gridW - 1);
      const row = Math.min(Math.max(Math.floor(v * (gridH - 1)), 0), gridH - 1);
      const h = (grid[row]?.[col] ?? avgHeight) - avgHeight;
      const y = h * heightScale + 0.35; // Lift slightly to prevent Z-fighting
      linePoints.push(new THREE.Vector3(x, y, z));
    });
    // Close the loop
    linePoints.push(linePoints[0].clone());

    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      linewidth: 3,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    scene.add(line);
  }

  // Low elevation water label / indicator
  // Find coordinate of minimum height within the terrain
  let minH = 9999;
  let minRow = 0;
  let minCol = 0;
  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      if (grid[r][c] < minH) {
        minH = grid[r][c];
        minRow = r;
        minCol = c;
      }
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
