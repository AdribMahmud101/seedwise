import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  defaultAssessment,
  validDate,
  buildRecovery,
} from "../src/legacy/recovery-engine.js";
import { crops, examples, guides } from "../src/legacy/recovery-data.js";
const run = (hazard, patch = {}) =>
  buildRecovery(
    hazard,
    { ...defaultAssessment("2026-11-04"), ...examples[hazard], ...patch },
    crops,
  );
test("active hazards, unknown access and missing readiness never release a planting option", () => {
  for (const h of ["flood", "drought", "fire"]) {
    for (const phase of ["prepare", "active", "inspect"])
      assert.equal(run(h, { phase }).options.length, 0);
    for (const patch of [
      { ground: "unknown" },
      { ground: "dry" },
      { ground: "wet" },
      { standing: "recovering" },
      { standing: "unknown" },
      { water: "none" },
    ])
      assert.ok(run(h, { ...patch, exposure: "reviewed" }).reasons.length);
  }
  for (const exposure of ["suspected", "unknown"])
    for (const h of ["fire", "flood"])
      assert.equal(run(h, { exposure }).options.length, 0);
  assert.ok(
    run("fire", { exposure: "reviewed" }).options.find(
      (c) => c.id === "mustard",
    ).available,
  );
});
test("a February drought recovery schedules mung before the next crop with a full maturity allowance", () => {
  const c = run("drought").options.find((c) => c.id === "mung");
  assert.equal(c.first, "2026-02-25");
  assert.equal(c.last, "2026-03-07");
  assert.deepEqual(c.harvest, ["2026-04-21", "2026-04-24"]);
  assert.equal(c.status, "open");
  assert.ok(
    !run("drought", { nextDate: "2026-04-10" }).options.some(
      (c) => c.available,
    ),
  );
});
test("post-flood Aman requires pre-raised seedlings and does not invent a harvest duration", () => {
  const c = run("flood").options.find((c) => c.id === "flood-late");
  assert.equal(c.status, "open");
  assert.equal(c.last, "2026-09-15");
  assert.equal(c.harvest, null);
  assert.equal(
    run("flood", { seedlings: "unknown" }).options.find(
      (c) => c.id === "flood-late",
    ).status,
    "seedlings",
  );
  assert.equal(
    run("flood", { nextDate: "2026-11-20" }).options.find(
      (c) => c.id === "flood-late",
    ).status,
    "duration",
  );
  assert.ok(
    !run("flood", { delay: 14 }).options.find((c) => c.id === "flood-late")
      .available,
  );
});
test("missed mustard window rolls to next year without advising immediate off-season sowing", () => {
  const c = run("fire", {
    exposure: "reviewed",
    date: "2026-11-16",
    nextDate: "",
  }).options.find((c) => c.id === "mustard");
  assert.equal(c.first, "2027-10-15");
  assert.equal(c.status, "later");
  assert.equal(c.available, false);
  const late = run("fire", {
    exposure: "reviewed",
    delay: 12,
    nextDate: "",
  }).options.find((c) => c.id === "mustard");
  assert.equal(late.first, "2027-10-15");
});
test("dates, missing values and fractional delays are validated before calendar arithmetic", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  for (const patch of [
    { date: "" },
    { date: "bad" },
    { delay: "" },
    { delay: -1 },
    { delay: 0.5 },
    { delay: 181 },
    { nextDate: "2026-02-01" },
  ])
    assert.deepEqual(run("drought", patch).reasons, ["dates"]);
});
test("every recovery source resolves to an included evidence record and planting links have real types", async () => {
  const a = JSON.parse(
    await readFile(new URL("../public/data/agronomy.json", import.meta.url)),
  );
  for (const id of [
    ...Object.values(guides).flatMap((g) => g.sources),
    ...crops.flatMap((c) => c.sources),
  ])
    assert.ok(
      a.sources.some((s) => s.id === id),
      id,
    );
  for (const c of crops)
    assert.ok(["mustard", "mungbean", "rice"].includes(c.plant));
});
