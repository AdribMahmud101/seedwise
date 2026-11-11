/**
 * LAND3D - 3D landscape of Mithapukur, Pirganj, and Gangachara.
 * Lazy-loads MapLibre GL JS v5 only when scrolled into view (IntersectionObserver).
 */
import { nasaBadge, t, truth, panel } from "./ui.js";

let maplibreLoading = null;
let currentMap = null;
let currentMode = "height"; // "height" | "photo"
let observer = null;

// The 3 pilot upazila pin locations and bilingual names
const UPAZILAS = [
  {
    id: "gangachara",
    en: "Gangachara",
    bn: "গঙ্গাচড়া",
    lng: 89.1955,
    lat: 25.8538,
  },
  {
    id: "mithapukur",
    en: "Mithapukur",
    bn: "মিঠাপুকুর",
    lng: 89.2760,
    lat: 25.5549,
  },
  {
    id: "pirganj",
    en: "Pirganj",
    bn: "পীরগঞ্জ",
    lng: 89.2732,
    lat: 25.4100,
  },
];

// Keep river lines on the land: cut each line where it leaves the faded data box.
const LAND_BOX = [89.075, 25.29, 89.462, 25.976];
function clipRivers(fc) {
  const inBox = ([x, y]) => x >= LAND_BOX[0] && x <= LAND_BOX[2] && y >= LAND_BOX[1] && y <= LAND_BOX[3];
  const features = [];
  for (const f of fc.features || []) {
    let run = [];
    for (const pt of f.geometry?.coordinates || []) {
      if (inBox(pt)) run.push(pt);
      else { if (run.length > 1) features.push({ ...f, geometry: { type: "LineString", coordinates: run } }); run = []; }
    }
    if (run.length > 1) features.push({ ...f, geometry: { type: "LineString", coordinates: run } });
  }
  return { type: "FeatureCollection", features };
}

// Upazila extent (data bbox minus its 3 km buffer); the camera frames this on every screen size.
const UPAZILA_BBOX = [[89.087, 25.30], [89.45, 25.965]];
const PITCH = 55, BEARING = -12;
const HAZE = "#e8eee6"; // background, fog and faded data edge all share this, so the land floats in mist
let maplibreglRef = null;
let INITIAL_CAMERA = { center: [89.27, 25.63], zoom: 9.9, pitch: PITCH, bearing: BEARING };
function frameCamera(map) {
  // Wide screens look across the land from the west so the long north-south axis runs across the screen.
  const el = map.getContainer();
  const bearing = el.clientWidth / Math.max(1, el.clientHeight) > 1.2 ? 78 : BEARING;
  const c = map.cameraForBounds(UPAZILA_BBOX, { padding: 12, bearing });
  if (c) {
    // cameraForBounds ignores pitch; tilting magnifies the near side, so zoom out and aim a little toward the viewer.
    const ll = maplibreglRef.LngLat.convert(c.center), b = (bearing * Math.PI) / 180, d = 0.05;
    INITIAL_CAMERA = {
      center: [ll.lng - (Math.sin(b) * d) / Math.cos((ll.lat * Math.PI) / 180), ll.lat - Math.cos(b) * d],
      zoom: c.zoom - 0.45,
      pitch: PITCH,
      bearing,
    };
  }
  return INITIAL_CAMERA;
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch (e) {
    return false;
  }
}

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (maplibreLoading) return maplibreLoading;

  maplibreLoading = new Promise((resolve, reject) => {
    // Add CSS
    if (!document.querySelector('link[href*="maplibre-gl.css"]')) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "/assets/maplibre/maplibre-gl.css";
      document.head.appendChild(link);
    }
    // Add Script
    const script = document.createElement("script");
    script.src = "/assets/maplibre/maplibre-gl.js";
    script.async = true;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = (err) => reject(new Error("Failed to load MapLibre GL JS: " + err));
    document.head.appendChild(script);
  });
  return maplibreLoading;
}

export function landscapePanel() {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const photoDisabled = !isOnline;
  const photoTitle = photoDisabled
    ? t("Needs internet", "ইন্টারনেট প্রয়োজন")
    : t("Esri World Imagery", "এসরি স্যাটেলাইট ছবি");

  const body = `
    <div class="landscape-card">
      <p class="note">${t("Low green = where water collects · higher tan = drains first", "নিচু সবুজ = যেখানে পানি জমে · উঁচু বাদামি = আগে পানি নামে")}</p>
      <div class="landscape-viewport" id="landscape-container">
        <div class="landscape-controls">
          <div class="landscape-seg" role="group" aria-label="${t("Map style", "মানচিত্রের ধরন")}">
            <button type="button" class="landscape-btn ${currentMode === "height" ? "active" : ""}" data-landscape-mode="height" style="min-height:44px;min-width:44px;">
              ${t("Height colours", "উচ্চতার রঙ")}
            </button>
            <button type="button" class="landscape-btn ${currentMode === "photo" ? "active" : ""}" data-landscape-mode="photo" ${photoDisabled ? "disabled" : ""} title="${photoTitle}" style="min-height:44px;min-width:44px;">
              ${t("Photo", "স্যাটেলাইট")}
            </button>
          </div>
          <button type="button" class="landscape-btn icon-only" data-landscape-action="reset" title="${t("Reset view", "আগের দৃশ্য")}" aria-label="${t("Reset view", "আগের দৃশ্য")}" style="min-height:44px;min-width:44px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
              <path d="M3 3v5h5"/>
            </svg>
          </button>
        </div>

        <noscript>
          <div class="landscape-fallback">
            ${t("JavaScript is required to display the 3D landscape.", "ত্রিমাত্রিক ল্যান্ডস্কেপ দেখতে জাভাস্ক্রিপ্ট প্রয়োজন।")}
          </div>
        </noscript>
      </div>
        <div class="landscape-overlay-bottom">
          <div class="landscape-chip">
            <span>${t("Height exaggerated 10× · NASADEM 30 m · includes trees", "উচ্চতা ১০ গুণ বর্ধিত · নাসা ডেম ৩০ মি · গাছপালা অন্তর্ভুক্ত")}</span>
            ${truth("MODELED")}
          </div>

          <div class="landscape-legend" id="landscape-legend" style="${currentMode === 'photo' ? 'display:none;' : ''}">
            <div class="landscape-legend-bar"></div>
            <div class="landscape-legend-labels">
              <span>${t("Lower", "নিচু")}</span>
              <span>← →</span>
              <span>${t("Higher", "উঁচু")}</span>
            </div>
          </div>
        </div>

    </div>
  `;

  return `<div id="landscape-3d-panel">${panel(t("Your land in 3D", "আপনার এলাকা ত্রিমাত্রিকে"), body, nasaBadge("nasadem"))}</div>`;
}

export function initLandscapeObserver() {
  const container = document.getElementById("landscape-container");
  if (!container) return;

  if (!hasWebGL()) {
    container.innerHTML = `
      <div class="landscape-fallback">
        <p><strong>${t("3D terrain preview unavailable", "ত্রিমাত্রিক ভূপ্রকৃতি প্রিভিউ অনুপলব্ধ")}</strong></p>
        <p>${t("Your browser or device does not support WebGL hardware acceleration.", "আপনার ব্রাউজার বা ডিভাইসে WebGL সমর্থন নেই।")}</p>
      </div>
    `;
    return;
  }

  if (currentMap) {
    // Already initialized
    return;
  }

  // Lazy-load ONLY when the panel scrolls into view (IntersectionObserver)
  if (typeof IntersectionObserver !== "undefined") {
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          observer.disconnect();
          observer = null;
          setupMap(container);
          break;
        }
      }
    }, { rootMargin: "100px" });
    observer.observe(container);
  } else {
    setupMap(container);
  }
}

async function setupMap(container) {
  try {
    const maplibregl = await loadMapLibre();
    maplibreglRef = maplibregl;
    if (!container || !container.isConnected) return;

    // Filter upazila outlines from rangpur_upazilas.geojson
    let upazilasGeojson = { type: "FeatureCollection", features: [] };
    try {
      const res = await fetch("/data/rangpur_upazilas.geojson");
      if (res.ok) {
        const full = await res.json();
        const targets = ["mitha pukur", "pirganj", "gangachara"];
        upazilasGeojson.features = full.features.filter((f) =>
          targets.includes((f.properties?.name || "").toLowerCase()),
        );
      }
    } catch (e) {
      // offline fallback
    }

    let riversGeojson = { type: "FeatureCollection", features: [] };
    try {
      const r = await fetch("/data/landscape-rivers.geojson");
      if (r.ok) riversGeojson = clipRivers(await r.json());
    } catch (e) {
      // no rivers is acceptable
    }

    const dataBbox = [89.057375, 25.272260, 89.480445, 25.993650];

    const startCamera = {
      center: INITIAL_CAMERA.center,
      zoom: INITIAL_CAMERA.zoom - 0.5,
      pitch: 28,
      bearing: 0,
    };

    const map = new maplibregl.Map({
      container: container,
      maxBounds: [
        [88.95, 25.15],
        [89.6, 26.1],
      ],
      style: {
        version: 8,
        sources: {
          "terrain-dem": {
            type: "raster-dem",
            encoding: "terrarium",
            tiles: ["/landscape/dem/{z}/{x}/{y}.png"],
            tileSize: 256,
            minzoom: 8,
            maxzoom: 12,
            bounds: dataBbox,
          },
          "color-tiles": {
            type: "raster",
            tiles: ["/landscape/color/{z}/{x}/{y}.webp"],
            tileSize: 256,
            minzoom: 8,
            maxzoom: 12,
            bounds: dataBbox,
          },
          "esri-photo": {
            type: "raster",
            tiles: [
              "https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/default028mm/MapServer/tile/64776/{z}/{y}/{x}" // same clear Maxar 28 Nov 2022 release as the field map,
            ],
            tileSize: 256,
            maxzoom: 18,
            bounds: [89.075, 25.29, 89.462, 25.976], // photo stays on the land, haze around it
            attribution: "Imagery © Esri, Maxar, Earthstar Geographics",
          },
          "rivers": {
            type: "geojson",
            data: riversGeojson,
          },
          "upazila-bounds": {
            type: "geojson",
            data: upazilasGeojson,
          },
        },
        layers: [
          { id: "haze", type: "background", paint: { "background-color": HAZE } },
          {
            id: "color-layer",
            type: "raster",
            source: "color-tiles",
            layout: {
              visibility: currentMode === "height" ? "visible" : "none",
            },
          },
          {
            id: "photo-layer",
            type: "raster",
            source: "esri-photo",
            layout: {
              visibility: currentMode === "photo" ? "visible" : "none",
            },
          },
          {
            id: "rivers-glow",
            type: "line",
            source: "rivers",
            paint: {
              "line-color": "#38bdf8",
              "line-width": ["interpolate", ["linear"], ["zoom"], 8, 3.5, 12, 6],
              "line-opacity": 0.45,
              "line-blur": 2,
            },
          },
          {
            id: "rivers-layer",
            type: "line",
            source: "rivers",
            paint: {
              "line-color": "#0284c7",
              "line-width": ["interpolate", ["linear"], ["zoom"], 8, 2, 12, 3],
              "line-opacity": 0.95,
            },
          },
          {
            id: "upazila-casing",
            type: "line",
            source: "upazila-bounds",
            paint: {
              "line-color": "#0f172a",
              "line-width": 3,
              "line-opacity": 0.4,
            },
          },
          {
            id: "upazila-lines",
            type: "line",
            source: "upazila-bounds",
            paint: {
              "line-color": "#ffffff",
              "line-width": 1.5,
              "line-opacity": 0.7,
            },
          },
        ],
        sky: {
          "sky-color": "#cfe3ee",
          "sky-horizon-blend": 0.6,
          "horizon-color": HAZE,
          "horizon-fog-blend": 0.8,
          "fog-color": HAZE,
          "fog-ground-blend": 0.35,
        },
        terrain: {
          source: "terrain-dem",
          exaggeration: 10,
        },
      },
      center: startCamera.center,
      zoom: startCamera.zoom,
      pitch: startCamera.pitch,
      bearing: startCamera.bearing,
      maxPitch: 65,
      dragRotate: true,
      touchPitch: true,
      attributionControl: false,
    });

    currentMap = map;

    // Add upazila HTML pin labels
    map.on("load", () => {
      UPAZILAS.forEach((up) => {
        const el = document.createElement("div");
        el.className = "landscape-pin";
        el.innerHTML = `
          <div class="landscape-pin-tag">
            <span>${up.en}</span>
            <small>${up.bn}</small>
          </div>
          <div class="landscape-pin-point"></div>
        `;
        new maplibregl.Marker({ element: el, anchor: "bottom" })
          .setLngLat([up.lng, up.lat])
          .addTo(map);
      });

      frameCamera(map);
      // Fly-in animation (2 s)
      const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!prefersReducedMotion) {
        map.flyTo({
          center: INITIAL_CAMERA.center,
          zoom: INITIAL_CAMERA.zoom,
          pitch: INITIAL_CAMERA.pitch,
          bearing: INITIAL_CAMERA.bearing,
          duration: 2000,
          essential: true,
        });
      } else {
        map.jumpTo(INITIAL_CAMERA);
      }
    });

    // Wire segmented control & reset button
    container.addEventListener("click", (e) => {
      const modeBtn = e.target.closest("[data-landscape-mode]");
      if (modeBtn) {
        const mode = modeBtn.dataset.landscapeMode;
        setLandscapeMode(mode);
        return;
      }
      const resetBtn = e.target.closest("[data-landscape-action='reset']");
      if (resetBtn) {
        resetLandscapeView();
        return;
      }
    });

    // Update online / offline status dynamically
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
  } catch (err) {
    console.error("MapLibre setup error:", err);
  }
}

export function setLandscapeMode(mode) {
  currentMode = mode;
  // Update buttons
  const buttons = document.querySelectorAll("[data-landscape-mode]");
  buttons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.landscapeMode === mode);
  });
  // Update legend visibility
  const legend = document.getElementById("landscape-legend");
  if (legend) {
    legend.style.display = mode === "photo" ? "none" : "";
  }
  // Update map layers
  if (currentMap && currentMap.isStyleLoaded()) {
    currentMap.setLayoutProperty(
      "color-layer",
      "visibility",
      mode === "height" ? "visible" : "none",
    );
    currentMap.setLayoutProperty(
      "photo-layer",
      "visibility",
      mode === "photo" ? "visible" : "none",
    );
  }
}

export function resetLandscapeView() {
  if (currentMap) {
    currentMap.flyTo({
      ...INITIAL_CAMERA,
      duration: 1000,
    });
  }
}

function updateOnlineStatus() {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  const photoBtn = document.querySelector('[data-landscape-mode="photo"]');
  if (photoBtn) {
    photoBtn.disabled = !isOnline;
    photoBtn.title = !isOnline
      ? t("Needs internet", "ইন্টারনেট প্রয়োজন")
      : t("Esri World Imagery", "এসরি স্যাটেলাইট ছবি");
    if (!isOnline && currentMode === "photo") {
      setLandscapeMode("height");
    }
  }
}

export function disposeLandscape() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (currentMap) {
    try {
      currentMap.remove();
    } catch (e) {}
    currentMap = null;
  }
  window.removeEventListener("online", updateOnlineStatus);
  window.removeEventListener("offline", updateOnlineStatus);
}
