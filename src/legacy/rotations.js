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
let studioDataModule = null;

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

  return items
    .map((r, i) => {
      const study = agronomy.rotations[studyIndex[r.id]];
      const saved = state.plans.some(
        (p) => p.fieldId === state.fieldId && p.rotation === r.id
      );

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
 * Poster card for studio
 */
function posterCard() {
  return `<section class="studio-poster" id="studio-poster-root">
    <div class="studio-poster-inner">
      <div class="studio-poster-badge">✦ ${t('Interactive 3D Field', 'ইন্টারেক্টিভ ৩ডি জমি')}</div>
      <h2>${t('Your field, season by season', 'আপনার জমি, মৌসুম ধরে ধরে')}</h2>
      <p class="studio-poster-desc">${t('Watch real crops grow on your plot with 3D soil cutaway, root depth and NASA/Sentinel environmental observations.', 'মাটির গভীরতা, ফসলের শিকড় ও নাসার তথ্যের সাথে আপনার জমিতে ফসলচক্রের বাস্তব দৃশ্য দেখুন।')}</p>
      <div class="studio-poster-actions">
        <button class="button primary" data-action="open-studio3d">${t('Open 3D studio', '৩ডি স্টুডিও খুলুন')}</button>
        <span class="studio-poster-note">${t('3D · ~180 KB · then works offline', '৩ডি · ~১৮০ কেবি · এরপর অফলাইনেও চলবে')}</span>
      </div>
    </div>
    <div class="studio-poster-art" aria-hidden="true">
      <div class="art-field-block">
        <div class="art-field-top"></div>
        <div class="art-field-side"></div>
      </div>
    </div>
  </section>`;
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

/**
 * Open 3D Studio
 */
export async function openStudio3d() {
  studioOpened = true;
  const host = document.querySelector('#studio-3d-host');
  if (!host) return;

  const f = field();
  const rotId = getSelectedRotationId();

  try {
    const { studioModule: mod, studioDataModule: dataMod } = await loadStudio3dModules();
    const studioData = dataMod.buildStudioData({
      field: f,
      polygon: polygon(),
      rotationId: rotId,
      agronomy,
      ...(await loadStudioInputs()),
      cachedPower: f?.custom ? getCachedPower(f.id) : null,
      boundary: state.boundaries[f.id] ? 'farmer' : 'traced',
    });

    const opts = {
      rotations: rotationOptionsFor(rotId),
      onRotationSelect: (id) => {
        if (id === activeRotationId) return;
        activeRotationId = id;
        openStudio3d();
      },
    };
    host.innerHTML = mod.studio3dHtml(studioData, state.month || 0, opts);
    await mod.mountStudio3d(host, studioData, opts);
  } catch (err) {
    console.error('Failed to load studio3d:', err);
    host.innerHTML = `<div class="studio-fallback-msg">${t('Failed to load 3D studio.', '৩ডি স্টুডিও লোড হতে সমস্যা হয়েছে।')}</div>`;
  }
}

/**
 * Main rotations view
 */
function rotations() {
  const p = profile();

  return (
    header(
      t('Decision studio  /  03', 'সিদ্ধান্তের ঘর  /  ০৩'),
      t('Rotation studio', 'ফসলচক্র বাছাই'),
      t(
        'Set what matters to you. Compare a whole year of crops, including the familiar rotation.',
        'আপনার অগ্রাধিকার ঠিক করুন। পরিচিত চক্রসহ সারা বছরের ফসল তুলনা করুন।'
      ),
      button(t('Field constraints', 'জমির শর্ত'), 'profile', '', 'draw') +
        button(t('Field plan', 'জমির পরিকল্পনা'), 'print', 'secondary-action', 'print')
    ) +
    chips() +
    `<div id="studio-3d-host">${posterCard()}</div>` +
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
        `<div class="ranking-label">` +
          `<span class="eyebrow">${t('Four rotation scenarios', 'চারটি ফসলচক্র')}</span>` +
          `<span class="note">${t('Fit points, out of 100', 'মোট ১০০ পয়েন্ট')}</span>` +
        `</div>` +
        `<div id="rotation-list">${rankedCards()}</div>` +
      `</div>` +
    `</div>` +
    `<link rel="stylesheet" href="app/rotation-tool.css">` +
    rotationTool.soilModal() +
    rotationTool.sourcesModal()
  );
}

/**
 * Lifecycle hook
 */
export function mountRotations() {
  if (studioOpened) {
    openStudio3d();
    return;
  }

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 1024;
  const saveData = typeof navigator !== 'undefined' && navigator.connection?.saveData;

  if (isDesktop && !saveData && 'IntersectionObserver' in window) {
    const poster = document.querySelector('#studio-poster-root');
    if (poster) {
      const obs = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          obs.disconnect();
          openStudio3d();
        }
      }, { threshold: 0.1 });
      obs.observe(poster);
    }
  }

  rotationTool.initRotationPanels();
}

/**
 * Lifecycle hook - cleanup
 */
export function disposeRotations() {
  studioOpened = false;
  activeRotationId = null;
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
  if (action === 'open-studio3d') {
    openStudio3d();
  }
  if (action === 'preview-3d') {
    activeRotationId = value;
    openStudio3d();
    document.querySelector('#studio-3d-host')?.scrollIntoView({ behavior: 'smooth' });
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

export { rotations, rotationAction, rotationInput, posterCard };
