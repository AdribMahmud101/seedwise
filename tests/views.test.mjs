import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { state, loadData } from "../src/legacy/ui.js";
import { home, seasonView } from "../src/legacy/fields.js";
import { rotations } from "../src/legacy/rotations.js";
import { planner } from "../src/legacy/planner.js";
import { clinic } from "../src/legacy/clinic.js";
import { water } from "../src/legacy/water.js";
import { research } from "../src/legacy/research.js";
import { recovery } from "../src/legacy/recovery.js";
import { examples, references } from "../src/legacy/recovery-data.js";
import { units } from "../src/legacy/boundary.js";

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
