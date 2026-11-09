import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

test("LAND3D: required files exist and budget is <= 4 MB", () => {
  // 1. MapLibre vendored assets
  const maplibreJs = path.join(ROOT, "public/assets/maplibre/maplibre-gl.js");
  const maplibreCss = path.join(ROOT, "public/assets/maplibre/maplibre-gl.css");
  const maplibreLicense = path.join(ROOT, "public/assets/maplibre/LICENSE.txt");

  assert.ok(fs.existsSync(maplibreJs), "maplibre-gl.js exists in public/assets/maplibre/");
  assert.ok(fs.existsSync(maplibreCss), "maplibre-gl.css exists in public/assets/maplibre/");
  assert.ok(fs.existsSync(maplibreLicense), "LICENSE.txt exists in public/assets/maplibre/");

  // 2. Landscape rivers geojson
  const riversFile = path.join(ROOT, "public/data/landscape-rivers.geojson");
  assert.ok(fs.existsSync(riversFile), "landscape-rivers.geojson exists in public/data/");
  const riversData = JSON.parse(fs.readFileSync(riversFile, "utf-8"));
  assert.equal(riversData.type, "FeatureCollection", "Rivers is a FeatureCollection");
  assert.ok(riversData.features.length > 0, "Rivers contains simplified features");
  assert.ok(riversData.attribution?.includes("OpenStreetMap"), "Has ODbL attribution");

  // 3. DEM and Color tile hierarchies exist for z8-12
  const demDir = path.join(ROOT, "public/landscape/dem");
  const colorDir = path.join(ROOT, "public/landscape/color");
  assert.ok(fs.existsSync(demDir), "public/landscape/dem exists");
  assert.ok(fs.existsSync(colorDir), "public/landscape/color exists");

  for (let z = 8; z <= 12; z++) {
    assert.ok(fs.existsSync(path.join(demDir, String(z))), `dem zoom level ${z} exists`);
    assert.ok(fs.existsSync(path.join(colorDir, String(z))), `color zoom level ${z} exists`);
  }

  // 4. Calculate total landscape assets size (budget <= 4 MB)
  let totalLandscapeBytes = 0;
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        totalLandscapeBytes += fs.statSync(fullPath).size;
      }
    }
  }
  walkDir(path.join(ROOT, "public/landscape"));
  totalLandscapeBytes += fs.statSync(riversFile).size;

  const totalLandscapeMB = totalLandscapeBytes / (1024 * 1024);
  assert.ok(
    totalLandscapeMB <= 4.0,
    `Total landscape files size (${totalLandscapeMB.toFixed(2)} MB) must be <= 4.0 MB budget`,
  );
});

test("LAND3D: MapLibre is not imported on initial load path (zero bytes on initial page load)", () => {
  // Check that index / initial entry points do NOT statically import or load maplibre
  const layoutJs = fs.readFileSync(path.join(ROOT, "app/layout.js"), "utf-8");
  const pageJs = fs.readFileSync(path.join(ROOT, "app/page.js"), "utf-8");
  const appLoader = fs.readFileSync(path.join(ROOT, "app/AppLoader.js"), "utf-8");
  const appJs = fs.readFileSync(path.join(ROOT, "src/legacy/app.js"), "utf-8");
  const waterJs = fs.readFileSync(path.join(ROOT, "src/legacy/water.js"), "utf-8");

  // Initial HTML layout must not contain script link to maplibre
  assert.ok(
    !layoutJs.includes("maplibre-gl.js"),
    "layout.js must not link or import maplibre-gl.js statically",
  );
  assert.ok(
    !pageJs.includes("maplibre"),
    "page.js must not import maplibre statically",
  );
  assert.ok(
    !appLoader.includes("maplibre"),
    "AppLoader.js must not import maplibre statically",
  );
  assert.ok(
    !appJs.includes("maplibre-gl.js") && !appJs.includes("import * as maplibregl"),
    "app.js must not import maplibre statically",
  );
  assert.ok(
    !waterJs.includes("maplibre-gl.js") && !waterJs.includes("import maplibregl"),
    "water.js must not statically import maplibre-gl.js",
  );

  // Check landscape3d.js lazy-loads via IntersectionObserver / dynamic load
  const landscapeJs = fs.readFileSync(path.join(ROOT, "src/legacy/landscape3d.js"), "utf-8");
  assert.ok(
    landscapeJs.includes("IntersectionObserver"),
    "landscape3d.js must use IntersectionObserver for lazy-loading",
  );
  assert.ok(
    !landscapeJs.startsWith("import maplibregl") && !landscapeJs.includes('from "maplibre-gl"'),
    "landscape3d.js must not bundle or statically import maplibre-gl",
  );
});

test("LAND3D: UI components, labels, truth chip, legend and controls render correctly", async () => {
  const { landscapePanel } = await import("../src/legacy/landscape3d.js");
  const { state } = await import("../src/legacy/ui.js");

  state.lang = "en";
  const htmlEn = landscapePanel();
  assert.ok(htmlEn.includes("Your land in 3D"), "Includes English title");
  assert.ok(htmlEn.includes("Low green = where water collects"), "Includes English subtitle");
  assert.ok(htmlEn.includes("Height colours"), "Includes Height colours button");
  assert.ok(htmlEn.includes("Photo"), "Includes Photo button");
  assert.ok(htmlEn.includes("Reset view"), "Includes Reset view button");
  assert.ok(htmlEn.includes("Height exaggerated 10×"), "Includes exaggerated 10x label");
  assert.ok(htmlEn.includes("NASADEM 30 m"), "Includes NASADEM 30 m");
  assert.ok(htmlEn.includes("MODELED"), "Includes MODELED truth badge");
  assert.ok(htmlEn.includes("Lower"), "Includes Lower legend label");
  assert.ok(htmlEn.includes("Higher"), "Includes Higher legend label");

  // 44 px target requirements
  assert.ok(htmlEn.includes("min-height:44px"), "Controls meet 44px min-height");
  assert.ok(htmlEn.includes("min-width:44px"), "Controls meet 44px min-width");

  // Bengali translation
  state.lang = "bn";
  const htmlBn = landscapePanel();
  assert.ok(htmlBn.includes("আপনার এলাকা ত্রিমাত্রিকে"), "Includes Bengali title");
  assert.ok(htmlBn.includes("উচ্চতার রঙ"), "Includes Bengali Height colours");
  assert.ok(htmlBn.includes("আগের দৃশ্য"), "Includes Bengali reset view");
  assert.ok(htmlBn.includes("নিচু"), "Includes Bengali lower label");
  assert.ok(htmlBn.includes("উঁচু"), "Includes Bengali higher label");
  assert.ok(htmlBn.includes("MODELED"), "Includes MODELED truth badge in Bengali view");
});
