import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  referenceEt0,
  summarize,
  qa,
  processPowerResponses,
  buildPowerUrl,
  getCachedPower,
  setCachedPower,
} from "../src/legacy/powerlive.js";
import {
  state,
  loadData,
  allFields,
  field,
  fieldName,
  polygon,
  area,
} from "../src/legacy/ui.js";
import {
  searchResults,
  fieldAction,
  home,
  seasonView,
  BD_BBOX,
  loadMapData,
} from "../src/legacy/fields.js";
import { rotations } from "../src/legacy/rotations.js";
import { water } from "../src/legacy/water.js";

// Mock localStorage for node environment
const storageMock = (() => {
  let store = {};
  return {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { store = {}; },
  };
})();
globalThis.localStorage = storageMock;

test("FAO-56 ETo and monthly summary parity with Python fixture", async () => {
  const sample = JSON.parse(
    await readFile(new URL("./fixtures/power-sample.json", import.meta.url), "utf8"),
  );

  const lat = sample.lat;
  const lon = sample.lon;
  const elevation = sample.elevation;

  const processed = processPowerResponses(
    sample.meteorology,
    sample.gpm,
    lat,
    lon,
    elevation,
  );

  // 1. Verify daily referenceEt0 exact values
  assert.equal(processed.daily.length, sample.expectedDaily.length);
  for (let i = 0; i < processed.daily.length; i++) {
    const act = processed.daily[i];
    const exp = sample.expectedDaily[i];
    assert.equal(act.date, exp.date);
    assert.equal(act.tmean, exp.tmean);
    assert.equal(act.rainGpm, exp.rainGpm);
    assert.equal(act.et0, exp.et0, `Daily ETo parity mismatch on ${act.date}`);
  }

  // 2. Verify monthly summary numerical parity
  assert.equal(processed.monthly.length, sample.expectedMonthly.length);
  for (let m = 0; m < processed.monthly.length; m++) {
    const actM = processed.monthly[m];
    const expM = sample.expectedMonthly[m];
    assert.equal(actM.month, expM.month);
    assert.equal(actM.days, expM.days);
    assert.equal(actM.tmean, expM.tmean);
    assert.equal(actM.tmax, expM.tmax);
    assert.equal(actM.tmin, expM.tmin);
    assert.equal(actM.rainGpm, expM.rainGpm);
    assert.equal(actM.et0, expM.et0, `Monthly ETo parity mismatch in ${actM.month}`);
    assert.equal(actM.wetness, expM.wetness);
  }

  // 3. Verify QA statistics
  assert.equal(processed.qa.pairedDays, 28);
  assert.equal(processed.qa.differenceDirection, "POWER minus GPM");
  assert.equal(typeof processed.qa.maeMm, "number");
  assert.equal(typeof processed.qa.rmseMm, "number");
});

test("Village and coordinate search finds locations in Bangladesh", async () => {
  globalThis.document = { baseURI: new URL("../public/", import.meta.url).href };
  globalThis.fetch = async (url) => {
    const p = new URL(url, globalThis.document.baseURI);
    return {
      ok: true,
      json: async () => JSON.parse(await readFile(p, "utf8")),
    };
  };
  await loadData();
  await loadMapData();

  // Village search in English (Alampur)
  const resEn = searchResults("Alampur");
  assert.ok(resEn.includes("Alampur"), "Finds Alampur by English name");
  assert.ok(resEn.includes("start-custom-field"), "Provides 'Start a field here' button");

  // Village search in Bengali (আলমপুর)
  const resBn = searchResults("আলমপুর");
  assert.ok(resBn.includes("Alampur") || resBn.includes("আলমপুর"), "Finds Alampur by Bengali name");
  assert.ok(resBn.includes("start-custom-field"), "Provides 'Start a field here' button for Bengali query");

  // Coordinates inside Bangladesh bbox
  const resCoord = searchResults("25.61, 89.24");
  assert.ok(resCoord.includes("start-custom-field"), "Coordinates in BD trigger 'Start a field here'");
  assert.ok(resCoord.includes("25.61,89.24"), "Coordinate value passed correctly");

  // Coordinates outside Bangladesh bbox
  const resCoordOut = searchResults("10.0, 50.0");
  assert.ok(!resCoordOut.includes("start-custom-field"), "Coordinates outside BD bbox do not trigger custom field");

  // Existing prepared sites still found
  const resPrep = searchResults("Mithapukur");
  assert.ok(resPrep.includes("mithapukur"), "Prepared site Mithapukur found");
});

test("Custom field creation, ~20 decimals square boundary, switcher listing, and deletion", async () => {
  state.customFields = [];
  state.boundaries = {};
  state.fieldId = "mithapukur";

  // Create custom field via action
  fieldAction("start-custom-field", "25.75,89.25,Test Village,টেস্ট গ্রাম");
  
  assert.equal(state.customFields.length, 1);
  const cf = state.customFields[0];
  assert.equal(cf.name, "Test Village");
  assert.equal(cf.name_bn, "টেস্ট গ্রাম");
  assert.equal(cf.lat, 25.75);
  assert.equal(cf.lon, 89.25);
  assert.equal(cf.custom, true);
  assert.equal(state.fieldId, cf.id);

  // Field helper resolves custom field
  const currentF = field();
  assert.equal(currentF.id, cf.id);
  assert.equal(fieldName(currentF), "Test Village");

  // Area of default polygon is ~20 decimals (20 decimals = ~0.0809 ha, 20 shotok)
  const ha = area();
  const shotok = ha * 247.105381;
  assert.ok(shotok >= 19.5 && shotok <= 20.5, `Custom boundary is ~20 decimals (actual: ${shotok.toFixed(2)})`);

  // Switcher chips list custom field with delete action
  const homeHtml = home();
  assert.ok(homeHtml.includes("data-action=\"delete-field\""), "Delete button shown on chip for custom field");
  assert.ok(homeHtml.includes("Test Village"), "Custom field name displayed on chip");

  // Delete custom field
  fieldAction("delete-field", cf.id);
  assert.equal(state.customFields.length, 0);
  assert.equal(state.fieldId, "mithapukur", "Resets to prepared field upon deletion");
});

test("Custom field never reuses prepared site monthly data and handles offline without cache", async () => {
  storageMock.clear();
  const customId = "custom-test-unique-999";
  state.customFields = [
    {
      id: customId,
      name: "Remote Farm",
      name_bn: "রিমোট খামার",
      lat: 25.80,
      lon: 89.30,
      custom: true,
      imagery: [],
    },
  ];
  state.fieldId = customId;

  const f = field();
  assert.equal(f.id, customId);
  // Must NOT have prepared site's monthly data!
  assert.equal(f.monthly, null, "Custom field never inherits or reuses prepared site monthly data");

  // Views must not crash when monthly data is null
  const homeView = home();
  assert.ok(homeView.includes("Remote Farm"), "Home renders for custom field without crash");
  assert.ok(
    homeView.includes("Needs internet connection to fetch NASA weather data") ||
      homeView.includes("loading") ||
      homeView.includes("NASA"),
    "Empty/offline weather state shown for custom field",
  );

  const rotView = rotations();
  assert.ok(
    rotView.includes("Weather data not loaded for this field") || rotView.includes("ফসলচক্র"),
    "Rotations renders safely without crashing on null monthly",
  );

  const waterView = water();
  assert.ok(
    waterView.includes("Weather data not loaded for this field") || waterView.includes("Water balance"),
    "Water view renders safely without crashing on null monthly",
  );

  const pastSeasons = seasonView();
  assert.ok(
    pastSeasons.includes("Historical archive is not available for this custom field"),
    "Past seasons shows empty state for custom field",
  );

  // Now populate localStorage with cached NASA POWER data for this custom field
  const sampleFixture = JSON.parse(
    await readFile(new URL("./fixtures/power-sample.json", import.meta.url), "utf8"),
  );
  const customWeather = {
    monthly: sampleFixture.expectedMonthly,
    daily: sampleFixture.expectedDaily,
    qa: sampleFixture.expectedQa,
    retrievedAt: "2026-11-09T06:00:00Z",
    source: "NASA POWER (MERRA-2) & NASA GPM IMERG via POWER API",
  };
  setCachedPower(customId, customWeather);

  // Re-fetch field from allFields()
  const fCached = allFields().find((x) => x.id === customId);
  assert.ok(fCached.monthly && fCached.monthly.length > 0, "Cached weather attached to custom field");
  assert.equal(fCached.monthly[0].month, "2024-01");

  // Truth badge check in home view with cached data
  const homeCachedView = home();
  assert.ok(homeCachedView.includes("fetched 2026-11-09"), "Truth labels show 'fetched <date>' for custom field");
});
