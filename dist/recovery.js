import {
  state,
  agronomy,
  archive,
  persist,
  t,
  esc,
  num,
  monthName,
  fieldName,
  setProfile,
  icon,
  button,
  goButton,
  header,
  panel,
  tag,
  chips,
  input,
  select,
  sources,
  toast,
  repaint,
  modal,
  download,
} from "./ui.js";
import { mean } from "./engine.js";
import { setPlantCrop } from "./planner.js";
import {
  defaultAssessment,
  validDate,
  buildRecovery,
} from "./recovery-engine.js";
import {
  guides,
  phases,
  crops,
  reasons,
  statuses,
  examples,
} from "./recovery-data.js";

const word = (pair) => t(...pair);
const hazard = () => (guides[state.hazard] ? state.hazard : "flood");
const key = () => state.fieldId + ":" + hazard();
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const draft = () => ({
  ...defaultAssessment(today()),
  ...state.recoveryDrafts?.[key()],
});
const result = () => buildRecovery(hazard(), draft(), crops);
const date = (s) =>
  validDate(s)
    ? new Intl.DateTimeFormat(state.lang === "bn" ? "bn-BD" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(s + "T12:00:00Z"))
    : "—";
const opts = (rows) => rows.map(([id, en, bn]) => [id, t(en, bn)]);
const choice = (label, name, rows, a) =>
  select(word(label), "rr-" + name, opts(rows), a[name]);
function sketch(h) {
  const line =
    h === "flood"
      ? '<path d="M6 65q12-10 24 0t24 0t24 0t24 0t24 0M6 79q12-10 24 0t24 0t24 0t24 0M48 56V35l22-17 22 17v21M62 53V40h15v13"/><path d="m30 15-4 10m76-12-4 10m14 9-4 10"/>'
      : h === "drought"
        ? '<circle cx="98" cy="25" r="12"/><path d="M98 4v5m0 32v5m-21-21h5m32 0h5M8 74l25-10 26 4 23-8 39 13M32 65l-4 17m32-14 9 15m16-23 7 22M45 60V32m0 13q-20-16-20-8 0 13 20 12m0-8q18-15 18-7 0 11-18 11"/>'
        : '<path d="M66 8c12 24-14 24-4 43 10-3 14-11 12-22 30 25 24 55-6 55-32 0-41-26-17-48-1 13 4 18 8 21-10-24 5-29 7-49Z"/><path d="M63 83c-13-15-2-23 5-34 2 13 17 17 3 34"/>';
  return `<svg class="rr-sketch" viewBox="0 0 132 94" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${line}</svg>`;
}
function hazardCards() {
  return `<div class="rr-hazards">${Object.entries(guides)
    .map(
      ([id, g]) =>
        `<button type="button" data-action="rr-hazard" data-value="${id}" class="rr-hazard ${id} ${hazard() === id ? "selected" : ""}" aria-pressed="${hazard() === id}">${sketch(id)}<span><strong>${word(g.name)}</strong><small>${word(g.caption)}</small></span><span class="rr-radio">${hazard() === id ? icon("check", 14) : ""}</span></button>`,
    )
    .join("")}</div>`;
}
function assessment(a) {
  return `<section class="panel"><div class="panel-header"><h2>${t("1. What is happening?", "১. এখন কী অবস্থা?")}</h2>${tag(a.example ? t("Worked example", "নমুনা পরিস্থিতি") : t("Your observations", "আপনার পর্যবেক্ষণ"), a.example ? "amber" : "")}</div><div class="panel-body">
  <div class="form-grid">
  ${choice(["Recovery stage", "পুনরুদ্ধারের ধাপ"], "phase", phases, a)}
  ${input(t("Assessment date", "যাচাইয়ের তারিখ"), "rr-date", a.date, "required", "date")}
  </div>
  ${
    a.phase === "ready"
      ? `<div class="rr-check-title">${t("Check this plot before choosing a crop", "ফসল বাছাইয়ের আগে জমি যাচাই")}</div><div class="form-grid">
  ${choice(
    ["Ground condition", "জমির অবস্থা"],
    "ground",
    [
      ["unknown", "Not checked yet", "এখনও দেখা হয়নি"],
      ["dry", "Too dry to establish a crop", "বীজ গজানোর জন্য বেশি শুকনো"],
      ["wet", "Waterlogged or unstable", "জলাবদ্ধ বা অস্থির"],
      ["workable", "Stable and suitably moist", "স্থির ও উপযুক্ত আর্দ্র"],
    ],
    a,
  )}
  ${choice(
    ["The existing crop", "বর্তমান ফসল"],
    "standing",
    [
      ["unknown", "Not assessed", "যাচাই হয়নি"],
      [
        "recovering",
        "May recover · keep for assessment",
        "বাঁচতে পারে · আগে যাচাই",
      ],
      ["free", "Area available for a new crop", "নতুন ফসলের জন্য খালি"],
    ],
    a,
  )}
  ${choice(
    ["Water for this crop", "এই ফসলের পানি"],
    "water",
    [
      ["unknown", "Supply not confirmed", "ব্যবস্থা নিশ্চিত নয়"],
      ["none", "No reliable supply", "নির্ভরযোগ্য ব্যবস্থা নেই"],
      [
        "limited",
        "Limited · covers critical stages",
        "সীমিত · জরুরি সময়ের জন্য আছে",
      ],
      ["dependable", "Reliable supply confirmed", "নির্ভরযোগ্য ব্যবস্থা আছে"],
    ],
    a,
  )}
  ${
    hazard() !== "drought"
      ? choice(
          ["Contamination check", "দূষণ যাচাই"],
          "exposure",
          [
            ["unknown", "Not checked yet", "এখনও দেখা হয়নি"],
            [
              "suspected",
              "Possible contamination · review needed",
              "দূষণের আশঙ্কা · যাচাই দরকার",
            ],
            [
              "clear",
              "Local review found no likely source",
              "স্থানীয় যাচাইয়ে উৎস মেলেনি",
            ],
            [
              "reviewed",
              "Qualified review cleared food growing",
              "বিশেষজ্ঞ খাদ্যফসলের ছাড়পত্র দিয়েছেন",
            ],
          ],
          a,
        )
      : ""
  }
  ${input(t("Extra preparation days", "প্রস্তুতির অতিরিক্ত দিন"), "rr-delay", a.delay, 'min="0" max="180" step="1" required')}
  ${input(t("Next crop must start by (optional)", "পরের ফসলের শেষ শুরুর দিন (ঐচ্ছিক)"), "rr-nextDate", a.nextDate, "", "date")}
  </div><details class="rr-details" ${state.recoveryAmanOpen ? "open" : ""}><summary>${t("Planning Aman? Check land and seedlings", "আমন ভাবছেন? জমি ও চারা মিলিয়ে নিন")}</summary><div class="form-grid section-space">
  ${choice(
    ["Seedlings available at transplanting", "রোপণের সময়ে পাওয়া চারা"],
    "seedlings",
    [
      ["unknown", "Not confirmed", "নিশ্চিত নয়"],
      [
        "short",
        "BRRI dhan71 · healthy 20–25-day stock",
        "ব্রি ধান৭১ · ২০–২৫ দিনের সুস্থ চারা",
      ],
      [
        "sensitive",
        "Late Aman · nursery sown by 15 Aug",
        "দেরির আমন · ১৫ আগস্টের মধ্যে বপন",
      ],
    ],
    a,
  )}
  ${choice(
    ["Land class", "জমির শ্রেণি"],
    "land",
    [
      ["unknown", "Not confirmed", "নিশ্চিত নয়"],
      ["high", "High / medium-high land", "উঁচু / মাঝারি উঁচু"],
      ["low", "Low land / other", "নিচু / অন্য"],
    ],
    a,
  )}
  </div></details>`
      : `<p class="note rr-stage-note">${t("Follow the action card. When access is confirmed safe, select the final stage to check field readiness and planting dates.", "করণীয় কার্ড অনুসরণ করুন। প্রবেশ নিরাপদ হলে শেষ ধাপ বেছে জমি ও বপনের সময় যাচাই করুন।")}</p>`
  }
  <div class="rr-form-footer">${button(t("Try a worked example", "নমুনা দেখুন"), "rr-example", "small", "note")}${button(t("Start my assessment", "নিজের জমি যাচাই"), "rr-reset", "ghost small")}</div>
  </div></section>`;
}
function actions(a) {
  const g = guides[hazard()],
    index = Math.max(
      0,
      phases.findIndex((p) => p[0] === a.phase),
    );
  return `<aside class="rr-now ${hazard()}"><div class="eyebrow">${t("YOUR NEXT STEP", "এখন করণীয়")}</div><h2>${word(phases[index].slice(1))}</h2><p class="rr-action-text">${word(g.actions[index])}</p>
  ${hazard() === "fire" && a.phase === "active" ? `<a class="button rr-emergency" href="tel:102">${icon("flame")}${t("Fire Service · 102", "ফায়ার সার্ভিস · ১০২")}</a>` : ""}
  <div class="rr-next-season"><span>${icon("rotations", 17)}</span><div><b>${t("Make the next season stronger", "পরের মৌসুমের প্রস্তুতি")}</b><p>${word(g.improve)}</p></div></div>
  <div class="rr-official"><a href="https://www.bamis.gov.bd/en/bulletin/district/" target="_blank" rel="noopener">${t("Check current BAMIS advice", "বর্তমান বামিস নির্দেশনা")} ↗</a>${hazard() === "flood" ? '<a href="https://ffwc.gov.bd/" target="_blank" rel="noopener">FFWC · ' + t("flood information", "বন্যার তথ্য") + " ↗</a>" : ""}</div><details class="rr-details"><summary>${t("Guidance sources", "নির্দেশনার সূত্র")}</summary><p>${sources(g.sources)}</p></details></aside>`;
}
function calendar(c) {
  const start = +c.start.slice(5, 7) - 1,
    end = +c.end.slice(5, 7) - 1;
  return `<div class="rr-months" aria-label="${esc(t("Months with a planting window", "বপনের সময়ের মাস"))}">${Array.from({ length: 12 }, (_, i) => `<span class="${i >= start && i <= end ? "season" : ""}">${esc(monthName(i, true))}</span>`).join("")}</div>`;
}
function cropCard(c) {
  return `<article class="rr-crop ${c.available ? "available" : ""}"><div class="rr-crop-head"><div><div class="eyebrow">${esc(c.variety)}</div><h3>${word(c.name)}</h3></div>${tag(word(statuses[c.status]), c.available ? "green" : "amber")}</div>
  <p class="note">${word(c.why)}</p>${calendar(c)}
  <dl class="rr-dates"><div><dt>${word(c.verb)} · ${t("reference window", "তথ্যসূত্রের সময়")}</dt><dd>${date(c.start)} – ${date(c.end)}</dd></div>
  ${c.available ? `<div><dt>${t("Fits your entered conditions", "আপনার দেওয়া শর্ত মিললে")}</dt><dd>${date(c.first)} – ${date(c.last)}</dd></div>` : ""}
  <div><dt>${t("Harvest if planted on", "এই দিনে লাগালে সম্ভাব্য ফসল তোলা")} ${date(c.first)}</dt><dd>${c.harvest ? `${date(c.harvest[0])} – ${date(c.harvest[1])}` : t("Confirm locally before scheduling the next crop", "পরের ফসলের আগে স্থানীয়ভাবে নিশ্চিত করুন")}</dd></div></dl>
  <p class="rr-crop-check">${word(c.check)}</p>
  ${
    !c.available
      ? `<p class="notice amber">${word(
          {
            seedlings: [
              "Confirm the required seedlings at this window.",
              "এই সময়ে উপযুক্ত চারা নিশ্চিত করুন।",
            ],
            land: [
              "This option requires confirmed high or medium-high land.",
              "এই জাতের জন্য উঁচু বা মাঝারি উঁচু জমি নিশ্চিত হতে হবে।",
            ],
            duration: [
              "Harvest duration is uncertain, so the next-crop deadline cannot be checked.",
              "কাটার সময় অনিশ্চিত, তাই পরের ফসলের সময় মেলানো যায়নি।",
            ],
            deadline: [
              "This option cannot be shown to finish before your next-crop date.",
              "আপনার পরের ফসলের তারিখের আগে শেষ হবে বলে দেখানো যাচ্ছে না।",
            ],
            later: [
              "This window is over six months away. Reassess closer to the season.",
              "এই সময় ছয় মাসের বেশি পরে। মৌসুমের কাছে আবার যাচাই করুন।",
            ],
          }[c.status],
        )}</p>`
      : ""
  }
  <details class="rr-details"><summary>${t("Why these dates?", "এই সময় কেন?")}</summary><p class="note">${word(c.basis)}</p><p>${sources(c.sources)}</p></details>
  ${c.available ? button(t("Estimate planting material", "বীজ বা চারার হিসাব"), "rr-layout", "small", "planner", c.id) : ""}</article>`;
}
function planting(a, r) {
  const fits = r.options.filter((c) => c.available),
    others = r.options.filter((c) => !c.available);
  return `<section class="rr-section" id="recovery-calendar"><div class="section-label"><div><div class="eyebrow">${t("SEASONAL RECOVERY", "মৌসুম মিলিয়ে পুনরুদ্ধার")}</div><h2>${t("2. When and what to plant", "২. কখন কী লাগাবেন")}</h2></div>${tag(t("Rules + published guidance", "নিয়ম ও প্রকাশিত নির্দেশনা"))}</div>
  ${
    r.reasons.length
      ? `<div class="rr-hold">${icon("recovery", 30)}<div><h3>${t("Resolve these checks first", "আগে এই বিষয়গুলো নিশ্চিত করুন")}</h3><ul>${r.reasons.map((id) => `<li>${word(reasons[id])}</li>`).join("")}</ul><p class="note">${t("The crop calendar will open here when the checks are complete.", "যাচাই সম্পূর্ণ হলে এখানে ফসলের সময় দেখা যাবে।")}</p></div></div>`
      : `<p class="note">${t("Earliest assumed field readiness", "জমি প্রস্তুত হওয়ার প্রথম অনুমিত দিন")} <b>${date(r.ready)}</b>. ${t("Compare alternatives for this plot with your extension officer. Recheck field conditions at the chosen window. Harvest dates are arithmetic estimates, not forecasts.", "এই জমির বিকল্প ফসলগুলো কৃষি কর্মকর্তার সঙ্গে তুলনা করুন। বাছা সময়ে জমি আবার যাচাই করুন। কাটার তারিখ গাণিতিক হিসাব, পূর্বাভাস নয়।")}</p>
  ${fits.length ? `<div class="rr-crop-grid">${fits.map(cropCard).join("")}</div>` : `<div class="notice amber">${t("No option clears every check in the next six months. Keep suitable soil cover and review the timing or constraints with your extension officer.", "আগামী ছয় মাসে সব শর্ত মিলে এমন সুযোগ নেই। উপযুক্ত মাটির আচ্ছাদন রাখুন এবং সময় ও শর্ত কৃষি কর্মকর্তার সঙ্গে দেখুন।")}</div>`}
  ${others.length ? `<details class="rr-details rr-other"><summary>${t("Other seasons and options needing review", "অন্য মৌসুম ও যাচাই দরকার এমন সুযোগ")} (${num(others.length)})</summary><div class="rr-crop-grid section-space">${others.map(cropCard).join("")}</div></details>` : ""}
  <p class="note rr-method">${t("Archived crop advisories are used as reference calendars. Approximate dates repeat annually. The tool checks your entered readiness and next-crop deadline; it does not predict the next flood, fire, rainfall or yield.", "পুরনো ফসলের নির্দেশনা সময়ের তথ্যসূত্র। আনুমানিক সময় প্রতিবছর ধরা হয়। আপনার দেওয়া প্রস্তুতি ও পরের ফসলের তারিখ মেলানো হয়। পরের বন্যা, আগুন, বৃষ্টি বা ফলনের পূর্বাভাস দেওয়া হয় না।")}</p>`
  }</section>`;
}
function trees(a, r) {
  let body = "";
  if (r.reasons.length)
    body = `<p>${t("Complete safe-access and field checks first. Record existing vegetation before choosing trees or disturbing the soil.", "আগে নিরাপদ প্রবেশ ও জমি যাচাই করুন। গাছ বাছাই বা মাটি নাড়ার আগে আগের গাছপালা লিখে রাখুন।")}</p>`;
  else if (hazard() === "fire")
    body = `<h3>${t("Protect regrowth first", "আগে স্বাভাবিক পুনরুজ্জীবন রক্ষা")}</h3><p class="note">${t("Some surviving roots and shoots may recover. Check erosion, past habitat and repeat-fire risk with forestry or extension staff. If regeneration is insufficient, choose locally appropriate native material with an agreed moisture and aftercare window.", "বেঁচে থাকা শিকড় ও কুঁড়ি থেকে গাছ ফিরতে পারে। বন বা কৃষি কর্মকর্তার সঙ্গে ক্ষয়, আগের পরিবেশ ও আবার আগুনের ঝুঁকি দেখুন। যথেষ্ট গাছ না ফিরলে স্থানীয় উপযোগী দেশি প্রজাতি, আর্দ্রতার সময় ও পরিচর্যা ঠিক করুন।")}</p>${sources(["rr-regrow", "fao-regeneration", "rr-soil"])}`;
  else {
    const ids =
      a.edge === "wet" && hazard() === "flood"
        ? ["hijol", "koroch"]
        : a.edge === "dry"
          ? ["mango"]
          : [];
    body =
      choice(
        [
          "What kind of edge are you restoring?",
          "কেমন জমির ধার পুনরুদ্ধার করবেন?",
        ],
        "edge",
        [
          ["none", "Choose a setting", "জমির ধরন বাছুন"],
          [
            "wet",
            "Stable seasonal freshwater margin",
            "স্থির মৌসুমি মিঠাপানির ধার",
          ],
          [
            "dry",
            "Stable, drained homestead / farm edge",
            "স্থির, পানি নামে এমন বাড়ি / ক্ষেতের ধার",
          ],
        ],
        a,
      ) +
      (ids.length
        ? ids
            .map((id) => {
              const c = agronomy.resilience.candidates.find((x) => x.id === id);
              return `<article class="rr-tree"><h3>${t(c.label, c.bn)} <small>${esc(c.scientificName)}</small></h3><p class="note">${t(c.siteFit, c.siteFitBn)}</p><p><b>${t("When", "কখন")}</b> · ${t(c.window, c.windowBn)}</p><p class="note">${t(c.evidenceArea, c.evidenceAreaBn)}</p>${sources(c.sourceIds)}</article>`;
            })
            .join("")
        : `<p class="note">${t("Choose the setting to see conditional tree options. Confirm land use, bank stability, species fit and permission locally. No tree can guarantee protection from a disaster.", "জমির ধরন বেছে শর্তসাপেক্ষ গাছ দেখুন। ভূমির ব্যবহার, পাড়ের স্থিরতা, প্রজাতি ও অনুমতি স্থানীয়ভাবে নিশ্চিত করুন। কোনো গাছ দুর্যোগ থেকে রক্ষার নিশ্চয়তা দেয় না।")}</p>`);
  }
  return panel(
    t(
      "3. Restore soil, borders and trees",
      "৩. মাটি, জমির ধার ও গাছ ফিরিয়ে আনুন",
    ),
    body,
    icon("tree", 23),
  );
}
function evidence(a) {
  const m = validDate(a.date) ? a.date.slice(5, 7) : "11",
    rows = archive.fields[state.fieldId].monthly.filter((x) =>
      x.month.endsWith("-" + m),
    );
  const rain = rows.map((x) => x.rainGpm).filter(Number.isFinite),
    wet = rows.map((x) => x.rootWetness).filter(Number.isFinite);
  return `<details class="rr-details rr-evidence"><summary>${t("What can the NASA record tell us here?", "নাসার তথ্য এখানে কী বলতে পারে?")}</summary><div class="rr-evidence-grid"><div><span class="eyebrow">2021–2025 · ${monthName(+m - 1)}</span><h3>${num(Math.min(...rain), 1)}–${num(Math.max(...rain), 1)} mm</h3><p class="note">${t("Monthly IMERG rain range across five years", "পাঁচ বছরের মাসিক IMERG বৃষ্টির সীমা")}</p></div><div><span class="eyebrow">NASA POWER · GWETROOT</span><h3>${num(mean(wet), 2)}</h3><p class="note">${t("Mean regional root-zone wetness index · 0–1", "আঞ্চলিক শিকড়ের আর্দ্রতা সূচকের গড় · ০–১")}</p></div></div><p class="note">${t("Historical regional context. These data cannot establish today’s field moisture, safe access, contamination or a replanting date. Add a local observation and check the latest advisory.", "এগুলো এলাকার পুরনো তথ্য। আজকের আর্দ্রতা, নিরাপদ প্রবেশ, দূষণ বা পুনরায় বপনের দিন এগুলো দিয়ে নিশ্চিত হয় না। স্থানীয় পর্যবেক্ষণ যোগ করুন ও বর্তমান নির্দেশনা দেখুন।")}</p>${sources(["gpm", "power"])} ${goButton(t("Log a field observation", "মাঠের তথ্য লিখুন"), "research", "small")}</details>`;
}
function snapshot() {
  const a = draft(),
    r = result();
  return {
    schema: "ropon-recovery-1",
    savedAt: new Date().toISOString(),
    fieldId: state.fieldId,
    fieldName: fieldName(),
    hazard: hazard(),
    assessment: a,
    restoration:
      r.reasons.length || hazard() === "fire"
        ? []
        : agronomy.resilience.candidates.filter((c) =>
            (hazard() === "flood" && a.edge === "wet"
              ? ["hijol", "koroch"]
              : a.edge === "dry"
                ? ["mango"]
                : []
            ).includes(c.id),
          ),
    ...r,
    sourceIds: [
      ...new Set([
        ...guides[hazard()].sources,
        ...r.options.flatMap((c) => c.sources),
      ]),
    ],
  };
}
function report(s) {
  const g = guides[s.hazard];
  modal(
    t("Recovery plan", "পুনরুদ্ধারের পরিকল্পনা"),
    `<article id="report-content"><div class="eyebrow">ROPON RADAR · ${s.assessment.example ? t("WORKED EXAMPLE", "নমুনা পরিস্থিতি") : t("FARMER-ENTERED PLAN", "কৃষকের দেওয়া পরিকল্পনা")}</div><h2>${esc(s.fieldName)} · ${word(g.name)}</h2><p>${date(s.assessment.date)} · ${word(phases.find((p) => p[0] === s.assessment.phase).slice(1))}</p><p>${word(g.actions[phases.findIndex((p) => p[0] === s.assessment.phase)])}</p>
 <p class="note">${t("Saved", "সংরক্ষিত")} ${esc(s.savedAt.slice(0, 10))} · ${t("Preparation delay", "প্রস্তুতির দেরি")} ${num(+s.assessment.delay)} d · ${t("Next crop deadline", "পরের ফসলের তারিখ")} ${s.assessment.nextDate ? date(s.assessment.nextDate) : "—"}</p>
 ${s.reasons.length ? `<ul>${s.reasons.map((id) => `<li>${word(reasons[id])}</li>`).join("")}</ul>` : s.options.map((c) => `<div class="report-section"><h3>${word(c.name)} · ${word(statuses[c.status])}</h3><p>${esc(c.variety)} · ${word(c.verb)} ${date(c.start)} – ${date(c.end)}</p>${c.available ? `<p>${t("Fits entered conditions", "আপনার দেওয়া শর্তে সময়")} ${date(c.first)} – ${date(c.last)}</p>` : ""}<p>${word(c.check)}</p>${c.harvest ? `<p>${t("Approximate harvest from earliest planting", "প্রথম দিনে লাগালে আনুমানিক ফসল তোলা")} ${date(c.harvest[0])} – ${date(c.harvest[1])}</p>` : ""}</div>`).join("")}
 ${(s.restoration || []).map((c) => `<div class="report-section"><h3>${t(c.label, c.bn)}</h3><p>${t(c.siteFit, c.siteFitBn)}</p><p>${t(c.window, c.windowBn)}</p><p class="note">${t(c.evidenceArea, c.evidenceAreaBn)}</p>${sources(c.sourceIds)}</div>`).join("")}
 <div class="report-section"><h3>${t("Prepare for the next season", "পরের মৌসুমের প্রস্তুতি")}</h3><p>${word(g.improve)}</p><p class="note">${t("Reference guidance and entered assumptions. Recheck local conditions before acting.", "তথ্যসূত্র ও আপনার দেওয়া অনুমান। কাজের আগে স্থানীয় অবস্থা আবার দেখুন।")}</p>${sources(s.sourceIds)}</div></article><div class="spacer"></div>${button(t("Print or save as PDF", "ছাপুন বা PDF রাখুন"), "print-report", "primary", "print")}`,
  );
}
function recovery() {
  const a = draft(),
    r = result(),
    saved = state.recoverySaves?.[key()];
  return (
    header(
      t("Resilience desk / 07", "সহনশীলতার ডেস্ক / ০৭"),
      t("A way forward after disaster", "দুর্যোগের পর আবার শুরু"),
      t(
        "Protect people. Check the field. Find the next planting opportunity.",
        "মানুষের নিরাপত্তা, জমি যাচাই, তারপর পরের ফসলের সুযোগ।",
      ),
    ) +
    chips() +
    `<div class="rr-intro"><span>${icon("recovery", 23)}</span><p>${t("Choose the situation you want to plan for. Conditions below come from you. This page does not monitor active emergencies.", "কোন পরিস্থিতির পরিকল্পনা চান বাছুন। নিচের পরিস্থিতি আপনার দেওয়া তথ্য। এখানে চলমান দুর্যোগ পর্যবেক্ষণ করা হয় না।")}</p></div>${hazardCards()}
 ${a.example ? `<div class="notice amber rr-example-label">${t("Worked example · fictional field conditions, real guidance. Change the inputs to explore the rules, or start your own assessment.", "নমুনা পরিস্থিতি · জমির অবস্থা কাল্পনিক, নির্দেশনার সূত্র বাস্তব। নিয়ম দেখতে তথ্য বদলান বা নিজের জমি যাচাই শুরু করুন।")}</div>` : ""}
 <div class="rr-assessment">${assessment(a)}${actions(a)}</div>${planting(a, r)}
 <div class="rr-bottom">${trees(a, r)}${panel(t("4. Keep a recovery plan", "৪. পরিকল্পনা রাখুন"), `<p class="note">${t("Save this assessment on this device, or take a printed plan to your extension officer. Revisit it when conditions change.", "এই ডিভাইসে যাচাই সংরক্ষণ করুন বা ছাপিয়ে কৃষি কর্মকর্তার কাছে নিন। অবস্থা বদলালে আবার দেখুন।")}</p><div class="rr-save-actions">${button(t("Save assessment", "যাচাই সংরক্ষণ"), "rr-save", "primary", "save")}${button(t("Preview / print", "দেখুন / ছাপুন"), "rr-print", "", "print")}${button(t("Export JSON", "JSON নিন"), "rr-export", "ghost small", "download")}</div>${saved ? `<p class="note rr-saved">${t("Last saved", "শেষ সংরক্ষণ")} ${date(saved.assessment.date)} · ${saved.assessment.example ? t("Example", "নমুনা") : t("Your assessment", "আপনার যাচাই")} ${button(t("View saved copy", "সংরক্ষিত কপি"), "rr-saved", "ghost small")}</p>` : ""}<div class="rr-linked">${goButton(t("Check water demand", "পানির চাহিদা দেখুন"), "water", "small")}${goButton(t("Log crop or soil evidence", "ফসল বা মাটির তথ্য লিখুন"), "research", "small")}${hazard() === "flood" && !r.reasons.length ? button(t("Use delay in rotation comparison", "ফসলচক্রে দেরি প্রয়োগ"), "rr-rotation", "small") : ""}</div>`)}</div>${evidence(a)}`
  );
}
function recoveryChange(el) {
  if (!el.name?.startsWith("rr-")) return;
  const a = draft(),
    name = el.name.slice(3);
  if (!(name in a)) return;
  a[name] =
    name === "delay" ? (el.value === "" ? "" : Number(el.value)) : el.value;
  state.recoveryAmanOpen =
    !!el.closest("details")?.open ||
    !!document.querySelector('.rr-details[open] select[name="rr-land"]');
  state.recoveryDrafts = { ...state.recoveryDrafts, [key()]: a };
  persist();
  const y = window.scrollY,
    id = el.id;
  repaint();
  document.getElementById(id)?.focus({ preventScroll: true });
  window.scrollTo(0, y);
}
function recoveryAction(action, value) {
  if (!action.startsWith("rr-")) return;
  if (action === "rr-hazard") {
    state.hazard = value;
    persist();
    repaint();
    return;
  }
  if (action === "rr-example" || action === "rr-reset") {
    const a =
      action === "rr-example"
        ? {
            ...defaultAssessment(today()),
            ...examples[hazard()],
            example: true,
          }
        : defaultAssessment(today());
    state.recoveryDrafts = { ...state.recoveryDrafts, [key()]: a };
    persist();
    repaint();
    return;
  }
  if (action === "rr-save") {
    const s = snapshot();
    state.recoverySaves = { ...state.recoverySaves, [key()]: s };
    if (persist()) {
      repaint();
      toast(t("Assessment saved on this device", "এই ডিভাইসে যাচাই সংরক্ষিত"));
    }
    return;
  }
  if (action === "rr-print") return report(snapshot());
  if (action === "rr-saved" && state.recoverySaves?.[key()])
    return report(state.recoverySaves[key()]);
  if (action === "rr-export")
    return download(
      "Ropon-recovery-" + state.fieldId + "-" + hazard() + ".json",
      JSON.stringify(snapshot(), null, 2),
    );
  if (action === "rr-layout") {
    const c = result().options.find((c) => c.id === value && c.available);
    if (c) {
      setPlantCrop(c.plant);
      location.hash = "planner";
      toast(
        t(
          "Spacing and yield here use the planner’s reference variety. Review them for your recovery crop.",
          "এখানে দূরত্ব ও ফলন পরিকল্পনাকারীর তথ্যসূত্রের জাত অনুযায়ী। পুনরুদ্ধারের ফসলের সঙ্গে মিলিয়ে নিন।",
        ),
      );
    }
  }
  if (action === "rr-rotation" && !result().reasons.length) {
    setProfile({ floodDays: +draft().delay });
    location.hash = "rotations";
    toast(
      t(
        "Entered delay applied to rotation checks",
        "দেওয়া দেরি ফসলচক্রে প্রয়োগ হয়েছে",
      ),
    );
  }
}

export { recovery, recoveryChange, recoveryAction };
