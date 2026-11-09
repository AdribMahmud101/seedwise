import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { state, loadData, field } from "../src/legacy/ui.js";
import { setCachedPower } from "../src/legacy/powerlive.js";
import { queryNdvi, inspectPopup, loadMapData, loadMoistureData, fieldAction, setLayerMode } from "../src/legacy/fields.js";

const publicRoot = new URL("../public/", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("fixtures/ndmi-grid.json", import.meta.url)));
const ndvi = JSON.parse(await readFile(new URL("data/ndvi-grid.json", publicRoot)));
const moistureBytes = await readFile(new URL("data/moisture-grid.json", publicRoot));
const moisture = JSON.parse(gunzipSync(moistureBytes));

test("NDMI uses the existing lookup, preserving negative, zero, boundary, masked and outside values", () => {
  assert.equal(queryNdvi(fixture, 25.54, 89.27), -0.15);
  assert.equal(queryNdvi(fixture, 25.54, 89.2702), 0);
  assert.equal(queryNdvi(fixture, 25.5398, 89.27), 0.2);
  assert.equal(queryNdvi(fixture, 25.5398, 89.2702), null);
  assert.equal(queryNdvi(fixture, 25.55, 89.27), null);
  assert.equal(queryNdvi(fixture, 26, 90), null);
  assert.equal(queryNdvi(null, 25.54, 89.27), null);
});

test("real NDMI pack stays under 2 MB and matches every NDVI scene, date, shape and transform", () => {
  assert.ok(moistureBytes.length <= 2_000_000);
  assert.equal(moisture.index, "NDMI");
  assert.equal(moisture.grids.length, ndvi.grids.length);
  for (const [i, grid] of moisture.grids.entries()) {
    for (const key of ["siteId", "date", "sceneId", "bounds", "width", "height", "transform", "crs"]) {
      assert.deepEqual(grid[key], ndvi.grids[i][key]);
    }
    assert.equal(grid.index, "NDMI");
    assert.equal(grid.resolutionMetres, 20);
    assert.equal(grid.values.length, grid.height);
    for (const row of grid.values) {
      assert.equal(row.length, grid.width);
      for (const value of row) {
        assert.ok(value === null || (Number.isFinite(value) && value >= -1 && value <= 1 && value === +value.toFixed(3)));
      }
    }
    const values = grid.values.flat().filter(v => v !== null);
    assert.ok(new Set(values).size > 100, "real spatial variation");
  }
  const check = spawnSync("python3", ["scripts/fetch-moisture-grid.py", "--self-check"], { encoding: "utf8" });
  assert.equal(check.status, 0, check.stderr);
});

test("tap popup loads NDMI lazily, retries failures, shares one fetch, and translates spot and area groups", async () => {
  globalThis.document = { baseURI: publicRoot.href };
  globalThis.window = new EventTarget();
  globalThis.localStorage = (() => {
    const items = new Map();
    return { getItem: key => items.get(key) || null, setItem: (key, value) => items.set(key, value) };
  })();
  const requests = [];
  let failMoisture = true;
  const popupMoisture = structuredClone(moisture);
  Object.assign(popupMoisture.grids.find(g => g.siteId === "mithapukur"), fixture, {
    width: 3, values: [[-0.15, 0, 0.201], [0.2, null, 0.4]],
  });
  globalThis.fetch = async path => {
    requests.push(String(path));
    const url = new URL(path, publicRoot);
    if (url.pathname.endsWith("moisture-grid.json") && failMoisture) throw new Error("offline");
    if (url.pathname.endsWith("moisture-grid.json")) {
      return new Response(gzipSync(JSON.stringify(popupMoisture)));
    }
    return new Response(await readFile(url));
  };
  await loadData();
  await loadMapData();
  assert.ok(!requests.some(path => path.includes("moisture-grid")), "initial map load skips moisture");
  state.lang = "en";
  state.fieldId = "mithapukur";
  state.month = 10;
  await loadMoistureData();
  assert.match(inspectPopup(field(), 25.54, 89.27), /No reliable observation/);
  failMoisture = false;
  await Promise.all([loadMoistureData(), loadMoistureData()]);
  await loadMoistureData();
  assert.equal(requests.filter(path => path.includes("moisture-grid")).length, 2, "one failed request, one shared successful request");

  for (const site of ["mithapukur", "gangachara", "pirganj"]) {
    state.fieldId = site;
    const f = field();
    const html = inspectPopup(f, f.lat, f.lon);
    assert.match(html, /At this spot/);
    assert.match(html, /Area weather · November 2024/);
    assert.match(html, /Greenness NDVI/);
    assert.match(html, /9 Nov 2024/);
    assert.match(html, /Mar → Nov/);
    assert.match(html, /Plant & soil moisture \(NDMI\)/);
    assert.match(html, /IMERG · ~10 km/);
    assert.equal((html.match(/POWER · ~50 km/g) || []).length, 2);
    assert.match(html, /◈ Estimated · Sentinel-2 L2A · NASA POWER · GPM IMERG/);
    assert.doesNotMatch(html, /Maxar|Observation date|Cell size|Surface wetness|undefined|NaN/);
    const grid = popupMoisture.grids.find(g => g.siteId === site);
    const ndmi = queryNdvi(grid, f.lat, f.lon);
    assert.ok(Number.isFinite(ndmi));
    assert.ok(html.includes(`${ndmi} · ${ndmi < 0 ? "Dry" : ndmi <= 0.2 ? "Moderate" : "Moist"}`));
    assert.match(inspectPopup(f, 26.5, 90), /No reliable observation/);
  }

  state.fieldId = "mithapukur";
  setLayerMode("high-detail");
  fieldAction("set-active-date", "2024-11-09");
  const novemberHtml = inspectPopup(field(), 25.54, 89.27);
  assert.match(novemberHtml, /9 Nov 2024/);
  assert.doesNotMatch(novemberHtml, /9 Mar 2024|Maxar/);
  fieldAction("set-active-date", "2024-03-09");

  // Use tiny grids to prove classification thresholds and per-tap differences in rendered HTML.
  state.fieldId = "mithapukur";
  assert.match(inspectPopup(field(), 25.54, 89.27), /-0.15 · Dry/);
  assert.match(inspectPopup(field(), 25.54, 89.2702), /0 · Moderate/);
  assert.match(inspectPopup(field(), 25.5398, 89.27), /0.2 · Moderate/);
  assert.match(inspectPopup(field(), 25.54, 89.2704), /0.201 · Moist/);
  assert.match(inspectPopup(field(), 25.5398, 89.2702), /No reliable observation/);
  state.lang = "bn";
  assert.match(inspectPopup(field(), 25.54, 89.27), /শুকনো/);
  assert.match(inspectPopup(field(), 25.54, 89.2702), /মাঝারি/);
  assert.match(inspectPopup(field(), 25.54, 89.2704), /আর্দ্র/);
  state.lang = "en";

  const custom = { id: "custom-inspect", name: "Custom", name_bn: "কাস্টম", custom: true, lat: 25.54, lon: 89.27 };
  state.customFields = [custom];
  state.fieldId = custom.id;
  const monthly = Array.from({ length: 12 }, () => ({ wetness: 0.123, rainGpm: 42.5, tmean: 23.4 }));
  setCachedPower(custom.id, { monthly });
  const html = inspectPopup(custom, custom.lat, custom.lon);
  assert.equal((html.match(/Not prepared for this field/g) || []).length, 3);
  assert.match(html, /42.5 mm/);
  assert.match(html, /0.12/);
  assert.match(html, /23.4 °C/);
  assert.doesNotMatch(html, /Mar → Nov|Maxar/);
  setCachedPower(custom.id, { monthly: [] });
  assert.match(inspectPopup(custom, custom.lat, custom.lon), /No data/);

  state.lang = "bn";
  const bn = inspectPopup(custom, custom.lat, custom.lon);
  assert.match(bn, /এই জায়গায়/);
  assert.match(bn, /এলাকার আবহাওয়া/);
  assert.match(bn, /এই জমির জন্য প্রস্তুত নেই/);
  assert.doesNotMatch(bn, /At this spot|Area weather|Not prepared|No data/);
});

test("offline generator includes both grids before any tap", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ropon-inspect-offline-"));
  try {
    await mkdir(join(directory, "scripts"));
    await mkdir(join(directory, "out/data"), { recursive: true });
    await writeFile(join(directory, "scripts/prepare-offline.py"), await readFile(new URL("../scripts/prepare-offline.py", import.meta.url)));
    for (const file of ["ndvi-grid.json", "moisture-grid.json"]) {
      await writeFile(join(directory, "out/data", file), "fixture");
    }
    const run = spawnSync("python3", [join(directory, "scripts/prepare-offline.py")], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const worker = await readFile(join(directory, "out/sw.js"), "utf8");
    assert.match(worker, /"\/data\/ndvi-grid.json"/);
    assert.match(worker, /"\/data\/moisture-grid.json"/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
