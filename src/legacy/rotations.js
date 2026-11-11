import {
  state,
  agronomy,
  persist,
  t,
  esc,
  num,
  field,
  area,
  profile,
  icon,
  button,
  header,
  panel,
  tag,
  truth,
  chips,
  sources,
  toast,
  repaint,
  modal,
  download,
  timeline,
  stateEmpty,
  polygon,
  fetchJsonMaybeGzip,
} from './ui.js';
import { getCachedPower } from './powerlive.js';
import { rotationEvidence } from './engine.js';
import { setPlantCrop } from './planner.js';
import * as rotationTool from './rotation-tool.js';

// Studio 3D integration state
let studioOpened = false;
let studioModule = null;
let activeRotationId = null;
let previewedRotationId = null;
let studioDataModule = null;
let activePlantingLayout = 'rows';
let drainTrenchActive = true;
let canalBlocked = false;
let selectedNutrient = 'moisture';
let cachedSoilNutrients = null;
let cachedSmap = null;
let cachedWaterTable = null;
let cachedSoilProfile = null;
let cachedLowGround = null;
let cachedS1Water = null; // null = unprobed, false = not found, object = data

export const PUMP_FLOW_LPH = 45000; // 45,000 L/hr (~45 m3/hr, SCENARIO)

/**
 * Calculate irrigation pump hours and cost in Taka
 * shortfallLitres / 45,000 L/hr * tariffRate (Tk/hr)
 */
export function calcIrrigationCost(shortfallLitres, tariffKey = 'diesel') {
  const tariffRate = rotationTool.PUMP_TARIFFS[tariffKey]?.rate || 320;
  if (!shortfallLitres || shortfallLitres <= 0) {
    return { pumpHours: 0, costTk: 0, pumpFlowLph: PUMP_FLOW_LPH, tariffRate };
  }
  const pumpHours = shortfallLitres / PUMP_FLOW_LPH;
  const costTk = Math.round(pumpHours * tariffRate);
  return {
    pumpHours: Math.round(pumpHours * 10) / 10,
    costTk,
    pumpFlowLph: PUMP_FLOW_LPH,
    tariffRate,
  };
}

// Bengali translations
const issueBn = {
  'Potato establishment still needs a verified water source.':
    'আলু লাগানোর জন্য সেচ নিশ্চিত করতে হবে।',
  'Reliable Boro irrigation is unavailable.': 'বোরোর জন্য নির্ভরযোগ্য সেচ নেই।',
  'Confirm the irrigation supply for the Boro stage.':
    'বোরো মৌসুমে সেচের ব্যবস্থা নিশ্চিত করুন।',
  'The selected low budget does not fit the higher-input potato stage.':
    'কম বাজেটে আলুর খরচ মেটানো কঠিন।',
  'Late Aman harvest makes this winter sequence conditional.':
    'আমন দেরিতে কাটলে শীতের ফসলের সময় কমে যাবে।',
  'Flood delay requires a revised sowing window and drainage check.':
    'বন্যার পরে পানি নামা ও বপনের সময় আবার যাচাই করুন।',
};

// Study index
const studyIndex = { baseline: 0, mustard: 1, potato: 2, legume: 3 };

/**
 * Mapping from priority keys to engine weights
 */
function mapPriorityKey(key) {
  if (key === 'income') return 'cost';
  if (key === 'stability') return 'risk';
  return key;
}

/**
 * Get rotation ranking
 */
function ranking() {
  const f = field();
  if (!f?.monthly || !f.monthly.length) return [];
  return rotationEvidence(f.monthly, state.weights, profile());
}

/**
 * Bengali translations for rotation descriptions
 */
const whyBn = {
  baseline: 'দুই মৌসুমে ধান থাকে। নতুন ফসলের বাজার বা শ্রমের অভাব থাকলে এই পদ্ধতি তুলনার জন্য ভালো।',
  mustard: 'আমনের পরের ফাঁকে সরিষা হয়। রংপুরে এই চক্রের মাঠ পরীক্ষা হয়েছে।',
  potato: 'পরিচিত রংপুরের আলু শীতের জমি কাজে লাগায়।',
  legume: 'গঙ্গাচড়ার পরীক্ষায় আলুর পর মুগ চাষ হয়েছে। মুগের অবশিষ্টাংশ মাটিতে ফিরিয়ে দিলে মাটির উপকার হতে পারে।',
};

const riskBn = {
  baseline: 'বোরোতে নিয়মিত সেচ লাগে। শীতে জমি খালি থাকে।',
  mustard: 'আমন কাটতে দেরি হলে সরিষা ও পরের বোরো দুটোই পিছিয়ে যেতে পারে।',
  potato: 'বীজ, শ্রম, রোগ পর্যবেক্ষণ এবং ক্রেতা বা হিমাগারের ব্যবস্থা দরকার।',
  legume: 'আলুর খরচ বেশি। মুগের জন্য উপযুক্ত সময় ও পানি নিষ্কাশন দরকার।',
};

/**
 * Generate ranked rotation cards
 */
function rankedCards() {
  const f = field();
  if (!f?.monthly || !f.monthly.length) {
    return stateEmpty(t('Weather data not loaded for this field', 'এই জমির আবহাওয়ার তথ্য লোড করা নেই'));
  }
  const items = ranking();
  const sum = Object.values(state.weights).reduce((a, b) => a + b, 0);
  const selectedTariff = state.pumpTariff || 'diesel';
  const fieldAreaHa = area();

  return items
    .map((r, i) => {
      const study = agronomy.rotations[studyIndex[r.id]];
      const saved = state.plans.some(
        (p) => p.fieldId === state.fieldId && p.rotation === r.id
      );

      // Shortfall litres = shortfallMm * areaHa * 10,000 (from studiodata.js logic)
      const shortfallLitres = (r.deficit || 0) * fieldAreaHa * 10000;
      const { pumpHours, costTk } = calcIrrigationCost(shortfallLitres, selectedTariff);

      return `<article class="panel rotation-card ${i === 0 && r.feasible && sum ? 'best' : ''} ${r.feasible ? '' : 'conditional'}">
        <div class="rotation-top">
          <div class="rank-num">${String(i + 1).padStart(2, '0')}</div>
          <div>
            <div class="eyebrow">${r.id === 'baseline' ? t('Existing rotation', 'বর্তমান ফসলচক্র') : t(r.intent, r.bn)}</div>
            <h2>${esc(t(r.crops.join(' → '), r.bnCrops?.join(' → ') || ''))}</h2>
          </div>
          <div class="score">${r.score == null ? '—' : num(r.score)}<small>/100</small> ${r.score != null ? truth('SCENARIO') : ''}</div>
        </div>
        ${timeline(r.months)}
        <div class="rotation-info">
          <div><b>${t('Why it fits', 'কেন বিবেচনা করবেন')}</b><p>${esc(t(r.why, whyBn[r.id]))}</p></div>
          <div><b>${t('What to check', 'কী দেখবেন')}</b><p>${esc(t(r.risk, riskBn[r.id]))}</p></div>
        </div>
        <div class="rotation-cost-badge">
          <span>${t('Irrigation cost:', 'সেচ খরচ:')} <strong>৳${num(costTk)}</strong> / ${t('season', 'মৌসুম')} (${num(pumpHours, 1)} ${t('hrs @ 45,000 L/hr', 'ঘণ্টা @ ৪৫,০০০ লি/ঘণ্টা')}) ${truth('SCENARIO')}</span>
        </div>
        ${r.issues.length ? `<div class="rotation-warning">${tag(t('Needs review', 'যাচাই দরকার'), 'amber')} ${r.issues.map((v) => esc(t(v, issueBn[v]))).join(' ')}</div>` : ''}
        <details class="disclosure">
          <summary>${t('See the evidence and score breakdown', 'প্রমাণ ও স্কোরের হিসাব দেখুন')}</summary>
          <p>${t('Screening water gap under 2024 weather', '২০২৪ সালের আবহাওয়ায় আনুমানিক পানির ঘাটতি')} <b>${num(r.deficit, 0)} mm ${truth('MODELED', { source: 'IMERG/POWER FAO-56', date: '2024' })}</b>. ${t('Trial irrigation totals', 'গবেষণায় মোট সেচ')} ${study.referenceIrrigationMm ? `${study.referenceIrrigationMm.join('–')} mm ${truth('MODELED', { source: 'Trial observations' })}` : t('unreported for this sequence', 'এই চক্রের তথ্য নেই')}. ${sources(study.sourceIds)}</p>
          <div class="mini-contributions">${rotationTool.priorityKeys.map(({ key, labelEn, labelBn }) => `<span>${t(labelEn, labelBn)} <b>${sum ? num((100 * r.benefits[mapPriorityKey(key)] * state.weights[mapPriorityKey(key)]) / sum, 1) : '—'} ${sum ? truth('SCENARIO') : ''}</b></span>`).join('')}</div>
        </details>
        <div class="rotation-bottom">
          <span>${tag(r.feasible ? t('Fits entered constraints', 'শর্তে মানানসই') : t('Conditional', 'শর্তসাপেক্ষ'), r.feasible ? 'green' : 'amber')}</span>
          <div class="toolbar-inline">
            ${button(t('Preview in 3D', '৩ডি-তে দেখুন'), 'preview-3d', 'small ghost', 'search', r.id)}
            ${button(saved ? t('Update saved plan', 'পরিকল্পনা হালনাগাদ') : t('Save plan', 'সংরক্ষণ'), 'save-rotation', 'small', 'save', r.id)}
            ${button(t('Plan planting', 'বপন সাজান'), 'layout-for', 'small', 'right', r.id)}
          </div>
        </div>
      </article>`;
    })
    .join('');
}

/**
 * Skeleton shown in place of the 3D stage until the first frame renders.
 * Same height as the stage so the swap does not move the page.
 */
export function studioSkeletonCard() {
  return `<section class="studio-skeleton" id="studio-skeleton-root" role="status" aria-busy="true" aria-label="${t('Loading 3D field studio', '৩ডি মাঠ স্টুডিও লোড হচ্ছে')}">
    <div class="studio-skeleton-block" aria-hidden="true">
      <div class="studio-skeleton-iso">
        <div class="studio-skeleton-top"></div>
        <div class="studio-skeleton-side"></div>
      </div>
    </div>
    <p class="studio-skeleton-text">${t('Building your field…', 'জমির ৩ডি মডেল তৈরি হচ্ছে…')}</p>
    <div class="studio-skeleton-bar" aria-hidden="true"><span class="studio-skeleton-fill" style="width:4%"></span></div>
  </section>`;
}

/**
 * Static fallback when the device has no WebGL. The soil strip and question
 * panels below the stage are independent and keep working.
 */
function studioNoWebglCard() {
  return `<section class="studio-no-webgl" id="studio-no-webgl-root">
    <div class="studio-skeleton-block" aria-hidden="true">
      <div class="studio-skeleton-iso">
        <div class="studio-skeleton-top"></div>
        <div class="studio-skeleton-side"></div>
      </div>
    </div>
    <p class="studio-skeleton-text">${t('3D not supported on this device', 'এই ডিভাইসে ৩ডি সমর্থিত নয়')}</p>
  </section>`;
}

// Local WebGL probe so rotations.js never statically imports three.js.
function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function setSkeletonProgress(host, frac) {
  const fill = host?.querySelector('.studio-skeleton-fill');
  if (fill) fill.style.width = `${Math.max(0, Math.min(100, Math.round(frac * 100)))}%`;
}

/**
 * Prepare site layers for studio
 */
async function loadStudioInputs() {
  const json = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [ndviGrid, moistureGrid, lowGround, soilProfile] = await Promise.all([
    json('data/ndvi-grid.json'),
    fetchJsonMaybeGzip('data/moisture-grid.json'),
    json('data/low-ground.json'),
    json('data/soil-profile.json'),
  ]);
  return { ndviGrid, moistureGrid, lowGround, soilProfile };
}

/**
 * Load studio3d and studiodata modules
 */
async function loadStudio3dModules() {
  if (!studioModule) {
    studioModule = await import('./studio3d.js');
  }
  if (!studioDataModule) {
    studioDataModule = await import('./studiodata.js');
  }
  return { studioModule, studioDataModule };
}

/**
 * Build rotation options for studio rail
 */
function rotationOptionsFor(activeId) {
  const items = ranking();
  const fallback = [
    { id: 'baseline', label: 'Keep the familiar rhythm', bn: 'পরিচিত ফসলচক্র' },
    { id: 'mustard', label: 'Make the winter gap count', bn: 'শীতের ফাঁকে সরিষা' },
    { id: 'potato', label: 'Plan for a potato harvest', bn: 'আলুর মৌসুম পরিকল্পনা' },
    { id: 'legume', label: 'Bring a pulse into the cycle', bn: 'ফসলচক্রে ডাল যোগ করুন' },
  ];
  const source = items.length
    ? items.map((r) => ({ id: r.id, label: r.label, bn: r.bn, score: r.score, feasible: r.feasible }))
    : fallback;
  return source.map((r) => ({ ...r, active: r.id === activeId }));
}

/**
 * Get selected rotation ID
 */
function getSelectedRotationId() {
  if (activeRotationId) return activeRotationId;
  const items = ranking();
  return items.length > 0 ? items[0].id : 'mustard';
}

// Silent existence check with HEAD (or safe fetch)
async function silentCheckUrl(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    if (res.ok) return true;
  } catch (_) {
    // Suppress errors
  }
  return false;
}

// Lazy load soil nutrients data (silent check)
async function getSoilNutrientsData() {
  if (cachedSoilNutrients !== null) return cachedSoilNutrients;
  try {
    const exists = await silentCheckUrl('data/soil-nutrients.json');
    if (!exists) {
      cachedSoilNutrients = false;
      return false;
    }
    const res = await fetch('data/soil-nutrients.json');
    if (res.ok) cachedSoilNutrients = await res.json();
    else cachedSoilNutrients = false;
  } catch (_) {
    cachedSoilNutrients = false;
  }
  return cachedSoilNutrients;
}

// Lazy load NASA SMAP L4 root-zone moisture and the Fan 2017 water-table model
async function getJsonOnce(url) {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : false;
  } catch (_) {
    return false;
  }
}
async function getSmapData() {
  if (cachedSmap === null) cachedSmap = await getJsonOnce('data/smap.json');
  return cachedSmap;
}
async function getWaterTableData() {
  if (cachedWaterTable === null) cachedWaterTable = await getJsonOnce('data/water-table.json');
  return cachedWaterTable;
}

// Lazy load soil profile
async function getSoilProfileData() {
  if (cachedSoilProfile !== null) return cachedSoilProfile;
  try {
    const res = await fetch('data/soil-profile.json');
    if (res.ok) cachedSoilProfile = await res.json();
  } catch (_) {}
  return cachedSoilProfile;
}

// Lazy load low ground
async function getLowGroundData() {
  if (cachedLowGround !== null) return cachedLowGround;
  try {
    const res = await fetch('data/low-ground.json');
    if (res.ok) cachedLowGround = await res.json();
  } catch (_) {}
  return cachedLowGround;
}

// Lazy load s1-water data (silent existence check)
async function getS1WaterData() {
  if (cachedS1Water !== null) return cachedS1Water;
  try {
    const exists = await silentCheckUrl('data/s1-water.json');
    if (!exists) {
      cachedS1Water = false;
      return false;
    }
    const res = await fetch('data/s1-water.json');
    if (res.ok) cachedS1Water = await res.json();
    else cachedS1Water = false;
  } catch (_) {
    cachedS1Water = false;
  }
  return cachedS1Water;
}

const MONTH_NAMES_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];

/**
 * Question Panel 1: "When is the field bare or stressed?"
 */
function panelWhenBareOrStressed(studioData) {
  const rotId = getSelectedRotationId();
  const f = field();
  const monthsData = studioData?.months || [];

  // Build 12-month strip
  const monthCells = Array.from({ length: 12 }, (_, i) => {
    const m = monthsData[i] || {};
    const isBare = !m.cropId || m.stage === 'fallow';
    // Stress: shortfallLitres > 0 or shortfallMm > 0 or low wetness
    const isStressed = !isBare && ((m.shortfallMm && m.shortfallMm > 0) || (m.wetness != null && m.wetness < 0.3));
    let statusClass = 'month-crop';
    let statusLabel = t(m.cropName || 'Crop', m.cropNameBn || 'ফসল');
    if (isBare) {
      statusClass = 'month-bare';
      statusLabel = t('Bare', 'পতিত');
    } else if (isStressed) {
      statusClass = 'month-stressed';
      statusLabel = t('Stressed', 'চাপে');
    }

    return `<div class="month-cell ${statusClass}" title="${MONTH_NAMES_EN[i]}: ${statusLabel}">
      <span class="month-name">${t(MONTH_NAMES_EN[i], MONTH_NAMES_BN[i])}</span>
      <span class="month-indicator ${statusClass}"></span>
      <span class="month-tag">${statusLabel}</span>
    </div>`;
  }).join('');

  return `<section class="panel question-panel panel-left-rotation" id="panel-left-rotation">
    <div class="panel-header">
      <div class="eyebrow">${t('Question 01 · Seasonal calendar', 'প্রশ্ন ০১ · মৌসুমের ক্যালেন্ডার')}</div>
      <h3>${t('When is the field bare or stressed?', 'জমি কখন খালি বা চাপে থাকে?')}</h3>
      <p class="panel-sub">${t('12-month crop coverage and moisture stress derived from Sentinel-2 & NASA POWER.', 'সেন্টিনেল-২ ও নাসা পাওয়ার তথ্যে ১২ মাসের জমি আচ্ছাদন ও পানির চাপ।')}</p>
    </div>
    <div class="panel-body">
      <div class="month-strip-container">
        <div class="month-strip-scroll" tabindex="0" role="region" aria-label="${t('12-month seasonal strip, scroll for all months', '১২ মাসের মৌসুমের চিত্র, সব মাস দেখতে স্ক্রল করুন')}"><div class="month-strip" role="group" aria-label="${t('12-month seasonal strip', '১২ মাসের মৌসুমের চিত্র')}">
          ${monthCells}
        </div></div>
        <div class="month-strip-legend">
          <span><span class="month-indicator month-crop"></span> ${t('Covered', 'ফসল')}</span>
          <span><span class="month-indicator month-stressed"></span> ${t('Moisture stress', 'পানির চাপ')} ${truth('MODELED')}</span>
          <span><span class="month-indicator month-bare"></span> ${t('Bare/Fallow', 'খালি')} ${truth('REMOTE_OBSERVED')}</span>
        </div>
      </div>
      <div class="layout-switch-block">
        <span class="eyebrow">${t('3D Planting layout', '৩ডি বপন বিন্যাস')}</span>
        <div class="planting-layout-buttons" role="group">
          <button type="button" class="btn-layout ${activePlantingLayout === 'rows' ? 'active' : ''}" data-layout="rows">${t('Line rows', 'সারি')}</button>
          <button type="button" class="btn-layout ${activePlantingLayout === 'beds' ? 'active' : ''}" data-layout="beds">${t('Raised beds', 'উঁচু বেড')}</button>
          <button type="button" class="btn-layout ${activePlantingLayout === 'drains' ? 'active' : ''}" data-layout="drains">${t('Bund drains', 'আইল নালা')}</button>
        </div>
      </div>
    </div>
  </section>`;
}

/**
 * Question Panel 2: "Where will water collect?"
 */
function panelWhereWillWaterCollect() {
  const f = field();
  const fid = f?.id || state.fieldId;
  const siteLg = cachedLowGround?.sites?.find((s) => s.id === fid) || cachedLowGround?.sites?.[0];
  const lowPercent = siteLg?.stats?.lowPercent ?? 20.3;
  const minElev = siteLg?.stats?.minRelativeMetres ?? -5.1;
  const maxElev = siteLg?.stats?.maxRelativeMetres ?? 5.2;
  const elevRange = (maxElev - minElev).toFixed(1);

  // S1 water flood data if available
  let s1FloodHtml = '';
  if (cachedS1Water && cachedS1Water !== false) {
    const s1Site = cachedS1Water[fid] || cachedS1Water.sites?.[fid] || cachedS1Water;
    if (s1Site && (s1Site.dates || Array.isArray(s1Site))) {
      const dates = s1Site.dates || s1Site;
      s1FloodHtml = `<div class="s1-flood-table-wrap">
        <div class="eyebrow">${t('Sentinel-1 monthly flooded area', 'সেন্টিনেল-১ মাসিক প্লাবিত এলাকা')} ${truth('REMOTE_OBSERVED')}</div>
        <div class="s1-flood-grid">
          ${dates.slice(0, 12).map((d) => `
            <div class="s1-flood-cell">
              <span class="s1-flood-date">${d.date ? d.date.slice(5) : ''}</span>
              <strong class="s1-flood-pct">${d.flooded_pct != null ? `${num(d.flooded_pct)}%` : '—'}</strong>
            </div>
          `).join('')}
        </div>
      </div>`;
    }
  }

  return `<section class="panel question-panel panel-left-water" id="panel-left-water">
    <div class="panel-header">
      <div class="eyebrow">${t('Question 02 · Topography & drainage', 'প্রশ্ন ০২ · ভূ-প্রকৃতি ও নিষ্কাশন')}</div>
      <h3>${t('Where will water collect?', 'পানি কোথায় জমবে?')}</h3>
      <p class="panel-sub">${t('Low ground and drainage flow based on NASADEM 30m topography.', 'নাসাডেম ৩০মি ভূ-উচ্চতার ভিত্তিতে নিচু জমি ও পানি প্রবাহ।')}</p>
    </div>
    <div class="panel-body">
      <div class="low-ground-stat-box">
        <div class="stat-item">
          <span class="stat-lbl">${t('Low-ground share', 'নিচু জমির অংশ')}</span>
          <span class="stat-val"><strong>${num(lowPercent, 1)}%</strong> ${truth('MODELED', { source: 'NASADEM 30m' })}</span>
        </div>
        <div class="stat-item">
          <span class="stat-lbl">${t('Elevation range', 'উচ্চতার ব্যবধান')}</span>
          <span class="stat-val">${num(elevRange, 1)} m</span>
        </div>
      </div>
      <div class="drain-toggle-row">
        <div class="drain-control-group">
          <span class="toggle-lbl">${t('Outlet drain:', 'নিষ্কাশন নালা:')}</span>
          <button type="button" class="btn-drain-toggle ${drainTrenchActive ? 'active' : ''}" id="btn-toggle-drain">
            ${drainTrenchActive ? t('Open (active)', 'খোলা (সক্রিয়)') : t('Blocked (off)', 'বন্ধ')}
          </button>
        </div>
        <div class="drain-control-group">
          <span class="toggle-lbl">${t('Canal outlet:', 'খাল মুখ:')}</span>
          <button type="button" class="btn-block-toggle ${canalBlocked ? 'blocked' : 'open'}" id="btn-toggle-block">
            ${canalBlocked ? t('Blocked!', 'আটকে আছে!') : t('Free flow', 'স্বাভাবিক')}
          </button>
        </div>
      </div>
      <div class="show-3d-action">
        <button type="button" class="button primary small" data-action="show-ponding-3d">
          ${icon('search', 15)} ${t('Show on 3D', '৩ডি-তে দেখুন')}
        </button>
      </div>
      ${s1FloodHtml}
    </div>
  </section>`;
}

/**
 * Question Panel 3: "What is under my field?"
 */
function panelWhatIsUnderMyField() {
  const f = field();
  const fid = f?.id || state.fieldId;
  const siteNutrients = cachedSoilNutrients?.sites?.[fid]?.nutrients;
  const soilTruth = truth('MODELED', { source: 'SoilGrids 250 m' })
    .replaceAll(t('Estimated', 'স্যাটেলাইট অনুমান'), t('Estimated · SoilGrids 250 m', 'স্যাটেলাইট অনুমান · SoilGrids 250 m'));
  const nutrientClass = (key) => t(siteNutrients?.[key]?.class_en || '', siteNutrients?.[key]?.class_bn);

  // Local overrides from localStorage
  const localGw = rotationTool.soilOverrides?.gwDepth;
  const localPh = rotationTool.soilOverrides?.ph;
  const localOm = rotationTool.soilOverrides?.om;

  // 1. Moisture: NASA SMAP L4 root-zone (0-100 cm) mean over the data year, vs its 2015-present percentile.
  const smapDays = (cachedSmap?.sites?.[fid]?.daily || []).filter((d) => Number.isFinite(d.RZMC));
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const rzmc = mean(smapDays.map((d) => d.RZMC));
  const pct = mean(smapDays.map((d) => d.PRMC_PRCNTL).filter(Number.isFinite));
  const smapYear = smapDays[0]?.date?.slice(0, 4) || '';
  const moistureVal = rzmc != null ? num(rzmc, 2) : null;
  const moistureClass = pct == null ? `${smapYear} ${t('average', 'গড়')}`
    : `${smapYear}: ${pct < 33 ? t('drier than usual', 'স্বাভাবিকের চেয়ে শুকনো') : pct > 66 ? t('wetter than usual', 'স্বাভাবিকের চেয়ে ভেজা') : t('usual', 'স্বাভাবিক')}`;
  const nasaChip = `<span class="nasa-chip">${t('NASA SMAP', 'নাসা SMAP')}</span>`;
  // Groundwater: farmer's well reading, else Fan et al. 2017 ~1 km model (yearly median).
  const modelGw = cachedWaterTable?.sites?.[fid]?.annualDepthM;
  const gwMonths = cachedWaterTable?.sites?.[fid]?.monthlyDepthM;
  const gwSpan = Array.isArray(gwMonths) ? `${num(Math.min(...gwMonths), 1)}–${num(Math.max(...gwMonths), 1)} m` : '';
  // 2. pH: local soil tests take precedence over SoilGrids nutrient values.
  const phVal = localPh != null ? localPh : siteNutrients?.ph?.value;
  const phClass = localPh != null ? (phVal < 5.5 ? t('Acidic', 'অম্লীয়') : phVal > 7.5 ? t('Alkaline', 'ক্ষারীয়') : t('Optimal', 'উপযুক্ত')) : nutrientClass('ph');
  const phTruth = localPh != null ? truth('FARMER_REPORTED') : soilTruth;

  // 3. OM: local percent or SoilGrids organic matter converted from g/kg to percent.
  const omVal = localOm != null ? localOm : (siteNutrients?.om?.value != null ? num(siteNutrients.om.value / 10, 2) : null);
  const omClass = localOm != null ? (omVal < 1.5 ? t('Low', 'কম') : omVal > 2.5 ? t('Good', 'ভালো') : t('Medium', 'মাঝারি')) : nutrientClass('om');
  const omTruth = localOm != null ? truth('FARMER_REPORTED') : soilTruth;

  // 4. Nitrogen
  const nVal = siteNutrients?.totalN?.value != null ? num(siteNutrients.totalN.value / 10, 3) : null;
  const cecVal = siteNutrients?.cec?.value;
  // 5. Phosphorus
  const pVal = null;
  // 6. Potassium
  const kVal = null;
  // 7. Zinc
  const znVal = null;
  // 8. Boron
  const bVal = null;

  const missingLabels = []; // chips without data render nothing; one lab-test note lists them
  function renderChip(key, label, val, unit, standardClass, truthBadge) {
    const isSelected = selectedNutrient === key;
    if (val != null) {
      return `<button type="button" class="nutrient-chip ${isSelected ? 'active' : ''}" data-nutrient="${key}">
        <span class="chip-label">${label}</span>
        <span class="chip-val"><strong>${val}</strong> ${unit}</span>
        <span class="chip-class">${standardClass}</span>
        ${truthBadge}
      </button>`;
    }
    if (key !== 'moisture') missingLabels.push(label); // moisture is satellite data, not a lab test
    return '';
  }

  return `<section class="panel question-panel panel-left-soil" id="panel-left-soil">
    <div class="panel-header">
      <div class="eyebrow">${t('Question 03 · Soil & nutrients', 'প্রশ্ন ০৩ · মাটি ও পুষ্টি উপাদান')}</div>
      <h3>${t('What is under my field?', 'আমার জমির মাটির নিচে কী আছে?')}</h3>
      <p class="panel-sub">${t('NASA SMAP soil moisture, SoilGrids 250 m soil map, and your own test.', 'নাসা SMAP মাটির আর্দ্রতা, SoilGrids ২৫০ মি মাটির মানচিত্র, আর আপনার নিজের পরীক্ষা।')}</p>
    </div>
    <div class="panel-body">
      <div class="nutrient-chips-grid">
        ${renderChip('moisture', t('Root-zone moisture', 'শিকড় স্তরের আর্দ্রতা'), moistureVal, 'm³/m³', moistureClass, nasaChip)}
        ${renderChip('ph', 'pH', phVal, '', phClass, phTruth)}
        ${renderChip('om', t('OM', 'জৈব পদার্থ'), omVal, '%', omClass, omTruth)}
        ${renderChip('N', t('Nitrogen', 'নাইট্রোজেন (N)'), nVal, '%', nutrientClass('totalN'), soilTruth)}
        ${renderChip('cec', t('CEC', 'ক্যাটায়ন বিনিময় ক্ষমতা (CEC)'), cecVal, 'cmol+/kg', nutrientClass('cec'), soilTruth)}
        ${renderChip('P', t('Phosphorus', 'ফসফরাস'), pVal, 'mg/kg', '', '')}
        ${renderChip('K', t('Potassium', 'পটাশিয়াম'), kVal, 'meq/100g', '', '')}
        ${renderChip('S', t('Sulfur', 'সালফার'), null, '', '', '')}
        ${renderChip('Zn', t('Zinc', 'জিংক'), znVal, 'mg/kg', '', '')}
        ${renderChip('B', t('Boron', 'বোরন'), bVal, 'mg/kg', '', '')}
      </div>
      <p class="lab-test-note">${t('Needs a lab soil test:', 'ল্যাব মাটি পরীক্ষা দরকার:')} <strong>${missingLabels.join(' · ')}</strong><span>${t('No open satellite or map data exists for these.', 'এগুলোর কোনো খোলা স্যাটেলাইট বা মানচিত্র তথ্য নেই।')}</span></p>
      <div class="groundwater-row">
        <span>${t('Water table:', 'পানির স্তর:')} <strong>${localGw != null ? `${localGw} m` : modelGw != null ? `~${num(modelGw, 1)} m ${t('below ground', 'মাটির নিচে')}` : t('Unknown', 'অজানা')}</strong>${localGw == null && gwSpan ? ` <small>(${t('through the year', 'সারা বছরে')} ${gwSpan})</small>` : ''}</span>
        ${localGw != null ? truth('FARMER_REPORTED') : modelGw != null ? truth('MODELED', { source: 'Fan et al. 2017 ~1 km model' }) : truth('UNKNOWN')}
      </div>
      <div class="soil-test-action">
        <button type="button" class="button small" data-action="open-soil-modal">
          + ${t('Add your soil test or well reading', 'আপনার মাটি পরীক্ষা বা কূপের মাপ দিন')}
        </button>
      </div>
    </div>
  </section>`;
}

/**
 * Open 3D Studio
 */
let studioBuildToken = 0;
export async function openStudio3d() {
  studioOpened = true;
  const host = document.querySelector('#studio-3d-host');
  if (!host) return;

  if (!webglAvailable()) {
    host.innerHTML = studioNoWebglCard();
    return;
  }

  const buildToken = ++studioBuildToken;
  const f = field();
  const rotId = getSelectedRotationId();
  const skeleton = host.querySelector('#studio-skeleton-root');
  const hasStagedEnter = Boolean(host.querySelector('.studio-stage-enter'));
  let forceTimer = null;

  // Swap the skeleton for the mounted stage: pin the skeleton over the stage
  // area and cross-fade (200 ms; instant under reduced motion). Idempotent.
  let revealed = false;
  const reveal = () => {
    if (revealed) return;
    revealed = true;
    if (forceTimer) clearTimeout(forceTimer);
    const stage = host.querySelector('.studio-stage-enter');
    if (!stage || !skeleton?.isConnected) return;
    stage.classList.add('studio-stage-entered');
    const canvasHost = stage.querySelector('.studio-stage-canvas-host');
    if (canvasHost) {
      const hostRect = host.getBoundingClientRect();
      const stageRect = canvasHost.getBoundingClientRect();
      skeleton.style.top = `${Math.max(0, stageRect.top - hostRect.top)}px`;
      skeleton.style.height = `${Math.max(0, stageRect.height)}px`;
    }
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (reduceMotion) {
      skeleton.remove();
      return;
    }
    skeleton.classList.add('studio-skeleton-cover', 'studio-skeleton-fade');
    setTimeout(() => skeleton.remove(), 220);
  };

  try {
    if (skeleton) setSkeletonProgress(host, 0.12);
    const { studioModule: mod, studioDataModule: dataMod } = await loadStudio3dModules();
    if (skeleton) setSkeletonProgress(host, 0.35);
    const studioData = dataMod.buildStudioData({
      field: f,
      polygon: polygon(),
      rotationId: rotId,
      agronomy,
      ...(await loadStudioInputs()),
      cachedPower: f?.custom ? getCachedPower(f.id) : null,
      boundary: state.boundaries[f.id] ? 'farmer' : 'traced',
    });

    if (buildToken !== studioBuildToken) return; // superseded by a newer open
    const initialMonth = previewedRotationId === rotId
      ? state.month
      : mod.nearestCropMonth(studioData, new Date().getMonth());
    state.month = initialMonth;
    previewedRotationId = rotId;

    const opts = {
      rotations: rotationOptionsFor(rotId),
      onRotationSelect: (id) => {
        if (id === activeRotationId) return;
        activeRotationId = id;
        openStudio3d();
      },
    };
    if (buildToken !== studioBuildToken) return; // superseded by a newer open
    if (skeleton && !hasStagedEnter) {
      // Mount behind the skeleton, then reveal on the first rendered frame.
      setSkeletonProgress(host, 0.65);
      const stage = document.createElement('div');
      stage.className = 'studio-stage-enter';
      stage.innerHTML = mod.studio3dHtml(studioData, initialMonth, opts);
      host.insertBefore(stage, skeleton);
      setSkeletonProgress(host, 0.85);
      forceTimer = setTimeout(reveal, 4000);
      await mod.mountStudio3d(stage, studioData, {
        ...opts,
        onFirstFrame: () => {
          setSkeletonProgress(host, 1);
          reveal();
        },
      });
    } else {
      host.innerHTML = mod.studio3dHtml(studioData, initialMonth, opts);
      await mod.mountStudio3d(host, studioData, opts);
    }
  } catch (err) {
    if (forceTimer) clearTimeout(forceTimer);
    console.error('Failed to load studio3d:', err);
    host.innerHTML = `<div class="studio-fallback-msg">${t('Failed to load 3D studio.', '৩ডি স্টুডিও লোড হতে সমস্যা হয়েছে।')}</div>`;
  }
}

/**
 * Main rotations view
 */
function rotations() {
  const p = profile();
  const selectedTariff = state.pumpTariff || 'diesel';

  return (
    header(
      t('Decision studio  /  02', 'সিদ্ধান্তের ঘর  /  ০২'),
      t('Rotation studio', 'ফসলচক্র বাছাই'),
      t(
        'Set what matters to you. Compare a whole year of crops, including the familiar rotation.',
        'আপনার অগ্রাধিকার ঠিক করুন। পরিচিত চক্রসহ সারা বছরের ফসল তুলনা করুন।'
      ),
      button(t('Field constraints', 'জমির শর্ত'), 'profile', '', 'draw') +
        button(t('Field plan', 'জমির পরিকল্পনা'), 'print', 'secondary-action', 'print')
    ) +
    chips() +
    `<div id="studio-3d-host">${studioSkeletonCard()}</div>` +
    `<div id="rotation-question-panels" class="rotation-question-panels-row">` +
      panelWhenBareOrStressed(null) +
      panelWhereWillWaterCollect() +
      panelWhatIsUnderMyField() +
    `</div>` +
    `<div class="priority-layout">` +
      `<section class="panel priority-box">` +
        `<div class="panel-header">` +
          `<h2>${t('My priorities', 'আমার অগ্রাধিকার')}</h2>` +
        `</div>` +
        `<div class="panel-body">` +
          `${rotationTool.priorityKeys.map(({ key, labelEn, labelBn, icon: iconKey }) => `
            <div class="priority-item">
              <label for="weight-${key}">${iconKey ? icon(iconKey, 15) : ''} ${t(labelEn, labelBn)} 
                <span class="count" id="value-${key}">${num(state.weights[mapPriorityKey(key)] || 0)}</span>
              </label>
              <input id="weight-${key}" data-weight="${key}" type="range" min="0" max="5" value="${state.weights[mapPriorityKey(key)] || 0}">
            </div>
          `).join('')}` +
          `<div class="preset-row">` +
            `${button(t('Balanced', 'সমান'), 'preset', 'small', '', 'balanced')}` +
            `${button(t('Save water', 'পানি বাঁচাই'), 'preset', 'small', '', 'water')}` +
          `</div>` +
          `<p class="priority-note note">${t('0 means ignore. 5 gives a goal the greatest weight. If all are zero, scores stay blank.', '০ মানে এই লক্ষ্য বাদ। ৫ সবচেয়ে বেশি গুরুত্ব। সব ০ হলে স্কোর ফাঁকা থাকে।')}</p>` +
        `</div>` +
        `<div class="panel-body priority-context">` +
          `<div class="eyebrow">${t('Field assumptions', 'জমির অনুমান')}</div>` +
          `<p>${t('Aman harvest', 'আমন কাটা')} <strong>${esc(p.harvest)}</strong></p>` +
          `<p>${t('Flood delay', 'বন্যায় দেরি')} <strong>${num(p.floodDays)} d ${truth('FARMER_REPORTED')}</strong></p>` +
          `<p>${t('Unit', 'একক')} <strong>${esc(t(rotationTool.AREA_CONVERSION[state.unit || 'ha']?.labelEn, rotationTool.AREA_CONVERSION[state.unit || 'ha']?.labelBn))}</strong></p>` +
          `<button class="text-link" data-action="score-method">${t('How scoring works', 'স্কোরের পদ্ধতি')}</button>` +
        `</div>` +
      `</section>` +
      `<div>` +
        `<div class="ranking-label ranking-header-bar">` +
          `<div>` +
            `<span class="eyebrow">${t('Four rotation scenarios', 'চারটি ফসলচক্র')}</span>` +
            `<span class="note">${t('Fit points, out of 100', 'মোট ১০০ পয়েন্ট')}</span>` +
          `</div>` +
          `<div class="pump-tariff-select-wrap">` +
            `<label for="select-pump-tariff" class="eyebrow">${t('Pump tariff', 'সেচ পাম্প দর')}:</label>` +
            `<select id="select-pump-tariff" class="unit-selector">` +
              `<option value="diesel" ${selectedTariff === 'diesel' ? 'selected' : ''}>${t('Diesel STW (৳320/hr)', 'ডিজেল এসটিডব্লিউ (৳৩২০/ঘণ্টা)')}</option>` +
              `<option value="electric" ${selectedTariff === 'electric' ? 'selected' : ''}>${t('Electric (৳160/hr)', 'বিদ্যুৎ পাম্প (৳১৬০/ঘণ্টা)')}</option>` +
              `<option value="bmda" ${selectedTariff === 'bmda' ? 'selected' : ''}>${t('BMDA-Solar (৳110/hr)', 'বিএমডিএ-সোলার (৳১১০/ঘণ্টা)')}</option>` +
            `</select>` +
            ` ${truth('SCENARIO')}` +
          `</div>` +
        `</div>` +
        `<div id="rotation-list">${rankedCards()}</div>` +
      `</div>` +
    `</div>` +
    `` +
    rotationTool.soilModal() +
    rotationTool.sourcesModal()
  );
}

/**
 * Lifecycle hook
 */
export async function mountRotations() {
  // Pre-load data for question panels
  await Promise.all([
    getSoilProfileData(),
    getSoilNutrientsData(),
    getLowGroundData(),
    getS1WaterData(),
    getSmapData(),
    getWaterTableData(),
  ]);

  // Update question panels if rendered
  const questionPanelsRoot = document.querySelector('#rotation-question-panels');
  if (questionPanelsRoot) {
    const f = field();
    const rotId = getSelectedRotationId();
    let studioData = null;
    try {
      const { studioDataModule: dataMod } = await loadStudio3dModules();
      studioData = dataMod.buildStudioData({
        field: f,
        polygon: polygon(),
        rotationId: rotId,
        agronomy,
        ...(await loadStudioInputs()),
        cachedPower: f?.custom ? getCachedPower(f.id) : null,
        boundary: state.boundaries[f.id] ? 'farmer' : 'traced',
      });
    } catch (_) {}

    questionPanelsRoot.innerHTML =
      panelWhenBareOrStressed(studioData) +
      panelWhereWillWaterCollect() +
      panelWhatIsUnderMyField();
  }

  // Setup question panel event handlers
  setupQuestionPanelEvents();

  if (studioOpened) {
    openStudio3d();
    return;
  }

  // Lazy-load three.js + data when the stage is near the viewport; the
  // skeleton holds the layout until the first frame. No poster anywhere.
  const host = document.querySelector('#studio-3d-host');
  if (host && !webglAvailable()) {
    host.innerHTML = studioNoWebglCard();
  } else if (host && 'IntersectionObserver' in window) {
    const target = host.querySelector('#studio-skeleton-root') || host;
    const obs = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        obs.disconnect();
        openStudio3d();
      }
    }, { rootMargin: '200px' });
    obs.observe(target);
  } else if (host) {
    openStudio3d();
  }

  rotationTool.initRotationPanels();
}

/**
 * Setup Question Panels interactions
 */
function setupQuestionPanelEvents() {
  // 1. Planting layout buttons
  document.querySelectorAll('#panel-left-rotation .btn-layout').forEach((btn) => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout');
      activePlantingLayout = layout;
      document.querySelectorAll('#panel-left-rotation .btn-layout').forEach((b) => {
        b.classList.toggle('active', b.getAttribute('data-layout') === layout);
      });
      // Call studio planting layout
      studioModule?.setPlantingLayout?.(layout);
      rotationTool.setPlantingLayout?.(layout);
    });
  });

  // 2. Drain open/blocked toggles
  const drainBtn = document.querySelector('#btn-toggle-drain');
  if (drainBtn) {
    drainBtn.addEventListener('click', () => {
      drainTrenchActive = !drainTrenchActive;
      drainBtn.className = `btn-drain-toggle ${drainTrenchActive ? 'active' : ''}`;
      drainBtn.textContent = drainTrenchActive ? t('Open (active)', 'খোলা (সক্রিয়)') : t('Blocked (off)', 'বন্ধ');
    });
  }

  const blockBtn = document.querySelector('#btn-toggle-block');
  if (blockBtn) {
    blockBtn.addEventListener('click', () => {
      canalBlocked = !canalBlocked;
      blockBtn.className = `btn-block-toggle ${canalBlocked ? 'blocked' : 'open'}`;
      blockBtn.textContent = canalBlocked ? t('Blocked!', 'আটকে আছে!') : t('Free flow', 'স্বাভাবিক');
    });
  }

  // 3. Show on 3D (ponding)
  const pondingBtn = document.querySelector('[data-action="show-ponding-3d"]');
  if (pondingBtn) {
    pondingBtn.addEventListener('click', async () => {
      if (!studioOpened) {
        await openStudio3d();
      }
      studioModule?.setSurfaceMode?.('ponding');
      document.querySelector('#studio-3d-host')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // 4. Nutrient chips
  document.querySelectorAll('#panel-left-soil .nutrient-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.getAttribute('data-nutrient');
      selectedNutrient = key;
      document.querySelectorAll('#panel-left-soil .nutrient-chip').forEach((c) => {
        c.classList.toggle('active', c === chip);
      });
    });
  });

  // 5. Open soil modal button
  const soilBtn = document.querySelector('[data-action="open-soil-modal"]');
  if (soilBtn) {
    soilBtn.addEventListener('click', () => {
      const soilModalEl = document.querySelector('#modal-soil-input');
      if (soilModalEl) {
        if (typeof soilModalEl.showModal === 'function') {
          soilModalEl.showModal();
        } else {
          soilModalEl.setAttribute('open', '');
        }
      }
    });
  }

  // 6. Pump tariff select change
  const tariffSel = document.querySelector('#select-pump-tariff');
  if (tariffSel) {
    tariffSel.addEventListener('change', (e) => {
      state.pumpTariff = e.target.value;
      persist();
      const rotList = document.querySelector('#rotation-list');
      if (rotList) rotList.innerHTML = rankedCards();
      rotationTool.updateEconDisplay?.();
    });
  }
}

/**
 * Lifecycle hook - cleanup
 */
export function disposeRotations() {
  studioOpened = false;
  activeRotationId = null;
  previewedRotationId = null;
  if (studioModule?.disposeStudio3d) {
    studioModule.disposeStudio3d();
  }
}

/**
 * Score method explanation
 */
function method() {
  modal(
    t('How the fit score works', 'স্কোর কীভাবে হয়'),
    `<p>${t('Each priority contributes its weight × the option’s rating. We divide by the total weight and scale to 100. Options that pass the field checks appear first.', 'প্রতিটি লক্ষ্যতে আপনার ওজন ও চক্রের মান গুণ করে যোগ করা হয়। মোট ওজন দিয়ে ভাগ করে ১০০-তে স্কোর দেখানো হয়। শর্তসাপেক্ষ চক্র পরে আসে।')}</p><p class="note">${t('Water fit uses the 2024 monthly IMERG rain and POWER-derived FAO-56 ETo. For each active month the gap is max(0, Kc × ETo − 0.65 × rain). We sum the gaps and rate smaller totals higher. Crop coefficients are demo assumptions: rice 1.10, mustard/pulse 0.85, potato 0.95.', 'পানির স্কোরে ২০২৪ সালের বৃষ্টি ও ETo ব্যবহৃত হয়। প্রতি মাসে Kc × ETo থেকে বৃষ্টির ৬৫% বাদ দিয়ে ধনাত্মক ঘাটতিগুলো যোগ করা হয়। ধান ১.১০, সরিষা ও ডাল ০.৮৫, আলু ০.৯৫ ধরে এই তুলনা।')}</p><p class="note">${t('Soil, cost and risk ratings are design judgments. The calendar is a planning template. Published irrigation ranges are separate trial observations. Fit points express a preference match; they have no probability or yield interpretation.', 'মাটি, খরচ ও ঝুঁকির মান পরিকল্পনার অনুমান। ক্যালেন্ডারও একটি নমুনা। গবেষণার সেচের পরিসর আলাদা করে দেখানো হয়। স্কোর দিয়ে সম্ভাবনা বা ফলন বোঝায় না।')}</p>${sources(['fao56', 'hossain2022', 'islam2014'])}`
  );
}

/**
 * Handle rotation actions
 */
function rotationAction(action, value) {
  if (action === 'preview-3d') {
    activeRotationId = value;
    openStudio3d();
    document.querySelector('#studio-3d-host')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  if (action === 'preset') {
    const weights = { water: 0, soil: 0, cost: 0, risk: 0 };
    if (value === 'water') {
      weights.water = 5;
      weights.soil = 2;
      weights.cost = 1;
      weights.risk = 1;
    } else {
      weights.water = 3;
      weights.soil = 3;
      weights.cost = 3;
      weights.risk = 3;
    }
    state.weights = weights;
    persist();
    repaint();
  }
  if (action === 'score-method') method();
  if (action === 'save-rotation') {
    const r = ranking().find((v) => v.id === value);
    if (!r) return;
    const item = {
      fieldId: state.fieldId,
      rotation: r.id,
      crops: r.crops.join(' → '),
      score: r.score,
      weights: { ...state.weights },
      constraints: profile(),
      areaHa: area(),
      screeningWaterGapMm: r.deficit,
      conditions: r.issues,
      referenceYear: 2024,
      savedAt: new Date().toISOString(),
    };
    state.plans = state.plans.filter(
      (p) => p.fieldId !== state.fieldId || p.rotation !== value
    );
    state.plans.push(item);
    persist();
    repaint();
    toast(t('Rotation saved on this device', 'এই যন্ত্রে ফসলচক্র সংরক্ষিত'));
  }
  if (action === 'export-plan') {
    const p = state.plans.find(
      (p) => p.fieldId === state.fieldId && p.rotation === value
    );
    if (p)
      download(
        `${state.fieldId}-${value}-plan.json`,
        JSON.stringify(p, null, 2)
      );
  }
  if (action === 'layout-for') {
    setPlantCrop(
      {
        baseline: 'rice',
        mustard: 'mustard',
        potato: 'potato',
        legume: 'mungbean',
      }[value]
    );
    location.hash = 'planner';
  }
}

/**
 * Handle rotation input changes
 */
function rotationInput(el) {
  if (el.dataset.weight) {
    state.weights[mapPriorityKey(el.dataset.weight)] = +el.value;
    persist();
    document.querySelector(`#value-${el.dataset.weight}`).textContent = num(+el.value);
    document.querySelector('#rotation-list').innerHTML = rankedCards();
  }
}

// Initialize soil overrides
rotationTool.initSoilOverrides();

export { rotations, rotationAction, rotationInput };
