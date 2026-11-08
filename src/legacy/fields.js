import { units } from "./boundary.js";
import {
  state,
  earth,
  agronomy,
  archive,
  persist,
  t,
  esc,
  num,
  monthName,
  field,
  fieldName,
  polygon,
  area,
  profile,
  setProfile,
  cropName,
  icon,
  button,
  goButton,
  header,
  panel,
  tag,
  chips,
  input,
  select,
  monthControl,
  toast,
  repaint,
  modal,
  close,
  download,
  csv,
  chart,
} from "./ui.js";
import { rotationEvidence, polygonValid, mean } from "./engine.js";

let leafletMap = null,
  drawLayer = null,
  drawPoints = [],
  drawMode = false,
  regional = false,
  showLandsat = false;
const colors = {
  wetness: "#658261",
  rainGpm: "#518899",
  tmean: "#bd8d49",
  et0: "#9e9275",
};
function setField(id) {
  state.fieldId = id;
  regional = false;
  drawMode = false;
  drawPoints = [];
  persist();
  repaint();
}
function disposeMap() {
  if (leafletMap) {
    leafletMap.off();
    leafletMap.remove();
    leafletMap = null;
  }
  drawLayer = null;
  drawMode = false;
  drawPoints = [];
}
function spark(values, color) {
  const finiteValues = values.filter(Number.isFinite);
  if (!finiteValues.length) return "";
  const low = Math.min(...finiteValues),
    span = Math.max(...finiteValues) - low || 1;
  const points = values.map((v, i) =>
    Number.isFinite(v)
      ? [
          2 + (i * 116) / Math.max(1, values.length - 1),
          24 - ((v - low) / span) * 20,
        ]
      : null,
  );
  const path = points
    .map((p, i) =>
      p ? `${i && points[i - 1] ? "L" : "M"}${p[0]},${p[1]}` : "",
    )
    .join(" ");
  return `<svg class="spark" viewBox="0 0 120 28" preserveAspectRatio="none" aria-hidden="true"><path d="M0 25h120" stroke="#dce2d6" stroke-dasharray="2 3"/><path d="${path}" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" fill="none"/></svg>`;
}
function stats(months = field().monthly) {
  const m = months[state.month];
  const defs = [
    [
      "wetness",
      t("Surface wetness", "মাটির উপরিভাগের আর্দ্রতা"),
      "",
      "water",
      t("POWER · index from 0 to 1", "POWER · সূচক ০ থেকে ১"),
      2,
    ],
    [
      "rainGpm",
      t("Rainfall", "বৃষ্টিপাত"),
      "mm",
      "rain",
      t("IMERG · monthly total", "IMERG · মাসের মোট"),
      1,
    ],
    [
      "tmean",
      t("Mean temperature", "গড় তাপমাত্রা"),
      "°C",
      "temp",
      t("POWER · monthly average", "POWER · মাসিক গড়"),
      1,
    ],
    [
      "et0",
      t("Reference water use", "রেফারেন্স পানির চাহিদা"),
      "mm",
      "sun",
      t("FAO-56 ETo · monthly total", "FAO-56 ETo · মাসের মোট"),
      1,
    ],
  ];
  return `<div class="data-row">${defs
    .map(
      ([key, label, unit, symbol, foot, places]) =>
        `<article class="data-stat"><div class="stat-top">${label}${icon(symbol)}</div><div class="stat-value">${num(m[key], places)}<small>${unit}</small></div>${spark(
          months.map((v) => v[key]),
          colors[key],
        )}<div class="stat-foot">${foot}</div></article>`,
    )
    .join("")}</div>`;
}
function mapImage(f) {
  return showLandsat ? f.imagery[0] : f.contextImage || f.imagery[0];
}
function home() {
  const f = field(),
    p = profile(),
    image = mapImage(f),
    ranks = rotationEvidence(f.monthly, state.weights, p);
  const first = ranks.find((r) => r.feasible);
  return (
    header(
      t("Field atlas  /  01", "জমির মানচিত্র  /  ০১"),
      t("My field notebook", "আমার জমির খাতা"),
      t(
        "Find your plot, read the season, and plan what comes next.",
        "জমি খুঁজুন, মৌসুমের তথ্য দেখুন এবং পরের ফসল ঠিক করুন।",
      ),
      goButton(
        t("Disaster recovery", "দুর্যোগের পর করণীয়"),
        "recovery",
        "",
        "recovery",
      ) +
        button(t("Find a field", "জমি খুঁজুন"), "search", "primary", "search"),
    ) +
    chips() +
    `<div class="grid-two"><section class="panel"><div class="panel-header"><h2>${t("Field map", "জমির মানচিত্র")}</h2>${tag(t("Satellite imagery", "স্যাটেলাইট ছবি"), "green")}</div>
 <div class="map-shell"><div id="field-map" class="field-map" role="region" aria-label="${t("Interactive Rangpur field map", "রংপুরের ইন্টার‌্যাক্টিভ মানচিত্র")}"></div><div class="map-overline" id="map-label">${image?.sourceLabel ? "SENTINEL-2" : "LANDSAT 8"}  /  ${t("NATURAL COLOR", "প্রাকৃতিক রং")}</div><div class="map-bottom">N ↑ &nbsp; ${num(f.lat, 3)}° N &nbsp; ${num(f.lon, 3)}° E</div></div>
 <div class="map-actions"><span class="note">${image ? `${image.date} · ${image.sourceLabel || "NASA / USGS"}` : t("No image available", "ছবি নেই")}</span><div class="map-controls">${f.contextImage ? button(showLandsat ? "Sentinel-2" : "Landsat 8", "swap-image", "small", "layers") : ""}${button(regional ? t("Satellite", "স্যাটেলাইট") : t("District", "জেলা"), "region", "small", "layers")}${button(t("Draw boundary", "সীমানা আঁকুন"), "draw", "small", "draw")}</div></div><div id="drawing-help"></div></section>
 <section class="panel"><div class="field-card"><div class="field-intro"><div class="eyebrow">${t("Plot dossier", "জমির পরিচয়")} / RG–0${earth.fields.indexOf(f) + 1}</div><h2>${esc(fieldName())}</h2><div class="location">${t("Rangpur District, Bangladesh", "রংপুর জেলা, বাংলাদেশ")}</div></div><dl class="field-meta"><div><dt>${t("Boundary area", "জমির আয়তন")}</dt><dd class="large" title="${units(area())}">${num(area(), 2)} <small>ha</small></dd><small class="unit-note">${num(area() * 2.47105381, 2)} ac · ${num(area() * 247.105381, 1)} ${t("decimals", "শতক")}</small></div><div><dt>${t("Field boundary", "জমির সীমানা")}</dt><dd>${state.boundaries[f.id] ? t("Farmer drawn", "কৃষকের আঁকা") : t("Demo outline", "নমুনা সীমানা")}</dd></div><div><dt>${t("Planning crop", "পরিকল্পনার ফসল")}</dt><dd>${cropName(p.crop)}</dd></div><div><dt>${t("Expected harvest", "সম্ভাব্য ফসল তোলা")}</dt><dd>${esc(p.harvest)}</dd></div></dl>
 <div class="field-recommend"><div class="eyebrow">${t("Next decision", "পরবর্তী সিদ্ধান্ত")}</div><h3>${first ? t(first.crops.join(" → "), first.bnCrops.join(" → ")) : t("Review field constraints", "জমির শর্ত দেখুন")}</h3><p>${t("Compare four full rotations using your priorities and the winter planting window.", "আপনার অগ্রাধিকার ও বপনের সময় ধরে চারটি ফসলচক্র তুলনা করুন।")}</p>${goButton(t("Explore rotations", "ফসলচক্র দেখুন"), "rotations", "primary full")}</div></div>
 <div class="field-bottom">${icon("draw", 13)}${button(t("Edit field assumptions", "জমির অনুমান বদলান"), "profile", "ghost small")}</div></section></div>
 <div class="section-label"><div><div class="eyebrow">${t("Historical observations", "পুরনো পর্যবেক্ষণ")}</div><h2>${monthName()} 2024</h2></div>${goButton(t("See past seasons", "পুরনো মৌসুম"), "seasons", "small")}</div>${stats()}
 <div class="section-label"><h2>${t("Work on this field", "এই জমিতে আরও কাজ")}</h2></div><div class="work-actions">${[
   [
     "planner",
     "planner",
     t("Lay out the rows", "সারি সাজান"),
     t(
       "Preview planting density in 3D",
       "ত্রিমাত্রিক দৃশ্যে গাছের ঘনত্ব দেখুন",
     ),
   ],
   [
     "clinic",
     "clinic",
     t("Check a crop problem", "ফসলের সমস্যা দেখুন"),
     t(
       "Record insects, leaf damage, or soil concerns",
       "পোকা, পাতার ক্ষতি বা মাটির সমস্যা লিখুন",
     ),
   ],
   [
     "research",
     "research",
     t("Add a field observation", "পর্যবেক্ষণ যোগ করুন"),
     t(
       "Connect rain, soil tests and measured yields",
       "বৃষ্টি, মাটি ও ফলনের রেকর্ড রাখুন",
     ),
   ],
 ]
   .map(
     ([route, symbol, name, sub]) =>
       `<button data-go="${route}" class="work-action">${icon(symbol, 22)}<span><strong>${name}</strong><small>${sub}</small></span>${icon("right", 15)}</button>`,
   )
   .join("")}</div>`
  );
}
function seasonView() {
  const f = field(),
    year = Number(state.historyYear || 2024),
    archiveMonths = archive.fields[f.id].monthly,
    months = archiveMonths.filter((v) => v.month.startsWith(String(year)));
  const m = months[state.month],
    img = year === 2024 && state.month >= 2 ? f.contextImage : f.imagery[0],
    dry = months.reduce((a, b) => (b.rainGpm < a.rainGpm ? b : a)),
    wet = months.reduce((a, b) => (b.rainGpm > a.rainGpm ? b : a));
  const comparators = archiveMonths.filter(
    (v) => v.month.slice(5) === m.month.slice(5) && v.month !== m.month,
  );
  const comparisonMean = mean(comparators.map((v) => v.rainGpm));
  const opticalTable =
    year === 2024 && f.opticalHistory
      ? panel(
          t("Greenness through the season", "মৌসুমে গাছের সবুজভাব"),
          `<p class="note">${t("Landsat samples in the fixed 900 m window. Cloud-obscured observations leave a gap.", "৯০০ মিটার জানালায় ল্যান্ডস্যাট নমুনা। মেঘে ঢাকা পর্যবেক্ষণ ফাঁকা থাকে।")}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>${t("Acquired", "তারিখ")}</th><th>NDVI</th><th>${t("Clear samples", "পরিষ্কার নমুনা")}</th><th>${t("Coverage", "তথ্যের অবস্থা")}</th></tr></thead><tbody>${f.opticalHistory.map((o) => `<tr><td>${esc(o.date)}</td><td>${o.opticalQA.validFraction >= 0.25 ? num(o.opticalQA.ndvi, 3) : "—"}</td><td>${num(o.opticalQA.validPixels)} / ${num(o.opticalQA.pixels)}</td><td>${o.opticalQA.validFraction >= 0.25 ? t("Usable", "ব্যবহারযোগ্য") : t("Too little clear cover", "পরিষ্কার অংশ কম")}</td></tr>`).join("")}</tbody></table></div>`,
        )
      : "";
  const history = state.records.filter(
    (r) =>
      r.fieldId === f.id &&
      r.kind === "harvest" &&
      r.date.startsWith(String(year)),
  );
  return (
    header(
      t("Season archive  /  02", "মৌসুমের খাতা  /  ০২"),
      t("Past seasons", "পুরনো মৌসুম"),
      t(
        "Replay five years. Choose a year and a month to read the regional record.",
        "পাঁচ বছরের আঞ্চলিক তথ্য দেখুন। বছর ও মাস বেছে নিন।",
      ),
      button(
        t("Download archive", "পুরনো তথ্য নিন"),
        "export-archive",
        "",
        "download",
      ),
    ) +
    chips() +
    panel(
      t("Choose a month", "মাস বাছুন"),
      select(
        t("Archive year", "রেকর্ডের বছর"),
        "historyYear",
        [2021, 2022, 2023, 2024, 2025].map((y) => [y, String(y)]),
        year,
      ) + monthControl(year),
      tag("2021–2025", "blue"),
    ) +
    stats(months) +
    `<div class="notice section-space">${monthName()} ${year} · ${t("Rainfall", "বৃষ্টি")} <b>${num(m.rainGpm, 1)} mm</b>. ${t("Same-month average in the other four archive years", "আর্কাইভের বাকি চার বছরে একই মাসের গড়")} <b>${num(comparisonMean, 1)} mm</b>. ${t("This is a short historical comparison.", "এটি স্বল্পমেয়াদি ঐতিহাসিক তুলনা।")}</div>` +
    `<div class="grid-equal section-space">${panel(
      t("Where the rain went", "কোন মাসে কত বৃষ্টি"),
      chart(
        [
          {
            label: "GPM IMERG",
            color: "#517e8b",
            values: months.map((m) => m.rainGpm),
          },
          {
            label: "POWER",
            color: "#9c9c67",
            values: months.map((m) => m.rainPower),
            dash: true,
          },
        ],
        {
          unit: "mm / month",
          description: "Monthly rainfall estimated by two products",
        },
      ) +
        `<p class="note">${t("The wettest IMERG month was", "IMERG অনুযায়ী সবচেয়ে বেশি বৃষ্টি")} ${monthName(months.indexOf(wet))} (${num(wet.rainGpm, 1)} mm). ${t("The driest was", "সবচেয়ে কম")} ${monthName(months.indexOf(dry))} (${num(dry.rainGpm, 1)} mm).</p>`,
    )}
 ${panel(
   t("How wet the soil was", "মাটি কতটা ভেজা ছিল"),
   chart(
     [
       {
         label: t("Surface layer", "উপরিভাগ"),
         color: "#567f56",
         values: months.map((m) => m.wetness),
       },
       {
         label: t("Root zone", "শিকড়ের স্তর"),
         color: "#b19251",
         values: months.map((m) => m.rootWetness),
         dash: true,
       },
     ],
     {
       unit: t("wetness index 0–1", "আর্দ্রতা সূচক ০–১"),
       max: 1,
       description: "POWER surface and root-zone wetness",
     },
   ) +
     `<p class="note">${t("These regional model indices describe relative wetness. A soil probe can supply a local reading.", "এলাকার মডেল থেকে আপেক্ষিক আর্দ্রতা পাওয়া যায়। জমির নিজস্ব মাপের জন্য মাটির সেন্সর ব্যবহার করুন।")}</p>`,
 )}</div>
 <div class="grid-equal section-space">${panel(t("Dated optical observation", "স্যাটেলাইট পর্যবেক্ষণ"), year === 2024 && img ? `<div class="observation-thumb"><img src="${esc(img.url)}" alt="${t("Dated satellite image near the field", "জমির কাছের ল্যান্ডস্যাট ছবি")}"><div><b>${esc(img.date)}</b><p class="note">${img.sourceLabel ? "Sentinel-2 · 10 m" : "Landsat 8 · 30 m"}</p><p class="note">${esc(img.sceneId)}</p>${Number.isFinite(img.ndvi) ? `<p>NDVI ${num(img.ndvi, 2)}</p>` : ""}<a class="source-link" href="${esc(img.itemUrl)}" target="_blank" rel="noopener">${t("View scene record ↗", "ছবির উৎস ↗")}</a></div></div><p class="note">${t("This scene keeps its acquisition date as you move between months.", "মাস বদলালেও ছবিটি তার আসল তারিখেই দেখানো হয়।")}</p>` : `<p class="note">${t("No optical scene prepared for the selected year.", "এই বছরের স্যাটেলাইট ছবি প্রস্তুত নেই।")}</p>`)}
 ${panel(t("What grew here?", "এখানে কী ফসল হয়েছিল?"), `<p class="note">${history.length ? t("Harvests recorded in this year", "এই বছরে লেখা ফসল") : t("No verified harvests are recorded for this field in the selected year. Add a harvest to connect an actual variety and yield to this weather record.", "এই জমির নির্বাচিত বছরের যাচাই করা ফলনের তথ্য নেই। আবহাওয়ার সাথে তুলনা করতে একটি ফলনের রেকর্ড যোগ করুন।")}</p>${history.map((r) => `<p>${esc(r.date)} · ${esc(r.variety || cropName(r.crop))} · ${num(r.yieldKg, 1)} kg</p>`).join("")}<div class="spacer"></div>${button(t("Log a harvest", "ফলন লিখুন"), "new-harvest", "", "add")}`)}</div><div class="section-space">${opticalTable}</div>`
  );
}
async function mountMap() {
  const el = document.querySelector("#field-map");
  if (!el || !window.L) return;
  const f = field(),
    img = mapImage(f);
  leafletMap = L.map(el, {
    zoomControl: false,
    scrollWheelZoom: false,
    zoomSnap: 0.5,
    minZoom: 8,
    maxZoom: 19,
    attributionControl: true,
    keyboard: true,
  });
  const current = leafletMap;
  L.control.zoom({ position: "topright" }).addTo(current);
  L.control.scale({ position: "bottomright", imperial: false }).addTo(current);
  current.attributionControl.setPrefix(false);
  if (img) {
    const [w, s, e, n] = img.bounds;
    L.imageOverlay(
      img.url,
      [
        [s, w],
        [n, e],
      ],
      { attribution: img.sourceLabel || "Landsat · NASA / USGS" },
    ).addTo(current);
  }
  const poly = L.polygon(polygon(), {
    color: "#e3f9a2",
    weight: 2.5,
    fillColor: "#c8e383",
    fillOpacity: 0.21,
  }).addTo(current);
  if (regional) {
    try {
      const gj = await (await fetch("data/rangpur_upazilas.geojson")).json();
      if (current !== leafletMap) return;
      const region = L.geoJSON(gj, {
        style: {
          color: "#9ca889",
          weight: 1,
          fillColor: "#b7c69d",
          fillOpacity: 0.55,
        },
        interactive: false,
      }).addTo(current);
      region.bringToBack();
      current.fitBounds(region.getBounds(), { padding: [12, 12] });
      earth.fields.forEach((other) =>
        L.circleMarker([other.lat, other.lon], {
          radius: 6,
          color: "#d6ec97",
          fillColor: "#2c4b35",
          fillOpacity: 1,
        })
          .addTo(current)
          .bindTooltip(fieldName(other), {
            permanent: true,
            direction: "right",
          })
          .on("click", () => setField(other.id)),
      );
      document.querySelector("#map-label").textContent = t(
        "RANGPUR  /  PREPARED SITES",
        "রংপুর  /  প্রস্তুত জমি",
      );
    } catch {
      current.setView([25.65, 89.25], 10);
    }
  } else {
    current.setView(poly.getBounds().getCenter(), 16);
    poly.bindTooltip(t("Demo plot", "নমুনা জমি"), {
      direction: "center",
      permanent: false,
    });
  }
  current.on("click", (event) => {
    if (!drawMode) return;
    const { lat, lng } = event.latlng;
    const [w, s, e, n] = img?.bounds || [];
    if (!(lng >= w && lng <= e && lat >= s && lat <= n)) {
      toast(
        t(
          "Draw inside this prepared image.",
          "প্রস্তুত ছবির ভেতরে সীমানা আঁকুন।",
        ),
      );
      return;
    }
    drawPoints.push([lat, lng]);
    if (drawLayer) drawLayer.remove();
    drawLayer = L.polygon(drawPoints, {
      color: "#f6d879",
      weight: 2,
      dashArray: "4 4",
    }).addTo(current);
    updateDraw();
  });
}
function updateDraw() {
  const help = document.querySelector("#drawing-help");
  if (!help) return;
  help.innerHTML = drawMode
    ? `<div class="notice">${t("Tap each corner of your plot, then finish.", "জমির কোণগুলোতে চাপুন, তারপর শেষ করুন।")} <b>${num(drawPoints.length)}</b> ${t("corners", "টি কোণ")} <div class="toolbar-inline">${button(t("Finish outline", "আঁকা শেষ"), "finish-draw", "small")}${button(t("Enter corners", "কোণ লিখুন"), "coordinates", "small")}${button(t("Cancel", "বাতিল"), "cancel-draw", "small")}${drawPoints.length ? button(t("Undo corner", "শেষ কোণ বাদ"), "undo-corner", "small") : ""}</div></div>`
    : "";
}
function searchModal() {
  modal(
    t("Find a field", "জমি খুঁজুন"),
    `<form id="field-search" class="search-form"><label for="lookup">${t("Upazila, plot code, or latitude and longitude", "উপজেলা, জমির কোড অথবা অক্ষাংশ ও দ্রাঘিমাংশ")}</label><input id="lookup" name="query" placeholder="Mithapukur / RG-01 / 25.54, 89.27" autocomplete="off"><button class="button primary">${icon("search")} ${t("Search", "খুঁজুন")}</button></form><p class="note">${t("Three prepared locations have satellite imagery. Coordinate search checks the footprint of each image.", "তিনটি স্থানের স্যাটেলাইট ছবি প্রস্তুত আছে। স্থানাঙ্ক দিয়ে খুঁজলে তা ছবির সীমানায় আছে কি না দেখা হয়।")}</p><div id="search-results">${searchResults("")}</div>`,
  );
  setTimeout(() => document.querySelector("#lookup")?.focus(), 0);
}
function searchResults(query) {
  const q = query.trim().toLowerCase(),
    xy = q.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const matches = earth.fields.filter((f, i) => {
    if (xy) {
      const a = Number(xy[1]),
        b = Number(xy[2]),
        [w, s, e, n] = f.imagery[0]?.bounds || [];
      return a >= s && a <= n && b >= w && b <= e;
    }
    return [f.name, fieldName(f), `rg-0${i + 1}`, `rg–0${i + 1}`].some((v) =>
      v.toLowerCase().includes(q),
    );
  });
  return matches.length
    ? matches
        .map(
          (f) =>
            `<button class="result-option" data-action="select-result" data-value="${f.id}">${icon("pin")}<span><b>${esc(fieldName(f))}</b><small>${f.lat}° N · ${f.lon}° E</small></span>${icon("right")}</button>`,
        )
        .join("")
    : `<div class="empty">${t("No prepared coverage here. Try Mithapukur, Pirganj, or Gangachara.", "এই স্থানের তথ্য প্রস্তুত নেই। মিঠাপুকুর, পীরগঞ্জ বা গঙ্গাচড়া লিখুন।")}${xy ? button(t("Measure an unsupported plot", "অন্য জমি মাপুন"), "measure-new", "small", "draw", xy[1] + "," + xy[2]) : ""}</div>`;
}
function editProfile() {
  const p = profile();
  modal(
    t("Field assumptions", "জমির নিজস্ব তথ্য"),
    `<p class="note">${t("The initial entries are demo assumptions. Replace them with the farmer’s actual plan. Changes also affect rotation eligibility.", "শুরুর মানগুলো নমুনা। কৃষকের বাস্তব তথ্য লিখলে ফসলচক্রের ফলও বদলাবে।")}</p><form id="profile-form"><div class="form-grid section-space">${select(
      t("Planning crop", "পরিকল্পনার ফসল"),
      "crop",
      agronomy.crops.map((c) => [c.id, cropName(c.id)]),
      p.crop,
    )}${input(t("Expected Aman harvest", "সম্ভাব্য আমন কাটার দিন"), "harvest", p.harvest, "required", "date")}${select(
      t("Irrigation access", "সেচের সুবিধা"),
      "irrigation",
      [
        ["reliable", t("Reliable", "নির্ভরযোগ্য")],
        ["limited", t("Limited", "সীমিত")],
        ["none", t("Unavailable", "নেই")],
      ],
      p.irrigation,
    )}${select(
      t("Input budget", "উপকরণের বাজেট"),
      "budget",
      [
        ["low", t("Low", "কম")],
        ["medium", t("Medium", "মাঝারি")],
        ["high", t("High", "বেশি")],
      ],
      p.budget,
    )}</div><div class="spacer"></div><button class="button primary">${t("Save field details", "তথ্য সংরক্ষণ করুন")}</button></form>`,
  );
}
function fieldAction(action, value) {
  if (action === "search") searchModal();
  if (action === "swap-image") {
    showLandsat = !showLandsat;
    regional = false;
    repaint();
  }
  if (action === "select-result") {
    close();
    setField(value);
  }
  if (action === "profile") editProfile();
  if (action === "region") {
    regional = !regional;
    repaint();
  }
  if (action === "draw") {
    if (regional) {
      regional = false;
      repaint();
    }
    drawMode = true;
    drawPoints = [];
    if (drawLayer) drawLayer.remove();
    updateDraw();
  }
  if (action === "cancel-draw") {
    drawMode = false;
    drawPoints = [];
    if (drawLayer) drawLayer.remove();
    updateDraw();
  }
  if (action === "undo-corner") {
    drawPoints.pop();
    if (drawLayer) drawLayer.setLatLngs(drawPoints);
    updateDraw();
  }
  if (action === "finish-draw") {
    if (!polygonValid(drawPoints)) {
      toast(
        t(
          "Draw at least three corners without crossing edges.",
          "অন্তত তিনটি কোণ দিন। সীমানার রেখা একে অপরকে পার হবে না।",
        ),
      );
      return;
    }
    state.boundaries[state.fieldId] = drawPoints.slice();
    persist();
    repaint();
    toast(
      t(
        "Boundary saved. The planner now uses your area.",
        "সীমানা সংরক্ষিত। পরিকল্পনায় নতুন আয়তন ব্যবহার হবে।",
      ),
    );
  }
  if (action === "export-archive") {
    download(
      `rangpur-${field().id}-monthly-2021-2025.csv`,
      csv(archive.fields[field().id].monthly),
      "text/csv;charset=utf-8",
    );
  }
  if (action === "export-days") {
    download(
      `rangpur-${field().id}-2024.csv`,
      csv(field().daily),
      "text/csv;charset=utf-8",
    );
  }
}
function fieldSubmit(form) {
  const d = new FormData(form);
  if (form.id === "field-search") {
    document.querySelector("#search-results").innerHTML = searchResults(
      String(d.get("query") || ""),
    );
    return true;
  }
  if (form.id === "profile-form") {
    setProfile(Object.fromEntries(d));
    close();
    repaint();
    toast(t("Field assumptions saved", "জমির তথ্য সংরক্ষিত"));
    return true;
  }
  return false;
}

export {
  home,
  seasonView,
  mountMap,
  disposeMap,
  setField,
  fieldAction,
  fieldSubmit,
  searchResults,
};
