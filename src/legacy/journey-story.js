import { t, esc } from './ui.js';
import { getPlan, nextStep, stepStatus, allSeasonsReviewed, subscribe, startPlan, confirmField, fieldSnapshot, confirmRotation, rotationSnapshot, confirmPlanting, markPlanGenerated, importPlanJSON, resetPlan } from './journey.js';
import { guide } from './planty-guide.js';
import { FIELD_HOWTO_STEPS, clipMarkup, resolveOpenId } from './howto-field.js';
import { plantyMascot } from './planty.js';
import { canFinishPlanting, finishNote, showExitPrompt } from './journey-bar.js';

// Season label: keep Aman and Boro distinct (both are rice).
const seasonCropName = (s) => ({ aman: 'Aman rice', boro: 'Boro rice' })[s.crop] || (s.crop ? s.crop[0].toUpperCase() + s.crop.slice(1) : '');

// --- State and Persistence ---
const OWN_STORAGE_KEY = 'ropon_season_plan_v1';
const DEMO_STORAGE_KEY = 'ropon_season_plan_demo_v1';

let activePage = 'field';
let coachCollapsed = false; // "Hide" collapses coach to a small bubble
let coachDismissed = false; // "Stop guide" hides it completely until page switch or reopen
let demoController = null;
let navigationCallback = null;

// Track manual checks / user interactions within session
// (field-constraints ticks only when the assumptions dialog is SAVED, never on open)
const pageActivity = {
  field: { mapChecked: false, areaChecked: false, constraintsSaved: false },
  rotation: { prioritiesChanged: false, compared: new Set() },
  plan: { calendarViewed: false, taskChecked: false, downloaded: false },
};

export function getStoryState() {
  return {
    activePage,
    coachCollapsed,
    coachDismissed,
    isDemoPlaying: !!demoController?.isPlaying(),
    demoBeat: demoController?.getBeat() ?? null,
  };
}

// HOWTO pilot state: one expanded sub-step at a time (null = auto = first not
// done), at most one clip playing. Reset when the page actually changes.
let openHowtoId = null;
let playingHowtoId = null;

export function setStoryPage(page, navigate) {
  if (page !== activePage) {
    openHowtoId = null;
    playingHowtoId = null;
  }
  activePage = page;
  navigationCallback = navigate;
  // If user navigated, show coach again unless stopped
  updateHandOffs(page);
  renderCoach();
}

// Subscribe to plan changes
subscribe((_plan) => {
  if (typeof document !== 'undefined') {
    updateHandOffs(activePage);
    renderCoach();
  }
});

// Set up global DOM listeners once
let listenersAttached = false;
export function initStoryListeners() {
  if (listenersAttached || typeof window === 'undefined') return;
  listenersAttached = true;

  // Map inspection or click on map
  window.addEventListener('click', (event) => {
    const target = event.target;
    if (!target) return;

    // Check map clicks
    if (target.closest('#field-map, .leaflet-container, .map-controls, [data-action="toggle-pick-map"]')) {
      pageActivity.field.mapChecked = true;
      renderCoach();
    }
    // Area edit opened (saving it also ticks via the submit listener below)
    if (target.closest('.net-area-edit, [data-action="edit-net-area"]')) {
      pageActivity.field.areaChecked = true;
      renderCoach();
    }
    // NOTE: opening the assumptions dialog ticks nothing; field-constraints
    // completes ONLY when #profile-form is saved (submit listener below).
    // Check rotation card compare or preview
    const rotCard = target.closest('.rotation-card, [data-action="preview-3d"], .disclosure summary');
    if (rotCard) {
      const rotId = rotCard.querySelector('[data-action="preview-3d"]')?.dataset?.value ||
                    rotCard.querySelector('[data-journey="rotation"]')?.dataset?.value;
      if (rotId) pageActivity.rotation.compared.add(rotId);
      renderCoach();
    }
    // Check plan calendar viewed
    if (target.closest('[data-plan-section="calendar"], .plan-calendar-wrap')) {
      pageActivity.plan.calendarViewed = true;
      renderCoach();
    }
    // Check plan export/download clicked
    if (target.closest('[data-action="export-html"], [data-plan-section="export"], [data-action="print"]')) {
      pageActivity.plan.downloaded = true;
      renderCoach();
    }
  }, { capture: true, passive: true });

  // Priority range inputs on #rotations
  window.addEventListener('input', (event) => {
    if (event.target && event.target.matches('[data-weight], #select-pump-tariff')) {
      pageActivity.rotation.prioritiesChanged = true;
      renderCoach();
    }
  }, { capture: true, passive: true });

  // Checklist checkbox changes on #plan
  window.addEventListener('change', (event) => {
    if (event.target && (event.target.matches('[data-plan-section="checklist"] input[type="checkbox"], .plan-checklist input[type="checkbox"]'))) {
      if (event.target.checked) {
        pageActivity.plan.taskChecked = true;
        renderCoach();
      }
    }
  }, { capture: true, passive: true });

  // Map pan/zoom without a tap: wheel zoom or a real drag inside the map.
  window.addEventListener('wheel', (event) => {
    if (event.target?.closest?.('#field-map, .leaflet-container') && !pageActivity.field.mapChecked) {
      pageActivity.field.mapChecked = true;
      renderCoach();
    }
  }, { capture: true, passive: true });
  let mapPointer = null;
  window.addEventListener('pointerdown', (event) => {
    mapPointer = event.target?.closest?.('#field-map, .leaflet-container')
      ? { x: event.clientX, y: event.clientY } : null;
  }, { capture: true, passive: true });
  window.addEventListener('pointerup', (event) => {
    if (mapPointer && event.target?.closest?.('#field-map, .leaflet-container')) {
      const moved = Math.hypot(event.clientX - mapPointer.x, event.clientY - mapPointer.y);
      if (moved > 12 && !pageActivity.field.mapChecked) {
        pageActivity.field.mapChecked = true;
        renderCoach();
      }
    }
    mapPointer = null;
  }, { capture: true, passive: true });

  // Dialog saves: assumptions saved ticks constraints; area saved ticks area.
  window.addEventListener('submit', (event) => {
    const id = event.target?.id;
    if (id === 'profile-form' && !pageActivity.field.constraintsSaved) {
      pageActivity.field.constraintsSaved = true;
      renderCoach();
    } else if (id === 'net-area-form' && !pageActivity.field.areaChecked) {
      pageActivity.field.areaChecked = true;
      renderCoach();
    }
  }, { capture: true, passive: true });
}

// --- Checklist item definitions & computation ---
export function getPageChecklist(page = activePage) {
  const plan = getPlan();
  const items = [];

  if (page === 'field') {
    // Field: ○ Check your plot on the map · ○ Check the area (0.09 ha) · ○ Set irrigation & budget (Edit field assumptions) · ○ Use this field
    const mapChecked = pageActivity.field.mapChecked || !!(plan?.field);
    const areaChecked = pageActivity.field.areaChecked || !!(plan?.field?.areaHa);
    const constraintsSet = pageActivity.field.constraintsSaved || !!(plan?.field?.constraints && plan.field.constraints.budget && plan.field.constraints.irrigation);
    const fieldUsed = plan?.steps.field === 'done';

    items.push({
      id: 'field-map',
      text: t('Check your plot on the map', 'মানচিত্রে আপনার জমি দেখুন'),
      done: mapChecked,
      target: '#field-map, .leaflet-container',
    });
    const areaText = plan?.field?.areaHa
      ? `${numLocal(plan.field.areaHa, 2)} ha`
      : '0.09 ha';
    items.push({
      id: 'field-area',
      text: t(`Check the area (${areaText})`, `জমির আয়তন (${areaText}) দেখুন`),
      done: areaChecked,
      target: '.field-meta, .field-intro',
    });
    items.push({
      id: 'field-constraints',
      text: t('Set irrigation & budget (Edit field assumptions)', 'সেচ ও বাজেট ঠিক করুন (জমির তথ্য সম্পাদনা)'),
      done: constraintsSet,
      target: '[data-action="profile"], .field-bottom button',
    });
    items.push({
      id: 'field-use',
      text: t('Use this field', 'এই জমি ব্যবহার করুন'),
      done: fieldUsed,
      target: '[data-journey="field"], .journey-field-inline',
    });
  } else if (page === 'rotations') {
    // Rotation: ○ Set what matters (priorities) · ○ Compare the top 2 · ○ Choose a rotation
    const prioritiesSet = pageActivity.rotation.prioritiesChanged || (plan?.rotation?.priorities && Object.values(plan.rotation.priorities).some(v => v > 0));
    const comparedTop2 = pageActivity.rotation.compared.size >= 2 || !!(plan?.rotation);
    const rotationChosen = plan?.steps.rotation === 'done';

    items.push({
      id: 'rotation-priorities',
      text: t('Set what matters (priorities)', 'অগ্রাধিকার ঠিক করুন'),
      done: !!prioritiesSet,
      target: '.priority-box, #weight-cost, .preset-row',
    });
    items.push({
      id: 'rotation-compare',
      text: t('Compare the top 2', 'শীর্ষ ২টি তুলনা করুন'),
      done: comparedTop2,
      target: '.rotation-card:nth-of-type(1), .rotation-card:nth-of-type(2), #rotation-list',
    });
    items.push({
      id: 'rotation-choose',
      text: t('Choose a rotation', 'ফসলচক্র বেছে নিন'),
      done: rotationChosen,
      target: '.rotation-card.best [data-journey="rotation"], [data-journey="rotation"]',
    });
  } else if (page === 'planner') {
    // Planting: ○ Aman ✓ / Potato ○ / Mungbean ○ (optional) · ○ Finish my plan
    const nonFallow = plan?.rotation?.seasons?.filter(s => s.crop !== 'fallow') ?? [];
    if (nonFallow.length > 0) {
      const summaryText = nonFallow.map(s => {
        const crop = seasonCropName(s);
        const cropBn = s.cropBn || s.crop;
        const confirmed = plan?.planting?.[s.key]?.confirmedAt != null;
        return `${t(crop, cropBn)} ${confirmed ? '✓' : '○'}`;
      }).join(' / ');

      items.push({
        id: 'planting-seasons',
        text: `${summaryText} (${t('optional', 'ঐচ্ছিক')})`,
        done: allSeasonsReviewed(plan), // optional: never blocks Finish
        target: '#plan-seasons, [data-action="plan-confirm"]',
      });
    } else {
      items.push({
        id: 'planting-seasons',
        text: t('Check each season (optional)', 'প্রতিটি মৌসুম দেখে নিন (ঐচ্ছিক)'),
        done: allSeasonsReviewed(plan),
        target: '#plan-seasons, [data-action="plan-confirm"]',
      });
    }
    items.push({
      id: 'planting-finish',
      text: t('Finish my plan', 'আমার পরিকল্পনা শেষ করুন'),
      done: plan?.steps.planting === 'done',
      target: '[data-journey="finish"]',
    });
  } else if (page === 'plan') {
    // Your plan: ○ Read the calendar · ○ Tick your first task · ○ Download your plan
    const calendarDone = pageActivity.plan.calendarViewed || true; // viewing the page shows calendar
    const taskDone = pageActivity.plan.taskChecked;
    const downloadDone = pageActivity.plan.downloaded;

    items.push({
      id: 'plan-calendar',
      text: t('Read the calendar', 'ক্যালেন্ডারটি দেখুন'),
      done: calendarDone,
      target: '[data-plan-section="calendar"], .plan-calendar-wrap',
    });
    items.push({
      id: 'plan-task',
      text: t('Tick your first task', 'প্রথম কাজটি সম্পন্ন চিহ্নিত করুন'),
      done: taskDone,
      target: '[data-plan-section="checklist"] input[type="checkbox"], .plan-checklist input[type="checkbox"]',
    });
    items.push({
      id: 'plan-download',
      text: t('Download your plan', 'পরিকল্পনা ডাউনলোড করুন'),
      done: downloadDone,
      target: '[data-action="export-html"], [data-plan-section="export"] button',
    });
  }

  return items;
}

function numLocal(n, decimals = 0) {
  return typeof n === 'number' ? n.toFixed(decimals) : String(n);
}

function capitalize(s) {
  return typeof s === 'string' && s.length ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// --- Coach Panel Component ---
const STEP_INFO = {
  field: { num: 1, nameEn: 'Field', nameBn: 'জমি', instructionEn: 'Inspect boundary and set water access to begin.', instructionBn: 'সীমানা ও সেচ সুবিধা নির্ধারণ করে শুরু করুন।' },
  rotations: { num: 2, nameEn: 'Rotation', nameBn: 'ফসলচক্র', instructionEn: 'Set priorities and choose the best fit rotation.', instructionBn: 'অগ্রাধিকার নির্ধারণ করে সেরা ফসলচক্র বেছে নিন।' },
  planner: { num: 3, nameEn: 'Planting', nameBn: 'বপন', instructionEn: 'Each season starts on recommended settings. Check any you like, then Finish.', instructionBn: 'প্রতি মৌসুমে প্রস্তাবিত মাপ আছে। চাইলে দেখে নিন, তারপর শেষ করুন।' },
  plan: { num: 4, nameEn: 'Your plan', nameBn: 'আপনার পরিকল্পনা', instructionEn: 'Review the full season calendar and save your plan.', instructionBn: 'পুরো মৌসুমের ক্যালেন্ডার দেখে পরিকল্পনা সংরক্ষণ করুন।' },
};

export function renderCoach(container) {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  let host = container || document.querySelector('#journey-coach-host');
  if (!host) {
    if (typeof document.createElement !== 'function' || !document.body) return;
    host = document.createElement('div');
    host.id = 'journey-coach-host';
    document.body.appendChild(host);
  }

  const plan = getPlan();
  if (!plan || coachDismissed || !STEP_INFO[activePage]) {
    host.innerHTML = '';
    host.className = '';
    return;
  }

  const info = STEP_INFO[activePage];
  const checklist = getPageChecklist(activePage);

  if (coachCollapsed) {
    host.className = 'coach-host coach-host--collapsed';
    host.innerHTML = `
      <button type="button" class="coach-bubble-btn" data-coach="expand" aria-label="${t('Open Planty guide coach', 'Planty গাইড খুলুন')}">
        <span class="coach-bubble-mascot">${plantyMascot('pointing')}</span>
        <span class="coach-bubble-label">${t(`Step ${info.num}/4`, `ধাপ ${info.num}/৪`)}</span>
      </button>
    `;
    attachCoachEvents(host);
    return;
  }

  host.className = 'coach-host coach-host--docked';
  const isHowtoPage = activePage === 'field';
  host.innerHTML = `
    <aside class="coach-card" role="region" aria-label="${t('Planty Coach', 'Planty নির্দেশিকা')}" aria-live="polite">
      <div class="coach-header">
        <div class="coach-identity">
          <span class="coach-mascot">${plantyMascot('idle')}</span>
          <div>
            <span class="coach-step-eyebrow">${t(`Step ${info.num} of 4 · ${info.nameEn}`, `ধাপ ${info.num}/৪ · ${info.nameBn}`)}</span>
            <p class="coach-instruction">${t(info.instructionEn, info.instructionBn)}</p>
          </div>
        </div>
        <button type="button" class="coach-hide-btn" data-coach="hide" title="${t('Hide coach', 'লুকান')}" aria-label="${t('Hide coach', 'লুকান')}">✕</button>
      </div>

      <ul class="coach-checklist${isHowtoPage ? ' coach-checklist--howto' : ''}">
        ${isHowtoPage ? fieldHowtoItems(checklist, plan) : checklist.map(item => `
          <li class="coach-check-item ${item.done ? 'is-done' : ''}" data-item-id="${item.id}">
            <span class="coach-bullet" aria-hidden="true">${item.done ? '✓' : '○'}</span>
            <span class="coach-item-text">${esc(item.text)}</span>
          </li>
        `).join('')}
      </ul>

      <div class="coach-actions">
        <button type="button" class="button coach-show-me" data-coach="show-me">${t('Show me', 'আমাকে দেখান')}</button>
        <button type="button" class="button ghost coach-collapse" data-coach="hide">${t('Hide', 'লুকান')}</button>
        <button type="button" class="button ghost coach-exit" data-coach="exit" style="margin-left:auto;">${t('Exit plan', 'বের হন')}</button>
        <button type="button" class="coach-stop" data-coach="stop">${t('Stop guide', 'নির্দেশিকা বন্ধ')}</button>
      </div>
    </aside>
  `;

  attachCoachEvents(host);
}

// HOWTO pilot rows: one expandable sub-step at a time (current = first not
// done). Open row shows why + how, Show me, Watch how clip, and for the area
// step an explicit "Area is right ✓" confirm.
function fieldHowtoItems(checklist, plan) {
  const done = Object.fromEntries(checklist.map(item => [item.id, !!item.done]));
  const openId = resolveOpenId(checklist.map(item => item.id), done, openHowtoId);
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const areaText = plan?.field?.areaHa ? `${numLocal(plan.field.areaHa, 2)} ha` : '0.09 ha';
  return FIELD_HOWTO_STEPS.map(step => {
    const isDone = !!done[step.id];
    const isOpen = openId === step.id;
    const title = step.id === 'field-area'
      ? `${t(step.title.en, step.title.bn)} (${areaText})`
      : t(step.title.en, step.title.bn);
    return `
      <li class="coach-check-item ${isDone ? 'is-done' : ''} ${isOpen ? 'is-open' : ''}" data-item-id="${step.id}">
        <button type="button" class="coach-item-head" data-coach="toggle" data-id="${step.id}" aria-expanded="${isOpen}">
          <span class="coach-bullet" aria-hidden="true">${isDone ? '✓' : '○'}</span>
          <span class="coach-item-text">${esc(title)}</span>
          <span class="coach-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="coach-item-body"${isOpen ? '' : ' hidden'}>
          <p class="coach-why">${esc(t(step.why.en, step.why.bn))}</p>
          <p class="coach-how">${esc(t(step.how.en, step.how.bn))}</p>
          <div class="coach-item-btns">
            <button type="button" class="button coach-show-me" data-coach="show-me" data-id="${step.id}">${t('Show me', 'আমাকে দেখান')}</button>
            <button type="button" class="button ghost" data-coach="watch" data-id="${step.id}">${playingHowtoId === step.id ? t('■ Stop', '■ থামান') : t(`▶ Watch how · ${step.seconds} s`, `▶ দেখুন · ${step.seconds} সে`)}</button>
            ${step.id === 'field-area' && !isDone ? `<button type="button" class="button ghost" data-coach="area-ok">${t('Area is right ✓', 'আয়তন ঠিক আছে ✓')}</button>` : ''}
          </div>
          ${clipMarkup(step, { playing: playingHowtoId === step.id, reducedMotion: reduced })}
        </div>
      </li>`;
  }).join('');
}

function attachCoachEvents(host) {
  host.onclick = (e) => {
    const btn = e.target.closest('[data-coach]');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.dataset.coach;
    const id = btn.dataset.id;
    if (action === 'expand') {
      coachCollapsed = false;
      renderCoach();
    } else if (action === 'hide') {
      coachCollapsed = true;
      renderCoach();
    } else if (action === 'stop') {
      coachDismissed = true;
      guide.stop();
      renderCoach();
    } else if (action === 'exit') {
      showExitPrompt();
    } else if (action === 'toggle' && id) {
      const checklist = getPageChecklist(activePage);
      const done = Object.fromEntries(checklist.map(item => [item.id, !!item.done]));
      const openId = resolveOpenId(checklist.map(item => item.id), done, openHowtoId);
      openHowtoId = openId === id ? '__closed' : id;
      renderCoach();
    } else if (action === 'show-me') {
      if (id) runHowtoShowMe(id);
      else runShowMe();
    } else if (action === 'watch' && id) {
      playingHowtoId = playingHowtoId === id ? null : id;
      renderCoach();
    } else if (action === 'area-ok') {
      pageActivity.field.areaChecked = true;
      openHowtoId = null;
      renderCoach();
    }
  };
}

// "Show me" action: on the field page each sub-step runs its micro-sequence
// (spotlight + ripple on every control, waiting for the real action); other
// pages keep the single spotlight on the first unchecked item.
export function runShowMe(customReason = null) {
  const checklist = getPageChecklist(activePage);
  const firstMissing = checklist.find(item => !item.done);
  if (!firstMissing) {
    if (typeof document !== 'undefined') {
      guide.hint(checklist[checklist.length - 1].target, t('Step is complete! Use Continue →', 'ধাপ সম্পন্ন! এগিয়ে যান → চাপুন'));
    }
    return;
  }

  if (activePage === 'field') {
    // The micro-sequence guides the missing action itself, so a Continue
    // reason needs no separate bubble.
    const done = Object.fromEntries(checklist.map(item => [item.id, !!item.done]));
    runHowtoShowMe(resolveOpenId(checklist.map(item => item.id), done, openHowtoId) ?? firstMissing.id);
    return;
  }

  const text = customReason || firstMissing.text;
  coachCollapsed = false;
  renderCoach();

  if (typeof document !== 'undefined') {
    guide.show({
      target: firstMissing.target,
      text,
      pose: 'pointing',
      timeout: 8000,
    });
  }
}

// HOWTO Show me: run one sub-step's micro-actions in order with guide.sequence.
export function runHowtoShowMe(id) {
  const step = FIELD_HOWTO_STEPS.find(item => item.id === id) ?? FIELD_HOWTO_STEPS[0];
  coachCollapsed = false;
  renderCoach();
  if (typeof document === 'undefined') return;
  const steps = step.micro.map(micro => ({
    target: micro.target,
    text: { en: micro.text.en, bn: micro.text.bn },
    action: micro.action,
    pose: 'pointing',
    timeout: 8000,
    inDialog: !!micro.inDialog,
  }));
  guide.sequence(steps);
  watchGuideDialog(steps);
}

// The #modal <dialog> renders in the top layer, above the guide root in
// <body>. While a micro-step targets a control inside the dialog, reparent the
// guide root into the dialog so scrim/ripple/bubble stay visible; move it back
// when the step or dialog closes. Focus never leaves the dialog, so its trap
// stays sane.
let guideDialogCleanup = null;
function stopGuideDialogWatch() {
  if (guideDialogCleanup) {
    guideDialogCleanup();
    guideDialogCleanup = null;
  }
}
function watchGuideDialog(steps) {
  stopGuideDialogWatch();
  if (typeof document === 'undefined') return;
  const dialog = document.querySelector('#modal');
  const place = () => {
    const root = document.querySelector('.planty-guide');
    if (!root) return;
    const bubbleText = root.querySelector('[aria-live]')?.textContent ?? '';
    const current = steps.find(item => bubbleText === item.text.en || bubbleText === item.text.bn);
    if (current?.inDialog && dialog?.open) {
      if (root.parentElement !== dialog) dialog.appendChild(root);
    } else if (dialog && root.parentElement === dialog) {
      document.body.appendChild(root);
    }
  };
  const onClose = () => {
    const root = document.querySelector('.planty-guide');
    if (root && dialog && root.parentElement === dialog) document.body.appendChild(root);
  };
  dialog?.addEventListener('close', onClose);
  const observer = new MutationObserver(() => {
    if (!document.querySelector('.planty-guide')) {
      stopGuideDialogWatch();
      return;
    }
    place();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  guideDialogCleanup = () => {
    observer.disconnect();
    dialog?.removeEventListener('close', onClose);
  };
  place();
}

// --- Hand-offs in Context & Pulse ---
export function updateHandOffs(page = activePage) {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return;
  const plan = getPlan();
  if (!plan) return;

  const checklist = getPageChecklist(page);
  // Checklist is "otherwise complete" if all items except the final action are done
  const nonFinalDone = checklist.slice(0, -1).every(item => item.done);

  if (page === 'field') {
    // Hand-off inside/under plot dossier card
    const dossierCard = document.querySelector('.field-card');
    if (dossierCard && typeof document.createElement === 'function') {
      let slot = dossierCard.querySelector('.journey-field-inline');
      if (!slot) {
        slot = document.createElement('div');
        slot.className = 'journey-field-inline';
        dossierCard.appendChild(slot);
      }
      const isPulse = nonFinalDone && plan.steps.field !== 'done';
      slot.innerHTML = `
        <button type="button" class="button primary journey-field-cta ${isPulse ? 'journey-cta-pulse' : ''}" data-journey="field">
          ${t('Use this field →', 'এই জমি ব্যবহার করুন →')}
        </button>
      `;
    }
  } else if (page === 'rotations') {
    // Pulse on rotation cards if priorities are checked
    const previewCards = typeof document.querySelectorAll === 'function' ? document.querySelectorAll('.rotation-card') : [];
    previewCards.forEach(card => {
      const cta = card.querySelector('[data-journey="rotation"]');
      if (cta) {
        if (nonFinalDone && plan.steps.rotation !== 'done') {
          cta.classList.add('journey-cta-pulse');
        } else {
          cta.classList.remove('journey-cta-pulse');
        }
      }
    });
  } else if (page === 'planner') {
    // Finish CTA under season tabs
    const finishSlot = document.querySelector('#planner-finish-slot') || document.querySelector('#journey-finish-slot');
    if (finishSlot) {
      const canFinish = canFinishPlanting(plan);
      const isPulse = canFinish && plan.steps.planting !== 'done';
      finishSlot.innerHTML = `
        <div class="journey-handoff journey-planner-finish">
          <button type="button" class="button primary ${isPulse ? 'journey-cta-pulse' : ''}" data-journey="finish"${canFinish ? '' : ' disabled'}>
            ${t('Finish my plan →', 'আমার পরিকল্পনা শেষ করুন →')}
          </button>
          ${finishNote(plan) ? `<p class="note">${finishNote(plan)}</p>` : ''}
        </div>
      `;
    }
  }
}

// --- Continue → Resolution ---
export function handleContinue() {
  const plan = getPlan();
  if (!plan) return;

  const checklist = getPageChecklist(activePage);
  const firstMissing = checklist.find(item => !item.done);

  if (firstMissing) {
    // Incomplete: open coach and run Show me with specific reason
    coachCollapsed = false;
    renderCoach();

    let reason = null;
    if (activePage === 'planner') {
      const seasons = plan?.rotation?.seasons?.filter(s => s.crop !== 'fallow') ?? [];
      const unconfirmed = canFinishPlanting(plan) ? null : seasons.find(s => !plan.planting[s.key]?.confirmedAt);
      if (unconfirmed) {
        const crop = seasonCropName(unconfirmed);
        const cropBn = unconfirmed.cropBn || unconfirmed.crop;
        reason = t(`Check ${crop} first`, `আগে ${cropBn} দেখে নিন`);
      }
    } else if (activePage === 'field') {
      reason = t('Complete field details and click ‘Use this field →’', 'জমির বিবরণ নিশ্চিত করে ‘এই জমি ব্যবহার করুন →’ চাপুন');
    } else if (activePage === 'rotations') {
      reason = t('Select a rotation by clicking ‘Choose this rotation →’', '‘এই ফসলচক্র বেছে নিন →’ চেপে ফসলচক্র নির্ধারণ করুন');
    }

    runShowMe(reason);
    return false;
  }

  // Complete: handoff to next step
  const next = nextStep();
  const routeMap = { field: 'field', rotation: 'rotations', planting: 'planner', plan: 'plan' };
  const targetRoute = next ? (routeMap[next] || next) : 'plan';
  if (navigationCallback) {
    navigationCallback(targetRoute);
  }
  return true;
}

// --- Rahim's Narrated Demo Engine ---
export const DEMO_BEATS = [
  {
    page: 'field',
    name: 'welcome',
    target: '#field-map, .leaflet-container',
    narrationEn: "Welcome! Rahim is planning his 0.09 ha plot in Mithapukur, Rangpur.",
    narrationBn: "স্বাগতম! রহিম রংপুরের মিঠাপুকুরে তার ০.০৯ হেক্টর জমির পরিকল্পনা করছেন।",
    pose: 'happy',
    action: async (planRef) => {
      // Step 1 begins: user sees Rahim's field selected
      const ui = await import('./ui.js');
      const earth = ui.earth ?? (await fetchDemoJson('earth-data'));
      const f = earth.fields.find(item => item.id === 'mithapukur');
      const constraints = ui.defaultProfile();
      const snapshot = fieldSnapshot(f, ui.basePolygon(f), constraints, ui.state.netInputs[f.id]);
      return confirmField({ ...snapshot, name: "Rahim's field" });
    },
  },
  {
    page: 'field',
    name: 'inspect-field',
    target: '.field-card',
    narrationEn: "First, Rahim checks his soil and boundary area on the satellite map.",
    narrationBn: "প্রথমে রহিম স্যাটেলাইট মানচিত্রে তার জমির সীমানা ও মাটির ধরন দেখে নেন।",
    pose: 'pointing',
    action: async () => {},
  },
  {
    page: 'field',
    name: 'confirm-field',
    target: '[data-journey="field"], .journey-field-inline',
    narrationEn: "Looks good! Rahim confirms this field to explore crop rotations.",
    narrationBn: "সব ঠিক আছে! ফসলচক্র দেখতে রহিম এই জমি নিশ্চিত করছেন।",
    pose: 'happy',
    action: async () => {
      // Advance step 1 to done
      if (typeof document !== 'undefined') {
        guide.celebrate(t('Field confirmed!', 'জমি নিশ্চিত হয়েছে!'));
      }
    },
  },
  {
    page: 'rotations',
    name: 'priorities',
    target: '.priority-box, #weight-water',
    narrationEn: "Rahim balances profit, water saving, and soil health for the year ahead.",
    narrationBn: "রহিম আগামী বছরের জন্য লাভ, পানি সাশ্রয় ও মাটির স্বাস্থ্যের ভারসাম্য করছেন।",
    pose: 'thinking',
    action: async () => {},
  },
  {
    page: 'rotations',
    name: 'pick-rotation',
    target: '.rotation-card.best, [data-journey="rotation"]',
    narrationEn: "The Aman → Potato → Mungbean rotation fits best. Rahim chooses it!",
    narrationBn: "আমন → আলু → মুগডাল চক্রটি সবচেয়ে উপযোগী। রহিম এটি নির্বাচন করছেন!",
    pose: 'pointing',
    action: async () => {
      const ui = await import('./ui.js');
      const agronomy = ui.agronomy ?? (await fetchDemoJson('agronomy'));
      const priorities = ui.defaultPriorities();
      return confirmRotation(rotationSnapshot('legume', priorities, agronomy));
    },
  },
  {
    page: 'planner',
    name: 'season-aman',
    target: '#plan-seasons, #plan-season-tab-0',
    narrationEn: "In the Planner, Rahim reviews Season 1 (Aman rice) spacing and rows.",
    narrationBn: "প্ল্যানারে রহিম প্রথম মৌসুম (আমন ধান)-এর সারি ও দূরত্ব যাচাই করছেন।",
    pose: 'pointing',
    action: async () => {},
  },
  {
    page: 'planner',
    name: 'season-potato',
    target: '[data-action="plan-confirm"]',
    narrationEn: "Season 1 looks great! Rahim reviews Season 2 (Potato) and taps Save & next.",
    narrationBn: "প্রথম মৌসুম প্রস্তুত! রহিম দ্বিতীয় মৌসুম (আলু) দেখে ঠিক আছে চিহ্নিত করছেন।",
    pose: 'pointing',
    action: async () => {},
  },
  {
    page: 'planner',
    name: 'season-mungbean-finish',
    target: '[data-journey="finish"]',
    narrationEn: "All seasons verified! Rahim completes his planting schedule.",
    narrationBn: "সব মৌসুম যাচাই সম্পন্ন! রহিম বপন পরিকল্পনা শেষ করছেন।",
    pose: 'happy',
    action: async () => {
      confirmPlanting();
      markPlanGenerated({});
    },
  },
  {
    page: 'plan',
    name: 'plan-summary',
    target: '[data-plan-section="calendar"], .plan-calendar-wrap',
    narrationEn: "Here is Rahim's full season calendar and task checklist ready to print!",
    narrationBn: "এই হলো রহিমের পূর্ণাঙ্গ মৌসুমের ক্যালেন্ডার ও করণীয় তালিকা!",
    pose: 'happy',
    action: async () => {
      if (typeof document !== 'undefined') {
        guide.celebrate(t("Rahim's journey complete!", 'রহিমের পরিকল্পনা সম্পন্ন!'));
      }
    },
  },
];

async function fetchDemoJson(name) {
  if (typeof document === 'undefined') {
    const { readFileSync } = await import('node:fs');
    return JSON.parse(readFileSync(new URL(`../../public/data/${name}.json`, import.meta.url), 'utf8'));
  }
  const url = `data/${name}.json`;
  const response = await fetch(new URL(url, document.baseURI));
  return response.json();
}

export class DemoStoryDirector {
  constructor(options = {}) {
    this.beats = options.beats || DEMO_BEATS;
    this.currentBeatIndex = 0;
    this.playing = false;
    this.timer = null;
    this.savedOwnPlan = null;
    this.beatDurationMs = options.beatDurationMs || 9000; // ~90s across beats
    this.onBeat = options.onBeat || (() => {});
    this.onExit = options.onExit || (() => {});
  }

  isPlaying() {
    return this.playing;
  }

  getBeat() {
    return this.beats[this.currentBeatIndex];
  }

  async start() {
    // 1. Stash own plan
    try {
      const existing = globalThis.localStorage?.getItem(OWN_STORAGE_KEY);
      this.savedOwnPlan = existing ? JSON.parse(existing) : null;
    } catch {
      this.savedOwnPlan = null;
    }

    // 2. Start clean demo plan
    startPlan({ mode: 'demo' });
    this.currentBeatIndex = 0;
    this.playing = true;

    renderDemoControls();
    await this.playBeat(this.currentBeatIndex);
  }

  async playBeat(index) {
    if (!this.playing || index < 0 || index >= this.beats.length) {
      if (index >= this.beats.length) {
        this.pause();
      }
      return;
    }

    this.currentBeatIndex = index;
    const beat = this.beats[index];

    // Navigate to page if needed
    if (navigationCallback && activePage !== beat.page) {
      navigationCallback(beat.page);
    }

    // Run action
    try {
      await beat.action(getPlan());
    } catch (e) {
      console.warn('Demo beat action error', e);
    }

    // Narrate in Planty bubble & spotlight target
    if (typeof document !== 'undefined') {
      guide.show({
        target: beat.target,
        text: { en: beat.narrationEn, bn: beat.narrationBn },
        pose: beat.pose || 'pointing',
        timeout: 10000,
      });
    }

    renderDemoControls();
    this.onBeat(beat, index);

    // Schedule next beat if still playing
    clearTimeout(this.timer);
    if (this.playing && index + 1 < this.beats.length) {
      this.timer = setTimeout(() => {
        void this.playBeat(index + 1);
      }, this.beatDurationMs);
    }
  }

  pause() {
    this.playing = false;
    clearTimeout(this.timer);
    renderDemoControls();
  }

  resume() {
    if (this.playing) return;
    this.playing = true;
    renderDemoControls();
    if (this.currentBeatIndex >= this.beats.length - 1) {
      void this.playBeat(0);
    } else {
      void this.playBeat(this.currentBeatIndex + 1);
    }
  }

  next() {
    clearTimeout(this.timer);
    if (this.currentBeatIndex + 1 < this.beats.length) {
      void this.playBeat(this.currentBeatIndex + 1);
    } else {
      this.pause();
    }
  }

  exit() {
    this.pause();
    guide.stop();
    demoController = null;

    // Restore own plan
    if (this.savedOwnPlan) {
      importPlanJSON(JSON.stringify(this.savedOwnPlan));
    } else {
      resetPlan();
    }

    removeDemoControls();
    if (navigationCallback) navigationCallback('field');
    this.onExit();
  }
}

export function startRahimDemo(options = {}) {
  if (demoController) {
    demoController.exit();
  }
  demoController = new DemoStoryDirector(options);
  return demoController.start();
}

export function exitRahimDemo() {
  if (demoController) {
    demoController.exit();
  }
}

// Controls always visible during demo: Pause/Play, Next beat, Exit demo, "Start my own"
function renderDemoControls() {
  if (typeof document === 'undefined') return;
  let bar = document.querySelector('#journey-demo-controls');
  if (!demoController) {
    bar?.remove();
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'journey-demo-controls';
    document.body.appendChild(bar);
  }

  const isPlaying = demoController.isPlaying();
  const beat = demoController.getBeat();
  const beatIndex = demoController.currentBeatIndex + 1;
  const totalBeats = demoController.beats.length;

  bar.className = 'demo-controls-bar';
  bar.innerHTML = `
    <div class="demo-controls-inner" role="toolbar" aria-label="${t("Rahim's Demo Controls", 'রহিমের ডেমো কন্ট্রোল')}">
      <div class="demo-controls-meta">
        <strong>${t("Rahim's Journey", 'রহিমের পথ')}</strong>
        <span>(${beatIndex}/${totalBeats})</span>
      </div>
      <div class="demo-controls-buttons">
        <button type="button" class="button small" data-demo="toggle-play">
          ${isPlaying ? t('⏸ Pause', '⏸ থামান') : t('▶ Play', '▶ চালু')}
        </button>
        <button type="button" class="button small" data-demo="next" ${beatIndex >= totalBeats ? 'disabled' : ''}>
          ${t('Next beat →', 'পরের দৃশ্য →')}
        </button>
        <button type="button" class="button small ghost" data-demo="exit">
          ${t('Exit demo', 'ডেমো থেকে বের হন')}
        </button>
        <button type="button" class="button small primary" data-demo="start-own">
          ${t('Start my own', 'নিজেরটি শুরু করুন')}
        </button>
      </div>
    </div>
  `;

  bar.onclick = (e) => {
    const btn = e.target.closest('[data-demo]');
    if (!btn || !demoController) return;
    const action = btn.dataset.demo;
    if (action === 'toggle-play') {
      if (demoController.isPlaying()) demoController.pause();
      else demoController.resume();
    } else if (action === 'next') {
      demoController.next();
    } else if (action === 'exit' || action === 'start-own') {
      demoController.exit();
    }
  };
}

function removeDemoControls() {
  if (typeof document !== 'undefined') {
    document.querySelector('#journey-demo-controls')?.remove();
  }
}

// Auto-boot listeners on import in browser
if (typeof window !== 'undefined') {
  initStoryListeners();
}
