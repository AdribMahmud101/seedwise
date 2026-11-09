import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants } from "node:fs";
import { filterOsmFeature } from "../src/legacy/fields.js";

// WebMercator tile calculation
function project(lat, lon, zoom) {
  const sin = Math.sin((lat * Math.PI) / 180);
  const z2 = Math.pow(2, zoom);
  const x = (z2 * (lon + 180)) / 360;
  const y = z2 * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI));
  return [Math.floor(x), Math.floor(y)];
}

test("every manifest date has a tile at z12 and z16 on disk for each site", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../public/data/map-layers.json", import.meta.url), "utf8"),
  );

  assert.ok(manifest.sites?.length >= 3, "Manifest defines all 3 sites");
  assert.ok(manifest.layers?.length >= 2, "Manifest defines natural and ndvi layers");

  for (const site of manifest.sites) {
    for (const zoom of [12, 16]) {
      const [tileX, tileY] = project(site.lat, site.lon, zoom);
      for (const layer of manifest.layers) {
        if (!layer.dates) continue;
        for (const dateObj of layer.dates) {
          const tilePath = new URL(
            `../public/tiles/${layer.id}/${dateObj.date}/${zoom}/${tileX}/${tileY}.png`,
            import.meta.url,
          );
          try {
            await access(tilePath, constants.R_OK);
          } catch {
            assert.fail(
              `Missing tile at z${zoom} for site ${site.id}, layer ${layer.id}, date ${dateObj.date}: ${tilePath.pathname}`,
            );
          }
        }
      }
    }
  }
});

test("OSM loader drops features with fewer than 2 valid points", () => {
  // Null and empty structures
  assert.equal(filterOsmFeature(null), false);
  assert.equal(filterOsmFeature(undefined), false);
  assert.equal(filterOsmFeature({}), false);
  assert.equal(filterOsmFeature({ geometry: null }), false);
  assert.equal(filterOsmFeature({ geometry: { type: "LineString" } }), false);

  // LineStrings
  assert.equal(
    filterOsmFeature({
      geometry: { type: "LineString", coordinates: [] },
    }),
    false,
    "empty coordinates drop",
  );
  assert.equal(
    filterOsmFeature({
      geometry: { type: "LineString", coordinates: [[89.27, 25.54]] },
    }),
    false,
    "single point LineString drops",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "LineString",
        coordinates: [
          [89.27, 25.54],
          [NaN, 25.55],
        ],
      },
    }),
    false,
    "LineString with NaN point drops",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "LineString",
        coordinates: [
          [89.27, 25.54],
          [89.28, "invalid"],
        ],
      },
    }),
    false,
    "LineString with invalid point drops",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "LineString",
        coordinates: [
          [89.27, 25.54],
          [89.28, 25.55],
        ],
      },
    }),
    true,
    "valid 2-point LineString passes",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "LineString",
        coordinates: [
          [89.27, 25.54],
          [89.28, 25.55],
          [89.29, 25.56],
        ],
      },
    }),
    true,
    "valid 3-point LineString passes",
  );

  // MultiLineStrings
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "MultiLineString",
        coordinates: [[[89.27, 25.54]]],
      },
    }),
    false,
    "MultiLineString with only 1 point per line drops",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "MultiLineString",
        coordinates: [
          [
            [89.27, 25.54],
            [89.28, 25.55],
          ],
        ],
      },
    }),
    true,
    "MultiLineString with valid line passes",
  );

  // Polygons
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [89.27, 25.54],
            [89.28, 25.55],
          ],
        ],
      },
    }),
    false,
    "Polygon ring with fewer than 3 points drops",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [89.27, 25.54],
            [89.28, 25.55],
            [89.29, 25.54],
            [89.27, 25.54],
          ],
        ],
      },
    }),
    true,
    "valid Polygon passes",
  );

  // Point
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "Point",
        coordinates: [89.27, 25.54],
      },
    }),
    true,
    "valid Point passes",
  );
  assert.equal(
    filterOsmFeature({
      geometry: {
        type: "Point",
        coordinates: [89.27, null],
      },
    }),
    false,
    "invalid Point drops",
  );
});
