import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { state, loadData, truth } from "../src/legacy/ui.js";
import { home, seasonView, formatNdvi, queryNdvi, projectWgs84ToUtm45N } from "../src/legacy/fields.js";
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
