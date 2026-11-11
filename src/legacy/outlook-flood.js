// Seasonal outlook (Chronos-Bolt on NASA POWER) and satellite water check
// (Prithvi-EO-2.0 on NASA HLS). Every number comes from
// public/data/outlook.json and public/data/flood-fields.json. Functions take
// the packs explicitly and return ''/null when the shape is missing or broken,
// so views render without these cards instead of failing.
import { nasaBadge, truth, tag, t, esc, num, monthName, panel } from "./ui.js";

const finite = (v) => typeof v === "number" && Number.isFinite(v);
// Outlook window in 0-based month indices: Nov, Dec, Jan.
const OUTLOOK_IDX = [10, 11, 0];
const NO_BETTER = [
  "No better than average — showing the usual instead",
  "গড়ের চেয়ে ভালো নয় — বদলে স্বাভাবিক মান দেখানো হচ্ছে",
];

function monthIndex(monthStr) {
  const m = Number(String(monthStr || "").slice(5, 7)) - 1;
  return Number.isInteger(m) && m >= 0 && m < 12 ? m : null;
}

export function outlookSite(pack, fieldId) {
  const site = pack?.sites?.[fieldId];
  return site && typeof site === "object" ? site : null;
}

function outlookVar(site, key) {
  const v = site?.[key];
  if (!v || typeof v !== "object" || !Array.isArray(v.months) || !v.months.length)
    return null;
  if (
    !v.months.every(
      (m) =>
        m &&
        typeof m.month === "string" &&
        monthIndex(m.month) !== null &&
        finite(m.p50) &&
        finite(m.climatology),
    )
  )
    return null;
  return v;
}

export function floodSite(pack, fieldId) {
  const site = pack?.fields?.[fieldId];
  return site && typeof site === "object" ? site : null;
}

// ---------------------------------------------------------------- verdicts

// p50 vs same-month climatology: >=1.2x above, <=0.8x below, else near.
export function rainVerdict(p50, clim) {
  if (!finite(p50) || !finite(clim)) return null;
  if (clim <= 0) return p50 > 0 ? "above" : "near";
  const ratio = p50 / clim;
  return ratio >= 1.2 ? "above" : ratio <= 0.8 ? "below" : "near";
}

function shortMonth(idx) {
  return monthName(idx, true);
}

export function backtestYears(pack) {
  const origins = pack?.backtest?.origins;
  if (!Array.isArray(origins) || origins.length !== 2) return "";
  const [a, b] = origins.map((o) => String(o).slice(0, 4));
  return /^\d{4}$/.test(a) && /^\d{4}$/.test(b) ? `${a}–${b}` : "";
}

// "27% closer than the monthly average in 2019–2025 tests" (h1 skill).
export function skillSentence(varKey, pack) {
  const skill = pack?.backtest?.skill_vs_climatology?.[varKey]?.h1;
  if (!finite(skill)) return null;
  const years = backtestYears(pack);
  const when = years ? ` in ${years} tests` : " in tests";
  const whenBn = years ? ` · ${years} সালের পরীক্ষায়` : " · পরীক্ষায়";
  if (skill <= 0)
    return t(`No better than the monthly average${when}`, `মাসিক গড়ের চেয়ে ভালো নয়${whenBn}`);
  const pct = num(Math.round(skill * 100));
  return t(
    `${pct}% closer than the monthly average${when}`,
    `মাসিক গড়ের চেয়ে ${pct}% কাছাকাছি${whenBn}`,
  );
}

function skillShort(varKey, pack) {
  const skill = pack?.backtest?.skill_vs_climatology?.[varKey]?.h1;
  if (!finite(skill) || skill <= 0) return null;
  const pct = num(Math.round(skill * 100));
  return t(`${pct}% closer in tests`, `${pct}% কাছাকাছি`);
}

// ---------------------------------------------------------------- fan chart

export function fanChartSVG(
  months,
  { beats = true, unit = "", color = "#517e8b", uid = "o1" } = {},
) {
  if (!Array.isArray(months) || !months.length) return "";
  const bandOK =
    beats && months.every((m) => finite(m?.p10) && finite(m?.p90));
  const showP50 = beats;
  const width = 320, height = 148, left = 36, right = 10, top = 12, bottom = 24;
  const n = months.length;
  const vals = months.flatMap((m) =>
    bandOK
      ? [m.p10, m.p50, m.p90, m.climatology]
      : showP50
        ? [m.p50, m.climatology]
        : [m.climatology],
  );
  const lo = Math.min(0, ...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const places = span < 0.2 ? 2 : span < 3 ? 1 : 0;
  const x = (i) =>
    n === 1 ? left + (width - left - right) / 2 : left + (i * (width - left - right)) / (n - 1);
  const y = (v) => top + ((hi - v) * (height - top - bottom)) / span;
  let svg = "";
  for (let j = 0; j <= 2; j++) {
    const v = lo + (span * j) / 2;
    svg += `<line class="grid" x1="${left}" y1="${y(v).toFixed(1)}" x2="${width - right}" y2="${y(v).toFixed(1)}"/><text x="${left - 5}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${num(v, places)}</text>`;
  }
  if (bandOK) {
    const points = [
      ...months.map((m, i) => `${x(i).toFixed(1)},${y(m.p90).toFixed(1)}`),
      ...months.map((m, i) => `${x(i).toFixed(1)},${y(m.p10).toFixed(1)}`).reverse(),
    ].join(" ");
    svg += `<polygon class="outlook-band" points="${points}"/>`;
  }
  if (showP50) {
    const path = months
      .map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.p50).toFixed(1)}`)
      .join(" ");
    svg += `<path class="outlook-p50" d="${path}" stroke="${esc(color)}"/>`;
  }
  const clim = months
    .map((m, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(m.climatology).toFixed(1)}`)
    .join(" ");
  svg += `<path class="outlook-clim" d="${clim}"/>`;
  months.forEach((m, i) => {
    const idx = monthIndex(m.month);
    svg += `<text x="${x(i).toFixed(1)}" y="${height - 6}" text-anchor="middle">${idx === null ? "?" : esc(shortMonth(idx))}</text>`;
  });
  const label = t("3-month outlook", "৩ মাসের আউটলুক");
  return `<div class="chart-legend"><span><i class="legend-dot" style="background:${esc(color)}"></i>${esc(t("Likely", "সম্ভাব্য"))}</span>${bandOK ? `<span><i class="legend-band"></i>${esc(t("Range", "পরিসর"))}</span>` : ""}<span><i class="legend-dash"></i>${esc(t("Usual for this month", "এই মাসে সাধারণত"))}</span><span>${esc(unit)}</span></div><div class="chart-frame"><svg class="chart outlook-fan" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}">${svg}</svg></div>`;
}

function outlookWindow(site) {
  const rain = outlookVar(site, "rain_mm_day");
  if (!rain) return "";
  const first = rain.months[0].month, last = rain.months.at(-1).month;
  return first === last ? first : `${first} – ${last}`;
}

function varFanBlock(varKey, label, unit, color, uid, pack, site) {
  const v = outlookVar(site, varKey);
  if (!v) return "";
  const beats = v.beats_climatology === true;
  const skill = skillSentence(varKey, pack);
  return `<h3>${esc(label)}</h3>${fanChartSVG(v.months, { beats, unit, color, uid })}<p class="note">${beats ? (skill ? esc(skill) + " " : "") + truth("MODELED", { source: "Chronos-Bolt outlook", date: outlookWindow(site) }) : esc(t(...NO_BETTER)) + " " + truth("MODELED", { source: "Same-month average", date: outlookWindow(site) })}</p>`;
}

function varCompactRow(varKey, label, unit, places, pack, site) {
  const v = outlookVar(site, varKey);
  if (!v) return "";
  const beats = v.beats_climatology === true;
  const names = v.months.map((m) => shortMonth(monthIndex(m.month)));
  const shown = v.months
    .map((m, i) => `${names[i]} ${num(beats ? m.p50 : m.climatology, places)}`)
    .join(" · ");
  const usual = v.months.map((m) => num(m.climatology, places)).join(" · ");
  const short = skillShort(varKey, pack);
  const body = beats
    ? `${esc(shown)} ${esc(unit)} (${t("usual", "সাধারণত")} ${esc(usual)})${short ? ` · ${esc(short)}` : ""}`
    : `${esc(t(...NO_BETTER))}: ${esc(usual)} ${esc(unit)}`;
  return `<p class="outlook-row"><b>${esc(label)}</b> ${body}</p>`;
}

const OUTLOOK_VAR_LABELS = {
  rain_mm_day: ["Rain", "বৃষ্টি"],
  t2m_c: ["Temperature", "তাপমাত্রা"],
  eto_mm_day: ["Evaporation (ETo)", "বাষ্পীভবন (ETo)"],
  gwetroot: ["Soil wetness", "মাটির আর্দ্রতা"],
};

function outlookDetails(pack) {
  const backtest = pack?.backtest;
  if (!pack || typeof pack !== "object") return "";
  const rows = [];
  if (typeof pack.model === "string" && pack.model)
    rows.push([t("Model", "মডেল"), pack.model]);
  if (typeof pack.source === "string" && pack.source)
    rows.push([t("Data", "তথ্য"), pack.source]);
  if (typeof pack.trained_through === "string" && pack.trained_through)
    rows.push([t("Trained through", "প্রশিক্ষণ পর্যন্ত"), pack.trained_through]);
  if (typeof backtest?.train_cutoff === "string" && backtest.train_cutoff)
    rows.push([t("Train cut-off", "প্রশিক্ষণের শেষ"), backtest.train_cutoff]);
  const origins = backtest?.origins;
  if (Array.isArray(origins) && origins.length === 2 && finite(backtest?.n)) {
    const fmt = (o) => {
      const idx = monthIndex(String(o).slice(0, 7));
      return idx === null ? String(o) : `${monthName(idx)} ${String(o).slice(0, 4)}`;
    };
    rows.push([
      t("Backtest", "পরীক্ষা"),
      t(
        `${num(backtest.n)} rolling starts, ${fmt(origins[0])} – ${fmt(origins[1])}`,
        `${num(backtest.n)}টি শুরুর বিন্দু, ${fmt(origins[0])} – ${fmt(origins[1])}`,
      ),
    ]);
  }
  const skill = backtest?.skill_vs_climatology;
  let table = "";
  if (skill && typeof skill === "object") {
    const lines = Object.keys(OUTLOOK_VAR_LABELS)
      .map((key) => {
        const s = skill[key];
        if (!s || !finite(s.h1) || !finite(s.h2) || !finite(s.h3)) return "";
        const pct = (v) => `${num(Math.round(v * 100))}%`;
        const variant = typeof s.model === "string" ? ` (${esc(s.model)})` : "";
        return `<tr><td>${esc(t(...OUTLOOK_VAR_LABELS[key]))}${variant}</td><td>${pct(s.h1)}</td><td>${pct(s.h2)}</td><td>${pct(s.h3)}</td></tr>`;
      })
      .join("");
    if (lines)
      table = `<div class="table-wrap"><table class="data-table"><thead><tr><th>${esc(t("Variable", "চলক"))}</th><th>${esc(t("Month 1", "মাস ১"))}</th><th>${esc(t("Month 2", "মাস ২"))}</th><th>${esc(t("Month 3", "মাস ৩"))}</th></tr></thead><tbody>${lines}</tbody></table></div><p class="note">${esc(t("Skill = how much closer than the monthly average (0% = same).", "দক্ষতা = মাসিক গড়ের চেয়ে কতটা কাছাকাছি (০% = সমান)।"))}</p>`;
  }
  if (!rows.length && !table) return "";
  return `<details class="rr-details"><summary>${esc(t("Model and test details", "মডেল ও পরীক্ষার তথ্য"))}</summary><dl class="field-meta">${rows.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>${table}${typeof backtest?.note === "string" && backtest.note ? `<p class="note">${esc(backtest.note)}</p>` : ""}</details>`;
}

export function outlookCard(fieldId, pack) {
  const site = outlookSite(pack, fieldId);
  if (!site || !outlookVar(site, "rain_mm_day")) return "";
  const window = outlookWindow(site);
  return panel(
    t("Outlook · next 3 months", "আউটলুক · পরের ৩ মাস"),
    `<div class="eyebrow">${esc(t("Experimental outlook · AI model on NASA POWER", "পরীক্ষামূলক আউটলুক · NASA POWER-এ AI মডেল"))}</div>`
      + varFanBlock("rain_mm_day", t("Rain", "বৃষ্টি"), "mm/day", "#517e8b", `r-${fieldId}`, pack, site)
      + varFanBlock("gwetroot", t("Soil wetness", "মাটির আর্দ্রতা"), t("index 0–1", "সূচক ০–১"), "#567f56", `w-${fieldId}`, pack, site)
      + varCompactRow("eto_mm_day", "ETo", "mm/day", 1, pack, site)
      + varCompactRow("t2m_c", t("Temp", "তাপমাত্রা"), "°C", 1, pack, site)
      + outlookDetails(pack),
    tag(t("Experimental", "পরীক্ষামূলক"), "amber") + nasaBadge("power", window || "2026"),
  );
}

// One line for a rotation card: rain verdict over the outlook months that
// overlap the rotation's winter season (the December crop's run).
export function outlookSeasonLine(fieldId, rotationMonths, pack) {
  const rain = outlookVar(outlookSite(pack, fieldId), "rain_mm_day");
  if (!rain || !Array.isArray(rotationMonths) || rotationMonths.length !== 12) return "";
  const winter = rotationMonths[11];
  const overlap = OUTLOOK_IDX.filter((i) => rotationMonths[i] === winter);
  if (!overlap.length) return "";
  const names = overlap.map(shortMonth);
  const span = names.length === 3 ? `${names[0]}–${names.at(-1)}` : names.join("–");
  if (rain.beats_climatology !== true)
    return `<span class="rotation-outlook-line">${esc(t(`Outlook: ${span} rain no better than average — using the usual`, `আউটলুক: ${span} — গড়ের চেয়ে ভালো নয়, স্বাভাবিক মান ব্যবহার করা হচ্ছে`))}</span>`;
  const byIdx = new Map(rain.months.map((m) => [monthIndex(m.month), m]));
  let p50 = 0, clim = 0;
  for (const i of overlap) {
    const m = byIdx.get(i);
    if (!m || !finite(m.p50) || !finite(m.climatology)) return "";
    p50 += m.p50;
    clim += m.climatology;
  }
  const verdict = rainVerdict(p50, clim);
  if (!verdict) return "";
  const word = { above: ["above", "বেশি"], near: ["near", "কাছাকাছি"], below: ["below", "কম"] }[verdict];
  return `<span class="rotation-outlook-line">${esc(t(`Outlook: ${span} rain likely ${word[0]} usual`, `আউটলুক: ${span} বৃষ্টি স্বাভাবিকের চেয়ে ${word[1]} হতে পারে`))} ${truth("MODELED", { source: "Chronos-Bolt outlook", date: span })}</span>`;
}

// ---------------------------------------------------------------- flood

export function floodCounts(site) {
  const years =
    site?.summary && typeof site.summary === "object"
      ? Object.values(site.summary)
      : [];
  let found = 0, usable = 0, fromSummary = false;
  for (const s of years) {
    if (finite(s?.scenes_found) && finite(s?.usable)) {
      found += s.scenes_found;
      usable += s.usable;
      fromSummary = true;
    }
  }
  if (!fromSummary) {
    usable = Array.isArray(site?.scenes) ? site.scenes.length : 0;
    found = usable + (Array.isArray(site?.skipped) ? site.skipped.length : 0);
  }
  return { found, usable };
}

export function floodTotals(pack) {
  let found = 0, usable = 0;
  const fields = pack?.fields;
  if (!fields || typeof fields !== "object") return { found, usable };
  for (const site of Object.values(fields)) {
    if (!site || typeof site !== "object") continue;
    const c = floodCounts(site);
    found += c.found;
    usable += c.usable;
  }
  return { found, usable };
}

function floodYears(site) {
  if (site?.summary && typeof site.summary === "object") {
    const years = Object.keys(site.summary)
      .filter((y) => /^\d{4}$/.test(y))
      .sort();
    if (years.length) return years;
  }
  const dates = [...(site?.scenes || []), ...(site?.skipped || [])]
    .map((s) => String(s?.date || "").slice(0, 4))
    .filter((y) => /^\d{4}$/.test(y));
  return [...new Set(dates)].sort();
}

// "2024–25" from ["2024","2025"]; full range otherwise.
function yearSpan(site) {
  const years = floodYears(site);
  if (!years.length) return "";
  if (years.length === 2 && years[1] === String(Number(years[0]) + 1))
    return `${years[0]}–${years[1].slice(2)}`;
  return years.length === 1 ? years[0] : `${years[0]}–${years.at(-1)}`;
}

export function floodHeadline(fieldId, pack) {
  const site = floodSite(pack, fieldId);
  if (!site) return null;
  const scenes = Array.isArray(site.scenes) ? site.scenes : [];
  const { usable } = floodCounts(site);
  const span = yearSpan(site);
  if (!span) return null;
  const buf = scenes
    .map((s) => s?.water_fraction_buffer300m)
    .filter((v) => finite(v));
  if (!usable || !scenes.length || !buf.length)
    return {
      level: "noclear",
      en: `No clear satellite view of this field in the ${span} monsoons`,
      bn: `${span} বর্ষায় এই জমির পরিষ্কার স্যাটেলাইট ছবি নেই`,
    };
  const maxBuf = Math.max(...buf);
  if (maxBuf < 0.01)
    return {
      level: "none",
      en: `No standing water seen on clear days in the ${span} monsoons`,
      bn: `${span} বর্ষায় পরিষ্কার দিনে দাঁড়ানো পানি দেখা যায়নি`,
    };
  if (maxBuf < 0.05)
    return {
      level: "low",
      en: `A little water seen on a few clear days in the ${span} monsoons`,
      bn: `${span} বর্ষায় কয়েকটি পরিষ্কার দিনে অল্প পানি দেখা গেছে`,
    };
  return {
    level: "some",
    en: `Standing water seen on clear days in the ${span} monsoons`,
    bn: `${span} বর্ষায় পরিষ্কার দিনে দাঁড়ানো পানি দেখা গেছে`,
  };
}

export function floodPeaks(site) {
  const scenes = Array.isArray(site?.scenes) ? site.scenes : [];
  let bufMax = null, bufDate = "", boxMax = null;
  for (const s of scenes) {
    if (finite(s?.water_fraction_buffer300m) && (bufMax === null || s.water_fraction_buffer300m > bufMax)) {
      bufMax = s.water_fraction_buffer300m;
      bufDate = typeof s.date === "string" ? s.date : "";
    }
    if (finite(s?.water_fraction_box) && (boxMax === null || s.water_fraction_box > boxMax))
      boxMax = s.water_fraction_box;
  }
  return { bufMax, bufDate, boxMax };
}

const SEASON_START = [6, 1]; // Jun 1
const MONTH_DAYS = [30, 31, 31, 30, 31]; // Jun..Oct

function seasonDay(dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ""));
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  if (month < 6 || month > 10 || day < 1) return null;
  let offset = 0;
  for (let i = 0; i < month - SEASON_START[0]; i++) offset += MONTH_DAYS[i];
  offset += day - 1;
  return offset > 152 ? null : offset;
}

export function floodTimelineSVG(site, { uid = "f1" } = {}) {
  const years = floodYears(site);
  if (!years.length) return "";
  const width = 320, rowH = 30, left = 40, right = 10, top = 8;
  const height = top + years.length * rowH + 20;
  const x = (offset) => left + (offset * (width - left - right)) / 152;
  let svg = "";
  years.forEach((year, r) => {
    const cy = top + r * rowH + rowH / 2;
    svg += `<line class="grid" x1="${left}" y1="${cy}" x2="${width - right}" y2="${cy}"/><text x="${left - 6}" y="${cy + 4}" text-anchor="end">${esc(year)}</text>`;
    const rows = [
      ...(Array.isArray(site?.skipped) ? site.skipped : []),
      ...(Array.isArray(site?.scenes) ? site.scenes : []),
    ];
    for (const s of rows) {
      if (String(s?.date || "").slice(0, 4) !== year) continue;
      const offset = seasonDay(s?.date);
      if (offset === null) continue;
      const cx = x(offset).toFixed(1);
      if (finite(s?.water_fraction_box)) {
        const pct = (s.water_fraction_box * 100).toFixed(1);
        svg += `<circle class="flood-clear" cx="${cx}" cy="${cy}" r="3.6"><title>${esc(s.date)} · ${t("water", "পানি")} ${pct}% ${t("in 2 km", "২ কিমিতে")}</title></circle>`;
      } else {
        svg += `<circle class="flood-cloud" cx="${cx}" cy="${cy}" r="2.4"><title>${esc(String(s?.date || ""))} · ${esc(t("cloudy — skipped", "মেঘলা — বাদ"))}</title></circle>`;
      }
    }
  });
  svg += `<text x="${left}" y="${height - 4}">${esc(t("Jun", "জুন"))}</text><text x="${width - right}" y="${height - 4}" text-anchor="end">${esc(t("Oct", "অক্টো"))}</text>`;
  const label = t("Monsoon water timeline", "বর্ষায় পানির সময়রেখা");
  return `<div class="chart-legend"><span><i class="legend-dot flood-dot-clear"></i>${esc(t("Clear day", "পরিষ্কার দিন"))}</span><span><i class="legend-hollow"></i>${esc(t("Cloudy (skipped)", "মেঘলা (বাদ)"))}</span></div><div class="chart-frame"><svg class="chart flood-timeline" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)} ${esc(uid)}">${svg}</svg></div>`;
}

function floodSureDetails(pack) {
  const test = pack?.testMetrics;
  const score =
    finite(test?.IoU_water) && finite(test?.published?.IoU_water)
      ? `<p>${esc(t("Test score", "পরীক্ষার ফল"))}: ${esc(t("water IoU", "পানির IoU"))} ${num(test.IoU_water, 1)} (${t("published", "প্রকাশিত")} ${num(test.published.IoU_water, 1)})</p>`
      : "";
  return `<details class="rr-details"><summary>${esc(t("How sure is this?", "কতটা নিশ্চিত?"))}</summary><ul class="check-list"><li>${esc(t("Cloudy days were skipped, so floods on cloudy days are missed.", "মেঘলা দিন বাদ পড়েছে, তাই মেঘলা দিনের বন্যা ধরা পড়েনি।"))}</li><li>${esc(t("30 m pixels miss water in small plots and channels.", "৩০ মিটার পিক্সেলে ছোট জমি ও নালার পানি ধরা পড়ে না।"))}</li><li>${esc(t("Water includes ponds and paddy — not flood alone.", "পানির মধ্যে পুকুর ও ধানক্ষেতও আছে — শুধু বন্যা নয়।"))}</li></ul>${score}<p><a class="source-link" href="docs/prithvi-flood-MODEL_CARD.md">${esc(t("Model card ↗", "মডেল কার্ড ↗"))}</a></p></details>`;
}

export function floodCard(fieldId, pack) {
  const site = floodSite(pack, fieldId);
  if (!site) return "";
  const { found, usable } = floodCounts(site);
  if (!found) return "";
  const totals = floodTotals(pack);
  const headline = floodHeadline(fieldId, pack);
  const peaks = floodPeaks(site);
  const years = floodYears(site);
  const period = years.length ? `${years[0]}–${years.at(-1)}` : "2024–2025";
  const near =
    finite(peaks.bufMax) && peaks.bufMax > 0
      ? t(
          `Most water near the field: ${num(peaks.bufMax * 100, 1)}% (${peaks.bufDate})`,
          `জমির কাছে সবচেয়ে বেশি পানি: ${num(peaks.bufMax * 100, 1)}% (${peaks.bufDate})`,
        )
      : t("No water near the field on clear days", "পরিষ্কার দিনে জমির কাছে পানি ছিল না");
  const around =
    finite(peaks.boxMax) && peaks.boxMax > 0
      ? t(
          ` · Most in the 2 km around: ${num(peaks.boxMax * 100, 1)}%`,
          ` · ২ কিমির মধ্যে সবচেয়ে বেশি: ${num(peaks.boxMax * 100, 1)}%`,
        )
      : "";
  const counts = t(
    `${num(usable)} of ${num(found)} scenes were clear here (${num(totals.usable)} of ${num(totals.found)} scenes were clear across all fields)`,
    `এখানে ${num(found)}টির মধ্যে ${num(usable)}টি পরিষ্কার ছিল (সব জমি মিলিয়ে ${num(totals.found)}টির মধ্যে ${num(totals.usable)}টি)`,
  );
  return panel(
    t("Satellite water check (NASA Prithvi AI)", "স্যাটেলাইটে পানির যাচাই (NASA Prithvi AI)"),
    `${headline ? `<p class="flood-headline">${esc(t(headline.en, headline.bn))}</p>` : ""}<p>${truth("MODELED", { source: "Prithvi-EO-2.0 on HLS", date: period, cell: "30m" })}</p><p class="note">${esc(near)}${esc(around)}</p>${floodTimelineSVG(site, { uid: `f-${fieldId}` })}<p class="note">${esc(counts)}</p>${floodSureDetails(pack)}`,
    tag(t("Experimental", "পরীক্ষামূলক"), "amber") + nasaBadge(["hls", "prithvi"], period),
  );
}

// ---------------------------------------------------------------- Planty + plan context (short strings, fit the worker whitelist)

function outlookSpan(site) {
  const rain = outlookVar(site, "rain_mm_day");
  if (!rain) return "";
  const first = monthIndex(rain.months[0].month), last = monthIndex(rain.months.at(-1).month);
  if (first === null || last === null) return "";
  return first === last ? shortMonth(first) : `${shortMonth(first)}–${shortMonth(last)}`;
}

function spanVerdict(site, key) {
  const v = outlookVar(site, key);
  if (!v || v.beats_climatology !== true) return null;
  let p50 = 0, clim = 0;
  for (const m of v.months) {
    p50 += m.p50;
    clim += m.climatology;
  }
  return rainVerdict(p50, clim);
}

export function outlookSummaryLine(fieldId, pack, lang = "en") {
  const site = outlookSite(pack, fieldId);
  if (!site) return null;
  const rain = spanVerdict(site, "rain_mm_day");
  const wet = spanVerdict(site, "gwetroot");
  if (!rain && !wet) return null;
  const span = outlookSpan(site) || "Nov–Jan";
  const word = (v) => ({ above: "above", near: "near", below: "below" })[v];
  const wordBn = (v) => ({ above: "বেশি", near: "কাছাকাছি", below: "কম" })[v];
  const parts = [];
  const partsBn = [];
  if (rain) {
    parts.push(`rain ${word(rain)} usual`);
    partsBn.push(`বৃষ্টি স্বাভাবিকের চেয়ে ${wordBn(rain)}`);
  }
  if (wet) {
    parts.push(`soil ${word(wet)} usual`);
    partsBn.push(`মাটি স্বাভাবিকের চেয়ে ${wordBn(wet)}`);
  }
  return lang === "bn"
    ? `পরীক্ষামূলক আউটলুক ${span}: ${partsBn.join(", ")}।`
    : `Experimental outlook ${span}: ${parts.join(", ")}.`;
}

export function floodSummaryLine(fieldId, pack, lang = "en") {
  const site = floodSite(pack, fieldId);
  if (!site) return null;
  const { usable } = floodCounts(site);
  const span = yearSpan(site);
  if (!span) return null;
  if (!usable)
    return lang === "bn"
      ? `${span} বর্ষায় পরিষ্কার স্যাটেলাইট ছবি নেই।`
      : `No clear satellite view in the ${span} monsoons.`;
  const { bufMax } = floodPeaks(site);
  if (finite(bufMax) && bufMax >= 0.01) {
    const pct = `${num(bufMax * 100, 1)}%`;
    return lang === "bn"
      ? `${span}: ${num(usable)}টি পরিষ্কার দিনে জমির কাছে ${pct} পর্যন্ত পানি (পরীক্ষামূলক AI)।`
      : `Water up to ${pct} near the field on ${num(usable)} clear days, ${span} (experimental AI).`;
  }
  return lang === "bn"
    ? `${span} বর্ষায় ${num(usable)}টি পরিষ্কার দিনে দাঁড়ানো পানি নেই (পরীক্ষামূলক AI)।`
    : `No standing water on ${num(usable)} clear days, ${span} monsoons (experimental AI).`;
}

export function outlookPlanHint(fieldId, pack) {
  const rain = outlookVar(outlookSite(pack, fieldId), "rain_mm_day");
  if (!rain || rain.beats_climatology !== true) return null;
  const nov = rain.months.find((m) => m.month.endsWith("-11"));
  if (!nov) return null;
  return { novRain: rainVerdict(nov.p50, nov.climatology) };
}
