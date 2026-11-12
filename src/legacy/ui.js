import { areaHa, mean } from "./engine.js";
import { getCachedPower } from "./powerlive.js";
import { confirmField, fieldSnapshot, getPlan, subscribe } from "./journey.js";

const storageKey = "ropon-radar.workspace.3";
const defaults = {
  lang: "en",
  fieldId: "mithapukur",
  customFields: [],
  month: 10,
  weights: { water: 4, soil: 3, cost: 2, risk: 3 },
  profiles: {},
  boundaries: {},
  netInputs: {},
  records: [],
  plans: [],
  planner: { crop: "rice", usable: 88, angle: 0.62, row: 20, spacing: 20 },
  clinic: { crop: "aman", symptoms: [] },
  tabs: { clinic: "symptoms", water: "budget", research: "qa" },
  water: {
    kc: 1.05,
    rainUse: 65,
    extra: 0,
    efficiency: 65,
    share: 80,
    recharge: "",
    aquiferArea: "",
    allocated: 100,
    other: 0,
    years: 5,
  },
  hazard: "flood",
  recoveryDrafts: {},
  recoverySaves: {},
};
let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
} catch {}
delete saved.month; // month is view state: always open on the default month, never a stale (possibly fallow) one
const state = { ...structuredClone(defaults), ...saved };
for (const key of ["weights", "planner", "clinic", "tabs", "water"])
  state[key] = { ...defaults[key], ...saved[key] };
let earth, agronomy, archive, smap, hlsField;
let outlook = null, floodFields = null, graceGroundwater = null, s1Water = null;
let lastSeasonField = null;
async function loadPack(path) {
  try {
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}
async function loadData() {
  const responses = await Promise.all(
    ["data/earth-data.json", "data/agronomy.json", "data/history.json", "data/smap.json", "data/hls-field.json"].map(
      (path) => fetch(new URL(path, document.baseURI)),
    ),
  );
  if (responses.some((r) => !r.ok))
    throw new Error("The prepared data could not be loaded.");
  [earth, agronomy, archive, smap, hlsField] = await Promise.all(
    responses.map((r) => r.json()),
  );
  // Optional ML packs: outlook + flood cards hide when these are missing or offline.
  [outlook, floodFields, graceGroundwater, s1Water] = await Promise.all([
    loadPack("data/outlook.json"),
    loadPack("data/flood-fields.json"),
    loadPack("data/grace-groundwater.json"),
    loadPack("data/s1-water.json"),
  ]);
  if (!allFields().some((f) => f.id === state.fieldId))
    state.fieldId = "mithapukur";
  applySeasonPlan(getPlan());
  try {
    syncSeasonField();
  } catch (error) {
    // Unavailable season storage must not block prepared data or workspace startup.
    console.warn("Season plan could not be saved", error);
  }
}
function syncSeasonField() {
  if (!getPlan()?.field) return;
  const selected = field();
  if (!selected) return;
  const snapshot = fieldSnapshot(selected, polygon(), profile(), state.netInputs[selected.id]);
  const serialized = JSON.stringify(snapshot);
  if (getPlan()?.field && serialized === lastSeasonField) return;
  confirmField(snapshot);
  lastSeasonField = serialized;
}
function applySeasonPlan(plan) {
  const snapshot = plan?.field;
  if (!snapshot || !earth) return;
  if (!allFields().some(selected => selected.id === snapshot.id)) {
    if (!snapshot.outline) return;
    state.customFields.push({ id: snapshot.id, name: snapshot.name, custom: true, imagery: [],
      lat: mean(snapshot.outline.map(point => point[0])), lon: mean(snapshot.outline.map(point => point[1])) });
  }
  state.fieldId = snapshot.id;
  state.profiles[snapshot.id] = structuredClone(snapshot.constraints);
  if (snapshot.netInputs) {
    if (snapshot.netEdited) state.netInputs[snapshot.id] = structuredClone(snapshot.netInputs);
    else delete state.netInputs[snapshot.id];
  }
  if (snapshot.outline) {
    if (JSON.stringify(snapshot.outline) === JSON.stringify(basePolygon(field()))) delete state.boundaries[snapshot.id];
    else state.boundaries[snapshot.id] = structuredClone(snapshot.outline);
  }
  if (plan.rotation) state.weights = { ...plan.rotation.priorities };
  lastSeasonField = JSON.stringify(fieldSnapshot(field(), polygon(), profile(), state.netInputs[snapshot.id]));
}
subscribe(applySeasonPlan);
function persist() {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ ...state, month: undefined }));
    syncSeasonField();
    return true;
  } catch {
    toast(
      t(
        "Storage is full. Export your entries before closing.",
        "সংরক্ষণের জায়গা নেই। বন্ধ করার আগে রেকর্ড রপ্তানি করুন।",
      ),
    );
    return false;
  }
}
function t(english, bangla) {
  return state.lang === "bn" && bangla ? bangla : english;
}
const bnDigits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
// Page numbers follow the nav: My field 01, Rotation studio 02, Planting planner 03, My plans 04, Past seasons 05, …
function deskNo(base) {
  const n = base + 1;
  return [`0${n}`, `০${bnDigits[n]}`];
}
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

// Facts and links: public/data/earth-data.json, smap.json and spec/13,18 source registers.
const nasaSources = {
  hls: {
    label: ['NASA HLS', 'নাসা HLS'],
    name: ['NASA HLS (Harmonized Landsat Sentinel-2)', 'নাসা HLS (সমন্বিত Landsat Sentinel-2)'],
    line: ["NASA's 30 m satellite record checks this field's average greenness/moisture.", 'নাসার ৩০ মি স্যাটেলাইট তথ্য এই মাঠের গড় সবুজভাব/আর্দ্রতা যাচাই করে।'],
    res: ['30 m', '৩০ মি'],
    url: 'https://www.earthdata.nasa.gov/data/projects/hls',
  },
  sentinel2: {
    agency: 'ESA',
    label: ['ESA · Space Apps partner', 'ESA · Space Apps সহযোগী'],
    name: ['ESA Copernicus Sentinel-2', 'ESA কোপার্নিকাস Sentinel-2'],
    line: ['10–20 m detail inside the field from ESA, a NASA Space Apps partner agency.', 'মাঠের ভেতরের ১০–২০ মি বিস্তারিত তথ্য ESA থেকে, নাসা Space Apps-এর সহযোগী সংস্থা।'],
    res: ['10–20 m', '১০–২০ মি'],
    url: 'https://sentiwiki.copernicus.eu/web/s2-mission',
  },
  power: {
    label: ['NASA POWER', 'নাসা POWER'],
    name: ['NASA POWER / MERRA-2', 'নাসা POWER / MERRA-2'],
    line: ['Regional weather helps estimate heat and water stress here.', 'এলাকার আবহাওয়া এখানে তাপ ও পানির চাপ বুঝতে সাহায্য করে।'],
    res: ['~50 km regional grid', '~৫০ কিমি আঞ্চলিক গ্রিড'],
    url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
  },
  wetness: {
    label: ['NASA POWER', 'নাসা POWER'],
    name: ['NASA POWER soil wetness', 'নাসা POWER মাটির আর্দ্রতা'],
    line: ['A regional 0–1 index estimates how wet the soil is here.', 'আঞ্চলিক ০–১ সূচক এখানে মাটি কতটা ভেজা তার অনুমান দেয়।'],
    res: ['~50 km regional grid', '~৫০ কিমি আঞ্চলিক গ্রিড'],
    url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
  },
  eto: {
    label: ['NASA POWER', 'নাসা POWER'],
    name: ['FAO-56 ETo from NASA POWER', 'নাসা POWER থেকে FAO-56 ETo'],
    line: ['Weather-based evaporation helps estimate crop water needs here.', 'আবহাওয়া থেকে হিসাব করা বাষ্পীভবন এখানে ফসলের পানির চাহিদা বুঝতে সাহায্য করে।'],
    res: ['~50 km weather inputs', '~৫০ কিমি আবহাওয়ার তথ্য'],
    url: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
  },
  imerg: {
    label: ['NASA IMERG', 'নাসা IMERG'],
    name: ['NASA GPM IMERG', 'নাসা GPM IMERG'],
    line: ['Satellite rainfall estimates how much water rain gives crops here.', 'স্যাটেলাইটের বৃষ্টির হিসাব এখানে ফসল বৃষ্টি থেকে কত পানি পায় তা বোঝায়।'],
    res: ['0.1° (~10 km)', '০.১° (~১০ কিমি)'],
    url: 'https://gpm.nasa.gov/data/imerg',
  },
  smap: {
    label: ['NASA SMAP', 'নাসা SMAP'],
    name: ['NASA SMAP L4 soil moisture', 'নাসা SMAP L4 মাটির আর্দ্রতা'],
    line: ['Satellite and model data estimate water in the surface and root zone here.', 'স্যাটেলাইট ও মডেল এখানে মাটির উপরিভাগ ও শিকড় স্তরের পানির অনুমান দেয়।'],
    res: ['~9 km regional grid', '~৯ কিমি আঞ্চলিক গ্রিড'],
    url: 'https://nsidc.org/data/spl4smgp/versions/8',
  },
  grace: {
    label: ['NASA GRACE-FO', 'নাসা GRACE-FO'],
    name: ['NASA JPL GRACE / GRACE-FO mascons RL06.3Mv04', 'নাসা JPL GRACE / GRACE-FO mascons RL06.3Mv04'],
    line: ["Satellites weigh the region's total water, including groundwater, against the 2004–2009 average.", 'স্যাটেলাইট এলাকার ভূগর্ভস্থ পানিসহ মোট পানির ওজন ২০০৪–২০০৯ সালের গড়ের সঙ্গে তুলনা করে।'],
    res: ['~300 km regional estimate (0.5° sampling)', '~৩০০ কিমি আঞ্চলিক অনুমান (০.৫° গ্রিড)'],
    url: 'https://grace.jpl.nasa.gov/data/get-data/jpl_global_mascons/',
  },
  nasadem: {
    label: ['NASA', 'নাসা'],
    name: ['NASADEM elevation', 'NASADEM ভূমির উচ্চতা'],
    line: ['Terrain height helps estimate low ground and where water may collect here.', 'ভূমির উচ্চতা এখানে নিচু জায়গা ও কোথায় পানি জমতে পারে তা বুঝতে সাহায্য করে।'],
    res: ['30 m', '৩০ মি'],
    url: 'https://planetarycomputer.microsoft.com/dataset/nasadem',
    period: ['2000 terrain survey', '২০০০ ভূমি জরিপ'],
  },
  landsat: {
    label: ['NASA Landsat', 'নাসা Landsat'],
    name: ['NASA/USGS Landsat Collection 2 Level 2', 'নাসা/USGS Landsat Collection 2 Level 2'],
    line: ['Dated images show crop greenness here where clouds allow a clear view.', 'তারিখসহ ছবিতে মেঘমুক্ত অংশে এখানকার ফসলের সবুজভাব দেখা যায়।'],
    res: ['30 m', '৩০ মি'],
    url: 'https://planetarycomputer.microsoft.com/dataset/landsat-c2-l2',
  },
  prithvi: {
    label: ['NASA–IBM Prithvi', 'নাসা–IBM Prithvi'],
    name: ['NASA–IBM Prithvi-EO-2.0 water model', 'নাসা–IBM Prithvi-EO-2.0 পানির মডেল'],
    line: ['An experimental AI model maps surface water in NASA satellite scenes.', 'একটি পরীক্ষামূলক AI মডেল নাসার স্যাটেলাইট ছবিতে ভূপৃষ্ঠের পানি চিহ্নিত করে।'],
    res: ['30 m HLS scenes', '৩০ মি HLS ছবি'],
    url: 'https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M-TL',
  },
};
let nasaBadgeId = 0;
function nasaBadge(keys, period = '2024') {
  const entries = [...new Set(Array.isArray(keys) ? keys : [keys])]
    .filter(key => Object.hasOwn(nasaSources, key)).map(key => nasaSources[key]);
  if (!entries.length) return '';
  // Keep partner provenance separate even if a caller requests several agencies.
  if (entries.length > 1 && entries.some(entry => entry.agency === 'ESA')) {
    return nasaBadge(keys.filter(key => nasaSources[key]?.agency !== 'ESA'), period) + nasaBadge('sentinel2', period);
  }
  const id = `nasa-source-${++nasaBadgeId}`;
  const label = entries.length === 1 ? t(...entries[0].label) : t('NASA', 'নাসা');
  const partner = entries[0].agency === 'ESA';
  const ariaLabel = partner ? t('ESA data source', 'ESA তথ্যসূত্র') : t('NASA data sources', 'নাসার তথ্যসূত্র');
  return `<span class="nasa-badge"><button type="button" class="nasa-chip${partner ? ' partner-chip' : ''}" aria-expanded="false" aria-controls="${id}" aria-haspopup="dialog" aria-label="${esc(ariaLabel)}">${esc(label)}</button><span class="nasa-popover" id="${id}" popover="manual" role="dialog" aria-label="${esc(ariaLabel)}" tabindex="-1">${entries.map(entry => `<span class="nasa-source"><strong>${esc(t(...entry.name))}</strong><span>${esc(t(...entry.line))}</span><small>${esc(t(...entry.res))} · ${esc(entry.period ? t(...entry.period) : period)}</small><a href="${esc(entry.url)}" target="_blank" rel="noopener">${t('Source ↗', 'উৎস ↗')}</a></span>`).join('')}</span></span>`;
}

function initNasaBadges() {
  let active = null, pinned = false, timer;
  const position = () => {
    if (!active) return;
    if (!active.isConnected) return closePopup();
    const button = active.previousElementSibling;
    const rect = button.getBoundingClientRect();
    const width = active.offsetWidth, height = active.offsetHeight;
    active.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
    active.style.top = `${Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - height - 8))}px`;
  };
  const closePopup = (restoreFocus = false) => {
    clearTimeout(timer);
    if (!active) return;
    const button = active.previousElementSibling;
    if (active.matches(':popover-open')) active.hidePopover();
    button.setAttribute('aria-expanded', 'false');
    active = null;
    pinned = false;
    if (restoreFocus) button.focus();
  };
  const openPopup = (button, pin = false) => {
    clearTimeout(timer);
    const popup = document.getElementById(button.getAttribute('aria-controls'));
    if (active !== popup) {
      closePopup();
      active = popup;
      active.showPopover();
      button.setAttribute('aria-expanded', 'true');
    }
    pinned = pinned || pin;
    position();
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('.nasa-chip');
    if (button) {
      event.preventDefault();
      event.stopPropagation();
      if (active === button.nextElementSibling && pinned) closePopup();
      else openPopup(button, true);
    } else if (active && !active.contains(event.target)) closePopup();
  }, true);
  document.addEventListener('pointerover', event => {
    if (event.pointerType !== 'mouse') return;
    const badge = event.target.closest('.nasa-badge');
    if (badge && (!pinned || badge.contains(active))) {
      openPopup(badge.querySelector('.nasa-chip'));
    }
  });
  document.addEventListener('pointerout', event => {
    const badge = event.target.closest('.nasa-badge');
    if (badge && !badge.contains(event.relatedTarget) && !pinned) {
      timer = setTimeout(() => closePopup(), 300);
    }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) {
      event.preventDefault();
      event.stopPropagation();
      closePopup(true);
    }
  }, true);
  document.addEventListener('focusout', event => {
    if (active && event.target.closest('.nasa-badge') &&
        !event.target.closest('.nasa-badge').contains(event.relatedTarget)) closePopup();
  });
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  window.addEventListener('hashchange', () => closePopup());
  window.addEventListener('workspace-render', () => closePopup());
}
function num(x, places = 0) {
  return Number.isFinite(x)
    ? new Intl.NumberFormat(state.lang === "bn" ? "bn-BD" : "en-GB", {
        maximumFractionDigits: places,
      }).format(x)
    : "—";
}
function monthName(monthIndex = state.month, short = false) {
  return new Intl.DateTimeFormat(state.lang === "bn" ? "bn-BD" : "en-GB", {
    month: short ? "short" : "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, monthIndex, 15)));
}
function allFields() {
  const custom = (state.customFields || []).map((cf) => {
    const cached = getCachedPower(cf.id);
    return {
      ...cf,
      custom: true,
      imagery: cf.imagery || [],
      monthly: cached?.monthly || cf.monthly || null,
      daily: cached?.daily || cf.daily || null,
      qa: cached?.qa || cf.qa || null,
      retrievedAt: cached?.retrievedAt || cf.retrievedAt || null,
    };
  });
  return [...(earth?.fields || []), ...custom];
}
function field() {
  return allFields().find((f) => f.id === state.fieldId) || earth?.fields?.[0];
}
const siteNames = {
  mithapukur: "মিঠাপুকুর",
  pirganj: "পীরগঞ্জ",
  gangachara: "গঙ্গাচড়া",
};
function fieldName(f = field()) {
  if (!f) return "";
  const seasonField = getPlan()?.field;
  if (seasonField?.id === f.id && seasonField.name !== f.name) return seasonField.name;
  if (siteNames[f.id]) return t(f.name, siteNames[f.id]);
  if (f.name_bn && state.lang === "bn") return f.name_bn;
  return f.name || t("My field", "আমার জমি");
}
function basePolygon(f = field()) {
  if (!f) return [];
  // Real plots traced on the Maxar 28 Nov 2022 photo (Mithapukur 23, Pirganj 33, Gangachara 44 decimals).
  const shapes = {
    mithapukur: [
      [0.001043, 0.001147],
      [0.000992, 0.001421],
      [0.000692, 0.001343],
      [0.000728, 0.001091],
    ],
    pirganj: [
      [0.000745, 0.000838],
      [0.000736, 0.001298],
      [0.000487, 0.00129],
      [0.000479, 0.000832],
    ],
    gangachara: [
      [0.001101, -0.000599],
      [0.001071, -0.00021],
      [0.00086, -0.000217],
      [0.000691, -0.000264],
      [0.000721, -0.000666],
      [0.000854, -0.000653],
    ],
  };
  if (shapes[f.id]) {
    return shapes[f.id].map(([dy, dx]) => [f.lat + dy, f.lon + dx]);
  }
  // Custom field default: small boundary square ~20 decimals (side ~28.45 m)
  const dy = 0.000128;
  const dx = 0.000128 / Math.cos(((f.lat || 25.5) * Math.PI) / 180);
  return [
    [f.lat - dy, f.lon - dx],
    [f.lat - dy, f.lon + dx],
    [f.lat + dy, f.lon + dx],
    [f.lat + dy, f.lon - dx],
  ];
}
function polygon() {
  return state.boundaries[state.fieldId] || basePolygon();
}
function area() {
  const seasonField = getPlan()?.field;
  if (seasonField?.id === state.fieldId) return seasonField.areaHa;
  return areaHa(polygon());
}
// Example Aman harvest: 10 Nov of the current year (an editable demo assumption, not a forecast).
function defaultHarvest(today = new Date()) {
  return `${today.getFullYear()}-11-10`;
}
function defaultPriorities() {
  return { ...defaults.weights };
}
function defaultProfile() {
  return {
    crop: "aman",
    harvest: defaultHarvest(),
    irrigation: "reliable",
    budget: "medium",
    floodDays: 0,
  };
}
function profile() {
  return { ...defaultProfile(), ...state.profiles[state.fieldId] };
}
function setProfile(values) {
  state.profiles[state.fieldId] = { ...profile(), ...values };
  persist();
}
function cropName(id) {
  const c = agronomy.crops.find((v) => v.id === id);
  return c ? t(c.label, c.bn) : id;
}
const paths = {
  calendar: "M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h3 M8 17h3 M14 14h2",
  plans: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M9 7h6 M9 11h6 M9 15h4",
  recovery: "M12 2 3 6v6c0 5 5 8 9 10 4-2 9-5 9-10V6Z M7 12l3 3 7-7",
  field: "M3 16 7 6l7-3 7 5-3 11-10 2Z M7 6l6 5 8-3 M13 11l-3 9",
  seasons: "M3 4v16h18 M6 15l4-5 4 3 6-9",
  rotations:
    "M4 10a8 8 0 0 1 14-4l2 2 M20 3v5h-5 M20 14a8 8 0 0 1-14 4l-2-2 M4 21v-5h5",
  planner: "m12 3 9 5-9 6-9-6Z M3 8v9l9 5 9-5V8 M12 14v8",
  clinic: "M5 12c0-6 6-9 15-9 1 9-3 15-9 15-3 0-6-2-6-6Z M3 22 16 8",
  water: "M12 2c-2 4-7 9-7 13a7 7 0 0 0 14 0c0-4-5-9-7-13Z M8 15a4 4 0 0 0 4 4",
  research: "M9 3h6 M10 3v6L4 19q-1 2 2 2h12q3 0 2-2l-6-10V3 M8 15h8",
  source: "M4 4h7l2 2h7v14h-7l-2-2H4Z M12 6v12",
  right: "M4 12h15 M13 6l6 6-6 6",
  down: "M6 9l6 6 6-6",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z M15 10a3 3 0 1 1-6 0 3 3 0 1 1 6 0Z",
  search: "M17 17l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z",
  draw: "m3 17 12-12 4 4L7 21H3Z M14 6l4 4",
  layers: "m12 3 10 5-10 5L2 8Z M3 12l9 5 9-5 M3 16l9 5 9-5",
  rain: "M6 14a4 4 0 1 1 0-8 6 6 0 0 1 11-1 4 4 0 1 1 1 9 M8 17l-1 3 M13 17l-1 3 M18 17l-1 3",
  temp: "M10 14V5a2 2 0 0 1 4 0v9a5 5 0 1 1-4 0Z M12 10v7",
  sun: "M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  close: "M5 5l14 14 M19 5 5 19",
  add: "M12 4v16 M4 12h16",
  download: "M12 3v12 M7 10l5 5 5-5 M4 16v5h16v-5",
  camera: "M3 7h4l2-3h6l2 3h4v14H3Z M16 14a4 4 0 1 1-8 0 4 4 0 1 1 8 0Z",
  save: "M4 3h12l4 4v14H4Z M8 3v6h8V3 M8 21v-8h8v8",
  print: "M6 8V3h12v5 M6 17H3V8h18v9h-3 M6 14h12v7H6Z",
  flame: "M12 2c3 6-3 7 1 11 2-1 3-4 3-6 9 9 3 15-4 15-8 0-12-9 0-20Z",
  tree: "m12 2-7 9h4l-6 7h8v4h2v-4h8l-6-7h4Z",
  note: "M4 3h16v18H4Z M8 8h8 M8 12h8 M8 16h5",
  bug: "M8 9c0-6 8-6 8 0v6a4 4 0 1 1-8 0Z M12 9v10 M4 10h4 M4 16h4 M16 10h4 M16 16h4 M9 5 7 2 M15 5l2-3",
  grid: "M3 3h7v7H3Z M14 3h7v7h-7Z M3 14h7v7H3Z M14 14h7v7h-7Z",
  target:
    "M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0Z M12 1v5 M12 18v5 M1 12h5 M18 12h5",
  check: "m3 13 6 6L21 5",
  share: "M5 19 19 5 M8 5h11v11",
  arrowback: "m14 5-7 7 7 7",
};
function icon(name, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.field}"/></svg>`;
}
function button(label, action, style = "", symbol = "", value = "") {
  return `<button type="button" class="button ${style}" data-action="${action}" data-value="${esc(value)}">${symbol ? icon(symbol) : ""}${esc(label)}</button>`;
}
function goButton(label, route, style = "", symbol = "right") {
  return `<button class="button ${style}" data-go="${route}">${esc(label)} ${icon(symbol)}</button>`;
}
function header(kicker, title, desc, actions = "") {
  return `<header class="page-head"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(desc)}</p></div>${actions ? `<div class="page-head-actions">${actions}</div>` : ""}</header>`;
}
function panel(title, body, action = "") {
  return `<section class="panel"><div class="panel-header"><h2>${esc(title)}</h2>${action}</div><div class="panel-body">${body}</div></section>`;
}
function tag(label, color = "") {
  return `<span class="tag ${color}">${esc(label)}</span>`;
}
function truth(tag, opts = {}) {
  const labels = {
    MEASURED: ["Measured", "জমি থেকে মাপা"],
    FARMER_REPORTED: ["Measured", "জমি থেকে মাপা"],
    RECOMMENDED: ["Recommended", "প্রস্তাবিত"],
    REMOTE_OBSERVED: ["Estimated", "স্যাটেলাইট অনুমান"],
    MODELED: ["Estimated", "স্যাটেলাইট অনুমান"],
    SCENARIO: ["Scenario", "কাল্পনিক পরিকল্পনা"],
    UNKNOWN: ["Unknown — add data", "অজানা — তথ্য দিন"],
  };
  const icons = {
    MEASURED: "✓",
    FARMER_REPORTED: "✓",
    RECOMMENDED: "◈",
    REMOTE_OBSERVED: "◈",
    MODELED: "◈",
    SCENARIO: "⬡",
    UNKNOWN: "⊘",
  };
  const classes = {
    MEASURED: "measured",
    FARMER_REPORTED: "measured",
    RECOMMENDED: "estimated",
    REMOTE_OBSERVED: "estimated",
    MODELED: "estimated",
    SCENARIO: "scenario",
    UNKNOWN: "unknown",
  };
  const [en, bn] = labels[tag] || ["Unknown — add data", "অজানা — তথ্য দিন"];
  const icon = icons[tag] || "⊘";
  const cls = classes[tag] || "unknown";
  const labelText = tag === "FARMER_REPORTED" ? `${icon} ${t(en, bn)} · by farmer` : `${icon} ${t(en, bn)}`;
  
  const titleParts = [];
  if (opts.source) titleParts.push(`source: ${opts.source}`);
  if (opts.date) titleParts.push(`date: ${opts.date}`);
  if (opts.cell) titleParts.push(`cell: ${opts.cell}`);
  const title = titleParts.length ? titleParts.join(", ") : tag;
  
  return `<span class="truth ${cls}" title="${esc(title)}" aria-label="${esc(labelText)}">${esc(labelText)}</span>`;
}
function chips() {
  const fields = allFields();
  return `<div class="field-selector" aria-label="${t("Field selector", "জমি নির্বাচন")}">${fields.map((f, i) => {
    const isCustom = !!f.custom;
    const isSelected = state.fieldId === f.id;
    const deleteBtn = isCustom
      ? `<button type="button" class="chip-delete-btn" data-action="delete-field" data-value="${f.id}" title="${t("Delete custom field", "জমি মুছুন")}" aria-label="${t("Delete", "মুছুন")} ${esc(fieldName(f))}">×</button>`
      : "";
    return `<div class="chip-wrapper"><button data-field="${f.id}" class="field-chip ${isSelected ? "selected" : ""}" aria-pressed="${isSelected}"><span class="tiny-dot ${isCustom ? "custom-dot" : ""}"></span>${esc(fieldName(f))} <small class="mono">${isCustom ? "★" : String(i + 1).padStart(2, "0")}</small></button>${deleteBtn}</div>`;
  }).join("")}</div>`;
}
function input(label, name, value = "", attributes = "", type = "number") {
  return `<div class="form-field"><label for="in-${esc(name)}">${esc(label)}</label><input id="in-${esc(name)}" name="${esc(name)}" type="${type}" value="${esc(value)}" ${attributes}></div>`;
}
function select(label, name, choices, current, attributes = "") {
  return `<div class="form-field"><label for="in-${esc(name)}">${esc(label)}</label><select id="in-${esc(name)}" name="${esc(name)}" ${attributes}>${choices.map(([id, title]) => `<option value="${esc(id)}" ${String(id) === String(current) ? "selected" : ""}>${esc(title)}</option>`).join("")}</select></div>`;
}
function sources(ids) {
  return ids
    .map((id) => {
      const item =
        agronomy.sources.find((s) => s.id === id) ||
        earth.sources.find((s) => s.id === id);
      return item
        ? `<a class="source-link" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.publisher || item.name)} ↗</a>`
        : "";
    })
    .join(" · ");
}
function tabs(scope, items) {
  return `<nav class="tabbar" aria-label="${esc(scope)}">${items.map(([id, label]) => `<button data-tab="${scope}" data-value="${id}" class="${state.tabs[scope] === id ? "active" : ""}" aria-pressed="${state.tabs[scope] === id}">${label}</button>`).join("")}</nav>`;
}
function monthControl(year = 2024) {
  return `<div class="timeline-controls"><span class="month-name">${monthName()} ${num(year).replace(/[,٬]/g, "")}</span><input type="range" min="0" max="11" step="1" value="${state.month}" data-month aria-label="${t("Historical month", "পুরনো মাস")}"><span class="mono note">01 — 12</span></div>`;
}
function toast(message) {
  const el = typeof document !== "undefined" && document.querySelector ? document.querySelector("#toast") : null;
  if (el) {
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2700);
  }
  if (typeof globalThis.onToastMessage === "function") {
    globalThis.onToastMessage(message);
  }
}
function recordId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
        b.toString(16).padStart(2, "0"),
      ).join("");
}
function repaint() {
  if (typeof window !== "undefined" && window.dispatchEvent) {
    window.dispatchEvent(new Event("workspace-render"));
  }
}
function promptModal(title, message, defaultValue, onConfirm) {
  const d = document.querySelector("#modal");
  if (!d) {
    const res = typeof window !== 'undefined' ? window.prompt(message, defaultValue) : defaultValue;
    if (res !== null) onConfirm(res);
    return;
  }
  const inputId = `prompt-input-${Date.now()}`;
  d.innerHTML = `
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="${t("Close", "বন্ধ করুন")}">${icon("close")}</button></div>
    <div class="modal-body">
      <p class="note">${esc(message)}</p>
      <div style="margin:12px 0;">
        <input type="text" id="${inputId}" value="${esc(defaultValue)}" style="width:100%;padding:8px 12px;border:1px solid var(--line);border-radius:6px;font:inherit;">
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button type="button" class="button ghost" data-action="close">${t("Cancel", "বাতিল")}</button>
        <button type="button" class="button primary" id="prompt-ok-btn">${t("Save", "সংরক্ষণ")}</button>
      </div>
    </div>
  `;
  const okBtn = d.querySelector('#prompt-ok-btn');
  const inputEl = d.querySelector(`#${inputId}`);
  const submit = () => {
    const val = inputEl?.value;
    close();
    onConfirm(val);
  };
  okBtn?.addEventListener('click', submit);
  inputEl?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });
  if (!d.open && typeof d.showModal === 'function') d.showModal();
  inputEl?.focus();
}

function modal(title, body) {
  const d = document.querySelector("#modal");
  d.innerHTML = `<div class="modal-head"><h2>${esc(title)}</h2><button class="icon-button" data-action="close" aria-label="${t("Close", "বন্ধ করুন")}">${icon("close")}</button></div><div class="modal-body">${body}</div>`;
  if (!d.open) d.showModal();
}
function close() {
  document.querySelector?.("#modal")?.close?.();
}
function download(filename, content, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function csv(rows) {
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = (value) => {
    let str =
      value == null
        ? ""
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
    if (
      /^[=+@\t\r]/.test(str) ||
      (str.startsWith("-") && !Number.isFinite(Number(str)))
    )
      str = "'" + str;
    return '"' + str.replaceAll('"', '""') + '"';
  };
  return [keys, ...rows.map((row) => keys.map((k) => row[k]))]
    .map((r) => r.map(cell).join(","))
    .join("\r\n");
}
function timeline(months) {
  const colors = {
    aman: t("Aman", "আমন"),
    boro: t("Boro", "বোরো"),
    potato: t("Potato", "আলু"),
    mustard: t("Mustard", "সরিষা"),
    pulse: t("Pulse", "ডাল"),
    fallow: t("Rest", "পতিত"),
  };
  return `<div class="timeline-scroll" tabindex="0" role="region" aria-label="${t("Crop calendar, scroll for all months", "ফসলের ক্যালেন্ডার, সব মাস দেখতে স্ক্রল করুন")}"><div class="timeline-strip">${months.map((m, i) => `<div class="${m}" title="${monthName(i)} · ${colors[m]}">${i === 0 || months[i - 1] !== m ? colors[m] : ""}</div>`).join("")}</div><div class="month-labels">${months.map((_, i) => `<span>${monthName(i, true)}</span>`).join("")}</div></div>`;
}
function chart(
  series,
  {
    max: explicitMax,
    unit = "",
    selected = state.month,
    band = null,
    description = "Monthly series",
  } = {},
) {
  const width = 600,
    height = 172,
    left = 41,
    right = 18,
    top = 15,
    bottom = 29;
  const values = series.flatMap((s) => s.values.filter(Number.isFinite));
  if (band) values.push(...band.flat().filter(Number.isFinite));
  if (!values.length)
    return `<p class="empty">${t("No valid observations", "বৈধ পর্যবেক্ষণ নেই")}</p>`;
  const low = Math.min(0, Math.min(...values)),
    high = explicitMax ?? Math.max(0, ...values),
    span = high - low || 1,
    n = series[0].values.length;
  const x = (i) => left + (i * (width - left - right)) / Math.max(n - 1, 1),
    y = (v) => top + ((high - v) * (height - top - bottom)) / span;
  let lines = "";
  for (let j = 0; j < 4; j++) {
    const v = low + (span * j) / 3;
    lines += `<line class="grid" x1="${left}" y1="${y(v)}" x2="${width - right}" y2="${y(v)}"/><text x="${left - 6}" y="${y(v) + 3}" text-anchor="end">${num(v, span < 3 ? 1 : 0)}</text>`;
  }
  if (band && band.every((pair) => pair.every(Number.isFinite))) {
    const vertices = [
      ...band.map((pair, i) => `${x(i)},${y(pair[1])}`),
      ...band.map((pair, i) => `${x(i)},${y(pair[0])}`).reverse(),
    ];
    lines += `<polygon points="${vertices.join(" ")}" fill="#d1dfe2" opacity=".75"/>`;
  }
  if (selected != null)
    lines += `<line x1="${x(selected)}" x2="${x(selected)}" y1="${top}" y2="${height - bottom}" stroke="#adb59f" stroke-dasharray="3,4"/>`;
  for (const s of series) {
    let path = "",
      connected = false;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        connected = false;
        return;
      }
      path += `${connected ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      connected = true;
    });
    lines += `<path d="${path}" stroke="${s.color}" stroke-width="2.7" fill="none" ${s.dash ? 'stroke-dasharray="5,4"' : ""}/>`;
    if (selected != null && Number.isFinite(s.values[selected]))
      lines += `<circle cx="${x(selected)}" cy="${y(s.values[selected])}" r="4" fill="${s.color}" stroke="#fff" stroke-width="2"/>`;
  }
  for (let i = 0; i < n; i++)
    if (n <= 12 || i % 5 === 0)
      lines += `<text x="${x(i)}" y="${height - 7}" text-anchor="middle">${n === 12 ? monthName(i, true) : num(i + 1)}</text>`;
  return `<div class="chart-legend">${series.map((s) => `<span><i class="legend-dot" style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}<span>${esc(unit)}</span></div><div class="chart-frame"><svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(description)}">${lines}</svg></div>`;
}
function stateEmpty(msg, actionLabel = "", action = null) {
  const hasAction = actionLabel && action;
  return `<div class="empty">${icon("note", 31)}${hasAction ? `<h3>${esc(msg)}</h3><p>${button(esc(actionLabel), action, "primary")}</p>` : `<h3>${esc(msg)}</h3><p>${esc(actionLabel)}</p>`}</div>`;
}
function stateError(msg, retryAction = null) {
  const hasRetry = retryAction !== null;
  return `<div class="error-state">${icon("bug", 31)}<h3>${esc(msg)}</h3>${hasRetry ? `<p>${button(t("Retry", "আবার চেষ্টা করুন"), retryAction)}</p>` : ""}</div>`;
}
function exampleBanner() {
  return `<div class="example-banner">${t("Example — not your field", "উদাহরণ — আপনার জমি নয়")}</div>`;
}

// Fetch JSON that may be a gzip pack (moisture-grid.json); null when missing or offline.
async function fetchJsonMaybeGzip(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    const body = bytes[0] === 0x1f && bytes[1] === 0x8b
      ? new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))
      : bytes;
    return await new Response(body).json();
  } catch {
    return null;
  }
}
export {
  nasaSources,
  nasaBadge,
  initNasaBadges,
  fetchJsonMaybeGzip,
  recordId,
  state,
  earth,
  allFields,
  agronomy,
  archive,
  smap,
  hlsField,
  outlook,
  floodFields,
  graceGroundwater,
  s1Water,
  loadData,
  persist,
  t,
  deskNo,
  promptModal,
  esc,
  num,
  monthName,
  field,
  fieldName,
  basePolygon,
  polygon,
  area,
  profile,
  defaultPriorities,
  defaultProfile,
  setProfile,
  cropName,
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
  modal,
  close,
  download,
  csv,
  timeline,
  chart,
  stateEmpty,
  stateError,
  exampleBanner,
};
