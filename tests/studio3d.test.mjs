import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { rotations, posterCard } from "../src/legacy/rotations.js";
import { studio3dHtml } from "../src/legacy/studio3d.js";
import { buildStudioData } from "../src/legacy/studiodata.js";
import { state, t } from "../src/legacy/ui.js";

const fixture = JSON.parse(
  await readFile(new URL("fixtures/studio-data.json", import.meta.url), "utf8")
);

test("poster renders without importing three.js", () => {
  const html = posterCard();
  assert.match(html, /Your field, season by season/);
  assert.match(html, /Open 3D studio/);
  assert.match(html, /3D · ~180 KB · then works offline/);
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
