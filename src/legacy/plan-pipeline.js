// PLANGEN: generative first-open experience for the plan report.
// Pure data helpers (tested) + the animated Planty pipeline runner (DOM).
// Real data only: every step hides itself when its data is missing.
import { t, esc, num, nasaBadge, truth } from './ui.js';
import {
  outlookSummaryLine, floodSummaryLine, floodHeadline, rainVerdict,
} from './outlook-flood.js';
import { plantyMascot } from './planty.js';
import { cropLabel, seasonWater } from './plan.js';
import { CROP_KC } from './engine.js';

export const FLOOD_MODEL_URL = 'https://adribmahmud101--ropon-flood-flood.us-east.modal.run';
export const OUTLOOK_MODEL_URL = 'https://adribmahmud101--ropon-outlook-outlook.us-east.modal.run';
export const MODEL_FIELDS = ['mithapukur', 'pirganj', 'gangachara'];
export const LIVE_TIMEOUT_MS = 30000;

const SEEN_KEY = 'ropon_plan_pipeline_done_v1';
const readSeen = () => {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(SEEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
export const pipelineSeen = planId => Boolean(planId && readSeen()[planId]);
export function markPipelineSeen(planId) {
  if (!planId) return;
  try {
    globalThis.localStorage?.setItem(SEEN_KEY, JSON.stringify({ ...readSeen(), [planId]: 1 }));
  } catch { /* private mode: pipeline replays next open */ }
}

// Replay is requested explicitly ("Regenerate report"); consumed once by mountPlan.
const REPLAY_KEY = 'ropon_plan_pipeline_replay';
export const consumeReplay = () => {
  try {
    if (globalThis.sessionStorage?.getItem(REPLAY_KEY) !== '1') return false;
    globalThis.sessionStorage.removeItem(REPLAY_KEY);
    return true;
  } catch {
    return false;
  }
};
export const requestReplay = () => {
  try { globalThis.sessionStorage?.setItem(REPLAY_KEY, '1'); } catch { /* ignore */ }
};

export const shouldPlayPipeline = plan =>
  Boolean(plan?.field && plan?.rotation) && (!pipelineSeen(plan.id) || consumeReplay());

// ------------------------------------------------------------------ pure lines

export function planCropList(plan) {
  const seasons = plan?.rotation?.seasons ?? [];
  const crops = seasons.filter(s => s.crop !== 'fallow').map(s => String(s.crop).toLowerCase());
  for (const settings of Object.values(plan?.planting ?? {})) {
    const crop = String(settings?.crop ?? '').toLowerCase();
    if (crop && crop !== 'fallow' && !crops.includes(crop)) crops.push(crop);
  }
  return [...new Set(crops)];
}

// Step 1: "Reading your plan: <crops>, <field>, <area>".
export function thinkingLine(plan, lang = 'en') {
  const bn = lang === 'bn';
  const seasons = (plan?.rotation?.seasons ?? []).filter(s => s.crop !== 'fallow');
  const crops = seasons.map(s => (bn ? s.cropBn : cropLabel(s.crop, lang)) || s.crop).join(bn ? '、' : ', ') || (bn ? 'অজানা ফসল' : 'Unknown crops');
  const field = plan?.field?.name ?? (bn ? 'আমার জমি' : 'My field');
  const area = Number.isFinite(plan?.field?.areaHa) ? `${num(plan.field.areaHa, 2)} ha` : null;
  return bn
    ? `আপনার পরিকল্পনা পড়া হচ্ছে: ${crops} · ${field}${area ? ` · ${area}` : ''}`
    : `Reading your plan: ${crops} · ${field}${area ? ` · ${area}` : ''}`;
}

// Step 2: names the files that really loaded.
export const DATA_FILES = ['outlook.json', 'flood-fields.json', 'soil-nutrients.json', 'water-table.json',
  'grace-groundwater.json', 'smap.json', 'tolerant-varieties.json'];
export function loadedFilesLine(files, lang = 'en') {
  if (!files?.length) return null;
  return lang === 'bn' ? `${files.length}টি ফাইল লোড হয়েছে` : `${files.length} files loaded`;
}

// Field hazards from real packs: flood history, outlook rain, cold-season crops.
export function hazardsFor(plan, floodPack, outlookPack) {
  const hazards = [];
  const level = floodHeadline(plan?.field?.id, floodPack)?.level;
  if (level === 'some' || level === 'low') hazards.push('flood', 'submergence');
  const rain = outlookPack?.sites?.[plan?.field?.id]?.rain_mm_day;
  if (rain?.beats_climatology === true && Array.isArray(rain.months)) {
    let p50 = 0, clim = 0;
    for (const m of rain.months) {
      if (Number.isFinite(m?.p50) && Number.isFinite(m?.climatology)) { p50 += m.p50; clim += m.climatology; }
    }
    if (rainVerdict(p50, clim) === 'below') hazards.push('drought');
  }
  const seasons = plan?.rotation?.seasons ?? [];
  if (seasons.some(s => s.crop === 'boro' || (s.crop !== 'fallow' && s.sowMonth === 11)) || planCropList(plan).some(c => /boro/i.test(c))) hazards.push('cold');
  return [...new Set(hazards)];
}

// Step 5: match plan crops + field hazards against the RAG shortlist only.
const RICE = new Set(['rice', 'aman', 'boro']);
export function pickTolerantVarieties(planCrops, hazards, pack, limit = 4) {
  const varieties = Array.isArray(pack?.varieties) ? pack.varieties : [];
  const norm = planCrops.map(c => (RICE.has(c) ? 'rice' : c));
  const scored = [];
  for (const v of varieties) {
    if (!v?.variety || !Array.isArray(v.crops)) continue;
    if (!v.crops.some(c => norm.includes(c))) continue;
    const hit = (v.hazards ?? []).filter(h => hazards.includes(h)).length;
    if (!hit) continue;
    const official = (v.evidence ?? []).includes('official_trait') ? 0 : 1;
    scored.push({ v, hit, official });
  }
  scored.sort((a, b) => b.hit - a.hit || a.official - b.official);
  return scored.slice(0, limit).map(({ v }) => v);
}

// Step 3: irrigation need vs rain + water-table depth + GRACE anomaly.
export function resilienceParts(plan, monthly, waterTablePack, gracePack) {
  let needMm = null, rainMm = null;
  if (Array.isArray(monthly) && monthly.length) {
    let need = 0, rain = 0, ok = false;
    for (const season of (plan?.rotation?.seasons ?? []).filter(s => s.crop !== 'fallow')) {
      // Custom-plan crops have no Kc: skip so we never report "Need 0 mm".
      const key = season.crop === 'mungbean' ? 'pulse' : season.crop === 'rice' ? 'aman' : season.crop;
      if (!Number.isFinite(CROP_KC[key]) || CROP_KC[key] <= 0) continue;
      try {
        const part = seasonWater(monthly, season);
        if (part.needMm === null || part.rainMm === null) continue;
        need += part.needMm; rain += part.rainMm; ok = true;
      } catch { /* unreachable after the Kc guard, kept for safety */ }
    }
    if (ok) { needMm = need; rainMm = rain; }
  }
  const wtd = waterTablePack?.sites?.[plan?.field?.id]?.annualDepthM;
  const graceRows = gracePack?.sites?.[plan?.field?.id]?.monthly ?? [];
  const graceLast = [...graceRows].reverse().find(r => Number.isFinite(r?.twsAnomalyCm));
  return {
    needMm, rainMm,
    wtdM: Number.isFinite(wtd) ? wtd : null,
    graceCm: graceLast ? { value: graceLast.twsAnomalyCm, month: graceLast.month } : null,
  };
}

export function resilienceLine(parts, lang = 'en') {
  const bits = [];
  if (parts.needMm !== null && parts.rainMm !== null) {
    bits.push(lang === 'bn'
      ? `চাহিদা ${num(parts.needMm, 0)} মিমি বনাম বৃষ্টি ${num(parts.rainMm, 0)} মিমি`
      : `Need ${num(parts.needMm, 0)} mm vs rain ${num(parts.rainMm, 0)} mm`);
  }
  if (parts.wtdM !== null) {
    bits.push(lang === 'bn' ? `পানির স্তর ~${num(parts.wtdM, 1)} মি` : `Water table ~${num(parts.wtdM, 1)} m`);
  }
  if (parts.graceCm) {
    bits.push(`GRACE ${num(parts.graceCm.value, 0)} cm`);
  }
  return bits.length ? bits.join(' · ') : null;
}

// Step 6: NASA datasets with real coverage for this field.
export function nasaList(fieldId, packs) {
  const has = (pack, test) => {
    try { return Boolean(test(pack)); } catch { return false; }
  };
  return [
    { key: 'power', ok: has(packs?.earth, p => p?.fields?.find(f => f.id === fieldId)?.monthly?.length) },
    { key: 'imerg', ok: has(packs?.earth, p => p?.fields?.find(f => f.id === fieldId)?.monthly?.some(m => Number.isFinite(m?.rainGpm))) },
    { key: 'smap', ok: has(packs?.smap, p => p?.sites?.[fieldId]?.monthly?.length) },
    { key: 'grace', ok: has(packs?.grace, p => p?.sites?.[fieldId]?.monthly?.length) },
    { key: 'hls', ok: has(packs?.flood, p => (p?.fields?.[fieldId]?.scenes?.length ?? 0) > 0) },
    { key: 'prithvi', ok: has(packs?.flood, p => (p?.fields?.[fieldId]?.scenes?.length ?? 0) > 0) },
  ];
}

// Step 7: soil nutrients, always labelled Estimated.
export function soilLine(site, lang = 'en') {
  const n = site?.nutrients;
  const bits = [];
  if (Number.isFinite(n?.ph?.value)) bits.push(`pH ${num(n.ph.value, 1)}`);
  if (Number.isFinite(n?.om?.value)) bits.push(lang === 'bn' ? `জৈব পদার্থ ${num(n.om.value, 1)} গ/কেজি` : `OM ${num(n.om.value, 1)} g/kg`);
  if (!bits.length) return null;
  return `${bits.join(' · ')} (${lang === 'bn' ? 'স্যাটেলাইট অনুমান' : 'Estimated'})`;
}

// Step 8: SMAP root-zone moisture, latest 2024 month.
export function smapLine(site, lang = 'en') {
  const rows = (site?.monthly ?? []).filter(r => r?.month >= '2024-01' && r?.month <= '2024-12' && Number.isFinite(r?.RZMC_mean));
  const last = rows.at(-1);
  if (!last) return null;
  const p = last.RZMC_PRCNTL_mean ?? last.PRMC_PRCNTL_mean;
  const word = !Number.isFinite(p) ? null : p < 30 ? (lang === 'bn' ? 'শুষ্ক' : 'Dry') : p <= 70 ? (lang === 'bn' ? 'স্বাভাবিক' : 'Normal') : (lang === 'bn' ? 'ভিজা' : 'Wet');
  return lang === 'bn'
    ? `মূল অঞ্চল ${num(last.RZMC_mean, 2)} মি³/মি³${word ? ` (${word})` : ''}`
    : `Root zone ${num(last.RZMC_mean, 2)} m³/m³${word ? ` (${word})` : ''}`;
}

// Step 9: one weather/outlook value.
export function weatherLine(fieldId, outlookPack, lang = 'en') {
  return outlookSummaryLine(fieldId, outlookPack, lang);
}

// Step 4: defensive reads of the live Modal responses (shapes may evolve).
export function extractFloodLive(json) {
  try {
    const scenes = Array.isArray(json?.scenes) ? json.scenes : Array.isArray(json?.fields) ? json.fields : [];
    let best = null;
    for (const s of scenes) {
      const v = s?.water_fraction_buffer300m ?? s?.waterFraction ?? s?.water_fraction;
      if (Number.isFinite(v) && (!best || v > best.value)) best = { value: v, date: s?.date };
    }
    const direct = json?.water_fraction_buffer300m ?? json?.waterFraction ?? json?.water_fraction_box;
    if (Number.isFinite(direct) && (!best || direct > best.value)) best = { value: direct, date: json?.date };
    return best;
  } catch {
    return null;
  }
}

export function extractOutlookLive(json) {
  try {
    const months = Array.isArray(json?.months) ? json.months : Array.isArray(json?.rain_mm_day?.months) ? json.rain_mm_day.months : null;
    if (!months) return null;
    let p50 = 0, clim = 0, n = 0;
    for (const m of months) {
      if (Number.isFinite(m?.p50) && Number.isFinite(m?.climatology)) { p50 += m.p50; clim += m.climatology; n++; }
    }
    return n ? rainVerdict(p50, clim) : null;
  } catch {
    return null;
  }
}

export async function liveFetch(url, timeoutMs = LIVE_TIMEOUT_MS, fetchImpl = globalThis.fetch) {
  const started = performance.now();
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try { controller.abort(); } catch { /* done */ }
      reject(Object.assign(new Error('timeout'), { name: 'AbortError' }));
    }, timeoutMs);
  });
  try {
    const response = await Promise.race([fetchImpl(url, { signal: controller.signal }), timeout]);
    const ms = Math.round(performance.now() - started);
    if (!response?.ok) return { ok: false, ms, error: `HTTP ${response?.status}` };
    return { ok: true, ms, data: await response.json().catch(() => null) };
  } catch (error) {
    return { ok: false, ms: Math.round(performance.now() - started), error: error?.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}

export const hostOf = url => {
  try { return new URL(url).host; } catch { return url; }
};

// ------------------------------------------------------------ SVG art (ours)

// Every svg carries width/height (plan export test requires it).
const svgWrap = (inner, label) =>
  `<svg width="30" height="30" viewBox="0 0 30 30" role="img" aria-label="${esc(label)}" class="plg-art-svg">${inner}</svg>`;

const ART = {
  // Satellite orbiting a field patch.
  satellite: s => svgWrap(`<circle cx="15" cy="15" r="11" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2" opacity=".5"/><rect x="10" y="11" width="10" height="8" rx="1.5" fill="currentColor" opacity=".25"/><path d="M10 15h10M13 11v8M17 11v8" stroke="currentColor" stroke-width=".8" opacity=".6"/><g class="plg-orbit"><rect x="22" y="12.5" width="6" height="5" rx="1" fill="currentColor"/><rect x="20" y="14" width="2.5" height="2" fill="currentColor" opacity=".6"/><rect x="28" y="14" width="2.5" height="2" fill="currentColor" opacity=".6"/></g>`, s),
  // Expanding water ripples.
  ripple: s => svgWrap(`<ellipse cx="15" cy="17" rx="4" ry="2.4" fill="currentColor" opacity=".7"/><ellipse cx="15" cy="17" rx="8" ry="4.6" fill="none" stroke="currentColor" stroke-width="1.2" class="plg-ripple r1"/><ellipse cx="15" cy="17" rx="12" ry="6.8" fill="none" stroke="currentColor" stroke-width="1" class="plg-ripple r2"/><path d="M13 8c-1 1.6-2.4 2.6-2.4 4a2.4 2.4 0 0 0 4.8 0c0-1.4-1.4-2.4-2.4-4Z" fill="currentColor" opacity=".5"/><path d="M18.5 5c-.8 1.2-1.8 2-1.8 3a1.8 1.8 0 0 0 3.6 0c0-1-1-1.8-1.8-3Z" fill="currentColor" opacity=".4"/>`, s),
  // Radar sweep for the flood model.
  radar: s => svgWrap(`<circle cx="15" cy="15" r="11" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="15" cy="15" r="7" fill="none" stroke="currentColor" stroke-width=".8" opacity=".6"/><circle cx="15" cy="15" r="3" fill="none" stroke="currentColor" stroke-width=".8" opacity=".6"/><path d="M15 15 15 4A11 11 0 0 1 22.8 7.2Z" fill="currentColor" opacity=".45" class="plg-sweep"/><circle cx="19" cy="18" r="1.6" fill="currentColor" class="plg-blip"/>`, s),
  // Sprouting seedling for crops.
  seedling: s => svgWrap(`<path d="M6 24h18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M15 24v-9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" class="plg-stem"/><path d="M15 17C11 17 9 14.5 8.5 11c3.5 0 6 2 6.5 6Z" fill="currentColor" class="plg-leaf l"/><path d="M15 15c4 0 6-2.5 6.5-6-3.5 0-6 2-6.5 6Z" fill="currentColor" opacity=".75" class="plg-leaf r"/><circle cx="15" cy="13" r="1.4" fill="currentColor" opacity=".5"/>`, s),
  // Thought dots.
  thinking: s => svgWrap(`<circle cx="8" cy="18" r="2.2" fill="currentColor" class="plg-dot d1"/><circle cx="15" cy="14" r="2.2" fill="currentColor" class="plg-dot d2"/><circle cx="22" cy="10" r="2.2" fill="currentColor" class="plg-dot d3"/>`, s),
  // Stacked files.
  files: s => svgWrap(`<rect x="8" y="11" width="11" height="13" rx="1.5" fill="currentColor" opacity=".3"/><rect x="11" y="6" width="11" height="13" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M13.5 10.5h6M13.5 13.5h6M13.5 16.5h4" stroke="currentColor" stroke-width="1"/>`, s),
  // Sun behind cloud for weather.
  sun: s => svgWrap(`<circle cx="12" cy="12" r="5" fill="currentColor" opacity=".8" class="plg-sun"/><ellipse cx="18" cy="19" rx="7" ry="4" fill="currentColor" opacity=".35"/><ellipse cx="15" cy="17.5" rx="4.5" ry="3" fill="currentColor" opacity=".35"/>`, s),
  // Leaf-soil for soil quality.
  leaf: s => svgWrap(`<path d="M6 24c8 0 14-5 16-14-8 0-14 5-16 14Z" fill="currentColor" opacity=".7"/><path d="M8 22 18 12" stroke="#fff" stroke-width="1" opacity=".7"/><circle cx="22" cy="22" r="1.6" fill="currentColor"/><circle cx="26" cy="19" r="1.2" fill="currentColor" opacity=".6"/>`, s),
  // Drop for water.
  drop: s => svgWrap(`<path d="M15 4c-3 5-7 8.5-7 13a7 7 0 0 0 14 0c0-4.5-4-8-7-13Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11.5 17a3.5 3.5 0 0 0 3 3.4" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round"/>`, s),
  // Report page with check.
  report: s => svgWrap(`<rect x="8" y="4" width="14" height="22" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M11 10h8M11 13.5h8M11 17h5" stroke="currentColor" stroke-width="1"/><circle cx="19" cy="21" r="5" fill="currentColor"/><path d="m16.8 21 1.6 1.6 3-3" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>`, s),
};

// ------------------------------------------------------------ pipeline shell

const STEP_DEFS = [
  { id: 'thinking', art: 'thinking', en: 'Thinking', bn: 'ভাবনা' },
  { id: 'loading', art: 'files', en: 'Loading data', bn: 'তথ্য লোড' },
  { id: 'water-check', art: 'ripple', en: 'Water resilience check', bn: 'পানির সহনশীলতা' },
  { id: 'models', art: 'radar', en: 'Disaster prediction model', bn: 'দুর্যোগ পূর্বাভাস মডেল' },
  { id: 'varieties', art: 'seedling', en: 'Disaster-tolerant crops', bn: 'সহনশীল ফসল' },
  { id: 'nasa', art: 'satellite', en: 'NASA data check', bn: 'নাসার তথ্য যাচাই' },
  { id: 'soil', art: 'leaf', en: 'Soil quality', bn: 'মাটির মান' },
  { id: 'water', art: 'drop', en: 'Water', bn: 'পানি' },
  { id: 'weather', art: 'sun', en: 'Weather & outlook', bn: 'আবহাওয়া ও আউটলুক' },
  { id: 'report', art: 'report', en: 'Final plan report', bn: 'চূড়ান্ত পরিকল্পনা' },
];

export function pipelineShell(plan, lang = 'en') {
  const bn = lang === 'bn';
  const items = STEP_DEFS.map(def => `
    <li class="plg-step" data-step="${def.id}" data-state="idle">
      <span class="plg-mark" aria-hidden="true"><span class="plg-dotbox"></span></span>
      <span class="plg-art" aria-hidden="true">${ART[def.art](bn ? def.bn : def.en)}</span>
      <div class="plg-body">
        <div class="plg-title">${esc(bn ? def.bn : def.en)}</div>
        <div class="plg-status" aria-live="polite"></div>
      </div>
    </li>`).join('');
  return `<section class="panel plg" id="plan-pipeline" aria-label="${esc(bn ? 'প্রতিবেদন তৈরি হচ্ছে' : 'Building your report')}">
    <div class="plg-head"><span class="plg-planty">${plantyMascot('thinking')}</span>
      <div><div class="eyebrow">${esc(bn ? 'Planty আপনার প্রতিবেদন বানাচ্ছে' : 'Planty is building your report')}</div>
      <h2>${esc(bn ? 'আপনার পরিকল্পনা তৈরি হচ্ছে' : 'Generating your plan')}</h2></div>
      <button type="button" class="button small plg-skip" data-action="plan-pipeline-skip">${esc(bn ? 'এড়িয়ে যান ▸' : 'Skip ▸')}</button>
    </div>
    <ol class="plg-steps">${items}</ol>
  </section>`;
}

// ------------------------------------------------------------ runner

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fetchPack(path) {
  try {
    const url = typeof document === 'undefined' ? path : new URL(path, document.baseURI);
    const response = await fetch(url);
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export function pipelineRunner(plan, packs, lang = 'en') {
  const bn = lang === 'bn';
  const skeleton = `<span class="plg-skeleton" aria-hidden="true"><span></span><span class="short"></span></span>`;
  const root = () => document.querySelector('#plan-pipeline');
  const step = id => root()?.querySelector(`[data-step="${id}"]`);
  const status = id => step(id)?.querySelector('.plg-status');
  let skipped = false;
  const timers = [];
  const later = (fn, ms) => new Promise(resolve => {
    const id = setTimeout(() => { fn(); resolve(); }, skipped ? 0 : ms);
    timers.push(id);
  });
  const api = { flood: null, outlook: null, controllers: [] };

  const setState = (id, state, html = '') => {
    const el = step(id);
    if (!el) return;
    el.dataset.state = state;
    if (state !== 'idle') status(id).innerHTML = html;
  };
  const hide = id => step(id)?.setAttribute('hidden', '');
  // Skip jumps straight to the report: waits collapse and live calls abort
  // (the models step then falls back to the saved result).
  const skip = () => {
    skipped = true;
    api.controllers.forEach(c => { try { c.abort(); } catch { /* done */ } });
  };

  // Live model calls start at once; the models step awaits them with progress.
  const startLive = () => {
    const fieldId = plan?.field?.id;
    if (!MODEL_FIELDS.includes(fieldId)) return;
    for (const [key, base, param] of [['flood', FLOOD_MODEL_URL, 'field'], ['outlook', OUTLOOK_MODEL_URL, 'site']]) {
      const controller = new AbortController();
      api.controllers.push(controller);
      const started = performance.now();
      api[key] = (async () => {
        try {
          const response = await fetch(`${base}?${param}=${encodeURIComponent(fieldId)}`, { signal: controller.signal });
          const ms = Math.round(performance.now() - started);
          if (!response?.ok) return { ok: false, ms };
          return { ok: true, ms, data: await response.json().catch(() => null) };
        } catch {
          return { ok: false, ms: Math.round(performance.now() - started) };
        }
      })();
    }
  };

  const tick = async (id, label, promise) => {
    const started = performance.now();
    const el = status(id);
    const timer = setInterval(() => {
      if (!el?.isConnected) { clearInterval(timer); return; }
      const secs = ((performance.now() - started) / 1000).toFixed(1);
      el.querySelector('.plg-elapsed')?.replaceChildren(`${secs}s`);
    }, 200);
    timers.push(timer);
    const out = await promise;
    clearInterval(timer);
    return out;
  };

  const run = async (onDone) => {
    startLive();
    const done = new Set();
    const finish = () => {
      timers.forEach(clearTimeout);
      api.controllers.forEach(c => { try { c.abort(); } catch { /* done */ } });
      onDone?.({ skipped });
    };

    // 1. Thinking
    setState('thinking', 'busy', `${skeleton}`);
    await later(() => setState('thinking', 'busy', `<span class="plg-spin" aria-hidden="true"></span> ${esc(bn ? 'পড়া হচ্ছে…' : 'Reading…')}`), 450);
    await later(() => {
      setState('thinking', 'done', `<span class="plg-result">${esc(thinkingLine(plan, lang))}</span>`);
      done.add('thinking');
    }, 650);

    // 2. Loading data (extra packs; ui packs already in memory)
    setState('loading', 'busy', skeleton);
    const [waterTable, soil, tolerant] = await Promise.all([
      fetchPack('data/water-table.json'), fetchPack('data/soil-nutrients.json'), fetchPack('data/tolerant-varieties.json'),
      later(() => {}, 900),
    ]);
    packs.waterTable = waterTable; packs.soil = soil; packs.tolerant = tolerant;
    const files = [
      packs.outlook && 'outlook.json', packs.flood && 'flood-fields.json',
      soil && 'soil-nutrients.json', waterTable && 'water-table.json',
      packs.grace && 'grace-groundwater.json', packs.smap && 'smap.json',
      tolerant && 'tolerant-varieties.json',
    ].filter(Boolean);
    const filesLine = loadedFilesLine(files, lang);
    if (!filesLine) hide('loading');
    else {
      setState('loading', 'done', `<span class="plg-result">${esc(filesLine)}: ${files.map(f => `<code>${esc(f)}</code>`).join(' ')}</span>`);
      done.add('loading');
    }

    // 3. Water resilience check (from the Water & resilience desk)
    setState('water-check', 'busy', skeleton);
    await later(() => {}, 700);
    const parts = resilienceParts(plan, packs.monthly, waterTable, packs.grace);
    const line = resilienceLine(parts, lang);
    if (!line) hide('water-check');
    else {
      const badges = `${parts.needMm !== null ? nasaBadge(['imerg', 'eto']) : ''}${parts.graceCm ? nasaBadge('grace') : ''}`;
      setState('water-check', 'done',
        `<span class="plg-result">${esc(line)} ${truth('MODELED', { source: 'IMERG/POWER FAO-56' })} ${badges}</span>
         <a class="plg-link" href="#water">${esc(bn ? 'পানি ও সহনশীলতা খুলুন →' : 'Open Water & resilience →')}</a>`);
      done.add('water-check');
    }

    // 4. Disaster prediction models (live, with saved-result fallback)
    const fieldId = plan?.field?.id;
    const liveOk = MODEL_FIELDS.includes(fieldId);
    setState('models', 'busy', `<span class="plg-spin" aria-hidden="true"></span> ${esc(bn ? 'মডেল ডাকা হচ্ছে…' : 'Calling models…')} <span class="plg-elapsed">0.0s</span>
      <span class="plg-progress" aria-hidden="true"><i></i></span>`);
    const floodSaved = floodSummaryLine(fieldId, packs.flood, lang);
    const outlookSaved = outlookSummaryLine(fieldId, packs.outlook, lang);
    let floodBit = '', outlookBit = '';
    if (liveOk) {
      // Cold start can take ~20 s; give up gracefully and use the saved result.
      const withTimeout = promise => Promise.race([
        promise, wait(LIVE_TIMEOUT_MS).then(() => ({ ok: false, ms: LIVE_TIMEOUT_MS })),
      ]);
      const [floodRes, outlookRes] = await Promise.all([
        tick('models', 'flood', withTimeout(api.flood)), tick('models', 'outlook', withTimeout(api.outlook)),
      ]);
      const floodNum = floodRes?.ok ? extractFloodLive(floodRes.data) : null;
      const outlookNum = outlookRes?.ok ? extractOutlookLive(outlookRes.data) : null;
      const savedTag = esc(bn ? 'সংরক্ষিত ফলাফল ব্যবহার করা হচ্ছে' : 'using saved result');
      floodBit = floodNum
        ? `${esc(bn ? 'বন্যা মডেল' : 'Flood model')} · ${(floodNum.value * 100).toFixed(1)}% · ${(floodRes.ms / 1000).toFixed(1)}s`
        : floodRes?.ok
          ? `${esc(bn ? 'বন্যা মডেল' : 'Flood model')} · ${(floodRes.ms / 1000).toFixed(1)}s${floodSaved ? ` · ${esc(floodSaved)} (${savedTag})` : ''}`
          : `${esc(bn ? 'বন্যা মডেল' : 'Flood model')} · ${esc(hostOf(FLOOD_MODEL_URL))}${floodSaved ? ` · ${esc(floodSaved)} (${savedTag})` : ` · ${esc(bn ? 'অজানা' : 'Unknown')}`}`;
      outlookBit = outlookNum
        ? `${esc(bn ? 'আউটলুক মডেল' : 'Outlook model')} · ${esc(outlookNum)} · ${(outlookRes.ms / 1000).toFixed(1)}s`
        : outlookRes?.ok
          ? `${esc(bn ? 'আউটলুক মডেল' : 'Outlook model')} · ${(outlookRes.ms / 1000).toFixed(1)}s${outlookSaved ? ` · ${esc(outlookSaved)} (${savedTag})` : ''}`
          : `${esc(bn ? 'আউটলুক মডেল' : 'Outlook model')} · ${esc(hostOf(OUTLOOK_MODEL_URL))}${outlookSaved ? ` · ${esc(outlookSaved)} (${savedTag})` : ` · ${esc(bn ? 'অজানা' : 'Unknown')}`}`;
    } else if (floodSaved || outlookSaved) {
      floodBit = floodSaved ? `${esc(bn ? 'বন্যা' : 'Flood')}: ${esc(floodSaved)}` : '';
      outlookBit = outlookSaved ? `${esc(bn ? 'আউটলুক' : 'Outlook')}: ${esc(outlookSaved)}` : '';
    }
    if (!floodBit && !outlookBit) hide('models');
    else {
      setState('models', 'done', `<span class="plg-result">${floodBit}${floodBit && outlookBit ? '<br>' : ''}${outlookBit}</span> ${nasaBadge(['hls', 'prithvi'])}`);
      done.add('models');
    }

    // 5. Disaster-tolerant crops (RAG shortlist only)
    setState('varieties', 'busy', skeleton);
    await later(() => {}, 700);
    // No field-level hazard detected → use Rangpur's regional hazards (research report scope), labelled as regional.
    const fieldHazards = hazardsFor(plan, packs.flood, packs.outlook);
    let matches = pickTolerantVarieties(planCropList(plan), fieldHazards, tolerant);
    const regional = !matches.length;
    if (regional) matches = pickTolerantVarieties(planCropList(plan), ['flood', 'submergence', 'drought', 'cold'], tolerant);
    if (!matches.length) hide('varieties');
    else {
      const rows = matches.map(v => {
        const label = (v.evidence ?? [])[0] ?? 'requires_local_validation';
        const src = v.sources?.[0];
        return `<li><b>${esc(v.variety)}</b> · ${esc(v.tolerance)} <span class="plg-evidence">${esc(label)}</span>${src ? ` <a href="${esc(src)}" target="_blank" rel="noopener">${esc(bn ? 'উৎস ↗' : 'Source ↗')}</a>` : ''}</li>`;
      }).join('');
      setState('varieties', 'done', `${regional ? `<p class="note">${esc(bn ? 'এই জমিতে নির্দিষ্ট ঝুঁকি পাওয়া যায়নি — রংপুরের আঞ্চলিক ঝুঁকি (বন্যা, খরা, শীত) অনুযায়ী:' : 'No field-specific hazard found — matched to Rangpur regional risks (flood, drought, cold):')}</p>` : ''}<ul class="plg-list">${rows}</ul><p class="note">${esc(bn ? 'গবেষণা সংক্ষিপ্ত তালিকা — বীজের মজুত যাচাই করা হয়নি।' : 'Research shortlist — seed stock unverified.')}</p>`);
      done.add('varieties');
    }

    // 6. NASA data check
    setState('nasa', 'busy', skeleton);
    await later(() => {}, 650);
    const nasa = nasaList(fieldId, packs).filter(n => n.ok);
    if (!nasa.length) hide('nasa');
    else {
      setState('nasa', 'done', `<span class="plg-result">${nasa.map(n => `${nasaBadge(n.key)} ✓`).join(' ')}</span>`);
      done.add('nasa');
    }

    // 7. Soil quality
    setState('soil', 'busy', skeleton);
    await later(() => {}, 600);
    const soilText = soilLine(soil?.sites?.[fieldId], lang);
    if (!soilText) hide('soil');
    else { setState('soil', 'done', `<span class="plg-result">${esc(soilText)}</span>`); done.add('soil'); }

    // 8. Water (SMAP root zone)
    setState('water', 'busy', skeleton);
    await later(() => {}, 600);
    const waterText = smapLine(packs.smap?.sites?.[fieldId], lang);
    if (!waterText) hide('water');
    else { setState('water', 'done', `<span class="plg-result">${esc(waterText)}</span> ${nasaBadge('smap')}`); done.add('water'); }

    // 9. Weather / outlook
    setState('weather', 'busy', skeleton);
    await later(() => {}, 600);
    const weatherText = weatherLine(fieldId, packs.outlook, lang);
    if (!weatherText) hide('weather');
    else { setState('weather', 'done', `<span class="plg-result">${esc(weatherText)}</span> ${nasaBadge('power')}`); done.add('weather'); }

    // 10. Final plan report
    setState('report', 'busy', `<span class="plg-spin" aria-hidden="true"></span> ${esc(bn ? 'প্রতিবেদন সাজানো হচ্ছে…' : 'Assembling report…')}`);
    await later(() => {}, skipped ? 0 : 800);
    setState('report', 'done', `<span class="plg-result">${esc(bn ? `${done.size}টি পরীক্ষা সম্পন্ন ✓` : `${done.size} checks complete ✓`)}</span>`);
    finish();
  };

  return { run, skip, reduced: reducedMotion() };
}

