import { t, esc, state, field, polygon, profile, agronomy, toast, repaint } from './ui.js';
import { getPlan, startPlan, demoPlan, confirmField, fieldSnapshot, confirmRotation,
  rotationSnapshot, confirmPlanting, stepStatus, nextStep, reviewReasons, allSeasonsReviewed, subscribe } from './journey.js';
import { plantyMascot } from './planty.js';
import { guide } from './planty-guide.js';
import { setStoryPage, handleContinue, startRahimDemo, updateHandOffs, renderCoach } from './journey-story.js';

const steps = [
  ['field', 'field', 'Field', 'জমি'],
  ['rotation', 'rotations', 'Rotation', 'ফসলচক্র'],
  ['planting', 'planner', 'Planting', 'বপন'],
  ['plan', 'plan', 'Your plan', 'আপনার পরিকল্পনা'],
];
const stepFor = route => steps.find(step => step[1] === route)?.[0];
let route, navigate, hasPlanPage, handoffTimer, animationTimer, pendingHint, topbarObserver;
let previous = stepStatus();
let previousPlanId = getPlan()?.id;
let previousPlanting = getPlan()?.planting ?? {};
let changedPlantingControl = '#plant-controls';
let demoLoading = false;
const completed = new Set();
const dismissed = new Map();

export function journeyBar(page) {
  const plan = getPlan();
  if (!plan || !stepFor(page)) return '';
  const statuses = stepStatus();
  const labels = { done: t('Done', 'সম্পন্ন'), current: t('Current step', 'বর্তমান ধাপ'),
    todo: t('To do', 'বাকি'), review: t('Needs review', 'যাচাই দরকার') };
  return `<div class="journey-shell">${plan.mode === 'demo' ? `<div class="journey-demo"><strong>${t("Demo — Rahim's field", 'ডেমো — রহিমের জমি')}</strong><button type="button" data-journey="own">${t('Start my own', 'নিজের পরিকল্পনা শুরু')}</button></div>` : ''}
    <nav class="journey-bar" aria-label="${t('Season journey', 'মৌসুমের পথ')}" data-journey-page="${page}"><ol>${steps.map(([key, target, en, bn], index) => {
      const current = target === page;
      const status = statuses[key] === 'todo' && current ? 'current' : statuses[key];
      return `<li><a class="journey-step ${current ? 'is-current' : ''} ${status === 'done' && completed.has(key) ? 'just-completed' : ''}" href="#${target}" data-journey="jump" data-value="${target}" data-status="${status}"${current ? ' aria-current="step"' : ''} aria-label="${index + 1}. ${esc(t(en, bn))}: ${labels[status]}"><span class="journey-number" aria-hidden="true">${status === 'done' ? '✓' : status === 'review' ? '⚠' : t(String(index + 1), ['১', '২', '৩', '৪'][index])}</span><span class="journey-step-label">${t(en, bn)}</span></a></li>`;
    }).join('')}</ol><button type="button" class="button primary journey-continue" data-journey="continue">${t('Continue →', 'এগিয়ে যান →')}</button></nav></div>`;
}

export function journeyStart() {
  if (getPlan()) return '';
  return `<section class="journey-start"><div>${plantyMascot('happy')}<div><h2>${t('Your field. Your next season.', 'আপনার জমি। আপনার পরের মৌসুম।')}</h2><p>${t('Choose your field, compare rotations, and make a planting plan.', 'জমি বেছে নিন, ফসলচক্র তুলনা করুন, বপনের পরিকল্পনা করুন।')}</p></div></div><div class="journey-start-actions"><button type="button" class="button primary" data-journey="own">${t('Plan my season', 'আমার মৌসুমের পরিকল্পনা')}</button><button type="button" class="button" data-journey="demo">${t("Watch Rahim's journey", 'রহিমের পরিকল্পনা দেখুন')}</button></div></section>`;
}

export function journeyFieldCTA() {
  return getPlan() ? `<div class="journey-handoff"><button type="button" class="button primary" data-journey="field">${t('Use this field →', 'এই জমি ব্যবহার করুন →')}</button></div>` : '';
}

export function journeyRotationCTA(id) {
  return getPlan() ? `<button type="button" class="button primary journey-choose" data-journey="rotation" data-value="${esc(id)}"${getPlan().steps.field !== 'done' ? ' disabled' : ''}>${t('Choose this rotation →', 'এই ফসলচক্র বেছে নিন →')}</button>` : '';
}

export function canFinishPlanting(plan) {
  return !!(plan?.steps.rotation === 'done' && allSeasonsReviewed(plan));
}

// Name the seasons still waiting for "Looks good ✓" so a disabled Finish is never a mystery.
function finishNote(plan) {
  const names = { aman: 'Aman rice', boro: 'Boro rice' };
  const left = (plan.rotation?.seasons || []).filter(s => s.crop !== 'fallow' && !plan.planting?.[s.key]?.confirmedAt);
  if (plan.steps?.rotation !== 'done' || !left.length) return t('Choose a rotation and review every season to finish.', 'শেষ করতে ফসলচক্র বেছে প্রতিটি মৌসুম যাচাই করুন।');
  const en = left.map(s => names[s.crop] || s.crop[0].toUpperCase() + s.crop.slice(1)).join(', ');
  const bn = left.map(s => s.cropBn || s.crop).join(', ');
  return t(`Still to review: ${en}. Open each tab and tap “Looks good ✓”.`, `এখনও যাচাই বাকি: ${bn}। প্রতিটি ট্যাব খুলে “ঠিক আছে ✓” চাপুন।`);
}

export function journeyFinishCTA() {
  const plan = getPlan();
  if (!plan) return '';
  return `<div class="journey-handoff"><button type="button" class="button primary" data-journey="finish"${canFinishPlanting(plan) ? '' : ' disabled'}>${t('Finish my plan →', 'আমার পরিকল্পনা শেষ করুন →')}</button>${canFinishPlanting(plan) ? '' : `<p class="note">${finishNote(plan)}</p>`}</div>`;
}

const reviewKey = plan => JSON.stringify([plan.updatedAt, plan.reviews]);
export function journeyReview(page) {
  const plan = getPlan();
  const key = stepFor(page);
  if (!plan || plan.steps[key] !== 'review' || dismissed.get(key) === reviewKey(plan)) return '';
  return `<aside class="journey-review" role="status"><span>${plantyMascot('thinking')}</span><p><strong>${t('Planty · Needs review', 'Planty · যাচাই দরকার')}</strong><br>${esc(reviewReasons(t).join(' · '))}</p><button type="button" class="button" data-journey="review">${t('Review', 'যাচাই করুন')}</button><button type="button" data-journey="dismiss" aria-label="${t('Dismiss review reminder', 'যাচাইয়ের বার্তা বন্ধ করুন')}">×</button></aside>`;
}

function refreshJourney() {
  if (!route || typeof document === 'undefined') return;
  const fragments = { '#journey-bar-slot': journeyBar(route), '#journey-start-slot': route === 'field' ? journeyStart() : '',
    '#journey-review-slot': journeyReview(route), '#journey-field-slot': journeyFieldCTA(), '#journey-finish-slot': journeyFinishCTA() };
  for (const [selector, html] of Object.entries(fragments)) {
    const host = document.querySelector(selector);
    if (host && host.innerHTML !== html) host.innerHTML = html;
  }
}

subscribe(plan => {
  if (plan?.id !== previousPlanId) completed.clear();
  previousPlanId = plan?.id;
  for (const [key, settings] of Object.entries(plan?.planting ?? {})) {
    const before = previousPlanting[key];
    if (!before) continue;
    for (const [property, selector] of [['crop', '.plan-crops'], ['rowSpacingCm', '#plan-row'],
      ['withinRowCm', '#plan-spacing'], ['usableAreaPct', '#plan-usable']]) {
      if (before[property] !== settings[property]) changedPlantingControl = selector;
    }
  }
  previousPlanting = plan?.planting ?? {};
  const statuses = stepStatus();
  for (const [key] of steps) if (statuses[key] === 'done' && previous[key] !== 'done') completed.add(key);
  previous = statuses;
  clearTimeout(animationTimer);
  animationTimer = setTimeout(() => { completed.clear(); refreshJourney(); }, 1400);
  refreshJourney();
});

export function mountJourney(page, go, planPageExists) {
  route = page;
  navigate = go;
  hasPlanPage = planPageExists;
  clearTimeout(handoffTimer);
  refreshJourney();
  setStoryPage(page, go);
  topbarObserver?.disconnect();
  const topbar = document.querySelector('.topbar');
  const shell = document.querySelector('.journey-shell');
  if (topbar && shell) {
    const slot = shell.parentElement;
    const position = () => slot.style.setProperty('--journey-top', `${topbar.getBoundingClientRect().height}px`);
    position();
    topbarObserver = new ResizeObserver(position);
    topbarObserver.observe(topbar);
  }
  if (pendingHint?.target === page) {
    const { selector, hint } = pendingHint;
    pendingHint = null;
    handoffTimer = setTimeout(() => { if (route === page) guide.hint(selector, hint); }, 850);
  }
}

function jump(target) {
  guide.stop();
  clearTimeout(handoffTimer);
  pendingHint = null;
  if (target === 'plan' && !hasPlanPage()) {
    toast(t('Your plan page is coming next', 'আপনার পরিকল্পনার পাতা শীঘ্রই আসছে'));
    return;
  }
  navigate(target);
}

function celebrate(step, message) {
  completed.add(step);
  clearTimeout(animationTimer);
  animationTimer = setTimeout(() => { completed.clear(); refreshJourney(); }, 1400);
  refreshJourney();
  guide.celebrate(message);
}

function handoff(target, message, selector, hint) {
  pendingHint = { target, selector, hint };
  celebrate(stepFor(route), message);
  navigate(target);
}

export async function journeyAction(action, value) {
  try {
    if (action === 'own') {
      startPlan({ mode: 'own' });
      dismissed.clear();
      jump('field');
    } else if (action === 'demo') {
      if (demoLoading) return;
      demoLoading = true;
      try {
        dismissed.clear();
        await startRahimDemo();
      } finally { demoLoading = false; }
    } else if (action === 'jump') jump(value);
    else if (action === 'continue') {
      const allowed = handleContinue();
      if (allowed) {
        const step = nextStep() ?? 'plan';
        jump(steps.find(item => item[0] === step)[1]);
      }
    } else if (action === 'field') {
      confirmField(fieldSnapshot(field(), polygon(), profile()));
      handoff('rotations', t('Field confirmed!', 'জমি নিশ্চিত হয়েছে!'), '#rotation-list',
        t('Pick the rotation that fits you', 'আপনার উপযোগী ফসলচক্র বেছে নিন'));
    } else if (action === 'rotation') {
      if (getPlan()?.steps.field !== 'done') return;
      confirmRotation(rotationSnapshot(value, state.weights, agronomy));
      handoff('planner', t('Rotation chosen!', 'ফসলচক্র বেছে নেওয়া হয়েছে!'),
        '#plan-seasons',
        t('Set planting for each season', 'প্রতি মৌসুমের বপনের মাপ দিন'));
    } else if (action === 'finish') {
      if (!canFinishPlanting(getPlan())) return;
      confirmPlanting();
      celebrate('planting', t('Planting confirmed!', 'বপনের মাপ নিশ্চিত হয়েছে!'));
      if (hasPlanPage()) navigate('plan');
      else toast(t('Your plan page is coming next', 'আপনার পরিকল্পনার পাতা শীঘ্রই আসছে'));
    } else if (action === 'dismiss') {
      dismissed.set(stepFor(route), reviewKey(getPlan()));
      refreshJourney();
    } else if (action === 'review') {
      const reason = getPlan()?.reviews[stepFor(route)];
      const selector = route === 'field' ? '.field-selector, [data-action="profile"]' :
        route === 'rotations' ? (reason?.en === 'field changed' ? '[data-action="profile"]' : '[data-weight], #rotation-list') :
          route === 'planner' ? (reason?.en.startsWith('planting settings') ? changedPlantingControl : '.plan-season-tabs, .plan-crops, #plant-controls') : '[data-journey="jump"]';
      guide.hint(selector, reason ? t(reason.en, reason.bn) : reviewReasons(t).join(' · '));
    }
  } catch (error) {
    console.warn('Season journey could not be saved', error);
    toast(t('Could not save your season. Please try again.', 'মৌসুম সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।'));
    repaint();
  }
}
