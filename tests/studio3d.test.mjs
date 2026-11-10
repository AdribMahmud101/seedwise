import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { rotations, studioSkeletonCard } from "../src/legacy/rotations.js";
import { studio3dHtml } from "../src/legacy/studio3d.js";
import { buildStudioData } from "../src/legacy/studiodata.js";
import { state, t } from "../src/legacy/ui.js";

const fixture = JSON.parse(
  await readFile(new URL("fixtures/studio-data.json", import.meta.url), "utf8")
);

test("skeleton renders without importing three.js", () => {
  const html = studioSkeletonCard();
  assert.match(html, /studio-skeleton-root/);
  assert.match(html, /Building your field…/);
  assert.match(html, /studio-skeleton-fill/);
  assert.match(html, /studio-skeleton-iso/);
  assert.doesNotMatch(html, /Open 3D studio/);
  assert.doesNotMatch(html, /studio-poster/);
});

test("rotations view embeds the skeleton, not the poster", () => {
  state.lang = "en";
  const html = rotations();
  assert.match(html, /id="studio-3d-host"/);
  assert.match(html, /studio-skeleton-root/);
  assert.doesNotMatch(html, /studio-poster-root/);
  assert.doesNotMatch(html, /open-studio3d/);
});

test("three stays behind the two lazy 3D entry modules", async () => {
  async function scanDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        files.push(...(await scanDir(p)));
      } else if (p.endsWith(".js") || p.endsWith(".mjs")) {
        files.push(p);
      }
    }
    return files;
  }

  const jsFiles = [
    ...(await scanDir("src")),
    ...(await scanDir("app")),
  ];

  for (const file of jsFiles) {
    if (file.endsWith("/studio3d.js") || file.endsWith("/planner3d.js")) continue;
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(
      content,
      /import\s+.*from\s+['"]three(\/.*)?['"]/,
      `Static import of three detected in ${file}`
    );
  }
});

test("contract fixture renders month summary in English", () => {
  state.lang = "en";
  const html = studio3dHtml(fixture, 0); // Jan 2024
  assert.match(html, /Mustard/);
  assert.match(html, /Rainfall/);
  assert.match(html, /Crop Need/);
  assert.match(html, /Water Shortfall for This Plot/);
  assert.match(html, /Litres/);
  assert.match(html, /44,595 Litres|44595 Litres/);
  assert.match(html, /Illustrative crops · not observed/);
  assert.match(html, /Soil Profile/);
  assert.match(html, /ISRIC SoilGrids 2.0/);
});

test("contract fixture renders month summary in Bengali", () => {
  state.lang = "bn";
  const html = studio3dHtml(fixture, 0); // Jan 2024
  assert.match(html, /সরিষা/);
  assert.match(html, /বৃষ্টি/);
  assert.match(html, /ফসলের চাহিদা/);
  assert.match(html, /এই জমির জন্য পানির ঘাটতি/);
  assert.match(html, /লিটার/);
  assert.match(html, /কাল্পনিক ফসল · সরাসরি দেখা নয়/);
  assert.match(html, /মাটির স্তর/);
  // Restore language
  state.lang = "en";
});

test('month player precedes the canvas with translated month ticks and accessible controls', () => {
  try {
    for (const lang of ['en', 'bn']) {
      state.lang = lang;
      const html = studio3dHtml(fixture, 0);
      assert.ok(html.indexOf('class="studio-calendar-bar"') < html.indexOf('class="studio-stage-canvas-host"'));
      assert.match(html, /id="studio-month-slider"[^>]*aria-label=/);
      assert.match(html, /data-studio-action="toggle-play"[^>]*aria-label=/);
      const labels = html.match(/class="studio-month-slider-labels"[^>]*>([\s\S]*?)<\/div>/)[1];
      assert.equal((labels.match(/<span>/g) || []).length, 12);
      assert.ok(labels.includes(lang === 'en' ? 'Jan' : 'জানু'));
      assert.match(html, /class="studio-month-short"/);
    }
  } finally {
    state.lang = 'en';
  }
});

test("contract fixture satisfies required contract schema", () => {
  const data = fixture;
  assert.ok(data.field.id);
  assert.ok(data.field.areaHa > 0);
  assert.equal(data.field.centroid.length, 2);
  assert.equal(data.field.bboxLatLon.length, 4);
  assert.ok(Array.isArray(data.field.outlineM));
  assert.ok(data.field.outlineM.length >= 3);
  assert.equal(data.months.length, 12);

  const m0 = data.months[0];
  assert.ok(m0.month);
  assert.ok("canopyHeightM" in m0);
  assert.ok("rootDepthM" in m0);
  assert.ok("shortfallLitres" in m0);
  assert.ok(Array.isArray(data.vegetation));
  assert.ok(Array.isArray(data.moisture));
  assert.ok(data.truth.plants);
  assert.ok(data.truth.soil);
  assert.ok(data.truth.vegetation);
});

test("desktop and mobile soil callouts show translated estimates and a separate crop scenario", () => {
  const data = structuredClone(fixture);
  data.rotation = { id: "potato", label: "Rotation 01", bn: "ফসলচক্র 01" };
  data.months[0] = { ...data.months[0], cropName: "Potato", cropNameBn: "আলু", rootDepthM: 0.1, wetness: 0.8 };
  try {
    for (const lang of ["en", "bn"]) {
      state.lang = lang;
      const html = studio3dHtml(data);
      const rootValue = lang === "en" ? "Root zone: wet (80 % of saturation)" : "শিকড় অঞ্চল: ভেজা (সম্পৃক্ততার 80 %)";
      const cropValue = lang === "en" ? "Planned: Potato (Rotation 01) · roots ~0.1 m" : "পরিকল্পিত: আলু (ফসলচক্র 01) · শিকড় ~0.1 মি";
      const soilTag = lang === "en" ? "Estimated · SoilGrids 250 m" : "আনুমানিক · SoilGrids 250 মি";
      const rootTag = lang === "en" ? "Estimated · NASA POWER ~50 km, top ~1 m" : "আনুমানিক · NASA POWER ~50 কিমি, উপরের ~1 মি";
      const cropTag = lang === "en" ? "Scenario" : "কাল্পনিক পরিকল্পনা";
      for (const value of [rootValue, cropValue, `<small>${soilTag}</small>`, `<small>${rootTag}</small>`, `<small>${cropTag}</small>`]) {
        assert.equal(html.split(value).length - 1, 2, `${lang}: desktop and mobile both show ${value}`);
      }
      assert.doesNotMatch(html, /GWETROOT/);
    }
  } finally {
    state.lang = "en";
  }
});
