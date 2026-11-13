import { consumeToastSequence, consumeWelcome, playToastSequence } from './notify-toast.js';
import { journeyBar, journeyStart, journeyReview, journeyFieldCTA, mountJourney, journeyAction } from './journey-bar.js';
import { getPlan, getReadyPlan, listPlans, openPlan, approveRefinement, restorePreviousPlan } from './journey.js';
import { requestReplay } from './plan-pipeline.js';
import { parseRoute } from './routes.js';
import { plantyPanel, mountPlanty } from './planty.js';
import { getPlannerPlantyContext } from './planner.js';
import { notificationId, taskReminderId, mergeNotifications, unreadCount, readNotificationState, writeNotificationState, visibleNotifications } from './notifications.js';
import { runShowMe } from './journey-story.js';
import { plan, mountPlan, disposePlan, planAction, planChange } from './plan.js';
import { plans, mountPlans, disposePlans, plansAction } from './plans.js';
import { boundaryAction, boundarySubmit } from "./boundary.js";
import { fieldReport, printReport } from "./report.js";
import {
  initNasaBadges,
  state,
  earth,
  agronomy,
  outlook,
  floodFields,
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
  mountSeasonCharts,
  disposeSeasonCharts,
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
import { deriveChecklist } from './plan.js';
import { outlookSummaryLine, floodSummaryLine } from './outlook-flood.js';
import { calendar, mountCalendar, disposeCalendar } from './calendar.js';
import { weather, mountWeather } from './weather.js';

const pages = [
  ["field", "My field", "আমার জমি", home],
  ["rotations", "Rotation studio", "ফসলচক্র বাছাই", rotations],
  ["planner", "Planting planner", "বপনের পরিকল্পনা", planner],
  ["plans", "My plans", "আমার পরিকল্পনা", plans],
  ["calendar", "Calendar", "ক্যালেন্ডার", calendar],
  ["weather", "Weather", "আবহাওয়া", weather],
  ["seasons", "Past seasons", "পুরনো মৌসুম", seasonView],
  ["water", "Water & resilience", "পানি ও সহনশীলতা", water],
  ["recovery", "Disaster recovery", "দুর্যোগের পর করণীয়", recovery],
  ["plan", "Your plan", "আপনার পরিকল্পনা", plan],
  ["research", "Research lab", "গবেষণাগার", research],
];
function route() {
  const parsed = parseRoute(location.hash);
  if (parsed.page === 'clinic') return { ...parsed, page: pages[0] };
  return { ...parsed, page: pages.find(p => p[0] === parsed.page) || pages[0] };
}
function page() {
  return route().page;
}
const bellIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>';
function panelHtml(items, store) {
  const shown = visibleNotifications(items, store);
  return `<section class="notification-panel" role="dialog" aria-label="${t('Notifications', 'বিজ্ঞপ্তি')}" tabindex="-1"><header><strong>${t('Notifications', 'বিজ্ঞপ্তি')}</strong><button data-notify="read-all">${t('Mark all read', 'সব পড়া হয়েছে')}</button></header>${shown.length ? `<ul>${shown.map(item => `<li class="notification-item ${store.read[item.id] ? '' : 'unread'}"><span class="notification-type">${item.type === 'disaster' ? '◈' : item.type === 'refine' ? '✦' : '✓'}</span><div class="notification-copy"><strong>${esc(item.title)}</strong><p>${esc(item.body)}</p><small>${relativeTime(item.createdAt)}</small>${item.type === 'refine' ? `<div class="refine-review">${(item.changes || []).map(change => `<p><b>${t('Season', 'মৌসুম')} ${change.season + 1}</b></p><div class="refine-compare"><div><small>${t('Current', 'বর্তমান')}</small><p>${esc(change.current || change.from)}</p></div><div><small>${t('Suggested', 'প্রস্তাবিত')}</small><p>${esc(change.suggested || change.to)}</p></div></div><p>${esc(change.why)}</p>`).join('')}<p>${t('Confidence', 'নিশ্চয়তা')}: ${esc(item.confidence || '')}</p><p>${(item.evidence || []).map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.title)}</a>`).join(' · ')}</p><div><button data-notify="approve" data-id="${esc(item.id)}">${t('Approve', 'অনুমোদন')}</button><button data-notify="later" data-id="${esc(item.id)}">${t('Not now', 'এখন নয়')}</button></div></div>` : ''}<a href="#${esc(item.href)}" data-notify="open" data-id="${esc(item.id)}">${esc(item.cta)}</a></div><button class="notification-dismiss" data-notify="dismiss" data-id="${esc(item.id)}" aria-label="${t('Dismiss', 'বন্ধ করুন')}">×</button></li>`).join('')}</ul>` : `<p class="notification-empty">${t('Planty has nothing new for you yet. Keep growing!', 'প্ল্যান্টির নতুন কিছু নেই। এগিয়ে চলুন!')}</p>`}</section>`;
}
function relativeTime(value) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 86400000));
  if (!days) return t('Today', 'আজ');
  return t(`${days} day${days === 1 ? '' : 's'} ago`, `${days} দিন আগে`);
}
function offerUndo(id) {
  document.querySelector('.notification-undo')?.remove();
  const button = document.createElement('button');
  button.className = 'notification-undo';
  button.textContent = t('Plan updated · Undo', 'পরিকল্পনা বদলেছে · ফিরিয়ে নিন');
  button.onclick = () => {
    if (restorePreviousPlan(id)) { requestReplay(); location.hash = `plan/${encodeURIComponent(id)}?refresh=${Date.now()}`; }
    button.remove();
  };
  document.body.append(button);
  setTimeout(() => button.remove(), 10000);
}
document.addEventListener('planty:apply-suggestion', event => {
  const { suggestion, plan: attached } = event.detail || {};
  const saved = listPlans().find(item => item.id === attached?.id);
  try {
    if (saved && suggestion && approveRefinement(saved.id, suggestion.changes, suggestion.newPlanting)) {
      requestReplay();
      offerUndo(saved.id);
      location.hash = `plan/${encodeURIComponent(saved.id)}?refresh=${Date.now()}`;
    }
  } catch { /* invalid suggestions stay unapproved */ }
});
function renderNotifications() {
  const button = document.querySelector('.notification-bell');
  if (!button) return;
  const store = readNotificationState();
  const count = unreadCount(store.cache.items || [], store);
  button.setAttribute('aria-label', t(`Notifications, ${count} unread`, `বিজ্ঞপ্তি, ${count}টি অপঠিত`));
  const badge = button.querySelector('.notification-badge');
  badge.textContent = count > 9 ? '9+' : count ? String(count) : '';
  badge.hidden = count === 0;
  const host = document.querySelector('.notification-host');
  const pop = host?.querySelector('.notification-pop');
  if (pop) pop.innerHTML = host.classList.contains('open') ? panelHtml(store.cache.items || [], store) : '';
}
async function refreshNotifications() {
  const store = readNotificationState(), date = new Date().toISOString().slice(0, 10);
  const knownTaskIds = new Set((store.cache.items || []).filter(item => item.type === 'task').map(item => item.id));
  const entries = listPlans(), incoming = [], field = state.fieldId, name = fieldName(); // fieldName takes a field object (defaults to the current field), not an id
  try {
    const response = await fetch(`/api/daily-brief?field=${encodeURIComponent(field)}`);
    if (response.ok) {
      const brief = await response.json();
      incoming.push({ id: notificationId('disaster', brief.date, field), type: 'disaster', createdAt: `${brief.date}T00:00:00Z`, title: t(`Today's disaster outlook for ${name}: ${brief.headline}`, `আজ ${name}-এর দুর্যোগ পূর্বাভাস: ${brief.headline}`), body: brief.fallback ? t('Using prepared outlook and flood data.', 'প্রস্তুত আউটলুক ও বন্যার তথ্য দেখানো হচ্ছে।') : t('Daily model update is ready.', 'দৈনিক মডেল হালনাগাদ প্রস্তুত।'), cta: t('See analytics', 'বিশ্লেষণ দেখুন'), href: entries.length ? `plan/${encodeURIComponent(entries[0].id)}` : 'recovery' });
    }
  } catch { /* no fabricated alert */ }
  const dueTasks = entries.flatMap(entry => deriveChecklist(entry.plan, null).filter(item => !entry.plan.checklist?.[item.id] && item.id.startsWith('sow-')).map(item => {
    const season = entry.plan.rotation.seasons.find(s => item.id === `sow-${s.key}`);
    if (!season.sowDate) return null;
    const sowDate = season.sowDate;
    const target = new Date(`${new Date().getFullYear()}-${sowDate.slice(5,10)}T00:00:00`);
    const days = Math.ceil((target - new Date(`${date}T00:00:00`)) / 86400000);
    return { entry, item, days };
  })).filter(task => task && task.days <= 7).sort((a,b)=>a.days-b.days);
  const nextPlanTask = entries.map(entry => ({ entry, item: deriveChecklist(entry.plan, null).find(item => item.id.startsWith('sow-') && !entry.plan.checklist?.[item.id]) }))
    .find(({entry,item}) => item && !entry.plan.rotation.seasons.find(season => item.id === `sow-${season.key}`)?.sowDate && !dueTasks.some(task => task.entry.id === entry.id && task.item.id === item.id));
  if (nextPlanTask) incoming.push({ id: notificationId('task', date, nextPlanTask.entry.id), type: 'task', createdAt: `${date}T00:00:00Z`, title: t('Next task in your plan', 'আপনার পরিকল্পনার পরের কাজ'), body: t(nextPlanTask.item.en,nextPlanTask.item.bn), cta: t('Open plan', 'পরিকল্পনা খুলুন'), href: `plan/${encodeURIComponent(nextPlanTask.entry.id)}?section=plan-checklist` });
  dueTasks.forEach(({entry,item,days}, index) => {
    const due = days < 0 ? t('overdue', 'বাকি') : days === 0 ? t('today', 'আজ') : t(`in ${days} days`, `${days} দিনে`);
    incoming.push({ id: taskReminderId(date, entry.id, item.id), type: 'task', createdAt: `${date}T00:00:00Z`, title: index === 0 ? t('Next task in your plan', 'আপনার পরিকল্পনার পরের কাজ') : t('Task due soon', 'শিগগির কাজ'), body: `${t(item.en,item.bn)} (${due})`, cta: t('Open plan', 'পরিকল্পনা খুলুন'), href: `plan/${encodeURIComponent(entry.id)}?section=plan-checklist` });
  });
  if (!entries.length) incoming.push({ id: notificationId('task', date), type: 'task', createdAt: `${date}T00:00:00Z`, title: t('Make your first plan', 'প্রথম পরিকল্পনা করুন'), body: t('Planty can help shape a plan for your field.', 'প্ল্যান্টি আপনার জমির পরিকল্পনায় সাহায্য করবে।'), cta: t('Open field', 'জমি দেখুন'), href: 'field' });
  for (const entry of entries) {
    const cacheKey = `refine:${date}:${entry.id}`;
    if (Date.parse(store.cache[`refineDismissed:${entry.id}`] || '') > Date.now()) continue;
    if (Object.hasOwn(store.cache, cacheKey)) { if (store.cache[cacheKey]) incoming.push(store.cache[cacheKey]); continue; }
    try {
      const response = await fetch('/api/rotation-advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: state.lang, mode: 'refine', crops: Object.values(entry.plan.planting).map(p => p.crop), plan: entry.plan, context: { fieldId: entry.plan.field.id, fieldName: entry.plan.field.name, areaHa: entry.plan.field.areaHa, outlook: outlookSummaryLine(entry.plan.field.id, outlook) || '', flood: floodSummaryLine(entry.plan.field.id, floodFields) || '' } }) });
      if (!response.ok) continue;
      const result = await response.json();
      if (result.verdict !== 'refine') {
        const ev = result.evidence?.[0];
        const review = { id: notificationId('review', date, entry.id), type: 'review', createdAt: `${date}T00:00:00Z`,
          title: t(`Planty re-checked your ${entry.plan.field.name} plan: still the best fit ✓`, `প্ল্যান্টি ${entry.plan.field.name}-এর পরিকল্পনা আবার দেখেছে: এখনও সেরা ✓`),
          body: ev ? `${t('Evidence', 'প্রমাণ')}: ${ev.title}` : t('No better crop found for this season.', 'এই মৌসুমে এর চেয়ে ভালো ফসল পাওয়া যায়নি।'),
          cta: t('Open plan', 'পরিকল্পনা খুলুন'), href: `plan/${encodeURIComponent(entry.id)}`, confidence: result.confidence };
        store.cache[cacheKey] = review; incoming.push(review); continue;
      }
      const changes = result.changes.map(change => {
        const season = entry.plan.rotation.seasons[change.season], planting = result.newPlanting[change.season];
        const settings = season && entry.plan.planting[season.key];
        const months = season ? `${monthName(season.sowMonth - 1, true)}–${monthName(season.harvestMonth - 1, true)}` : '';
        return { ...change, current: season ? `${season.crop} · ${months}${settings ? ` · ${settings.rowSpacingCm}×${settings.withinRowCm} cm` : ''}` : change.from,
          suggested: `${planting?.crop || change.to}${planting ? ` · ${planting.rowSpacingCm}×${planting.withinRowCm} cm` : ''}` };
      });
      const item = { id: notificationId('refine', date, entry.id), type: 'refine', createdAt: `${date}T00:00:00Z`, title: t(`Planty suggests a better plan for ${entry.plan.field.name}`, `প্ল্যান্টি ${entry.plan.field.name}-এর জন্য ভালো পরিকল্পনা দিয়েছে`), body: t('Review crop changes and evidence before approval.', 'অনুমোদনের আগে ফসলের পরিবর্তন ও তথ্যসূত্র দেখুন।'), cta: t('Review suggestion', 'প্রস্তাব দেখুন'), href: `plan/${encodeURIComponent(entry.id)}`, planId: entry.id, changes, newPlanting: result.newPlanting, evidence: result.evidence, confidence: result.confidence };
      store.cache[cacheKey] = item; incoming.push(item);
    } catch { /* offline/API failure means no item */ }
  }
  // Task items are recomputed every refresh: drop stale ones (e.g. "Make your first plan" once a plan exists).
  const kept = (store.cache.items || []).filter(item => item.type !== 'task' || incoming.some(n => n.id === item.id));
  store.cache.items = mergeNotifications(kept, incoming);
  writeNotificationState(store);
  renderNotifications();
  const newTasks = incoming.filter(item => item.type === 'task' && item.id.includes(':') && !knownTaskIds.has(item.id) && !store.read[item.id]);
  if (newTasks.length) playToastSequence(newTasks, { persist: true, onDismiss: markToastRead, onShow: bumpBell });
}
// After the user completes a plan, play the real notifications as a timed toast sequence (judges see it once).
document.addEventListener('ropon:report-ready', async () => {
  if (!consumeToastSequence()) return;
  await refreshNotifications();
  const store = readNotificationState();
  const items = visibleNotifications(store.cache.items || [], store);
  // Right after a plan is completed, the next toast always points to today's disaster analytics for that field
  // (built from the same real model headline, even if the morning outlook toast was already dismissed).
  const brief = items.find(item => item.type === 'disaster');
  const followUp = brief && { ...brief, id: `${brief.id}:after-plan`, title: t('Your plan is ready — check today\'s disaster analytics', 'পরিকল্পনা তৈরি — আজকের দুর্যোগ বিশ্লেষণ দেখুন'),
    body: brief.title, cta: t('See analytics', 'বিশ্লেষণ দেখুন'), href: 'recovery' };
  playToastSequence([...(followUp && !store.read[followUp.id] ? [followUp] : []), ...items.filter(item => !store.read[item.id] && item.type !== 'disaster')], {
    persist: true, onDismiss: markToastRead,
    onShow: () => {
      const bell = document.querySelector('.notification-bell');
      bell?.classList.remove('bell-bump'); void bell?.offsetWidth; bell?.classList.add('bell-bump'); // restart the shake per toast
    },
  });
});

function bumpBell() {
  const bell = document.querySelector('.notification-bell');
  bell?.classList.remove('bell-bump'); void bell?.offsetWidth; bell?.classList.add('bell-bump');
}
// Dismissing a toast marks that notification read, so the bell count matches what the user has seen.
function markToastRead(item) {
  const store = readNotificationState();
  store.read[item.id] = true;
  writeNotificationState(store);
  renderNotifications();
}

function evidence() {
  modal(
    t("Evidence register", "তথ্যসূত্রের খাতা"),
    `<p class="note">${t("Weather values are frozen to 2024. Each prepared field has a dated image and a boundary traced from the satellite photo. The rotation scores combine these data with stated planning assumptions.", "আবহাওয়ার তথ্য ২০২৪ সালের। প্রতিটি স্থানে তারিখসহ ছবি ও ছবি দেখে আঁকা সীমানা আছে। এই তথ্যের সঙ্গে স্পষ্ট অনুমান মিলিয়ে ফসলচক্রের স্কোর হয়।")}</p>${[...earth.sources, ...agronomy.sources].map((s, i) => `<div class="source-row"><span class="source-no">${String(i + 1).padStart(2, "0")}</span><div><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name || s.title)} ↗</a><p>${esc(s.spatialSupport || s.method || s.locator || s.role || "")}</p></div></div>`).join("")}`,
  );
}
let disposePlantyHub = null;
function render() {
  disposePlantyHub?.();
  disposePlantyHub = null;
  const current = page();
  disposeSeasonCharts();
  disposeMap();
  const title = t(current[1], current[2]);
  document.documentElement.lang = state.lang;
  document.body.classList.toggle("lang-bn", state.lang === "bn");
  document.title = `${title} · SeedWise`;
  // Research desk and single Your plan hidden from the nav menu; My plans is always nav 04.
  const nav = pages
    .filter(([id]) => !["research", "plan", "water"].includes(id)) // water hidden by owner; route still works by URL
    .map(
      ([id, en, bn], i) =>
        `<button data-go="${id}" class="nav-item ${id === current[0] ? "active" : ""}" ${id === current[0] ? 'aria-current="page"' : ""} title="${esc(t(en, bn))}">${icon(id)}<span>${t(en, bn)}</span><span class="number">0${i + 1}</span></button>`,
    )
    .join("");
  document.querySelector("#app").innerHTML =
    `<a href="#main-content" class="skip">${t("Skip to content", "মূল অংশে যান")}</a><aside class="sidebar"><a class="brand" href="#field"><img src="/assets/mark.svg" alt=""><div><strong>SeedWise</strong></div></a><div class="nav-label">${t("FIELD WORKSPACE", "জমির কাজ")}</div><nav aria-label="${t("Workspace", "কর্মক্ষেত্র")}">${nav}</nav>
 <div class="side-bottom"><div class="region-mark"><i class="status-dot"></i><strong>${t("Rangpur field lab", "রংপুর মাঠ গবেষণা")}</strong></div><p>${t("Bangladesh · Three prepared sites", "বাংলাদেশ · তিনটি প্রস্তুত স্থান")}</p><div class="sidebar-foot"><span>24°–27° N</span><span>FIELD EDITION 01</span></div></div></aside><button class="nav-shade" data-action="menu" aria-label="${t("Close navigation", "মেনু বন্ধ করুন")}"></button>
 <div class="workspace"><div class="topbar"><div class="crumb"><button class="mobile-menu" data-action="menu" aria-expanded="false" aria-label="${t("Open navigation", "মেনু খুলুন")}">${icon("menu")}</button><span class="crumb-region">${t("Rangpur", "রংপুর")} &nbsp; / &nbsp;</span><b>${esc(title)}</b></div><div class="top-actions"><span class="snapshot">${t("HISTORICAL DATA  /  2024", "ঐতিহাসিক তথ্য  /  ২০২৪")}</span><div class="notification-host"><button class="notification-bell" aria-expanded="false">${bellIcon}<span class="notification-badge" hidden></span></button><div class="notification-pop"></div></div><div class="lang-toggle" aria-label="Language"><button data-lang="en" class="${state.lang === "en" ? "on" : ""}">EN</button><button data-lang="bn" class="${state.lang === "bn" ? "on" : ""}">বাংলা</button></div><span class="avatar" aria-label="Rangpur field lab">RG</span></div></div>
 <div id="journey-bar-slot">${journeyBar(current[0])}</div>
 <main class="main" id="main-content" tabindex="-1" data-page="${current[0]}">${current[0] === "field" ? `<div id="journey-start-slot">${journeyStart()}</div><div id="journey-field-slot">${journeyFieldCTA()}</div>` : ""}<div id="journey-review-slot">${journeyReview(current[0])}</div>${current[3]()}<footer class="workspace-foot"><span>SEEDWISE &nbsp; / &nbsp; ${esc(fieldName())}</span><span>${t("NASA EARTH OBSERVATIONS · BANGLADESH FIELD RESEARCH", "নাসার পৃথিবী পর্যবেক্ষণ · বাংলাদেশের মাঠ গবেষণা")}</span></footer></main>${plantyPanel()}</div>`;
  if (current[0] === "seasons") mountSeasonCharts();
  if (current[0] === "calendar") mountCalendar();
  else disposeCalendar();
  mountJourney(current[0], navigate, () => pages.some(([id]) => id === "plan"));
  if (current[0] === "field") mountMap();
  if (current[0] === "weather") mountWeather();
  if (current[0] === "planner") mountPlanner();
  else disposePlanner();
  disposePlantyHub = mountPlanty(() => {
    const selected = getPlan() || getReadyPlan() || listPlans().find(item => item.status === 'ready') || null;
    const base = current[0] === 'planner' ? getPlannerPlantyContext() : { lang: state.lang, fieldId: state.fieldId, fieldName: fieldName(), month: state.month + 1 };
    return { ...base, ...(current[0] === 'calendar' ? calendarPlantyContext : {}), lang: state.lang, page: current[1], fieldName: fieldName(),
      outlook: outlookSummaryLine(state.fieldId, outlook, state.lang), flood: floodSummaryLine(state.fieldId, floodFields, state.lang), plan: selected };
  });
  if (current[0] === "plans") mountPlans();
  else disposePlans();
  if (current[0] === "plan") mountPlan();
  else disposePlan();
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
  renderNotifications();
  if (current[0] === 'plan' && route().param && location.hash.includes('?section=plan-checklist'))
    requestAnimationFrame(() => document.querySelector('#plan-checklist')?.scrollIntoView({ behavior: 'smooth' }));
}
function navigate(id) {
  if (location.hash === "#" + id) {
    render();
    return;
  }
  location.hash = id;
}
initNasaBadges();

document.addEventListener("click", (event) => {
  const el = event.target.closest("button,a");
  if (!el) return;
  if (el.dataset.openNotification) {
    // From a toast: open the bell panel on that suggestion so the user can review and approve it.
    const host = document.querySelector('.notification-host');
    if (host && !host.classList.contains('open')) { host.classList.add('open'); document.querySelector('.notification-bell')?.setAttribute('aria-expanded', 'true'); }
    renderNotifications();
    const target = document.querySelector(`.notification-panel [data-id="${CSS.escape(el.dataset.openNotification)}"]`)?.closest('li, .notification-item');
    target?.classList.add('notification-focus'); target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    return;
  }
  if (el.classList.contains('notification-bell')) {
    const host = document.querySelector('.notification-host');
    if (host.classList.contains('open')) { closeNotifications(); return; }
    host.classList.add('open');
    el.setAttribute('aria-expanded', 'true');
    renderNotifications(); host.querySelector('.notification-panel')?.focus();
    return;
  }
  if (el.dataset.notify) {
    const store = readNotificationState(), id = el.dataset.id;
    const item = store.cache.items?.find(value => value.id === id);
    if (el.dataset.notify === 'read-all') for (const item of store.cache.items || []) store.read[item.id] = true;
    if (el.dataset.notify === 'dismiss' || el.dataset.notify === 'later') {
      const expires = new Date(Date.now() + (el.dataset.notify === 'later' ? 7 : 30) * 86400000).toISOString();
      store.dismissed[id] = expires;
      if (el.dataset.notify === 'later' && item?.planId) store.cache[`refineDismissed:${item.planId}`] = expires;
    }
    if (el.dataset.notify === 'open') store.read[id] = true;
    if (el.dataset.notify === 'approve') {
      const saved = listPlans().find(value => value.id === item?.planId);
      try { if (saved && approveRefinement(saved.id, item.changes, item.newPlanting)) { store.read[id] = true; requestReplay(); offerUndo(saved.id); location.hash = `plan/${encodeURIComponent(saved.id)}?refresh=${Date.now()}`; } }
      catch { /* invalid suggestions stay unapproved */ }
    }
    writeNotificationState(store);
    renderNotifications();
    if (el.dataset.notify === 'open') closeNotifications();
    return;
  }
  if (el.dataset.journey) {
    event.preventDefault();
    void journeyAction(el.dataset.journey, el.dataset.value);
    return;
  }
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
  if (el.dataset.plansAction) {
    plansAction(el.dataset.plansAction, el.dataset.planId);
    return;
  }
  const action = el.dataset.action,
    value = el.dataset.value;
  if (!action) return;
  if (action === "guide-field") {
    runShowMe();
    return;
  }
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
  planAction(action, value);
  clinicAction(action, value);
  waterAction(action, value);
  recoveryAction(action, value);
  researchAction(action, value);
});
let calendarPlantyContext = {};
window.addEventListener('calendar:ask', event => {
  calendarPlantyContext = { weekTasks: event.detail?.tasks?.map(task => task.title) || [], riskLines: event.detail?.risk ? [event.detail.risk] : [] };
  document.querySelector('.planty-launch')?.click();
});
window.addEventListener('calendar:shifted', event => {
  offerUndo(event.detail?.id);
  requestReplay();
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
  planChange(el);
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
  const host = document.querySelector('.notification-host.open');
  if (e.key === 'Escape' && host) { closeNotifications(); document.querySelector('.notification-bell')?.focus(); }
  if (e.key === 'Tab' && host) {
    const focusable = [...host.querySelectorAll('button,a[href]')];
    if (focusable.length && e.shiftKey && document.activeElement === focusable[0]) { e.preventDefault(); focusable.at(-1).focus(); }
    else if (focusable.length && !e.shiftKey && document.activeElement === focusable.at(-1)) { e.preventDefault(); focusable[0].focus(); }
  }
  if (e.key === "Escape")
    document.querySelector(".sidebar")?.classList.remove("open");
});
function closeNotifications() {
  const host = document.querySelector('.notification-host.open');
  if (!host) return;
  host.classList.remove('open');
  host.querySelector('.notification-pop')?.replaceChildren();
  document.querySelector('.notification-bell')?.setAttribute('aria-expanded', 'false');
}
document.addEventListener('click', event => {
  const host = document.querySelector('.notification-host.open');
  // Toast "Review & approve" opens the panel itself, so clicks from the toast stack never count as outside clicks.
  if (host && event.target.isConnected && !host.contains(event.target) && !event.target.closest('.sw-toast-stack')) closeNotifications();
});
window.addEventListener("hashchange", () => {
  const currentRoute = route();
  if (currentRoute.page[0] === 'plan' && currentRoute.param) openPlan(currentRoute.param);
  render();
  window.scrollTo(0, 0);
  refreshNotifications();
});
window.addEventListener("workspace-render", render);
window.addEventListener("resize", () => {
  if (page()[0] === "planner") drawPlanner();
});
async function start() {
  try {
    await loadData();
    const currentRoute = route();
    if (currentRoute.page[0] === 'plan' && currentRoute.param) openPlan(currentRoute.param);
    render();
    // First visit this session: show the real unread notifications as persistent stacked toasts.
    refreshNotifications().then(() => {
      if (!consumeWelcome()) return;
      const store = readNotificationState();
      playToastSequence(visibleNotifications(store.cache.items || [], store).filter(item => !store.read[item.id]), {
        persist: true, onDismiss: markToastRead, onShow: bumpBell });
    });
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
setInterval(() => { if (document.visibilityState === 'visible') refreshNotifications(); }, 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshNotifications(); });
window.addEventListener('ropon:plan', refreshNotifications);
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
