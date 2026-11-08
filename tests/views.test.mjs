import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { state, loadData, truth, stateEmpty, stateError, exampleBanner } from "../src/legacy/ui.js";
import { home, seasonView, formatNdvi, queryNdvi, projectWgs84ToUtm45N, fieldAction, viewMode, setViewMode } from "../src/legacy/fields.js";
import { isWebGLAvailable, fetchTerrainData } from "../src/legacy/terrain3d.js";
import { rotations } from "../src/legacy/rotations.js";
import { planner } from "../src/legacy/planner.js";
import { clinic } from "../src/legacy/clinic.js";
import { water } from "../src/legacy/water.js";
import { research } from "../src/legacy/research.js";
import { recovery } from "../src/legacy/recovery.js";
import { examples, references } from "../src/legacy/recovery-data.js";
import { units } from "../src/legacy/boundary.js";
import { fieldReport } from "../src/legacy/report.js";

test("SMAP card renders correctly in EN and BN", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  for (const lang of ["en", "bn"]) {
    state.lang = lang;
    for (const id of ["mithapukur", "pirganj", "gangachara"]) {
      state.fieldId = id;
      state.tabs.water = "budget";
      state.month = 10;
      const html = water();

      // Check SMAP card is rendered (EN: "Soil water (NASA SMAP)", BN: "মাটির পানি (NASA SMAP)")
      assert.ok(html.includes("Soil water (NASA SMAP)") || html.includes("মাটির পানি (NASA SMAP)"), `SMAP card title in ${lang} for ${id}`);
      
      // Check m³/m³ is shown
      assert.ok(html.includes("m³/m³"), `m³/m³ shown in ${lang} for ${id}`);

      // Check % is NOT shown next to SFMC or RZMC values
      // Extract the SMAP card section and check within it
      const smapTitle = lang === "bn" ? "মাটির পানি (NASA SMAP)" : "Soil water (NASA SMAP)";
      const smapStart = html.indexOf(smapTitle);
      const smapEnd = html.indexOf("</section>", smapStart);
      const smapHtml = html.substring(smapStart, smapEnd);
      assert.ok(smapStart !== -1, `SMAP card found in ${lang} for ${id}`);
      assert.ok(!smapHtml.includes("%"), `No % in SMAP card for ${lang} ${id}`);

      // Check truth label
      assert.ok(smapHtml.includes("Estimated") || smapHtml.includes("স্যাটেলাইট অনুমান"), `Estimated label in ${lang} for ${id}`);
    }
  }
});

test("SMAP card handles null values", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  // Test with a month where percentiles are null (January 2024)
  state.lang = "en";
  state.fieldId = "mithapukur";
  state.tabs.water = "budget";
  state.month = 0; // January
  const html = water();

  // Extract the SMAP card section
  const smapStart = html.indexOf("Soil water (NASA SMAP)");
  const smapEnd = html.indexOf("</section>", smapStart);
  const smapHtml = html.substring(smapStart, smapEnd);

  // For null percentiles, the status should show "Unknown" (which is acceptable)
  // The values themselves should still show m³/m³
  assert.ok(smapHtml.includes("m³/m³"), "Still shows m³/m³ for non-null values");
  assert.ok(smapHtml.includes("Unknown") || smapHtml.includes("অজানা"), "Shows status for null percentile");
});

test("area-unit conversion outputs shotok, bigha, katha, acre, and ha in EN and BN", () => {
  // 1 ha test
  state.lang = "en";
  const enUnits = units(1);
  assert.ok(enUnits.includes("shotok"), "includes shotok in English");
  assert.ok(enUnits.includes("bigha"), "includes bigha in English");
  assert.ok(enUnits.includes("katha"), "includes katha in English");
  assert.ok(enUnits.includes("acres"), "includes acres in English");
  assert.ok(enUnits.includes("ha"), "includes ha in English");
  assert.ok(enUnits.startsWith("247.1 shotok · 7.49 bigha · 149.8 katha · 2.47 acres · 1 ha"));

  state.lang = "bn";
  const bnUnits = units(1);
  assert.ok(bnUnits.includes("শতক"), "includes শতক in Bengali");
  assert.ok(bnUnits.includes("বিঘা"), "includes বিঘা in Bengali");
  assert.ok(bnUnits.includes("কাঠা"), "includes কাঠা in Bengali");
  assert.ok(bnUnits.includes("একর"), "includes একর in Bengali");
  assert.ok(bnUnits.includes("ha"), "includes ha in Bengali");
});

test("every workspace renders in English and Bengali using all three data packs", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();
  for (const id of ["mithapukur", "pirganj", "gangachara"]) {
    state.fieldId = id;
    for (const lang of ["en", "bn"]) {
      state.lang = lang;
      for (const view of [
        home,
        seasonView,
        rotations,
        planner,
        clinic,
        water,
        research,
        recovery,
      ]) {
        const html = view();
        assert.ok(html.includes("<h1>"));
        assert.ok(!html.includes("NaN"));
        assert.ok(!html.includes("undefined"));
      }
      for (const [scope, tabs] of Object.entries({
        clinic: ["symptoms", "fertilizer"],
        water: ["budget", "soil", "hazard"],
        research: ["qa", "log", "trials"],
      })) {
        for (const tab of tabs) {
          state.tabs[scope] = tab;
          const html = { clinic, water, research }[scope]();
          assert.ok(!html.includes("undefined"));
        }
      }
      for (const hazard of ["flood", "drought", "fire"]) {
        state.hazard = hazard;
        state.recoveryDrafts[`${id}:${hazard}`] = {
          ...examples[hazard],
          example: true,
        };
        const html = recovery();
        assert.ok(html.includes("recovery-calendar"));
        assert.ok(!/undefined|NaN/.test(html));
      }
    }
  }
});

test("null NDVI renders 'No reliable observation' and valid NDVI renders formatted number", async () => {
  state.lang = "en";
  assert.equal(formatNdvi(null), "No reliable observation");
  assert.equal(formatNdvi(undefined), "No reliable observation");
  assert.equal(formatNdvi(NaN), "No reliable observation");

  state.lang = "bn";
  assert.equal(formatNdvi(null), "নির্ভরযোগ্য পর্যবেক্ষণ নেই");
  assert.equal(formatNdvi(undefined), "নির্ভরযোগ্য পর্যবেক্ষণ নেই");

  state.lang = "en";
  assert.equal(formatNdvi(0.839), "0.84");
  assert.equal(formatNdvi(0.35), "0.35");

  // Also verify queryNdvi against real ndvi-grid.json
  const ndviGrid = JSON.parse(await readFile(new URL("../public/data/ndvi-grid.json", import.meta.url), "utf8"));
  const mithaGrid = ndviGrid.grids.find((g) => g.siteId === "mithapukur");
  assert.ok(mithaGrid, "found mithapukur grid");

  // Center coordinate
  const centerNdvi = queryNdvi(mithaGrid, 25.54, 89.27);
  assert.equal(typeof centerNdvi, "number");
  assert.ok(centerNdvi > 0.8, "center of mithapukur has high NDVI");

  // Known masked null coordinate (row 10, col 34)
  const nullNdvi = queryNdvi(mithaGrid, 25.565973, 89.246791);
  assert.equal(nullNdvi, null, "masked cell evaluates to null");
  assert.equal(formatNdvi(nullNdvi), "No reliable observation");

  // Coordinate outside bounds returns null -> "No reliable observation"
  const outsideNdvi = queryNdvi(mithaGrid, 26.5, 90.0);
  assert.equal(outsideNdvi, null);
  assert.equal(formatNdvi(outsideNdvi), "No reliable observation");
});

test("truth labels render in all 6 views in EN and BN", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  const sixViews = [
    ['rotations', rotations],
    ['planner', planner],
    ['clinic', clinic],
    ['water', water],
    ['research', research],
    ['recovery', recovery],
  ];

  for (const [name, viewFn] of sixViews) {
    for (const lang of ["en", "bn"]) {
      state.lang = lang;
      state.fieldId = "mithapukur";
      if (name === 'water') state.tabs.water = "budget";
      if (name === 'research') state.tabs.research = "qa";
      if (name === 'clinic') state.tabs.clinic = "symptoms";
      if (name === 'recovery') {
        state.hazard = "flood";
        state.recoveryDrafts["mithapukur:flood"] = {
          ...examples.flood,
          example: true,
        };
      }
      const html = viewFn();
      assert.ok(html.includes("class=\"truth") || html.includes("class='truth"), `Truth label class in ${name} ${lang}`);
      assert.ok(html.includes("Measured") || html.includes("Estimated") || html.includes("Scenario") || html.includes("Unknown") || html.includes("জমি থেকে মাপা") || html.includes("স্যাটেলাইট অনুমান") || html.includes("কাল্পনিক পরিকল্পনা") || html.includes("অজানা"), `Truth label text in ${name} ${lang}`);
    }
  }
});

test("truth function handles all tags and null values", () => {
  state.lang = "en";
  
  const tags = ['MEASURED', 'FARMER_REPORTED', 'REMOTE_OBSERVED', 'MODELED', 'SCENARIO', 'UNKNOWN'];
  for (const tag of tags) {
    const html = truth(tag);
    assert.ok(html.includes("class=\"truth"), `Truth label has class for ${tag}`);
    assert.ok(html.includes("Measured") || html.includes("Estimated") || html.includes("Scenario") || html.includes("Unknown"), `Truth label has English text for ${tag}`);
  }
  
  state.lang = "bn";
  for (const tag of tags) {
    const html = truth(tag);
    assert.ok(html.includes("class=\"truth"), `Truth label has class for ${tag} BN`);
    assert.ok(html.includes("জমি থেকে মাপা") || html.includes("স্যাটেলাইট অনুমান") || html.includes("কাল্পনিক পরিকল্পনা") || html.includes("অজানা"), `Truth label has Bengali text for ${tag}`);
  }
  
  const unknownHtml = truth('UNKNOWN');
  assert.ok(unknownHtml.includes("Unknown") || unknownHtml.includes("অজানা"), "UNKNOWN tag renders correctly");
  assert.ok(unknownHtml.includes("⊘"), "UNKNOWN tag has icon");
});

test("truth badges include both icon and word", () => {
  state.lang = "en";
  const tags = ['MEASURED', 'FARMER_REPORTED', 'REMOTE_OBSERVED', 'MODELED', 'SCENARIO', 'UNKNOWN'];
  const icons = ['✓', '✓', '◈', '◈', '⬡', '⊘'];
  
  for (let i = 0; i < tags.length; i++) {
    const html = truth(tags[i]);
    assert.ok(html.includes(icons[i]), `Tag ${tags[i]} has icon ${icons[i]}`);
    assert.ok(html.includes("Measured") || html.includes("Estimated") || html.includes("Scenario") || html.includes("Unknown"), `Tag ${tags[i]} has English word`);
  }
  
  state.lang = "bn";
  for (let i = 0; i < tags.length; i++) {
    const html = truth(tags[i]);
    assert.ok(html.includes(icons[i]), `Tag ${tags[i]} has icon ${icons[i]} in BN`);
    assert.ok(html.includes("জমি থেকে মাপা") || html.includes("স্যাটেলাইট অনুমান") || html.includes("কাল্পনিক পরিকল্পনা") || html.includes("অজানা"), `Tag ${tags[i]} has Bengali word`);
  }
});

test("truth labels with opts include title and aria-label", () => {
  state.lang = "en";
  const html = truth('MODELED', { source: 'NASA SMAP', date: '2024', cell: '9km' });
  assert.ok(html.includes('title="source: NASA SMAP, date: 2024, cell: 9km"'), "Title includes opts");
  assert.ok(html.includes('aria-label='), "Has aria-label");
});

test("FARMER_REPORTED shows 'by farmer'", () => {
  state.lang = "en";
  const html = truth('FARMER_REPORTED');
  assert.ok(html.includes("by farmer"), "FARMER_REPORTED shows 'by farmer' in EN");
  
  state.lang = "bn";
  const htmlBn = truth('FARMER_REPORTED');
  assert.ok(htmlBn.includes("by farmer"), "FARMER_REPORTED shows 'by farmer' in BN");
});

test("report source contains truth badges, index label, and Sources line", async () => {
  // Read the report.js source to verify it contains the required patterns
  const reportSource = await readFile(new URL("../src/legacy/report.js", import.meta.url), "utf8");
  
  // Check report.js imports truth function
  assert.ok(reportSource.includes("truth"), "report.js imports truth function");
  
  // Check for truth badges in the HTML
  assert.ok(reportSource.includes("truth('REMOTE_OBSERVED')"), "Uses REMOTE_OBSERVED for rain");
  assert.ok(reportSource.includes("truth('MODELED')"), "Uses MODELED for estimated values");
  assert.ok(reportSource.includes("truth('FARMER_REPORTED')"), "Uses FARMER_REPORTED for farmer data");
  assert.ok(reportSource.includes("truth('SCENARIO')"), "Uses SCENARIO for trial-based values");
  
  // Check for index label (Bengali or English)
  assert.ok(reportSource.includes("index 0–1") || reportSource.includes("সূচক ০–১"), "Contains index label");
  
  // Check for Sources line
  assert.ok(reportSource.includes("sources-line"), "Contains sources-line class");
  assert.ok(reportSource.includes("This plan supports"), "Contains disclaimer text");
  
  // Check print CSS in labels.css
  const labelsSource = await readFile(new URL("../app/labels.css", import.meta.url), "utf8");
  assert.ok(labelsSource.includes("@media print"), "labels.css has print media query");
  assert.ok(labelsSource.includes(".truth") && labelsSource.includes("black"), "Print CSS makes truth badges visible in black and white");
});

test("stateEmpty renders empty state with message and action in EN and BN", () => {
  state.lang = "en";
  const html = stateEmpty("No records found", "Add record", "add-record");
  assert.ok(html.includes("class=\"empty\""), "stateEmpty has empty class");
  assert.ok(html.includes("No records found"), "stateEmpty shows message in EN");
  assert.ok(html.includes("Add record"), "stateEmpty shows action label in EN");
  assert.ok(html.includes("data-action=\"add-record\""), "stateEmpty has action");

  state.lang = "bn";
  const htmlBn = stateEmpty("রেকর্ড নেই", "রেকর্ড যোগ করুন", "add-record");
  assert.ok(htmlBn.includes("class=\"empty\""), "stateEmpty has empty class in BN");
  assert.ok(htmlBn.includes("রেকর্ড নেই"), "stateEmpty shows message in BN");
  assert.ok(htmlBn.includes("রেকর্ড যোগ করুন"), "stateEmpty shows action label in BN");
});

test("stateEmpty renders without action when actionLabel is empty", () => {
  state.lang = "en";
  const html = stateEmpty("No data available");
  assert.ok(html.includes("class=\"empty\""), "stateEmpty has empty class");
  assert.ok(html.includes("No data available"), "stateEmpty shows message");
  assert.ok(!html.includes("data-action"), "stateEmpty has no action button");
});

test("stateError renders error state with message and retry button in EN and BN", () => {
  state.lang = "en";
  const html = stateError("Failed to load data", "reload");
  assert.ok(html.includes("class=\"error-state\""), "stateError has error-state class");
  assert.ok(html.includes("Failed to load data"), "stateError shows message in EN");
  assert.ok(html.includes("Retry"), "stateError shows Retry button in EN");
  assert.ok(html.includes("data-action=\"reload\""), "stateError has retry action");

  state.lang = "bn";
  const htmlBn = stateError("তথ্য লোড হয়নি", "reload");
  assert.ok(htmlBn.includes("class=\"error-state\""), "stateError has error-state class in BN");
  assert.ok(htmlBn.includes("তথ্য লোড হয়নি"), "stateError shows message in BN");
  assert.ok(htmlBn.includes("আবার চেষ্টা করুন"), "stateError shows Retry button in BN");
});

test("stateError renders without retry button when action is null", () => {
  state.lang = "en";
  const html = stateError("Error occurred");
  assert.ok(html.includes("class=\"error-state\""), "stateError has error-state class");
  assert.ok(html.includes("Error occurred"), "stateError shows message");
  assert.ok(!html.includes("Retry"), "stateError has no retry button");
});

test("exampleBanner renders example banner in EN and BN", () => {
  state.lang = "en";
  const html = exampleBanner();
  assert.ok(html.includes("class=\"example-banner\""), "exampleBanner has example-banner class");
  assert.ok(html.includes("Example — not your field"), "exampleBanner shows EN text");

  state.lang = "bn";
  const htmlBn = exampleBanner();
  assert.ok(htmlBn.includes("class=\"example-banner\""), "exampleBanner has example-banner class in BN");
  assert.ok(htmlBn.includes("উদাহরণ — আপনার জমি নয়"), "exampleBanner shows BN text");
});

test("research log with empty records shows empty state and action", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  state.lang = "en";
  state.fieldId = "mithapukur";
  state.tabs.research = "log";
  state.records = [];
  
  const { research } = await import("../src/legacy/research.js");
  const html = research();
  
  assert.ok(html.includes("class=\"empty\""), "Research log shows empty state");
  assert.ok(html.includes("Your field record starts here") || html.includes("আপনার মাঠের খাতা এখান থেকে শুরু"), "Research log shows empty message");
});

test("stateError function works correctly for data load errors", () => {
  state.lang = "en";
  const html = stateError("The field workspace could not open.", "reload");
  assert.ok(html.includes("class=\"error-state\""), "stateError has error-state class");
  assert.ok(html.includes("The field workspace could not open."), "stateError shows data load error message in EN");
  assert.ok(html.includes("Retry"), "stateError shows Retry button in EN");
  assert.ok(html.includes("data-action=\"reload\""), "stateError has reload action");

  state.lang = "bn";
  const htmlBn = stateError("ফিল্ড কর্মক্ষেত্র খোলা যায়নি।", "reload");
  assert.ok(htmlBn.includes("class=\"error-state\""), "stateError has error-state class in BN");
  assert.ok(htmlBn.includes("ফিল্ড কর্মক্ষেত্র খোলা যায়নি।"), "stateError shows data load error message in BN");
  assert.ok(htmlBn.includes("আবার চেষ্টা করুন"), "stateError shows Retry button in BN");
});

test("recovery example shows example banner in EN and BN", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  const { recovery } = await import("../src/legacy/research.js");
  
  state.lang = "en";
  state.fieldId = "mithapukur";
  state.hazard = "flood";
  state.recoveryDrafts["mithapukur:flood"] = {
    phase: "ready",
    date: "2024-10-15",
    example: true,
    ground: "unknown",
    standing: "unknown",
    water: "unknown",
    exposure: "unknown",
    delay: 0,
    nextDate: "",
    edge: "none"
  };
  
  const { recovery: recoveryFn } = await import("../src/legacy/recovery.js");
  const html = recoveryFn();
  
  assert.ok(html.includes("class=\"example-banner\"") || html.includes("Example — not your field") || html.includes("উদাহরণ — আপনার জমি নয়"), "Recovery example shows example banner");
});

test("3D terrain toggle and WebGL fallback behavior", async () => {
  globalThis.document = {
    baseURI: new URL("../public/", import.meta.url).href,
    createElement: () => ({ getContext: () => null }),
    querySelector: () => null,
  };
  globalThis.window = {
    WebGLRenderingContext: undefined,
    matchMedia: () => ({ matches: false }),
  };

  let toastMessage = "";
  globalThis.onToastMessage = (msg) => { toastMessage = msg; };

  // isWebGLAvailable returns false when WebGL is missing
  assert.equal(isWebGLAvailable(), false, "isWebGLAvailable returns false when WebGLRenderingContext missing");

  // Attempting to switch to 3D without WebGL stays in 2D with explanatory message
  fieldAction("set-view-mode", "3d");
  assert.equal(viewMode, "2d", "View mode stays 2D when WebGL is unavailable");
  assert.ok(
    toastMessage.includes("WebGL") || toastMessage.includes("3D view requires WebGL"),
    "Displays explanatory toast message about missing WebGL",
  );

  delete globalThis.onToastMessage;
});

test("3D terrain view HTML elements and chips", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => {
    const target = url instanceof URL || (typeof url === "string" && url.startsWith("file:")) ? new URL(url) : url;
    return {
      ok: true,
      json: async () => JSON.parse(await readFile(target, "utf8")),
    };
  };
  await loadData();

  state.lang = "en";
  state.fieldId = "mithapukur";
  const html2D = home();

  // Check 2D / 3D segmented toggle buttons
  assert.ok(html2D.includes("2D map"), "Includes '2D map' button");
  assert.ok(html2D.includes("3D view"), "Includes '3D view' button");
  assert.ok(html2D.includes('data-action="set-view-mode"'), "Has set-view-mode data-action");

  // Check terrain data loading from public/terrain/<site>.json
  const terrain = await fetchTerrainData("mithapukur");
  assert.equal(terrain.site, "mithapukur", "Terrain data site matches");
  assert.equal(terrain.width, 128, "Terrain grid width <= 128");
  assert.equal(terrain.height, 128, "Terrain grid height <= 128");
  assert.equal(terrain.grid.length, 128, "Terrain grid rows == 128");

  // Test 3D mode rendering
  setViewMode("3d");
  const html3D = home();

  assert.ok(html3D.includes("field-3d"), "Includes field-3d container");
  assert.ok(html3D.includes("Reset view"), "Includes Reset view button");
  assert.ok(html3D.includes("Height exaggerated 2.5×"), "Includes 'Height exaggerated 2.5×' label");
  assert.ok(
    html3D.includes("Real satellite + illustrative 3D — heights include trees and houses — check locally"),
    "Includes required scenario warning chip",
  );
  assert.ok(html3D.includes("Possible water collects here"), "Includes 'Possible water collects here' label");
  assert.ok(html3D.includes("Scenario"), "Includes Scenario truth tag");
  assert.ok(html3D.includes("Estimated"), "Includes Estimated truth tag");

  // Switch back to 2D
  setViewMode("2d");
});

test("#field and #seasons render >= 3 truth badges each in EN and BN", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  for (const lang of ["en", "bn"]) {
    state.lang = lang;
    state.fieldId = "mithapukur";
    
    // Test #field view (home)
    const fieldHtml = home();
    const fieldTruthCount = (fieldHtml.match(/class="truth/g) || []).length;
    assert.ok(fieldTruthCount >= 3, `#field view renders >= 3 truth badges in ${lang} (found ${fieldTruthCount})`);
    
    // Check for specific truth badges in #field
    assert.ok(fieldHtml.includes("class=\"truth") || fieldHtml.includes("class='truth'"), `Truth label class in #field ${lang}`);
    assert.ok(fieldHtml.includes("Estimated") || fieldHtml.includes("স্যাটেলাইট অনুমান") || fieldHtml.includes("Scenario") || fieldHtml.includes("কাল্পনিক পরিকল্পনা") || fieldHtml.includes("Measured") || fieldHtml.includes("জমি থেকে মাপা"), `Truth label text in #field ${lang}`);
    
    // Test #seasons view (seasonView)
    state.historyYear = 2024;
    state.month = 10;
    const seasonsHtml = seasonView();
    const seasonsTruthCount = (seasonsHtml.match(/class="truth/g) || []).length;
    assert.ok(seasonsTruthCount >= 3, `#seasons view renders >= 3 truth badges in ${lang} (found ${seasonsTruthCount})`);
    
    // Check for specific truth badges in #seasons
    assert.ok(seasonsHtml.includes("class=\"truth") || seasonsHtml.includes("class='truth'"), `Truth label class in #seasons ${lang}`);
    assert.ok(seasonsHtml.includes("Estimated") || seasonsHtml.includes("স্যাটেলাইট অনুমান") || seasonsHtml.includes("Scenario") || seasonsHtml.includes("কাল্পনিক পরিকল্পনা") || seasonsHtml.includes("Measured") || seasonsHtml.includes("জমি থেকে মাপা") || seasonsHtml.includes("Unknown") || seasonsHtml.includes("অজানা"), `Truth label text in #seasons ${lang}`);
  }
});

test("no '%' after wetness value in #field and #seasons", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  for (const lang of ["en", "bn"]) {
    state.lang = lang;
    state.fieldId = "mithapukur";
    
    // Test #field view
    const fieldHtml = home();
    
    // Find wetness values and ensure no % follows them
    // Look for the wetness stat section
    const wetnessStat = fieldHtml.match(/Surface wetness[\s\S]*?<\/article>/);
    if (wetnessStat) {
      const wetnessText = wetnessStat[0];
      // Check that wetness value is not followed by %
      const wetnessValueMatch = wetnessText.match(/(\d+\.\d+|\d+)[\s\S]*?<\/div>/);
      if (wetnessValueMatch) {
        assert.ok(!wetnessText.includes("%"), `No % after wetness value in #field ${lang}`);
      }
    }
    
    // Test #seasons view
    state.historyYear = 2024;
    state.month = 10;
    const seasonsHtml = seasonView();
    
    // Check that wetness values in charts are not followed by %
    assert.ok(!seasonsHtml.includes("wetness index 0–1%") && !seasonsHtml.includes("আর্দ্রতা সূচক ০–১%"), `No % in wetness index label in #seasons ${lang}`);
    
    // Check for any wetness values followed by %
    const wetnessIndexMatch = seasonsHtml.match(/wetness index 0–1[\s\S]*?<\/p>/);
    if (wetnessIndexMatch) {
      assert.ok(!wetnessIndexMatch[0].includes("%"), `No % after wetness index in #seasons ${lang}`);
    }
  }
});

test("truth badges in #field and #seasons have proper source, date, cell info", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, "utf8")),
  });
  await loadData();

  state.lang = "en";
  state.fieldId = "mithapukur";
  state.historyYear = 2024;
  state.month = 10;
  
  // Test #field view - check for title attributes with source info
  const fieldHtml = home();
  assert.ok(fieldHtml.includes("source:") || fieldHtml.includes("source:"), `Truth badges in #field have source info`);
  assert.ok(fieldHtml.includes("date:") || fieldHtml.includes("date:"), `Truth badges in #field have date info`);
  assert.ok(fieldHtml.includes("cell:") || fieldHtml.includes("cell:"), `Truth badges in #field have cell info`);
  
  // Test #seasons view
  const seasonsHtml = seasonView();
  assert.ok(seasonsHtml.includes("source:") || seasonsHtml.includes("source:"), `Truth badges in #seasons have source info`);
  assert.ok(seasonsHtml.includes("date:") || seasonsHtml.includes("date:"), `Truth badges in #seasons have date info`);
  assert.ok(seasonsHtml.includes("cell:") || seasonsHtml.includes("cell:"), `Truth badges in #seasons have cell info`);
});

test("MAP4C: 3D terrain elevation smoothing and low-area mask", async () => {
  const { smoothElevationGrid, computeLowAreaMask, cropTerrainAroundField, fetchTerrainData } = await import(
    "../src/legacy/terrain3d.js"
  );

  // 1. Smoothing reduces the max-min range of a noisy grid
  const noisyGrid = [
    [10, 35, 12, 38, 15],
    [32, 11, 40, 14, 36],
    [14, 39, 10, 37, 12],
    [36, 15, 35, 11, 39],
    [11, 38, 13, 36, 14],
  ];
  const flatNoisy = [].concat(...noisyGrid);
  const noisyRange = Math.max(...flatNoisy) - Math.min(...flatNoisy);

  const smoothed = smoothElevationGrid(noisyGrid, 5);
  const flatSmoothed = [].concat(...smoothed);
  const smoothedRange = Math.max(...flatSmoothed) - Math.min(...flatSmoothed);

  assert.ok(
    smoothedRange < noisyRange,
    `Smoothing reduces max-min range (smoothed range: ${smoothedRange} < noisy range: ${noisyRange})`,
  );

  // Verify on real terrain grid data
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => {
    const target = url instanceof URL || (typeof url === "string" && url.startsWith("file:")) ? new URL(url) : url;
    return {
      ok: true,
      json: async () => JSON.parse(await readFile(target, "utf8")),
    };
  };
  const terrain = await fetchTerrainData("mithapukur");
  const realSmoothed = smoothElevationGrid(terrain.grid, 5);
  const realRawRange = terrain.maxHeightMetres - terrain.minHeightMetres;
  const flatRealSmoothed = [].concat(...realSmoothed);
  const realSmoothedRange = Math.max(...flatRealSmoothed) - Math.min(...flatRealSmoothed);
  assert.ok(
    realSmoothedRange < realRawRange,
    `Real terrain smoothing reduces range (${realSmoothedRange} < ${realRawRange})`,
  );

  // 2. Low-area mask covers <= 10% of cells
  const testGrid = [
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    [25, 26, 27, 28, 29],
  ];
  const mask = computeLowAreaMask(testGrid, 0.10);
  const totalCells = testGrid.length * testGrid[0].length;
  const markedCells = [].concat(...mask).filter(Boolean).length;
  assert.ok(
    markedCells / totalCells <= 0.10,
    `Low-area mask covers <= 10% of cells (${markedCells} / ${totalCells} = ${markedCells / totalCells})`,
  );

  // Test mask on cropped smoothed real terrain
  const cropped = cropTerrainAroundField(
    { ...terrain, grid: realSmoothed },
    [[25.54, 89.27], [25.541, 89.271], [25.539, 89.269]],
    1500,
  );
  const croppedMask = computeLowAreaMask(cropped.grid, 0.10);
  const croppedTotal = cropped.width * cropped.height;
  const croppedMarked = [].concat(...croppedMask).filter(Boolean).length;
  assert.ok(
    croppedMarked / croppedTotal <= 0.10,
    `Cropped low-area mask covers <= 10% of cells (${croppedMarked} / ${croppedTotal} = ${croppedMarked / croppedTotal})`,
  );
});
