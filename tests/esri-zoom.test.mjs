import { test } from "node:test";
import assert from "node:assert/strict";
import { esriMaxZoom } from "../src/legacy/fields.js";

const fake = (deepest) => async (url) => ({ json: async () => ({ data: [Number(url.split("/tilemap/")[1].split("/")[0]) <= deepest ? 1 : 0] }) });

test("esriMaxZoom picks the deepest zoom with real imagery", async () => {
  assert.equal(await esriMaxZoom(25.54, 89.27, fake(18)), 18);
  assert.equal(await esriMaxZoom(40.76, -73.99, fake(19)), 19);
});
test("esriMaxZoom falls back to 18 when the probe fails", async () => {
  assert.equal(await esriMaxZoom(10.11, 10.11, async () => { throw new Error("offline"); }), 18);
});
