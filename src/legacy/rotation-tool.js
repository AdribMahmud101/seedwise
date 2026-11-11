/**
 * Rotation Tool - Side Panels
 * STUDIO5B: Rebuild rotation tool side panels to match reference.html
 */

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
  truth,
  tag,
  toast,
  repaint,
  modal,
  sources,
} from './ui.js';
import { rotationEvidence } from './engine.js';

// Priority configuration - maps to engine.js weights
const priorityKeys = [
  { key: 'water', labelEn: 'Save irrigation water', labelBn: 'পানি সাশ্রয়', icon: 'water' },
  { key: 'soil', labelEn: 'Strengthen soil organic matter', labelBn: 'মাটির জৈব পদার্থ বৃদ্ধি', icon: 'clinic' },
  { key: 'income', labelEn: 'Maximize net household income', labelBn: 'ঘরের মোট আয় সর্বোচ্চ', icon: 'note' },
  { key: 'stability', labelEn: 'Yield stability across weather', labelBn: 'আবহাওয়ায় ফলনের স্থিতিশীলতা', icon: 'target' },
];

// Study index mapping
const studyIndex = { baseline: 0, mustard: 1, potato: 2, legume: 3 };

// Bengali translations
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

// Pump tariff rates
const PUMP_TARIFFS = {
  diesel: { rate: 320, labelEn: 'Diesel STW', labelBn: 'ডিজেল STW' },
  electric: { rate: 160, labelEn: 'Electric Pump', labelBn: 'বিদ্যুৎ পাম্প' },
  bmda: { rate: 110, labelEn: 'BMDA/Solar', labelBn: 'BMDA/সোলার' },
};

// Area unit conversion
const AREA_CONVERSION = {
  bigha: { factor: 1 / 0.332286, labelEn: 'Bigha (33 Shotok)', labelBn: 'বিঘা (33 শতক)' },
  shotok: { factor: 1 / 247.105381, labelEn: 'Shotok (Decimal)', labelBn: 'শতক (ডেসিমাল)' },
  ha: { factor: 1, labelEn: 'Hectare', labelBn: 'হেক্টর' },
  acre: { factor: 1 / 2.47105381, labelEn: 'Acre', labelBn: 'একর' },
};

const NUTRIENT_GUIDES = {
  moisture: { en: 'Surface wetness index from NASA POWER/SMAP. Satellite estimates may not match your parcel after heavy local rain or irrigation.', bn: 'NASA POWER/SMAP থেকে পৃষ্ঠের আর্দ্রতা সূচক। হেভি লোকাল বৃষ্টি বা সেচের পরে স্যাটেলাইটের অনুমান আপনার জমির সাথে মেলাতে পারে না।' },
  ph: { en: 'Soil acidity. RARS Burirhat baseline: pH 5.61 (slightly acidic). Below 5.5 may need lime for optimal crop uptake.', bn: 'মাটির অম্লতা। বারিরহাট RARS বেসলাইন: pH 5.61 (হালকা এসিডিক)। 5.5 এর নিচে চুন প্রয়োগের প্রয়োজন হতে পারে।' },
  om: { en: 'Organic matter percentage. RARS baseline: 1.83%. <1.5% is low; >2.0% builds fertility. Legumes and residue return improve OM.', bn: 'জৈব পদার্থের শতাংশ। বারিরহাট বেসলাইন: 1.83%। <1.5% কম; >2.0% উর্বরতা বৃদ্ধি করে। ডাল ও অবশেষ ফেরত OM উন্নত করে।' },
  N: { en: 'Nitrogen is typically deficient. Soil test recommended. BARC FRG rates vary by crop: Aman 80-100 kg/ha, Boro 120-140 kg/ha.', bn: 'নাইট্রোজেন সাধারণত ঘাটতি থাকে। মাটি পরীক্ষা সুপারিশ করা হয়। BARC FRG অনুযায়ী আমন 80-100 কেজি/হা, বোরো 120-140 কেজি/হা।' },
  P: { en: 'Phosphorus. Soil test recommended. BARC FRG: 40-60 kg P2O5/ha for rice systems. Low mobility; place near roots.', bn: 'ফসফরাস। মাটি পরীক্ষা সুপারিশ করা হয়। BARC FRG: ধান চাষের জন্য 40-60 কেজি P2O5/হা। গতিশীলতা কম; শিকড়ের কাছে রাখুন।' },
  K: { en: 'Potassium. Soil test recommended. BARC FRG: 60-80 kg K2O/ha. High removal by harvest; replace for sustained yields.', bn: 'পটাশিয়াম। মাটি পরীক্ষা সুপারিশ করা হয়। BARC FRG: 60-80 কেজি K2O/হা। ফলনে প্রচুর অপসারণ হয়; টেকসই ফলনের জন্য প্রতিস্থাপন করুন।' },
  Zn: { en: 'Zinc micronutrient. Common deficiency in Tista floodplain. Soil test: <0.8 mg/kg is deficient. Foliar spray option exists.', bn: 'জিংক মাইক্রোনিউট্রিয়েন্ট। তিস্তা প্লাবনভূমিতে সাধারণ ঘাটতি। মাটি পরীক্ষা: <0.8 মিগ্রা/কেজি ঘাটতি। পাতায় স্প্রে করা যায়।' },
  B: { en: 'Boron micronutrient. Critical for grain filling. Soil test: <0.3 mg/kg is deficient. Waterlogging can reduce availability.', bn: 'বোরন মাইক্রোনিউট্রিয়েন্ট। শস্য পূর্ণতার জন্য গুরুত্বপূর্ণ। মাটি পরীক্ষা: <0.3 মিগ্রা/কেজি ঘাটতি। পানিজমে প্রাপ্যতা কমে যেতে পারে।' },
};

// State for new panels
let soilOverrides = null;
let plantingLayoutState = null;
let cachedSoilNutrients = null;

// Engine key mapping
function mapPriorityKey(key) {
  if (key === 'income') return 'cost';
  if (key === 'stability') return 'risk';
  return key;
}

// Export constants and helper functions
export { priorityKeys, AREA_CONVERSION, PUMP_TARIFFS, studyIndex, mapPriorityKey, soilOverrides };

// Load soil profile
async function loadSoilProfile() {
  if (soilOverrides) return soilOverrides;
  try {
    const resp = await fetch('data/soil-profile.json');
    if (resp.ok) soilOverrides = await resp.json();
  } catch (_) {}
  return soilOverrides;
}

// Load soil nutrients safely (silent check)
async function loadNutrients() {
  if (cachedSoilNutrients !== null) return cachedSoilNutrients;
  try {
    const resp = await fetch('data/soil-nutrients.json');
    if (resp.ok) cachedSoilNutrients = await resp.json();
    else cachedSoilNutrients = false;
  } catch (_) {
    cachedSoilNutrients = false;
  }
  return cachedSoilNutrients;
}

// Load low ground data
async function loadLowGround() {
  try {
    const resp = await fetch('data/low-ground.json');
    if (resp.ok) return await resp.json();
  } catch (_) {}
  return null;
}

// Format area in selected unit
export function formatArea(ha, unit = 'ha') {
  const conv = AREA_CONVERSION[unit] || AREA_CONVERSION.ha;
  return `${num(ha * conv.factor, 2)} ${t(conv.labelEn, conv.labelBn)}`;
}

// Get net area considering layout
export function getNetArea() {
  const ha = area();
  const layoutFactor = plantingLayoutState === 'drains' ? 0.90 : 0.93;
  return ha * layoutFactor;
}

// Calculate irrigation cost
export function calculateIrrigationCost(deficitMm, tariffKey = 'diesel') {
  const tariff = PUMP_TARIFFS[tariffKey]?.rate || 320;
  const netAreaHa = getNetArea();
  // 45 mm/hr pump rate assumption
  const pumpHours = (deficitMm * netAreaHa) / 45;
  const costTk = pumpHours * tariff;
  return { pumpHours: Math.round(pumpHours), costTk: Math.round(costTk) };
}

// Get ranking
export function getRanking() {
  const f = field();
  if (!f?.monthly?.length) return [];
  return rotationEvidence(f.monthly, state.weights, profile());
}

// Get selected rotation ID
export function getSelectedRotationId() {
  const items = getRanking();
  return items.length > 0 ? items[0].id : 'mustard';
}

// Get soil data for field
export function getSoilDataForField(fieldId) {
  const profile = soilOverrides?.sites?.[fieldId];
  if (!profile) return null;
  const topLayer = profile.layers?.[0];
  if (!topLayer) return null;
  return {
    ph: topLayer.ph,
    om: topLayer.socGkg ? (topLayer.socGkg * 1.724 / 10) : null,
    texture: topLayer.textureClass,
    source: profile.source,
  };
}

// Initialize soil overrides from localStorage
export function initSoilOverrides() {
  try {
    const saved = localStorage.getItem('ropon.soilOverrides');
    if (saved) soilOverrides = JSON.parse(saved);
  } catch (_) {}
}

// Save soil overrides
export function saveSoilOverrides(overrides) {
  localStorage.setItem('ropon.soilOverrides', JSON.stringify(overrides));
  soilOverrides = overrides;
}

// Reset soil overrides
export function resetSoilOverrides() {
  localStorage.removeItem('ropon.soilOverrides');
  soilOverrides = null;
}

// Update soil display
export function updateSoilDisplay() {
  const gwEl = document.getElementById('soil-gw-val');
  const gwSubEl = document.getElementById('soil-gw-sub');
  const gwStampEl = document.getElementById('soil-gw-stamp');
  if (!gwEl || !gwSubEl || !gwStampEl) return;
  
  if (soilOverrides) {
    gwEl.textContent = `${soilOverrides.gwDepth?.toFixed(1) || '?'} m ${t('depth', 'গভীরতা')}`;
    gwSubEl.textContent = t('Measured locally', 'স্থানীয়ভাবে পরিমাপ করা হয়েছে');
    gwStampEl.className = 'stamp stamp-measured';
    gwStampEl.textContent = t('Measured · by farmer', 'পরিমাপ করা · কৃষকের দ্বারা');
  } else {
    gwEl.textContent = t('Unknown', 'অজানা');
    gwSubEl.textContent = t('Requires local tubewell dip', 'স্থানীয় টিউবওয়েল ডিপ প্রয়োজন');
    gwStampEl.className = 'stamp stamp-unknown';
    gwStampEl.textContent = t('No Local Reading', 'স্থানীয় পাঠ নেই');
  }
}

// Update economic display
export function updateEconDisplay() {
  const netAreaHa = getNetArea();
  const items = getRanking();
  const selected = items[0] || { deficit: 0 };
  const tariffKey = state.pumpTariff || 'diesel';
  const { pumpHours, costTk } = calculateIrrigationCost(selected.deficit || 0, tariffKey);

  const netAreaEl = document.getElementById('right-net-area');
  const pumpHrsEl = document.getElementById('right-pump-hrs');
  const netTkEl = document.getElementById('right-net-tk');

  if (netAreaEl) netAreaEl.textContent = formatArea(netAreaHa, state.unit || 'ha');
  if (pumpHrsEl) pumpHrsEl.textContent = `${pumpHours} ${t('hrs', 'ঘণ্টা')}`;
  if (netTkEl) netTkEl.textContent = `৳ ${num(selected.score ? Math.round(selected.score * 1000) : 0)}`;
}

// Set planting layout
export function setPlantingLayout(layout) {
  plantingLayoutState = layout;
  updateEconDisplay();
}

// Panel 1: When is the field bare or stressed?
export function panelWhenBareOrStressed() {
  return `
    <section id="panel-left-rotation" class="panel-card p-4 flex flex-col gap-4">
      <div class="border-b border-[#e2e4d8] pb-2.5">
        <p class="eyebrow">01 / ${t('Seasonal Dynamics', 'মৌসুমের গতিপ্রকৃতি')}</p>
        <h2 class="serif-head text-xl font-semibold text-[#173e30] mt-0.5">${t('When is the field bare or stressed?', 'জমি কখন খালি বা চাপে থাকে?')}</h2>
        <p class="text-xs text-[#536456] mt-1">${t('Click a season to inspect 3D canopy, root depth, and NASA water balance.', 'মৌসুম নির্বাচন করুন 3D ক্যানোপি, শিকড় গভীরতা এবং নাসার পানি ব্যালেন্স দেখতে।')}</p>
      </div>
      <div class="flex flex-col gap-1.5" role="radiogroup">
        <button type="button" data-season="rabi" class="season-step-btn text-left p-2.5 rounded border-2 border-[#173e30] bg-[#f4f6ea]">
          <div class="flex justify-between"><span class="mono text-[11px] font-bold text-[#173e30]">NOV-FEB · ${t('RABI', 'রবি')}</span><span class="stamp stamp-scenario">${t('Mustard', 'সরিষা')} / ${t('Boro', 'বোরো')}</span></div>
          <p class="text-xs text-[#3a4d3f] mt-1">${t('Rain: ', 'বৃষ্টি: ')}<strong>38 mm</strong> ${t('vs ET₀: ', 'vs ইটিও: ')}<strong>310 mm</strong>. ${t('Boro needs pumping; Mustard on residual moisture + 1-2 irrigations.', 'বোরোর জন্য পাম্পিং দরকার; সরিষা অবশিষ্ট আর্দ্রতা + 1-2 সেচে জন্মায়।')}</p>
        </button>
        <button type="button" data-season="premonsoon" class="season-step-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9]">
          <div class="flex justify-between"><span class="mono text-[11px] font-bold text-[#b9822d]">MAR-MAY · ${t('BARE', 'খালি')}</span><span class="stamp stamp-estimated">Sentinel-2 NDVI &lt; 0.30</span></div>
          <p class="text-xs text-[#536456] mt-1">${t('4 of 5 years fields sit bare. Short-duration ', '৫ বছরের মধ্যে ৪ বছর জমি খালি থাকে। সংক্ষিপ্ত মেয়াদী ')}<strong>${t('Mungbean', 'মুগ')}</strong> ${t('covers soil and fixes nitrogen.', 'মাটিকে ঢাকে এবং নাইট্রোজেন সংরক্ষণ করে।')}</p>
        </button>
        <button type="button" data-season="aus" class="season-step-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9]">
          <div class="flex justify-between"><span class="mono text-[11px] font-bold text-[#315d42]">MAY-JUL · ${t('AUS', 'আউশ')}</span><span class="stamp stamp-estimated">IMERG Rain Onset</span></div>
          <p class="text-xs text-[#536456] mt-1">${t('Monsoon begins (~520 mm), 92% cloud cover blinds optical satellites.', 'মনসুন শুরু (~520 মিমি), 92% মেঘ অপটিক্যাল স্যাটেলাইট অন্ধ করে।')}</p>
        </button>
        <button type="button" data-season="aman" class="season-step-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9]">
          <div class="flex justify-between"><span class="mono text-[11px] font-bold text-[#234f61]">AUG-NOV · ${t('T. AMAN', 'টি. আমন')}</span><span class="stamp stamp-measured">${t('All 4', 'সকল ৪')}</span></div>
          <p class="text-xs text-[#536456] mt-1">${t('Rainfed Aman thrives, but low corners risk waterlogging.', 'বৃষ্টিনিরভর আমন ভালো, কিন্তু নীচু অংশ জলাবদ্ধতার ঝুঁকিতে।')}</p>
        </button>
      </div>
      <div class="rotation-panel-tint p-3 flex flex-col gap-2.5">
        <div class="flex justify-between"><span class="eyebrow text-[#173e30]">${t('Farm Priorities', 'খামারের অগ্রাধিকার')}</span><span class="mono text-[11px] text-[#536456]">${t('Weights', 'ওজন')}</span></div>
        ${priorityKeys.map(({ key }) => {
          const engineKey = mapPriorityKey(key);
          return `
            <div>
              <div class="flex justify-between text-xs font-medium"><span>${t(priorityKeys.find(pk => pk.key === key).labelEn, priorityKeys.find(pk => pk.key === key).labelBn)}</span><span id="val-prio-${key}" class="mono font-bold">${num(state.weights[engineKey] || 0)}%</span></div>
              <input id="slider-prio-${key}" data-priority="${key}" type="range" min="0" max="100" value="${state.weights[engineKey] || 0}" class="w-full mt-1">
            </div>
          `;
        }).join('')}
      </div>
      <div>
        <span class="eyebrow block mb-1.5">${t('3D Layout Geometry', '3D লেআউট জ্যামিতি')}</span>
        <div class="layout-btn-group text-xs">
          <button type="button" data-layout="rows" class="layout-btn py-1.5 px-2 rounded border border-[#173e30] bg-[#173e30] text-[#fffdf5] font-semibold">${t('Line Rows', 'সারি')}</button>
          <button type="button" data-layout="beds" class="layout-btn py-1.5 px-2 rounded border border-[#cdcfc0] bg-[#fffdf5] text-[#1b382e] font-medium">${t('Raised Beds', 'উচ্চ বিছানা')}</button>
          <button type="button" data-layout="drains" class="layout-btn py-1.5 px-2 rounded border border-[#cdcfc0] bg-[#fffdf5] text-[#1b382e] font-medium">${t('Bund Drains', 'বান্ধ নালা')}</button>
        </div>
      </div>
    </section>
  `;
}

// Panel 2: Where will water collect?
export async function panelWhereWillWaterCollect() {
  const lowGround = await loadLowGround();
  return `
    <section id="panel-left-water" class="panel-card p-4 flex flex-col gap-4">
      <div class="border-b border-[#e2e4d8] pb-2.5 flex justify-between items-start">
        <div>
          <p class="eyebrow">02 / ${t('Topography & Hydrology', 'ভূগোল ও জলবায়ু')}</p>
          <h2 class="serif-head text-xl font-semibold text-[#173e30] mt-0.5">${t('Where will water collect?', 'পানি কোথায় জমবে?')}</h2>
        </div>
        <span class="stamp stamp-estimated">NASADEM + S1</span>
      </div>
      <div class="flex flex-col gap-1.5" role="radiogroup">
        <button type="button" data-water-view="hypso" class="water-view-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9] flex justify-between">
          <div><div class="font-semibold text-xs text-[#1b382e]">${t('Height, slope & contours', 'উচ্চতা, ঢাল ও সমোন্নতি')}</div><div class="text-[11px] text-[#536456]">NASADEM 30m + isolines</div></div>
          <span class="mono text-[11px] font-bold text-[#315d42]">31.9-34.5 m</span>
        </button>
        <button type="button" data-water-view="collects" class="water-view-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9] flex justify-between">
          <div><div class="font-semibold text-xs text-[#1b382e]">${t('Runoff & ponding', 'প্রবাহ ও জমা')}</div><div class="text-[11px] text-[#536456]">3D slope vectors + S1 open-water</div></div>
          <span class="mono text-[11px] font-bold text-[#2563eb]">${t('SE Basin', 'দক্ষিণ-পূর্ব অববাহিকা')}</span>
        </button>
        <button type="button" data-water-view="drainage" class="water-view-btn text-left p-2.5 rounded border-2 border-[#173e30] bg-[#f4f6ea] flex justify-between">
          <div><div class="font-semibold text-xs text-[#173e30]">${t('Proposed drain to canal', 'খালের সাথে নালা')}</div><div class="text-[11px] text-[#3a4d3f]">${t('Connects SE corner to khal', 'দক্ষিণ-পূর্ব কোণকে খালের সাথে সংযুক্ত করে')}</div></div>
          <span class="stamp stamp-scenario">${t('Scenario', 'পরিকল্পনা')}</span>
        </button>
      </div>
      ${lowGround ? `
        <div class="rotation-panel-tint p-3 flex flex-col gap-2">
          <div class="flex justify-between text-[11px] mono font-semibold text-[#1b382e]">
            <span>${t('Low:', 'নিম্ন:')} ${lowGround.stats?.minRelativeMetres?.toFixed(1) || '?'} m</span>
            <span>${t('High:', 'উচ্চ:')} ${lowGround.stats?.maxRelativeMetres?.toFixed(1) || '?'} m</span>
          </div>
          <div class="h-2.5 w-full rounded-sm rainbow-strip"></div>
          <div class="grid grid-cols-2 gap-2 pt-1 text-xs">
            <div><span class="text-[11px] text-[#536456] block">${t('Elevation Range', 'উচ্চতার পরিসর')}</span><strong class="serif-head text-lg font-semibold">${((lowGround.stats?.maxRelativeMetres || 0) - (lowGround.stats?.minRelativeMetres || 0)).toFixed(2)} m</strong></div>
            <div><span class="text-[11px] text-[#536456] block">${t('Mean Slope', 'গড় ঢাল')}</span><strong class="serif-head text-lg font-semibold">${(lowGround.stats?.lowPercent || 20.3).toFixed(1)}%</strong></div>
          </div>
        </div>
      ` : ''}
      <div class="flex flex-col gap-2">
        <div class="flex justify-between items-center text-xs"><span class="font-medium text-[#1b382e]">${t('SE Drain Trench (46 m)', 'দক্ষিণ-পূর্ব নালা (46 মি)')}</span><button id="btn-toggle-drain" type="button" class="px-2.5 py-1 rounded bg-[#173e30] text-[#fffdf5] mono text-[11px] font-semibold">${t('Active', 'সক্রিয়')}</button></div>
        <div class="flex justify-between items-center text-xs"><span class="font-medium text-[#1b382e]">${t('Simulate Blocked Canal', 'খাল বন্ধ সিমুলেশন')}</span><button id="btn-toggle-block" type="button" class="px-2.5 py-1 rounded border border-[#cdcfc0] bg-[#fffdf5] text-[#1b382e] mono text-[11px] font-semibold">${t('Open', 'খোলা')}</button></div>
      </div>
      <div class="border-l-2 border-[#b9822d] bg-[#f8edd6] p-2.5 text-xs text-[#4b3412]"><strong>${t('Satellite vs Ground:', 'স্যাটেলাইট বনাম ভূমি:')}</strong> ${t('NASADEM 30m slope OK, but 10 cm bunds require spirit-level or drone.', 'NASADEM 30 মি ঢাল ঠিক, কিন্তু 10 সেমি বাঁধের জন্য স্পিরিট-লেভেল বা ড্রোন প্রয়োজন।')}</div>
    </section>
  `;
}

// Panel 3: What is under my field?
export async function panelWhatIsUnderMyField() {
  const profile = await loadSoilProfile();
  const f = field();
  const fieldId = f?.id || state.fieldId;
  const soilData = getSoilDataForField(fieldId);
  const nutrientsData = await loadNutrients();
  const siteNutrients = nutrientsData?.sites?.[fieldId] || nutrientsData?.[fieldId] || null;

  const awaitingText = t('Awaiting soil data', 'মাটির তথ্যের অপেক্ষায়');
  const pLabel = siteNutrients?.p ? `P: ${siteNutrients.p}` : `P (${awaitingText})`;
  const kLabel = siteNutrients?.k ? `K: ${siteNutrients.k}` : `K (${awaitingText})`;
  const znLabel = siteNutrients?.zn ? `Zn: ${siteNutrients.zn}` : `Zn (${awaitingText})`;
  const bLabel = siteNutrients?.b ? `B: ${siteNutrients.b}` : `B (${awaitingText})`;

  return `
    <section id="panel-left-soil" class="panel-card p-4 flex flex-col gap-4">
      <div class="border-b border-[#e2e4d8] pb-2.5 flex justify-between items-start">
        <div>
          <p class="eyebrow">03 / ${t('Subsurface Cutaway', 'মাটির নিচের কাটাওয়ে')}</p>
          <h2 class="serif-head text-xl font-semibold text-[#173e30] mt-0.5">${t('What is under my field?', 'আমার জমির মাটির নিচে কী আছে?')}</h2>
        </div>
        <span class="stamp stamp-measured">AEZ-3 + NASA</span>
      </div>
      <div class="flex flex-col gap-2">
        <div class="p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5]">
          <div class="flex justify-between"><span class="font-semibold text-xs text-[#1b382e]">1. ${t('Surface wetness (0-5 cm)', 'পৃষ্ঠের আর্দ্রতা (0-5 সেমি)')}</span><strong class="mono text-xs text-[#234f61]">0.50 ${t('index', 'সূচক')}</strong></div>
          <div class="flex justify-between mt-1"><span class="text-[11px] text-[#536456]">NASA POWER / SMAP</span><span class="stamp stamp-estimated">${t('Satellite', 'স্যাটেলাইট')}</span></div>
        </div>
        <div class="p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5]">
          <div class="flex justify-between"><span class="font-semibold text-xs text-[#1b382e]">2. ${t('Root-zone moisture (0-100 cm)', 'শিকড় অঞ্চলের আর্দ্রতা')}</span><strong class="mono text-xs text-[#1f4729]">0.50 ${t('index', 'সূচক')}</strong></div>
          <div class="flex justify-between mt-1"><span class="text-[11px] text-[#536456]">${t('Active roots: 35 cm', 'সক্রিয় শিকড়: 35 সেমি')}</span><span class="stamp stamp-estimated">${t('Model', 'মডেল')}</span></div>
        </div>
        <div class="p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5]">
          <div class="flex justify-between"><span class="font-semibold text-xs text-[#1b382e]">3. ${t('Groundwater table depth', 'ভূগর্ভস্থ পানির গভীরতা')}</span><strong class="mono text-xs text-[#575c58]" id="soil-gw-val">${t('Unknown', 'অজানা')}</strong></div>
          <div class="flex justify-between mt-1"><span class="text-[11px] text-[#536456]" id="soil-gw-sub">${t('Requires local tubewell dip', 'স্থানীয় টিউবওয়েল ডিপ প্রয়োজন')}</span><span class="stamp stamp-unknown" id="soil-gw-stamp">${t('No Local', 'স্থানীয় নেই')}</span></div>
        </div>
      </div>
      <div class="rotation-panel-tint p-3 flex flex-col gap-2">
        <div class="flex justify-between items-center"><span class="eyebrow text-[#173e30]">${t('Soil Fertility Lens', 'মাটির উর্বরতা লেন্স')}</span><span class="stamp stamp-measured" id="nutri-source-stamp">SoilGrids 2.0</span></div>
        <div class="nutrient-chip-group text-[11px] mono font-semibold">
          <button type="button" data-nutrient="moisture" class="nutrient-chip py-1.5 rounded bg-[#173e30] text-[#fffdf5]">${t('Moisture', 'আর্দ্রতা')}</button>
          <button type="button" data-nutrient="ph" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">pH ${soilData?.ph ? soilData.ph.toFixed(2) : '?'}</button>
          <button type="button" data-nutrient="om" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">OM ${soilData?.om ? soilData.om.toFixed(2) : '?'}%</button>
          <button type="button" data-nutrient="N" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">N</button>
          <button type="button" data-nutrient="P" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">${pLabel}</button>
          <button type="button" data-nutrient="K" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">${kLabel}</button>
          <button type="button" data-nutrient="Zn" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">${znLabel}</button>
          <button type="button" data-nutrient="B" class="nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]">${bLabel}</button>
        </div>
        <div id="nutrient-explanation" class="text-xs text-[#1b382e] bg-[#fffdf5] p-2.5 rounded border border-[#cdcfc0] leading-relaxed">${t('Surface wetness from NASA POWER/SMAP. Regional estimates may not match after heavy local rain or irrigation.', 'NASA POWER/SMAP থেকে পৃষ্ঠের আর্দ্রতা। আঞ্চলিক অনুমান স্থানীয় ভারী বৃষ্টি বা সেচের পরে মেলাতে পারে না।')}</div>
      </div>
      <button id="btn-open-soil-modal" type="button" class="w-full py-2 px-3 rounded bg-[#173e30] hover:bg-[#225441] text-[#fffdf5] text-xs font-semibold">+ ${t('Enter Local Soil Test', 'স্থানীয় মাটি পরীক্ষা লিখুন')}</button>
    </section>
  `;
}

// Panel 4: Compare rotations
export function panelCompareRotations() {
  const items = getRanking();
  const tariffKey = state.pumpTariff || 'diesel';
  const netAreaHa = getNetArea();
  const f = field();

  if (!f?.monthly?.length) {
    return `<section class="panel-card p-4">${t('Weather data not loaded', 'আবহাওয়ার তথ্য লোড হয়নি')}</section>`;
  }

  const selected = items[0] || { id: 'mustard', score: 0, deficit: 0 };
  const { pumpHours, costTk } = calculateIrrigationCost(selected.deficit || 0, tariffKey);

  function card(r, i, tKey) {
    const { phrs, pk } = calculateIrrigationCost(r.deficit || 0, tKey);
    return `<button type="button" data-rotation="${r.id}" class="rotation-comparison-card text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9] transition">
      <div class="flex justify-between gap-2"><span class="mono text-[10px] font-bold px-1.5 py-0.5 rounded ${r.id === 'baseline' ? 'bg-[#ece8d9] text-[#536456]' : 'bg-[#dbe9cf] text-[#1f4729]'}">${String(i + 1).padStart(2, '0')}</span><span class="mono text-xs font-bold text-[#173e30]">${t('Fit:', 'ম্যানানসই:')} ${r.score == null ? '—' : num(r.score)}/100</span></div>
      <div class="font-semibold text-xs text-[#1b382e] mt-1">${esc(t(r.crops.join(' → '), r.bnCrops?.join(' → ') || ''))}</div>
      <div class="grid grid-cols-3 gap-1 mt-1.5 pt-1.5 border-t border-[#e2e4d8] mono text-[10px] text-[#536456]"><span>${t('Deficit:', 'ঘাটতি:')} <strong class="text-[#1b382e]">${r.deficit == null ? '—' : num(r.deficit, 0)} mm</strong></span><span>${t('Pump:', 'পাম্প:')} <strong class="text-[#1b382e]">${phrs} hr</strong></span><span>${t('Cost:', 'খরচ:')} <strong class="text-[#1b382e]">৳${num(pk)}</strong></span></div>
    </button>`;
  }

  return `
    <section class="panel-card p-4 flex flex-col gap-3">
      <div class="border-b border-[#e2e4d8] pb-2.5 flex justify-between items-start">
        <div>
          <p class="eyebrow">NASA POWER · GPM IMERG · FAO-56</p>
          <h2 class="serif-head text-xl font-semibold text-[#173e30] mt-0.5">${t('Compare 4 Rotation Strategies', '৪টি ফসলচক্র তুলনা করুন')}</h2>
        </div>
        <span class="stamp stamp-measured">RARS ${t('Trial', 'পরীক্ষা')}</span>
      </div>
      <div id="rotation-cards-list" class="flex flex-col gap-2">${items.map((r, i) => card(r, i, tariffKey)).join('')}</div>
      <div id="selected-rotation-detail" class="rotation-panel-tint p-3.5 flex flex-col gap-2.5 text-xs">
        <div class="flex justify-between border-b border-[#d5dac7] pb-1.5"><strong class="serif-head text-base text-[#173e30]">${selected.id === 'baseline' ? t('Keep the familiar rhythm', 'পরিচিত ছন্দ বজায় রাখুন') : selected.id === 'mustard' ? t('Make the winter gap count', 'শীতের ফাঁকে ফসল চাষ') : selected.id === 'potato' ? t('Plan for a potato harvest', 'আলুর ফলনের পরিকল্পনা') : t('Bring a pulse into the cycle', 'চক্রে ডাল যোগ করুন')}</strong></div>
        <div><span class="eyebrow text-[10px] text-[#315d42] block">${t('Why Suggested', 'কেন পরামর্শ')}</span><p class="mt-0.5 text-[#1b382e]">${t(whyBn[selected.id] || selected.why || '', whyBn[selected.id] || '')}</p></div>
        <div><span class="eyebrow text-[10px] text-[#315d42] block">${t('Trial Evidence', 'গবেষণার প্রমাণ')}</span><p class="mt-0.5 text-[#1b382e]">${t('Agronomic field trials under regional conditions.', 'আঞ্চলিক পরিস্থিতিতে মাঠ পরীক্ষা।')}</p></div>
        <div><span class="eyebrow text-[10px] text-[#315d42] block">${t('Soil & Water Benefits', 'মাটি ও পানির সুবিধা')}</span><p class="mt-0.5 text-[#1b382e]">${t('Improves soil structure and reduces irrigation.', 'মাটির গঠন উন্নত করে এবং সেচ কমায়।')}</p></div>
        <div class="grid grid-cols-1 gap-1.5 pt-1 border-t border-[#d5dac7]">
          <div><span class="eyebrow text-[10px] text-[#b9822d] block">${t('Information Gaps', 'তথ্যের ঘাটতি')}</span><p class="text-[11px] text-[#536456]">${t('Local soil test required for precise nutrients.', 'সঠিক পুষ্টির জন্য স্থানীয় মাটি পরীক্ষা প্রয়োজন।')}</p></div>
          <div><span class="eyebrow text-[10px] text-[#b0452b] block">${t('Risks to Check', 'ঝুঁকি পরীক্ষা')}</span><p class="text-[11px] text-[#536456]">${t(riskBn[selected.id] || selected.risk || '', riskBn[selected.id] || '')}</p></div>
        </div>
      </div>
      <div class="border-t border-[#e2e4d8] pt-3 flex flex-col gap-2">
        <div class="flex justify-between items-center"><span class="eyebrow text-[#173e30]">${t('Parcel Area & Pump Cost', 'জমির এলাকা ও পাম্প খরচ')}</span>
          <select id="select-pump-tariff" class="unit-selector text-[11px] mono">
            <option value="diesel">${t('Diesel STW (৳320/hr)', 'ডিজেল STW (৳320/ঘণ্টা)')}</option>
            <option value="electric">${t('Electric (৳160/hr)', 'বিদ্যুৎ (৳160/ঘণ্টা)')}</option>
            <option value="bmda">${t('BMDA/Solar (৳110/hr)', 'BMDA/সোলার (৳110/ঘণ্টা)')}</option>
          </select>
        </div>
        <div class="econ-grid">
          <div class="econ-cell"><span class="econ-cell-label">${t('Cultivable Area', 'চাষযোগ্য এলাকা')}</span><strong id="right-net-area" class="econ-cell-value">${formatArea(netAreaHa, state.unit || 'ha')}</strong></div>
          <div class="econ-cell"><span class="econ-cell-label">${t('Dry-Season Pump', 'শুকনো মৌসুমের পাম্প')}</span><strong id="right-pump-hrs" class="econ-cell-value">${pumpHours} ${t('hrs', 'ঘণ্টা')}</strong></div>
          <div class="econ-cell"><span class="econ-cell-label">${t('Est. Net Return', 'আনুমানিক নিট আয়')}</span><strong id="right-net-tk" class="econ-cell-value">৳ ${num(selected.score ? Math.round(selected.score * 1000) : 0)}</strong></div>
        </div>
      </div>
    </section>
  `;
}

// NASA Sources Modal
export function sourcesModal() {
  return `
    <dialog id="modal-sources" class="rotation-modal">
      <div class="rotation-modal-content">
        <div class="rotation-modal-header">
          <div>
            <p class="eyebrow">${t('Data Fusion & Citations', 'ডেটা ফিউশন ও উদ্ধৃতি')}</p>
            <h3 class="serif-head text-xl font-semibold text-[#173e30]">${t('NASA & Local Data Sources', 'NASA ও স্থানীয় তথ্যের উৎস')}</h3>
          </div>
          <button id="btn-close-sources" type="button" class="rotation-modal-close" aria-label="${t('Close', 'বন্ধ')}">✕</button>
        </div>
        <div class="overflow-x-auto"><table class="sources-table"><thead><tr><th>${t('Dataset', 'ডেটাসেট')}</th><th>${t('Resolution & Dates', 'রেজোলিউশন ও তারিখ')}</th><th>${t('Role', 'ভূমিকা')}</th><th>${t('Truth & Limitation', 'সত্যতা ও সীমাবদ্ধতা')}</th></tr></thead><tbody>
          <tr><td class="font-semibold"><a href="https://www.esri.com/" target="_blank" rel="noopener" class="text-[#315d42] underline">Esri World Imagery (Wayback) ↗</a></td><td class="mono">0.31 m · 2022-11-28</td><td>${t('High-detail basemap & parcel boundary reference', 'উচ্চ বিস্তারিত বেসম্যাপ ও জমির সীমানা')}</td><td class="text-[#536456]"><span class="stamp stamp-estimated">${t('Estimated', 'অনুমান')}</span> ${t('Dry season snapshot; static aerial', 'শুকনো মৌসুমের স্থির দৃশ্য')}</td></tr>
          <tr><td class="font-semibold"><a href="https://planetarycomputer.microsoft.com/dataset/sentinel-2-l2a" target="_blank" rel="noopener" class="text-[#315d42] underline">Copernicus Sentinel-2 L2A ↗</a></td><td class="mono">10 m · 2024-03-09, 2024-11-09</td><td>${t('True-colour canopy, NDVI, bare-field window', 'সত্য রং ক্যানোপি, এনডিভিআই, খালি জমি')}</td><td class="text-[#536456]"><span class="stamp stamp-estimated">${t('Estimated', 'অনুমান')}</span> ${t('Monsoon cloud blocks optical scenes', 'বর্ষার মেঘে অপটিক্যাল দৃশ্য ব্যাহত')}</td></tr>
          <tr><td class="font-semibold"><a href="https://planetarycomputer.microsoft.com/dataset/nasadem" target="_blank" rel="noopener" class="text-[#315d42] underline">NASADEM ↗</a></td><td class="mono">30 m · 2000</td><td>${t('3D surface topography, slope %, flood exposure', '3D ভূ-উচ্চতা, ঢাল %, বন্যা ঝুঁকি')}</td><td class="text-[#536456]"><span class="stamp stamp-estimated">${t('Estimated', 'অনুমান')}</span> ${t('Cannot see 15 cm earthen bunds (aal)', '১৫ সেমি মাটির আইল দেখা যায় না')}</td></tr>
          <tr><td class="font-semibold"><a href="https://power.larc.nasa.gov/" target="_blank" rel="noopener" class="text-[#315d42] underline">NASA POWER / GPM IMERG ↗</a></td><td class="mono">~10 km / ~50 km · 2024 ${t('monthly', 'মাসিক')}</td><td>${t('Rainfall, FAO-56 ETo, temperature, water deficit', 'বৃষ্টিপাত, FAO-56 ETo, তাপমাত্রা, পানির ঘাটতি')}</td><td class="text-[#536456]"><span class="stamp stamp-estimated">${t('Estimated', 'অনুমান')}</span> ${t('Regional grid; no sub-parcel variation', 'আঞ্চলিক গ্রিড; উপ-প্লট বৈচিত্র্য নেই')}</td></tr>
          <tr><td class="font-semibold"><a href="https://smap.jpl.nasa.gov/" target="_blank" rel="noopener" class="text-[#315d42] underline">NASA SMAP L4 ↗</a></td><td class="mono">9 km · 2024 ${t('monthly', 'মাসিক')}</td><td>${t('Surface & root-zone soil wetness index', 'মাটির পৃষ্ঠ ও মূল অঞ্চলের আর্দ্রতা')}</td><td class="text-[#536456]"><span class="stamp stamp-estimated">${t('Estimated', 'অনুমান')}</span> ${t('Coarse microwave cell; integrates wider basin', 'বৃহৎ মাইক্রোওয়েভ সেল')}</td></tr>
          <tr><td class="font-semibold"><a href="https://soilgrids.org/" target="_blank" rel="noopener" class="text-[#315d42] underline">ISRIC SoilGrids 2.0 ↗</a></td><td class="mono">250 m · 2024</td><td>${t('Standardized pH, SOC/OM, texture across 5 depths', '৫টি গভীরতায় প্রমিত pH, জৈব কার্বন ও গঠন')}</td><td class="text-[#536456]"><span class="stamp stamp-estimated">${t('Estimated', 'অনুমান')}</span> ${t('Regional machine learning; verify with soil test', 'আঞ্চলিক এমএল অনুমান; পরীক্ষা দিয়ে যাচাই করুন')}</td></tr>
        </tbody></table></div>
      </div>
    </dialog>
  `;
}

// Soil Input Modal
export function soilModal() {
  const f = field();
  const defaultSoil = getSoilDataForField(f?.id || state.fieldId);
  const curPh = soilOverrides?.ph ?? (defaultSoil?.ph ? defaultSoil.ph.toFixed(2) : '');
  const curOm = soilOverrides?.om ?? (defaultSoil?.om ? defaultSoil.om.toFixed(2) : '');
  const curGw = soilOverrides?.gwDepth ?? '';
  const curP = soilOverrides?.p ?? '';

  return `
    <dialog id="modal-soil-input" class="rotation-modal">
      <div class="rotation-modal-content">
        <div class="rotation-modal-header">
          <div>
            <p class="eyebrow">${t('Ground Calibration', 'ভূমি ক্যালিব্রেশন')}</p>
            <h3 class="serif-head text-xl font-semibold text-[#173e30]">${t('Enter Local Well or Soil Test', 'স্থানীয় কূপ বা মাটি পরীক্ষা লিখুন')}</h3>
          </div>
          <button id="btn-close-soil-modal" type="button" class="rotation-modal-close" aria-label="${t('Close', 'বন্ধ')}">✕</button>
        </div>
        <p class="text-xs text-[#536456] mb-4">${t('Satellites estimate moisture but cannot see tubewell depth or lab NPK. Enter local measurements to calibrate 3D.', 'উপগ্রহ আর্দ্রতা অনুমান করে কিন্তু টিউবওয়েল গভীরতা বা ল্যাব এনপিকে দেখতে পারে না। 3D ক্যালিব্রেট করতে স্থানীয় পরিমাপ লিখুন।')}</p>
        <form id="form-soil-input" class="rotation-form">
          <div class="rotation-form-grid">
            <div class="rotation-form-row"><label class="rotation-form-label" for="inp-gw-depth">${t('Water level in well (m below ground)', 'কূপে পানির স্তর (মাটি থেকে মি নিচে)')}</label><input id="inp-gw-depth" type="number" step="0.1" min="0.5" max="25" placeholder="—" value="${curGw !== '' ? curGw : ''}" class="rotation-form-input mono"></div>
            <div class="rotation-form-row"><label class="rotation-form-label" for="inp-ph-val">${t('Soil pH', 'মাটির pH')}</label><input id="inp-ph-val" type="number" step="0.05" min="3.5" max="8.5" placeholder="—" value="${curPh !== '' ? curPh : ''}" class="rotation-form-input mono"></div>
            <div class="rotation-form-row"><label class="rotation-form-label" for="inp-om-val">${t('Organic Matter (%)', 'জৈব পদার্থ (%)')}</label><input id="inp-om-val" type="number" step="0.05" min="0.3" max="5.0" placeholder="—" value="${curOm !== '' ? curOm : ''}" class="rotation-form-input mono"></div>
            <div class="rotation-form-row"><label class="rotation-form-label" for="inp-p-val">${t('Available P (mg/kg)', 'প্রাপ্য P (মিগ্রা/কেজি)')}</label><input id="inp-p-val" type="number" step="0.5" min="1" max="80" placeholder="—" value="${curP !== '' ? curP : ''}" class="rotation-form-input mono"></div>
          </div>
          <div class="rotation-form-actions">
            <button id="btn-reset-soil" type="button" class="rotation-btn secondary">${t('Reset to Regional', 'আঞ্চলিক ডিফল্ট')}</button>
            <button type="submit" class="rotation-btn primary">${t('Apply to 3D', '3D তে প্রয়োগ')}</button>
          </div>
        </form>
      </div>
    </dialog>
  `;
}

// Initialize panel interactions
export function initRotationPanels() {
  // Season buttons
  document.querySelectorAll('.season-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.season-step-btn').forEach(b => {
        b.className = b === btn ? 'season-step-btn text-left p-2.5 rounded border-2 border-[#173e30] bg-[#f4f6ea]' : 'season-step-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9]';
      });
    });
  });

  // Priority sliders
  document.querySelectorAll('[data-priority]').forEach(slider => {
    const key = slider.getAttribute('data-priority');
    const engineKey = mapPriorityKey(key);
    slider.value = state.weights[engineKey] || 0;
    const valEl = document.getElementById(`val-prio-${key}`);
    if (valEl) valEl.textContent = `${num(state.weights[engineKey] || 0)}%`;
    slider.addEventListener('input', (e) => {
      state.weights[engineKey] = parseInt(e.target.value, 10);
      if (valEl) valEl.textContent = `${num(+e.target.value)}%`;
      persist();
    });
  });

  // Layout buttons
  document.querySelectorAll('.layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const layout = btn.getAttribute('data-layout');
      setPlantingLayout(layout);
      document.querySelectorAll('.layout-btn').forEach(b => {
        b.className = b === btn ? 'layout-btn py-1.5 px-2 rounded border border-[#173e30] bg-[#173e30] text-[#fffdf5] font-semibold' : 'layout-btn py-1.5 px-2 rounded border border-[#cdcfc0] bg-[#fffdf5] text-[#1b382e] font-medium';
      });
    });
  });

  // Water view buttons
  document.querySelectorAll('.water-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.water-view-btn').forEach(b => {
        b.className = b === btn ? 'water-view-btn text-left p-2.5 rounded border-2 border-[#173e30] bg-[#f4f6ea] flex justify-between' : 'water-view-btn text-left p-2.5 rounded border border-[#cdcfc0] bg-[#fffdf5] hover:bg-[#f6f3e9] flex justify-between';
      });
    });
  });

  // Drain & Block toggles
  const setupToggle = (btnId, states) => {
    const btn = document.getElementById(btnId);
    if (!btn || btn.closest('.question-panel')) return;
    let idx = 0;
    btn.addEventListener('click', () => {
      idx = (idx + 1) % states.length;
      btn.textContent = states[idx].label;
      btn.className = states[idx].className;
    });
  };
  setupToggle('btn-toggle-drain', [
    { label: t('Active', 'সক্রিয়'), className: 'px-2.5 py-1 rounded bg-[#173e30] text-[#fffdf5] mono text-[11px] font-semibold' },
    { label: t('Off', 'বন্ধ'), className: 'px-2.5 py-1 rounded border border-[#cdcfc0] bg-[#fffdf5] text-[#536456] mono text-[11px] font-semibold' }
  ]);
  setupToggle('btn-toggle-block', [
    { label: t('Open', 'খোলা'), className: 'px-2.5 py-1 rounded border border-[#cdcfc0] bg-[#fffdf5] text-[#1b382e] mono text-[11px] font-semibold' },
    { label: t('Blocked!', 'বন্ধ!'), className: 'px-2.5 py-1 rounded bg-[#b0452b] text-[#fffdf5] mono text-[11px] font-semibold' }
  ]);

  // Nutrient chips
  document.querySelectorAll('.nutrient-chip').forEach(chip => {
    if (chip.closest('.question-panel')) return;
    chip.addEventListener('click', () => {
      document.querySelectorAll('.nutrient-chip').forEach(c => {
        c.className = c === chip ? 'nutrient-chip py-1.5 rounded bg-[#173e30] text-[#fffdf5]' : 'nutrient-chip py-1.5 rounded bg-[#fffdf5] border border-[#cdcfc0] text-[#1b382e]';
      });
      const nutrient = chip.getAttribute('data-nutrient');
      const guide = NUTRIENT_GUIDES[nutrient];
      const expEl = document.getElementById('nutrient-explanation');
      if (expEl && guide) expEl.innerHTML = `<p>${t(guide.en, guide.bn)}</p>`;
    });
  });

  // Setup dialog focus trap and esc key listener
  const setupDialog = (dialogEl, openBtn, closeBtn) => {
    if (!dialogEl) return;
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        if (typeof dialogEl.showModal === 'function') {
          dialogEl.showModal();
        } else {
          dialogEl.setAttribute('open', '');
        }
        const focusable = dialogEl.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusable) focusable.focus();
      });
    }
    const closeDialog = () => {
      if (typeof dialogEl.close === 'function') {
        dialogEl.close();
      } else {
        dialogEl.removeAttribute('open');
      }
      if (openBtn) openBtn.focus();
    };
    if (closeBtn) closeBtn.addEventListener('click', closeDialog);
    dialogEl.addEventListener('click', (e) => {
      if (e.target === dialogEl) closeDialog();
    });
    dialogEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDialog();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = Array.from(dialogEl.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'));
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  };

  // Soil modal
  const soilModalEl = document.getElementById('modal-soil-input');
  const openSoilBtn = document.getElementById('btn-open-soil-modal');
  const closeSoilBtn = document.getElementById('btn-close-soil-modal');
  const resetSoilBtn = document.getElementById('btn-reset-soil');
  const soilForm = document.getElementById('form-soil-input');

  setupDialog(soilModalEl, openSoilBtn, closeSoilBtn);

  if (resetSoilBtn) resetSoilBtn.addEventListener('click', () => {
    const f = field();
    const defaultSoil = getSoilDataForField(f?.id || state.fieldId);
    const gwInp = document.getElementById('inp-gw-depth');
    const phInp = document.getElementById('inp-ph-val');
    const omInp = document.getElementById('inp-om-val');
    const pInp = document.getElementById('inp-p-val');
    if (gwInp) gwInp.value = '';
    if (phInp) phInp.value = defaultSoil?.ph ? defaultSoil.ph.toFixed(2) : '';
    if (omInp) omInp.value = defaultSoil?.om ? defaultSoil.om.toFixed(2) : '';
    if (pInp) pInp.value = '';
    resetSoilOverrides();
    updateSoilDisplay();
    if (typeof soilModalEl.close === 'function') soilModalEl.close();
    else soilModalEl.removeAttribute('open');
  });

  if (soilForm) soilForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const gwVal = document.getElementById('inp-gw-depth')?.value;
    const phVal = document.getElementById('inp-ph-val')?.value;
    const omVal = document.getElementById('inp-om-val')?.value;
    const pVal = document.getElementById('inp-p-val')?.value;

    const f = field();
    const defaultSoil = getSoilDataForField(f?.id || state.fieldId);

    const overrides = {
      gwDepth: gwVal !== '' && !isNaN(parseFloat(gwVal)) ? parseFloat(gwVal) : null,
      ph: phVal !== '' && !isNaN(parseFloat(phVal)) ? parseFloat(phVal) : (defaultSoil?.ph ?? null),
      om: omVal !== '' && !isNaN(parseFloat(omVal)) ? parseFloat(omVal) : (defaultSoil?.om ?? null),
      p: pVal !== '' && !isNaN(parseFloat(pVal)) ? parseFloat(pVal) : null,
    };
    saveSoilOverrides(overrides);
    updateSoilDisplay();
    if (typeof soilModalEl.close === 'function') soilModalEl.close();
    else soilModalEl.removeAttribute('open');
    toast(t('Local soil test applied', 'স্থানীয় মাটি পরীক্ষা প্রয়োগ করা হয়েছে'));
  });

  // Sources modal
  const sourcesModalEl = document.getElementById('modal-sources');
  const openSourcesBtn = document.getElementById('btn-open-sources');
  const closeSourcesBtn = document.getElementById('btn-close-sources');
  setupDialog(sourcesModalEl, openSourcesBtn, closeSourcesBtn);

  // Tariff selector
  const tariffSelect = document.getElementById('select-pump-tariff');
  if (tariffSelect) {
    tariffSelect.value = state.pumpTariff || 'diesel';
    tariffSelect.addEventListener('change', (e) => { state.pumpTariff = e.target.value; persist(); updateEconDisplay(); });
  }

  updateEconDisplay();
  updateSoilDisplay();
}

export default {
  panelWhenBareOrStressed,
  panelWhereWillWaterCollect,
  panelWhatIsUnderMyField,
  panelCompareRotations,
  sourcesModal,
  soilModal,
  initRotationPanels,
  getRanking,
  calculateIrrigationCost,
  formatArea,
  getNetArea,
  initSoilOverrides,
  saveSoilOverrides,
  resetSoilOverrides,
  updateSoilDisplay,
  updateEconDisplay,
  setPlantingLayout,
};
