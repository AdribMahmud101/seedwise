import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { state, loadData } from "../src/legacy/ui.js";
import { home, fieldAction, loadMapData, queryLowGround, setLayerMode } from "../src/legacy/fields.js";

const publicRoot = new URL("../public/", import.meta.url);
const manifestBytes = await readFile(new URL("data/low-ground.json", publicRoot));
const data = JSON.parse(manifestBytes);
const mapLayers = JSON.parse(await readFile(new URL("data/map-layers.json", publicRoot)));

test("low-ground schema, three RGBA PNGs, smooth alpha, and <=300 KB local pack", async () => {
  assert.match(data.source, /NASADEM 30 m.*Planetary Computer/);
  assert.match(data.caveat, /includes trees/);
  assert.equal(data.method.windowMetres, 1000);
  assert.equal(data.method.sigmaCells, 1.5);
  assert.equal(data.method.lowThresholdMetres, -1);
  assert.deepEqual(data.sites.map(s => s.id), mapLayers.sites.map(s => s.id));
  assert.equal(data.sites.length, 3);
  let total = manifestBytes.length;
  for (const site of data.sites) {
    assert.deepEqual(site.bounds, mapLayers.sites.find(s => s.id === site.id).bounds);
    assert.equal(site.width, 200);
    assert.equal(site.height, 200);
    assert.equal(site.grid.length, site.height);
    assert.ok(site.grid.every(row => row.length === site.width && /^[leh]+$/.test(row)));
    assert.ok(Number.isFinite(site.stats.minRelativeMetres));
    assert.ok(Number.isFinite(site.stats.maxRelativeMetres));
    const lowCells = site.grid.join("").split("l").length - 1;
    assert.ok(Math.abs(site.stats.lowPercent - 100 * lowCells / (site.width * site.height)) <= 0.051);
    assert.equal(site.png, `/overlays/low-ground-${site.id}.png`);
    assert.match(site.requestUrl, /collection=nasadem/);
    assert.ok(Number.isFinite(Date.parse(site.fetchedAt)));
    const png = await readFile(new URL(site.png.slice(1), publicRoot));
    total += png.length;
    assert.equal(png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(png.readUInt32BE(16), site.width);
    assert.equal(png.readUInt32BE(20), site.height);
    assert.equal(png[24], 8);
    assert.equal(png[25], 6, "RGBA");
    const chunks = [];
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset);
      if (png.toString("ascii", offset + 4, offset + 8) === "IDAT") {
        chunks.push(png.subarray(offset + 8, offset + 8 + length));
      }
      offset += length + 12;
    }
    const pixels = inflateSync(Buffer.concat(chunks));
    const alphas = new Set();
    for (let y = 0; y < site.height; y++) {
      const start = y * (site.width * 4 + 1);
      assert.equal(pixels[start], 0, "unfiltered PNG rows");
      for (let x = 0; x < site.width; x++) {
        const offset = start + 1 + x * 4;
        assert.deepEqual([...pixels.subarray(offset, offset + 3)], [47, 111, 181]);
        const alpha = pixels[offset + 3];
        alphas.add(alpha);
        assert.ok(alpha <= 140, "maximum opacity 0.55");
        if (site.grid[y][x] !== "l" || x === 0 || y === 0 || x === 199 || y === 199) {
          assert.equal(alpha, 0, "level/higher cells and pack edges stay transparent");
        }
      }
    }
    assert.ok(alphas.size > 80, "continuous tint, not binary pixels");
  }
  assert.ok(total <= 300_000, `${total} bytes exceeds 300 KB`);
});

test("inspection classifies the same grid, handles edges and missing coverage, and translates", () => {
  const site = { bounds: [0, 0, 3, 1], width: 3, height: 1, grid: ["leh"] };
  state.lang = "en";
  assert.equal(queryLowGround(site, 0.5, 0.5), "lower than surroundings");
  assert.equal(queryLowGround(site, 0.5, 1.5), "about level");
  assert.equal(queryLowGround(site, 0, 3), "higher");
  assert.equal(queryLowGround(site, 1, 0), "lower than surroundings");
  assert.equal(queryLowGround(site, 0.5, -0.01), null);
  assert.equal(queryLowGround(site, NaN, 0), null);
  assert.equal(queryLowGround(null, 0, 0), null);
  assert.equal(queryLowGround({ ...site, grid: ["???"] }, 0.5, 0.5), null);
  state.lang = "bn";
  assert.equal(queryLowGround(site, 0.5, 0.5), "আশেপাশের চেয়ে নিচু");
  assert.equal(queryLowGround(site, 0.5, 1.5), "প্রায় সমতল");
  assert.equal(queryLowGround(site, 0.5, 2.5), "উঁচু");
});

test("legend appears only when toggled on, across imagery layers and languages; missing overlays hide control", async () => {
  globalThis.document = { baseURI: publicRoot.href };
  globalThis.window = new EventTarget();
  globalThis.fetch = async path => ({
    ok: true,
    json: async () => path === "data/low-ground.json" ? data : JSON.parse(await readFile(new URL(path, publicRoot))),
  });
  await loadData();
  await loadMapData();
  state.fieldId = "mithapukur";
  state.lang = "en";
  assert.doesNotMatch(home(), /class="map-legend-bar low-ground-legend"/);
  assert.match(home(), /data-action="toggle-low-ground" aria-pressed="false"/);
  fieldAction("toggle-low-ground");
  for (const lang of ["en", "bn"]) {
    state.lang = lang;
    for (const mode of ["high-detail", "natural", "ndvi"]) {
      setLayerMode(mode);
      const html = home();
      assert.match(html, /data-action="toggle-low-ground" aria-pressed="true"/);
      const legend = html.match(/<div class="map-legend-bar low-ground-legend">[\s\S]*?<\/div>/)?.[0];
      assert.ok(legend);
      assert.match(legend, /title="MODELED"/);
      assert.ok(legend.includes(lang === "en" ? "water may collect after heavy rain" : "ভারী বৃষ্টির পর পানি জমতে পারে"));
      assert.ok(html.includes(lang === "en" ? "Low ground" : "নিচু জমি"));
    }
  }
  const png = data.sites[0].png;
  data.sites[0].png = null;
  assert.match(home(), /data-action="toggle-low-ground" aria-pressed="false" hidden/);
  assert.doesNotMatch(home(), /class="map-legend-bar low-ground-legend"/);
  data.sites[0].png = png;
  fieldAction("toggle-low-ground");
  assert.doesNotMatch(home(), /class="map-legend-bar low-ground-legend"/);
});

test("generator keeps flat land level and finds a hollow using the median and Gaussian", () => {
  const result = spawnSync("python", ["-c", `
import runpy
m = runpy.run_path('scripts/fetch-low-ground.py')
flat = [[20] * 15 for _ in range(15)]
assert all(abs(v) < 1e-10 for row in m['relative_grid'](flat, 4) for v in row)
for y in range(5, 10):
    for x in range(5, 10):
        flat[y][x] = 15
grid = m['relative_grid'](flat, 4)
assert grid[7][7] < -3 and abs(grid[0][0]) < 0.01
assert m['alpha'](-1, 10) == 0
assert m['alpha'](-4, 10) == m['alpha'](-10, 10) == 140
assert 0 < m['alpha'](-2.5, 10) < 140
assert m['alpha'](-4, 0) == 0
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
