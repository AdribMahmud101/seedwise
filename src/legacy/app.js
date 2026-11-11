import { boundaryAction, boundarySubmit } from "./boundary.js";
import { fieldReport, printReport } from "./report.js";
import {
  state,
  earth,
  agronomy,
  loadData,
  persist,
  t,
  esc,
  fieldName,
  monthName,
  icon,
  modal,
  close,
  stateError,
} from "./ui.js";
import {
  home,
  seasonView,
  mountMap,
  disposeMap,
  setField,
  fieldAction,
  fieldInput,
  fieldSubmit,
  searchResults,
} from "./fields.js";
import {
  rotations,
  rotationAction,
  rotationInput,
  mountRotations,
  disposeRotations,
} from "./rotations.js";
import {
  planner,
  drawPlanner,
  mountPlanner,
  disposePlanner,
  plannerAction,
  plannerInput,
  plannerChange,
} from "./planner.js";
import { clinic, clinicAction, clinicChange, clinicSubmit } from "./clinic.js";
import {
  water,
  waterAction,
  waterInput,
  waterSubmit,
  initLandscapeObserver,
  disposeLandscape,
} from "./water.js";
import { recovery, recoveryAction, recoveryChange } from "./recovery.js";
import {
  research,
  researchAction,
  researchChange,
  researchSubmit,
} from "./research.js";

const pages = [
  ["field", "My field", "আমার জমি", home],
  ["rotations", "Rotation studio", "ফসলচক্র বাছাই", rotations],
  ["seasons", "Past seasons", "পুরনো মৌসুম", seasonView],
  ["planner", "Planting planner", "বপনের পরিকল্পনা", planner],
  ["clinic", "Crop clinic", "ফসলের চিকিৎসাঘর", clinic],
  ["water", "Water & resilience", "পানি ও সহনশীলতা", water],
  ["recovery", "Disaster recovery", "দুর্যোগের পর করণীয়", recovery],
  ["research", "Research lab", "গবেষণাগার", research],
];
function page() {
  return pages.find((p) => p[0] === location.hash.slice(1)) || pages[0];
}
function evidence() {
  modal(
    t("Evidence register", "তথ্যসূত্রের খাতা"),
    `<p class="note">${t("Weather values are frozen to 2024. Each prepared field has a dated image and a boundary traced from the satellite photo. The rotation scores combine these data with stated planning assumptions.", "আবহাওয়ার তথ্য ২০২৪ সালের। প্রতিটি স্থানে তারিখসহ ছবি ও ছবি দেখে আঁকা সীমানা আছে। এই তথ্যের সঙ্গে স্পষ্ট অনুমান মিলিয়ে ফসলচক্রের স্কোর হয়।")}</p>${[...earth.sources, ...agronomy.sources].map((s, i) => `<div class="source-row"><span class="source-no">${String(i + 1).padStart(2, "0")}</span><div><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name || s.title)} ↗</a><p>${esc(s.spatialSupport || s.method || s.locator || s.role || "")}</p></div></div>`).join("")}`,
  );
}
function render() {
  const current = page();
  disposeMap();
  const title = t(current[1], current[2]);
  document.documentElement.lang = state.lang;
  document.body.classList.toggle("lang-bn", state.lang === "bn");
  document.title = `${title} · Ropon Radar`;
  // Research desk (Research lab, Evidence register) hidden from the menu to keep the app minimal (owner, 11 Nov); routes still work by URL.
  const nav = pages
    .filter(([id]) => id !== "research")
    .map(
      ([id, en, bn], i) =>
        `<button data-go="${id}" class="nav-item ${id === current[0] ? "active" : ""}" ${id === current[0] ? 'aria-current="page"' : ""} title="${esc(t(en, bn))}">${icon(id)}<span>${t(en, bn)}</span><span class="number">0${i + 1}</span></button>`,
    )
    .join("");
  document.querySelector("#app").innerHTML =
    `<a href="#main-content" class="skip">${t("Skip to content", "মূল অংশে যান")}</a><aside class="sidebar"><a class="brand" href="#field"><img src="/assets/mark.svg" alt=""><div><strong>Ropon Radar</strong><small>রোপণ রাডার</small></div></a><div class="nav-label">${t("FIELD WORKSPACE", "জমির কাজ")}</div><nav aria-label="${t("Workspace", "কর্মক্ষেত্র")}">${nav}</nav>
 <div class="side-bottom"><div class="region-mark"><i class="status-dot"></i><strong>${t("Rangpur field lab", "রংপুর মাঠ গবেষণা")}</strong></div><p>${t("Bangladesh · Three prepared sites", "বাংলাদেশ · তিনটি প্রস্তুত স্থান")}</p><div class="sidebar-foot"><span>24°–27° N</span><span>FIELD EDITION 01</span></div></div></aside><button class="nav-shade" data-action="menu" aria-label="${t("Close navigation", "মেনু বন্ধ করুন")}"></button>
 <div class="workspace"><div class="topbar"><div class="crumb"><button class="mobile-menu" data-action="menu" aria-expanded="false" aria-label="${t("Open navigation", "মেনু খুলুন")}">${icon("menu")}</button><span class="crumb-region">${t("Rangpur", "রংপুর")} &nbsp; / &nbsp;</span><b>${esc(title)}</b></div><div class="top-actions"><span class="snapshot">${t("HISTORICAL DATA  /  2024", "ঐতিহাসিক তথ্য  /  ২০২৪")}</span><div class="lang-toggle" aria-label="Language"><button data-lang="en" class="${state.lang === "en" ? "on" : ""}">EN</button><button data-lang="bn" class="${state.lang === "bn" ? "on" : ""}">বাংলা</button></div><span class="avatar" aria-label="Rangpur field lab">RG</span></div></div>
 <main class="main" id="main-content" tabindex="-1" data-page="${current[0]}">${current[3]()}<footer class="workspace-foot"><span>ROPON RADAR &nbsp; / &nbsp; ${esc(fieldName())}</span><span>${t("NASA EARTH OBSERVATIONS · BANGLADESH FIELD RESEARCH", "নাসার পৃথিবী পর্যবেক্ষণ · বাংলাদেশের মাঠ গবেষণা")}</span></footer></main></div>`;
  if (current[0] === "field") mountMap();
  if (current[0] === "planner") mountPlanner();
  else disposePlanner();
  if (current[0] === "rotations") {
    mountRotations();
  } else {
    disposeRotations();
  }
  if (current[0] === "water") {
    initLandscapeObserver();
  } else {
    disposeLandscape();
  }
}
function navigate(id) {
  if (location.hash === "#" + id) {
    render();
    return;
  }
  location.hash = id;
}
document.addEventListener("click", (event) => {
  const el = event.target.closest("button,a");
  if (!el) return;
  if (el.classList.contains("skip")) {
    event.preventDefault();
    document.querySelector("#main-content")?.focus();
    return;
  }
  if (el.dataset.go) {
    navigate(el.dataset.go);
    return;
  }
  if (el.dataset.lang) {
    state.lang = el.dataset.lang;
    persist();
    render();
    return;
  }
  if (el.dataset.field) {
    setField(el.dataset.field);
    return;
  }
  if (el.dataset.tab) {
    state.tabs[el.dataset.tab] = el.dataset.value;
    persist();
    render();
    return;
  }
  const action = el.dataset.action,
    value = el.dataset.value;
  if (!action) return;
  if (action === "menu") {
    const open = document.querySelector(".sidebar").classList.toggle("open");
    document
      .querySelector(".mobile-menu")
      ?.setAttribute("aria-expanded", String(open));
    return;
  }
  if (action === "close") {
    close();
    return;
  }
  if (action === "print") {
    fieldReport();
    return;
  }
  if (action === "print-report") {
    printReport();
    return;
  }
  if (action === "evidence") {
    evidence();
    return;
  }
  boundaryAction(action, value);
  fieldAction(action, value);
  rotationAction(action, value);
  plannerAction(action, value);
  clinicAction(action, value);
  waterAction(action, value);
  recoveryAction(action, value);
  researchAction(action, value);
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.hasAttribute("data-month")) {
    state.month = +el.value;
    const label = el.parentElement.querySelector(".month-name");
    if (label)
      label.textContent =
        monthName() +
        " " +
        (page()[0] === "seasons" ? state.historyYear || 2024 : 2024);
    return;
  }
  if (el.id === "lookup") {
    document.querySelector("#search-results").innerHTML = searchResults(
      el.value,
    );
    return;
  }
  fieldInput(el);
  rotationInput(el);
  plannerInput(el);
  waterInput(el);
});
document.addEventListener("change", (event) => {
  const el = event.target;
  if (el.hasAttribute("data-month")) {
    state.month = +el.value;
    persist();
    const prior = window.scrollY;
    render();
    document.querySelector("[data-month]")?.focus({ preventScroll: true });
    window.scrollTo(0, prior);
    return;
  }
  if (el.name === "historyYear") {
    state.historyYear = Number(el.value);
    persist();
    render();
    return;
  }
  plannerChange(el);
  recoveryChange(el);
  clinicChange(el);
  researchChange(el);
  if (el.name === "rotation" && el.closest("#water-controls")) waterInput(el);
});
document.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  boundarySubmit(form) ||
    fieldSubmit(form) ||
    clinicSubmit(form) ||
    waterSubmit(form) ||
    researchSubmit(form);
});
document.querySelector("#modal").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    )
      close();
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape")
    document.querySelector(".sidebar")?.classList.remove("open");
});
window.addEventListener("hashchange", () => {
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("workspace-render", render);
window.addEventListener("resize", () => {
  if (page()[0] === "planner") drawPlanner();
});
async function start() {
  try {
    await loadData();
    render();
  } catch (error) {
    console.error(error);
    document.querySelector("#app").innerHTML = stateError(
      t("The field workspace could not open.", "ফিল্ড কর্মক্ষেত্র খোলা যায়নি।"),
      "reload"
    );
    document.querySelector("[data-action='reload']").onclick = () => location.reload();
  }
}
start();
// In-app browsers resume tabs for days without reloading, so a resumed tab can run an old build.
// When the tab comes back, compare the deployed build with the one this page loaded and refresh.
let loadedBuild = null;
const deployedBuild = () =>
  fetch("/version.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((v) => v?.build || null)
    .catch(() => null);
async function checkForNewBuild() {
  if (document.visibilityState !== "visible" || !loadedBuild) return;
  const build = await deployedBuild();
  if (!build || build === loadedBuild) return;
  if (!document.querySelector("dialog[open], .draw-bar")) return location.reload();
  if (document.querySelector(".update-banner")) return; // mid-edit: let the farmer choose when
  const bar = document.createElement("button");
  bar.type = "button";
  bar.className = "update-banner";
  bar.textContent = t("New version available — tap to reload", "নতুন সংস্করণ এসেছে — চাপুন");
  bar.onclick = () => location.reload();
  document.body.append(bar);
}
deployedBuild().then((b) => (loadedBuild = b));
document.addEventListener("visibilitychange", checkForNewBuild);
window.addEventListener("pageshow", (e) => e.persisted && checkForNewBuild());
if ("serviceWorker" in navigator && window.isSecureContext) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
