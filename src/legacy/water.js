import {
  nasaBadge,
  state,
  agronomy,
  smap,
  persist,
  t,
  esc,
  num,
  monthName,
  field,
  area,
  profile,
  setProfile,
  icon,
  button,
  goButton,
  header,
  panel,
  tag,
  truth,
  chips,
  input,
  select,
  sources,
  tabs,
  monthControl,
  toast,
  repaint,
  stateEmpty,
} from "./ui.js";
import { STRATEGIES } from "./engine.js";
import { landscapePanel, initLandscapeObserver, disposeLandscape } from "./landscape3d.js";

// Helper function to get SMAP surface moisture for a field and month
// Returns { sfmc: number, status: string, monthly2024: array } or null if not prepared
export function getSmapSurfaceForMonth(fieldId, monthIndex, year = 2024) {
  const siteData = smap?.sites?.[fieldId];
  if (!siteData) return null;

  const monthStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  const monthly = siteData.monthly || [];
  const monthEntry = monthly.find((m) => m.month === monthStr);

  if (!monthEntry || monthEntry.SFMC_mean === null || monthEntry.SFMC_mean === undefined) {
    return null;
  }

  const sfmc = monthEntry.SFMC_mean;
  
  // Determine status word from SFMC percentile (use PRMC_PRCNTL_mean as proxy if SFMC_PRCNTL_mean not available)
  const prcntl = monthEntry.SFMC_PRCNTL_mean ?? monthEntry.PRMC_PRCNTL_mean;
  let status;
  if (prcntl === null || prcntl === undefined) {
    status = null;
  } else if (prcntl < 30) {
    status = "Dry";
  } else if (prcntl <= 70) {
    status = "Normal";
  } else {
    status = "Wet";
  }

  // Get all 2024 monthly SFMC values for spark line
  const monthly2024 = [];
  for (let i = 0; i < 12; i++) {
    const m = monthly.find((m) => m.month === `2024-${String(i + 1).padStart(2, "0")}`);
    monthly2024.push(m?.SFMC_mean ?? null);
  }

  return { sfmc, status, prcntl, monthly2024 };
}

function smapCard() {
  const siteId = state.fieldId;
  const year = 2024;
  const monthIndex = state.month;
  const monthStr = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

  // Get SMAP data for this site and month
  const siteData = smap?.sites?.[siteId];
  if (!siteData) return "";

  const monthly = siteData.monthly || [];
  const monthEntry = monthly.find((m) => m.month === monthStr);

  if (!monthEntry) return "";

  const sfmc = monthEntry.SFMC_mean;
  const rzmc = monthEntry.RZMC_mean;
  const rzmcPrcntl = monthEntry.RZMC_PRCNTL_mean;

  // Determine status word from RZMC percentile
  function statusWord(prcntl) {
    if (prcntl === null || prcntl === undefined) return t("Unknown", "অজানা");
    if (prcntl < 30) return t("Dry", "শুষ্ক");
    if (prcntl <= 70) return t("Normal", "স্বাভাবিক");
    return t("Wet", "ভিজা");
  }

  const sfmcStatus = statusWord(monthEntry.SFMC_PRCNTL_mean);
  const rzmcStatus = statusWord(rzmcPrcntl);

  // Build the sentence
  const monthLabel = monthName(monthIndex);
  let sentence = "";
  if (rzmcPrcntl !== null && rzmcPrcntl !== undefined) {
    sentence = `${monthLabel} ${year}: ${t("root zone", "মূল অঞ্চল")} ${rzmcStatus === t("Wet", "ভিজা") ? t("wetter than usual", "স্বাভাবিকের চেয়ে ভিজা") : rzmcStatus === t("Dry", "শুষ্ক") ? t("drier than usual", "স্বাভাবিকের চেয়ে শুষ্ক") : t("about usual", "স্বাভাবিক")} (${num(rzmcPrcntl, 0)}th ${t("percentile", "পারসেন্টাইল")}).`;
  } else {
    sentence = `${monthLabel} ${year}: ${t("root zone moisture unknown", "মূল অঞ্চলের আর্দ্রতা অজানা")}.`;
  }

  // Format values
  const formatValue = (val) => {
    if (val === null || val === undefined) return t("No data", "তথ্য নেই");
    return `${num(val, 2)} m³/m³`;
  };

  return panel(
    t("Soil water (NASA SMAP)", "মাটির পানি (NASA SMAP)"),
    `<div class="eyebrow">${t("2024 monthly · regional cell", "২০২৪ সালের মাসিক · আঞ্চলিক কোষ")}</div>
    <div class="water-visual">
      <div class="water-bar" style="height:${Math.max(2, ((sfmc || 0) / 0.5) * 128)}px">
        <strong>${formatValue(sfmc)} ${sfmc !== null ? truth('REMOTE_OBSERVED', { source: 'NASA SMAP', cell: '~9 km' }) : truth('UNKNOWN')}</strong>
        <label>${t("Top 0–5 cm", "উপরের ০–৫ সেমি")}<br>${sfmcStatus}</label>
      </div>
      <div class="water-bar" style="height:${Math.max(2, ((rzmc || 0) / 0.5) * 128)}px">
        <strong>${formatValue(rzmc)} ${rzmc !== null ? truth('REMOTE_OBSERVED', { source: 'NASA SMAP', cell: '~9 km' }) : truth('UNKNOWN')}</strong>
        <label>${t("Root zone 0–100 cm", "শিকড় অঞ্চল ০–১০০ সেমি")}<br>${rzmcStatus}</label>
      </div>
    </div>
    <p>${sentence}</p>
    <p class="note">${truth('REMOTE_OBSERVED', { source: 'NASA SMAP L4', cell: '~9 km', date: '2024 monthly' })} · ${t("model + satellite", "মডেল + স্যাটেলাইট")}</p>
    <p class="note">${t("This is a regional cell, not your field. A soil probe or AWD pipe gives your field's real value.", "এটি একটি আঞ্চলিক কোষ, আপনার জমির নয়। মাটি পরীক্ষা বা AWD পাইপ আপনার জমির সঠিক মান দেয়।")} <a href="#research" class="source-link">${t("Research lab logger", "গবেষণা ল্যাব লগার")}</a></p>`,
    tag(t("Estimated", "স্যাটেলাইট অনুমান"), "") + nasaBadge("smap"),
  );
}

function water() {
  const id = state.tabs.water;
  return (
    header(
      t("Land & water  /  06", "জমি ও পানি  /  ০৬"),
      t("Water & resilience", "পানি ও সহনশীলতা"),
      t(
        "Use the regional record to test an irrigation plan, read local soil evidence, or prepare for a disrupted season.",
        "সেচের পরিকল্পনা তুলনা করুন, এলাকার মাটির তথ্য পড়ুন এবং দুর্যোগের পরের মৌসুম ভাবুন।",
      ),
    ) +
    chips() +
    landscapePanel() +
    tabs("water", [
      ["budget", t("Water balance", "পানির হিসাব")],
      ["soil", t("AEZ soil reference", "AEZ মাটির তথ্য")],
      ["hazard", t("Disaster recovery", "দুর্যোগের পর করণীয়")],
    ]) +
    (id === "soil" ? soil() : id === "hazard" ? hazard() : budget())
  );
}
function budgetNumbers() {
  const f = field();
  const monthly = f?.monthly || [];
  const w = state.water,
    seq =
      STRATEGIES.find((r) => r.id === (w.rotation || "baseline")) ||
      STRATEGIES[0];
  const coeff = {
    aman: +w.kc,
    boro: +w.kc,
    mustard: 0.85,
    potato: 0.95,
    pulse: 0.85,
    fallow: 0,
  };
  const gaps = monthly.length
    ? monthly.map((m, i) =>
        Math.max(0, (m?.et0 || 0) * coeff[seq.months[i]] - ((m?.rainGpm || 0) * w.rainUse) / 100),
      )
    : [];
  const net = gaps.reduce((a, b) => a + b, 0) + Number(w.extra || 0),
    pumped =
      (((net * area() * 10) / Math.max(0.01, w.efficiency / 100)) * w.share) /
      100;
  const haveRecharge =
    w.recharge !== "" && w.aquiferArea !== "" && Number(w.aquiferArea) > 0;
  const recharge = haveRecharge
    ? (w.recharge * w.aquiferArea * 10 * w.allocated) / 100
    : null;
  return {
    seq,
    gaps,
    net,
    pumped,
    recharge,
    balance: haveRecharge ? recharge - pumped - w.other : null,
    coeff,
  };
}
function budgetResult() {
  const f = field();
  if (!f?.monthly || !f.monthly.length) {
    return stateEmpty(
      t("Weather data not loaded for this field", "এই জমির আবহাওয়ার তথ্য লোড করা নেই"),
    );
  }
  const { seq, gaps, net, pumped, recharge, balance, coeff } = budgetNumbers(),
    m = f.monthly[state.month] || {},
    w = state.water;
  const maximum = Math.max(pumped, recharge || 0, 1);
  return `<div class="eyebrow">${t("2024 replay · annual scenario", "২০২৪ সালের তথ্য · বার্ষিক দৃশ্য")}</div><div class="water-visual"><div class="water-bar pump" style="height:${Math.max(2, (pumped / maximum) * 128)}px"><strong>${num(pumped)} m³ ${truth('SCENARIO', { source: 'Water budget model' })}</strong><label>${t("Pumped groundwater", "উত্তোলিত ভূগর্ভস্থ পানি")}</label></div>${recharge === null ? "" : `<div class="water-bar" style="height:${Math.max(2, (recharge / maximum) * 128)}px"><strong>${num(recharge)} m³ ${truth('SCENARIO', { source: 'User input' })}</strong><label>${t("Allocated recharge", "বরাদ্দ পুনর্ভরণ")}</label></div>`}</div>
 <p class="notice ${balance !== null && balance < 0 ? "amber" : ""}">${balance === null ? t("Enter independently estimated recharge and an accounting area to unlock the balance.", "ভারসাম্য দেখতে স্বতন্ত্রভাবে পাওয়া পুনর্ভরণের হার ও সংশ্লিষ্ট এলাকা দিন।") : `${t("Allocated recharge less all entered withdrawals", "বরাদ্দ পুনর্ভরণ থেকে পানি তোলা বাদ")} <b>${num(balance)} m³/${t("year", "বছর")} ${truth('SCENARIO')}</b>. ${num(w.years)} ${t("identical replay years", "একই ধরনের বছরের মোট")} <b>${num(balance * w.years)} m³ ${truth('SCENARIO')}</b>.`}</p>
 <dl class="field-meta"><div><dt>${t("Annual irrigation assumption", "বার্ষিক নিট সেচের অনুমান")}</dt><dd>${num(net, 1)} mm ${truth('SCENARIO')}</dd></div><div><dt>${monthName()} · ${t("crop water use", "ফসলের পানির চাহিদা")}</dt><dd>${num((m.et0 || 0) * coeff[seq.months[state.month]], 1)} mm ${truth('MODELED', { source: 'FAO-56 ETo' })}</dd></div><div><dt>${monthName()} · ETo</dt><dd>${num(m.et0, 1)} mm ${truth('REMOTE_OBSERVED', { source: 'NASA POWER' })}</dd></div><div><dt>${monthName()} · ${t("rain (IMERG)", "বৃষ্টি (IMERG)")}</dt><dd>${num(m.rainGpm, 1)} mm ${truth('REMOTE_OBSERVED', { source: 'NASA IMERG' })}</dd></div></dl>
 <p class="note">${t("The annual estimate adds positive monthly crop demand gaps and your extra losses. Groundwater volume depends on pumping share and irrigation efficiency. Repeated-year balances use the same weather and assumptions each year. Water-table depth is unavailable without aquifer measurements.", "বছরের প্রতিটি মাসে ফসলের চাহিদা থেকে কার্যকর বৃষ্টি বাদ দিয়ে ধনাত্মক ঘাটতি ও অতিরিক্ত ক্ষতি যোগ হয়। উত্তোলনে সেচের দক্ষতা ও উৎসের অংশ ধরা হয়। প্রতি বছর একই আবহাওয়া ধরে দীর্ঘমেয়াদি হিসাব। ভূগর্ভস্থ পানির গভীরতা জানতে সরাসরি মাপ দরকার।")}</p>`;
}
function budget() {
  const w = state.water;
  return `<div class="grid-equal">${panel(
    t("Set the water scenario", "পানির অনুমান ঠিক করুন"),
    `<div class="notice">${t("The starting values are editable planning assumptions. Rain and reference evaporation come from the selected location’s 2024 record.", "শুরুর মানগুলো বদলানো যায়। বৃষ্টি ও রেফারেন্স বাষ্পীভবন নির্বাচিত স্থানের ২০২৪ সালের তথ্য।")}</div><form id="water-controls" class="form-grid section-space">
 ${select(
   t("Rotation", "ফসলচক্র"),
   "rotation",
   STRATEGIES.map((r) => [r.id, t(r.crops.join(" → "), r.bnCrops.join(" → "))]),
   w.rotation || "baseline",
 )}
 ${input(t("Rice crop coefficient (Kc)", "ধানের সহগ (Kc)"), "kc", w.kc, 'min="0.1" max="2" step=".01"')}${input(t("Effective share of rain (%)", "কার্যকর বৃষ্টির অংশ (%)"), "rainUse", w.rainUse, 'min="0" max="100"')}${input(t("Extra annual loss, e.g. seepage (mm)", "বার্ষিক অতিরিক্ত ক্ষতি (মিমি)"), "extra", w.extra, 'min="0" max="5000" step="any"')}${input(t("Irrigation efficiency (%)", "সেচের দক্ষতা (%)"), "efficiency", w.efficiency, 'min="1" max="100"')}${input(t("Pumped groundwater share (%)", "ভূগর্ভস্থ পানির অংশ (%)"), "share", w.share, 'min="0" max="100"')}
 <div class="form-field wide"><b>${t("Aquifer accounting assumptions", "ভূগর্ভস্থ পানির হিসাবের অনুমান")}</b><span class="form-help">${t("Leave unknown recharge or area blank. Rainfall alone cannot supply these values.", "পুনর্ভরণ বা এলাকা জানা না থাকলে ফাঁকা রাখুন। শুধু বৃষ্টি থেকে এগুলো পাওয়া যায় না।")}</span></div>
 ${input(t("Recharge (mm/year)", "পুনর্ভরণ (মিমি/বছর)"), "recharge", w.recharge, 'min="0" max="5000" step="any" placeholder="—"')}${input(t("Aquifer accounting area (ha)", "হিসাবের এলাকা (হেক্টর)"), "aquiferArea", w.aquiferArea, 'min=".001" max="100000000" step="any" placeholder="—"')}${input(t("Farm allocation of recharge (%)", "খামারের বরাদ্দ (%)"), "allocated", w.allocated, 'min="0" max="100"')}${input(t("Other allocated withdrawals (m³/year)", "অন্যান্য উত্তোলন (ঘনমিটার/বছর)"), "other", w.other, 'min="0" step="any"')}${input(t("Replay years", "পুনরাবৃত্ত বছর"), "years", w.years, 'min="1" max="30"')}</form>`,
  )}
 ${panel(t("Groundwater scenario", "ভূগর্ভস্থ পানির দৃশ্য"), `<div id="water-result">${budgetResult()}</div><div class="spacer"></div>${monthControl()}<p class="note">${sources(["fao56", "power", "gpm"])}</p>`, tag(t("Scenario", "অনুমান"), "amber") + nasaBadge(["imerg", "eto"]))}
 ${smapCard()}</div>`;
}
function soil() {
  const a = agronomy.aez,
    logs = state.records.filter(
      (r) => r.fieldId === state.fieldId && r.kind === "soil",
    );
  return `<div class="grid-equal">${panel(
    t(a.label, a.bn),
    `<p class="notice">${t("AEZ-3 is a regional reference. Rangpur includes several zones. Confirm the field’s AEZ and land type with the local office.", "AEZ-৩ আঞ্চলিক তথ্য। রংপুরে একাধিক অঞ্চল আছে। এই জমির AEZ ও ভূমির ধরন স্থানীয় অফিসে নিশ্চিত করুন।")}</p>
 <div class="table-wrap"><table class="data-table"><thead><tr><th>${t("Land class", "ভূমি")}</th><th>pH</th><th>${t("Organic matter", "জৈব পদার্থ")}</th></tr></thead><tbody>${a.soilMatrix.map((r, i) => `<tr><td>${t(r.landType, i ? "মাঝারি উঁচু" : "উঁচু জমি")}</td><td>${r.pH.join("–")}</td><td>${t(r.organicMatterClass, "কম থেকে মাঝারি")}</td></tr>`).join("")}</tbody></table></div>
 <div class="spacer"></div><div class="eyebrow">${t("Nutrient classes · both land types", "দুই ভূমিশ্রেণির পুষ্টিমান")}</div><p class="note">N, S, Zn, B · ${t("very low to low", "অতি কম থেকে কম")}<br>P, K, Ca, Mg · ${t("low to medium", "কম থেকে মাঝারি")}</p><p class="note">${sources(a.sourceIds)} · ${t("printed page 21", "মুদ্রিত পৃষ্ঠা ২১")}</p>`,
    tag("AEZ–03", "green"),
  )}
 ${panel(t("Local soil evidence", "এলাকার মাটির প্রমাণ"), `<div class="eyebrow">Mithapukur · Pirganj / 2018–2020</div><h3>${t("Published trial sites", "গবেষণার জমি")}</h3><p class="note">${t("Trial sites reported silt loam, pH 4.6–6.5 and organic carbon of 0.94%. These describe the study locations. A new sample provides evidence for this field.", "গবেষণার জমিতে পলি দোআঁশ, pH ৪.৬–৬.৫ এবং জৈব কার্বন ০.৯৪% পাওয়া যায়। নিজের জমির জন্য আলাদা নমুনা প্রয়োজন।")}</p>${sources(["hossain2022"])}<div class="spacer"></div><h3>${t("This field’s tests", "এই জমির পরীক্ষা")}</h3>${logs.length ? logs.map((r) => `<p class="note">${esc(r.date)} · ${esc(r.labName)} · pH ${num(r.soilPH, 2)}</p>`).join("") : `<p class="note">${t("No local test has been recorded yet.", "নিজস্ব পরীক্ষার রেকর্ড নেই।")}</p>`}<div class="spacer"></div>${button(t("Log a soil test", "মাটি পরীক্ষা লিখুন"), "new-soil", "", "add")}`)}</div>`;
}
function hazard() {
  return panel(
    t("A practical recovery plan", "পুনরুদ্ধারের ব্যবহারিক পরিকল্পনা"),
    `<p>${t("Choose drought, flood or fire. Get actions for each stage, check field readiness, then compare planting windows and restoration options.", "খরা, বন্যা বা আগুন বাছুন। প্রতিটি ধাপের করণীয় দেখুন, জমি যাচাই করুন, তারপর বপনের সময় ও পুনরুদ্ধারের সুযোগ তুলনা করুন।")}</p>${goButton(t("Open disaster recovery", "দুর্যোগের পর করণীয় খুলুন"), "recovery", "primary", "recovery")}`,
  );
}
function waterInput(el) {
  if (!el.closest("#water-controls") || !el.validity.valid) return;
  const optional = ["recharge", "aquiferArea"];
  if (el.value === "" && !optional.includes(el.name)) return;
  state.water[el.name] =
    el.name === "rotation" || el.value === "" ? el.value : +el.value;
  persist();
  document.querySelector("#water-result").innerHTML = budgetResult();
}
function waterAction(action, value) {
  if (action === "hazard") {
    state.hazard = value;
    persist();
    repaint();
  }
}
function waterSubmit(form) {
  if (form.id !== "flood-form") return false;
  setProfile({ floodDays: Number(new FormData(form).get("delay")) });
  location.hash = "rotations";
  toast(
    t(
      "Flood delay applied to rotation checks",
      "বন্যার দেরি ফসলচক্রে প্রয়োগ হয়েছে",
    ),
  );
  return true;
}

export { water, waterAction, waterInput, waterSubmit, initLandscapeObserver, disposeLandscape };
