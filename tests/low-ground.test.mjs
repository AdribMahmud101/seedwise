import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import { state, loadData, icon } from "../src/legacy/ui.js";
import { home, fieldAction, loadMapData, queryLowGround, setLayerMode } from "../src/legacy/fields.js";

const publicRoot = new URL("../public/", import.meta.url);
const manifestBytes = await readFile(new URL("data/low-ground.json", publicRoot));
const data = JSON.parse(manifestBytes);
const mapLayers = JSON.parse(await readFile(new URL("data/map-layers.json", publicRoot)));

test("low-ground schema, three blue RGBA PNGs, feathered alpha and rims, and <=300 KB local pack", async () => {
  assert.match(data.source, /NASADEM 30 m.*Planetary Computer/);
  assert.match(data.caveat, /includes trees/);
  assert.equal(data.method.windowMetres, 1000);
  assert.equal(data.method.sigmaCells, 1.5);
  assert.equal(data.method.lowThresholdMetres, -1);
  assert.equal(data.method.color, "#1f6fd1");
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
    let rims = 0, feathers = 0, strong = 0;
    for (let y = 0; y < site.height; y++) {
      const start = y * (site.width * 4 + 1);
      assert.equal(pixels[start], 0, "unfiltered PNG rows");
      for (let x = 0; x < site.width; x++) {
        const offset = start + 1 + x * 4;
        const color = [...pixels.subarray(offset, offset + 3)];
        const rim = color[0] === 95;
        assert.deepEqual(color, rim ? [95, 159, 237] : [31, 111, 209]);
        const alpha = pixels[offset + 3];
        alphas.add(alpha);
        assert.ok(alpha <= 217, "maximum opacity 0.75 plus 0.1 rim");
        if (rim) {
          rims++;
          assert.equal(site.grid[y][x], "l", "lighter rim stays on low side of contour");
          assert.ok([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([col, row]) =>
            site.grid[row]?.[col] && site.grid[row][col] !== "l"), "one-cell contour rim");
        }
        if (alpha >= 179) strong++;
        if (site.grid[y][x] !== "l" && alpha > 0) feathers++;
        if (x === 0 || y === 0 || x === 199 || y === 199) {
          assert.equal(alpha, 0, "pack edges stay transparent");
        } else if (!site.grid.slice(Math.max(0, y - 3), y + 4).some(row =>
          row.slice(Math.max(0, x - 3), x + 4).includes("l"))) {
          assert.equal(alpha, 0, "land beyond the alpha blur stays transparent");
        }
      }
    }
    assert.ok(alphas.size > 80, "continuous tint, not binary pixels");
    assert.ok(rims > 0 && feathers > 0 && strong > 0, "visible patches with lighter rims and feathered edges");
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
  assert.match(home(), /class="button small " data-action="toggle-low-ground"/);
  fieldAction("toggle-low-ground");
  for (const lang of ["en", "bn"]) {
    state.lang = lang;
    for (const mode of ["high-detail", "natural", "ndvi"]) {
      setLayerMode(mode);
      const html = home();
      assert.match(html, /data-action="toggle-low-ground" aria-pressed="true"/);
      assert.match(html, /class="button small primary" data-action="toggle-low-ground"/);
      const control = html.match(/<button[^>]*data-action="toggle-low-ground"[^>]*>([\s\S]*?)<\/button>/)?.[1];
      assert.ok(control.startsWith(`${icon("water", 14)} `), "same leading icon pattern as Context lines");
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
  assert.match(home(), /class="button small " data-action="toggle-low-ground" aria-pressed="false"/);
});

test("overlay uses normal blend, full opacity, and matching legend colour", async () => {
  const css = await readFile(new URL("../app/lowground.css", import.meta.url), "utf8");
  const fields = await readFile(new URL("../src/legacy/fields.js", import.meta.url), "utf8");
  assert.match(css, /\.low-ground-overlay\s*\{[^}]*mix-blend-mode:\s*normal;/);
  assert.doesNotMatch(css, /mix-blend-mode:\s*multiply/);
  assert.match(css, /\.low-ground-swatch\s*\{[^}]*background:\s*#1f6fd1;/);
  assert.match(fields, /className: "low-ground-overlay",\s*opacity: 1,/);
});

test("generator preserves terrain classification and renders the stronger alpha ramp, blurred edges, and thin rim", () => {
  const result = spawnSync("python", ["-c", `
import runpy
import math
import struct
import tempfile
import zlib
from pathlib import Path
m = runpy.run_path('scripts/fetch-low-ground.py')
flat = [[20] * 15 for _ in range(15)]
assert all(abs(v) < 1e-10 for row in m['relative_grid'](flat, 4) for v in row)
for y in range(5, 10):
    for x in range(5, 10):
        flat[y][x] = 15
grid = m['relative_grid'](flat, 4)
assert grid[7][7] < -3 and abs(grid[0][0]) < 0.01
assert m['alpha'](0) == m['alpha'](-0.99) == 0
assert m['alpha'](-1) == 0.25
assert m['alpha'](-2) == 0.5
assert m['alpha'](-3) == m['alpha'](-10) == 0.75
size = 31
step = [[-1 if x <= 15 else 0 for x in range(size)] for _ in range(size)]
with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'test.png'
    m['write_png'](path, step)
    png = path.read_bytes()
offset = 8
chunks = []
while offset < len(png):
    length = struct.unpack_from('>I', png, offset)[0]
    if png[offset + 4:offset + 8] == b'IDAT':
        chunks.append(png[offset + 8:offset + 8 + length])
    offset += length + 12
pixels = zlib.decompress(b''.join(chunks))
def pixel(x, y=15):
    offset = y * (size * 4 + 1) + 1 + x * 4
    return tuple(pixels[offset:offset + 4])
assert pixel(10) == (31, 111, 209, 64), '0.25 interior alpha at -1 m'
assert pixel(14)[:3] == (31, 111, 209)
assert pixel(15)[:3] == (95, 159, 237), 'one-cell lighter rim at -1 m contour'
weights = [math.exp(-i * i / 2) for i in range(-3, 4)]
expected = round(255 * (0.25 * sum(weights[:4]) + 0.1 * weights[3]) / sum(weights))
assert pixel(15)[3] == expected, 'sigma 1 alpha blur includes +0.1 rim'
assert 0 < pixel(17)[3] < pixel(16)[3] < pixel(15)[3], 'alpha feathers into adjacent cells'
assert pixel(19)[3] == pixel(0)[3] == pixel(10, 0)[3] == 0
`], { cwd: new URL("..", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});
