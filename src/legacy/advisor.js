// "Plan your own crops" — AI decision helper card for the Rotation studio.
// Calls /api/rotation-advisor (worker); the verdict is shown exactly as returned (no invented numbers).
import { t, esc, field, area, state, outlook as outlookPack, floodFields } from './ui.js';
import { outlookSummaryLine, floodSummaryLine } from './outlook-flood.js';
import { plantyMascot } from './planty.js';

export const ADVISOR_CROPS = [
  ['Hybrid Aman rice', 'হাইব্রিড আমন ধান'], ['Boro rice', 'বোরো ধান'], ['Potato', 'আলু'], ['Mustard', 'সরিষা'],
  ['Mungbean', 'মুগ ডাল'], ['Lentil', 'মসুর'], ['Maize', 'ভুট্টা'], ['Wheat', 'গম'], ['Jute', 'পাট'],
  ['Strawberry', 'স্ট্রবেরি'], ['Mango', 'আম'], ['Banana', 'কলা'], ['Chilli', 'মরিচ'], ['Tomato', 'টমেটো'],
];
const FRUITS = new Set(['strawberry', 'mango', 'banana', 'papaya', 'guava', 'jackfruit', 'lemon', 'lime', 'litchi', 'lychee', 'dragon fruit', 'watermelon', 'melon', 'pineapple', 'orange', 'malta', 'coconut', 'jujube', 'kul', 'pomegranate', 'grape', 'sapota', 'amla', 'blackberry', 'jamun']);
export const isFruit = (name) => FRUITS.has(String(name).toLowerCase().trim()) || /fruit|berry|melon/i.test(String(name));
// Pure: category from up to 2 chosen crops (crop + secondary fruit, crop + crop, fruit only, single crop).
export function cropCategory(crops) {
  const f = crops.filter(isFruit).length, c = crops.length - f;
  if (!crops.length) return null;
  if (crops.length === 1) return f ? 'fruit_only' : 'single_crop';
  if (c && f) return 'crop_fruit';
  return f ? 'fruit_fruit' : 'crop_crop';
}
const CATEGORY_LABEL = {
  single_crop: ['One field crop', 'একটি মাঠ ফসল'],
  crop_crop: ['Hybrid: crop + crop', 'মিশ্র: ফসল + ফসল'],
  crop_fruit: ['Hybrid: crop + secondary fruit', 'মিশ্র: ফসল + সহায়ক ফল'],
  fruit_only: ['Fruit only', 'শুধু ফল'],
  fruit_fruit: ['Fruit only (two fruits)', 'শুধু ফল (দুটি)'],
};
let revealed = false;
export const scoresRevealed = () => revealed;
export function setScoresRevealed(v) { revealed = Boolean(v); } // tests / programmatic reveal
function reveal() {
  if (revealed) return;
  revealed = true;
  document.dispatchEvent(new CustomEvent('ropon:rotations-reveal'));
}
const MODES = [
  ['rotation', 'Season rotation', 'মৌসুমি চক্র'], ['single', 'Single crop', 'একটি ফসল'],
  ['mixed', 'Mixed / hybrid', 'মিশ্র / একসাথে'], ['orchard', 'Orchard / fruit trees', 'ফলের বাগান'],
];
const VERDICT = {
  recommended: ['✓', 'Recommended', 'উপযুক্ত', 'ok'],
  possible_with_conditions: ['⚠', 'Possible with conditions', 'শর্তসাপেক্ষে সম্ভব', 'warn'],
  not_suitable: ['✕', 'Not suitable here', 'এখানে উপযুক্ত নয়', 'no'],
};
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ui = { mode: 'rotation', crops: [], notes: '', status: 'idle', result: null, error: '' };

export function advisorRequest(context) {
  const category = cropCategory(ui.crops);
  const mode = category === 'single_crop' ? 'single' : category === 'fruit_only' || category === 'fruit_fruit' ? 'orchard' : 'mixed';
  return { lang: state.lang === 'bn' ? 'bn' : 'en', mode, category, crops: ui.crops.slice(0, 2), notes: ui.notes.slice(0, 300), context };
}

function fieldContext() {
  const f = field() || {};
  const prof = { ...(state.profiles?.[state.fieldId] || {}) };
  const ctx = { fieldId: f.id, fieldName: f.name, areaHa: Number(area()) || undefined, irrigation: prof.irrigation, budget: prof.budget };
  try { ctx.outlook = outlookSummaryLine(f.id, outlookPack, 'en') || undefined; } catch { /* optional */ }
  try { ctx.flood = floodSummaryLine(f.id, floodFields, 'en') || undefined; } catch { /* optional */ }
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function cropColor(name) {
  const n = String(name || '').toLowerCase();
  if (/rice|aman|boro/.test(n)) return '#9fc58a';
  if (/potato/.test(n)) return '#cfae86';
  if (/mustard/.test(n)) return '#e7cf6a';
  if (/mung|lentil|pulse|bean/.test(n)) return '#9cc7a8';
  if (/mango|banana|orchard|tree/.test(n)) return '#6e9e5a';
  if (/strawberry|tomato|chilli/.test(n)) return '#e39a8f';
  if (/maize|wheat|jute/.test(n)) return '#d9c27a';
  return '#b9c7a3';
}

function calendarStrip(calendar) {
  return `<div class="adv-cal" role="list">${calendar.map((m) => {
    const fallow = !m.crop || m.stage === 'fallow';
    return `<span role="listitem" class="adv-cal-cell${fallow ? ' fallow' : ''}" style="${fallow ? '' : `background:${cropColor(m.crop)}`}" title="${esc(MONTHS[m.month - 1])}: ${esc(m.crop || t('Fallow', 'পতিত'))} · ${esc(m.stage)}">
      <b>${esc(m.crop ? m.crop.split(' ')[0] : '')}</b><small>${esc(MONTHS[m.month - 1])}</small></span>`;
  }).join('')}</div>`;
}

function list(title, items) {
  return items?.length ? `<div class="adv-list"><h4>${title}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>` : '';
}

function resultHtml(r) {
  const [mark, en, bn, cls] = VERDICT[r.verdict] || VERDICT.not_suitable;
  return `<div class="adv-result adv-${cls}" aria-live="polite">
    <div class="adv-verdict"><span class="adv-mark">${mark}</span><div><strong>${t(en, bn)}</strong><span>${esc(r.title || '')}</span></div>
      <span class="adv-conf">${t('Confidence', 'আস্থা')}: ${esc(r.confidence)}</span></div>
    <p class="adv-summary">${esc(r.summary || '')}</p>
    ${calendarStrip(r.calendar || [])}
    <div class="adv-grid">${list(t('Why', 'কেন'), r.reasons)}${list(t('Risks', 'ঝুঁকি'), r.risks)}${list(t("What you'd need", 'যা লাগবে'), r.requirements)}${list(t('Better options for this field', 'এই জমির জন্য ভালো বিকল্প'), r.alternatives)}</div>
    ${r.evidence?.length ? `<p class="adv-evidence">${t('Evidence', 'প্রমাণ')}: ${r.evidence.map((e) => `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>`).join(' · ')}</p>` : ''}
    ${r.verdict !== 'recommended' && (r.dropLine || r.suggestions?.length) ? `<div class="adv-drop"><p><strong>${t('Planty suggests dropping this idea.', 'Planty এই পরিকল্পনা বাদ দিতে বলছে।')}</strong> ${esc(r.dropLine || '')}</p>
      ${r.suggestions?.length ? `<p class="adv-drop-label">${t('Crops that suit this field better — tap one to check it:', 'এই জমিতে বেশি মানানসই — যাচাই করতে একটিতে চাপুন:')}</p><div class="adv-suggest">${r.suggestions.map((g, i) => `<button type="button" class="adv-suggest-btn" data-action="adv-try" data-value="${i}"><strong>${esc(g.crops.join(' + '))}</strong><small>${esc(g.line)}</small></button>`).join('')}</div>` : ''}
      <div class="adv-drop-actions">${r.verdict === 'possible_with_conditions' ? `<span class="note">${t('Or keep your idea with the conditions above.', 'অথবা ওপরের শর্ত মেনে নিজের পরিকল্পনা রাখুন।')}</span>` : ''}<button type="button" class="button small" data-action="adv-exit">${t('Exit', 'বন্ধ করুন')}</button></div></div>` : ''}
    ${r.verdict !== 'not_suitable' && r.planting?.length ? `<div class="adv-use"><button type="button" class="button primary" data-action="adv-use">${t('Use this plan in the planner →', 'এই পরিকল্পনা বপনে ব্যবহার করুন →')}</button><span class="note">${r.planting.map((p) => `${esc(p.crop)} ${p.sharePct}%`).join(' · ')}</span></div>` : ''}
    <div class="adv-compare"><button type="button" class="button small" data-action="show-rotations">${t('Compare with standard rotations (scores) ↓', 'সাধারণ ফসলচক্রের সঙ্গে তুলনা (স্কোর) ↓')}</button></div>
    <p class="note adv-note">${t('AI decision helper · experimental · check with your extension officer.', 'এআই সিদ্ধান্ত সহায়ক · পরীক্ষামূলক · কৃষি কর্মকর্তার সঙ্গে মিলিয়ে নিন।')}</p>
  </div>`;
}

export function advisorCard() {
  const busy = ui.status === 'loading';
  return `<section class="panel adv-card" id="advisor-card" aria-labelledby="adv-title">
    <div class="adv-head"><span class="adv-planty">${plantyMascot(busy ? 'thinking' : ui.result ? 'happy' : 'idle')}</span>
      <div><span class="eyebrow">${t('AI decision helper', 'এআই সিদ্ধান্ত সহায়ক')}</span><h2 id="adv-title">${t('Plan your own crops', 'নিজের ফসল বেছে পরিকল্পনা')}</h2>
      <p class="note">${t('Tell Planty what you want to grow — up to 2 crops. It checks them against this field and the research, and says no (with better options) if they will not work.', 'হাইব্রিড আমন + স্ট্রবেরি, বা শুধু আম? Planty এই জমি ও গবেষণার সঙ্গে মিলিয়ে দেখে — না হলে সরাসরি না বলে।')}</p></div></div>
    <p class="adv-category">${ui.crops.length ? `${t('Plan type', 'ধরন')}: <strong>${t(...CATEGORY_LABEL[cropCategory(ui.crops)])}</strong>` : t('Type or tap up to 2 crops — e.g. Potato + Strawberry, Aman + Mustard, or only Mango.', 'সর্বোচ্চ ২টি ফসল লিখুন বা বাছুন — যেমন আলু + স্ট্রবেরি, আমন + সরিষা, বা শুধু আম।')}</p>
    <div class="adv-chips">${ADVISOR_CROPS.map(([en, bn]) => { const on = ui.crops.includes(en); return `<button type="button" class="adv-chip${on ? ' on' : ''}" aria-pressed="${on}" data-action="adv-crop" data-value="${esc(en)}"${!on && ui.crops.length >= 2 ? ' disabled' : ''}>${t(en, bn)}</button>`; }).join('')}
      ${ui.crops.filter((c) => !ADVISOR_CROPS.some(([en]) => en === c)).map((c) => `<button type="button" class="adv-chip on" aria-pressed="true" data-action="adv-crop" data-value="${esc(c)}">${esc(c)} ✕</button>`).join('')}</div>
    <div class="adv-add"><input id="adv-other" type="text" maxlength="40" placeholder="${t('Add another crop (e.g. Dragon fruit)', 'অন্য ফসল যোগ করুন')}" aria-label="${t('Add another crop', 'অন্য ফসল যোগ করুন')}"><button type="button" class="button small" data-action="adv-add">${t('Add', 'যোগ')}</button></div>
    <textarea id="adv-notes" maxlength="300" rows="2" placeholder="${t('What matters to you? (optional)', 'আপনার কাছে কী জরুরি? (ঐচ্ছিক)')}">${esc(ui.notes)}</textarea>
    <div class="adv-actions"><span class="note">${ui.crops.length}/2 ${t('crops', 'ফসল')}</span>
      <button type="button" class="button primary" data-action="adv-check" ${!ui.crops.length || busy ? 'disabled' : ''}>${busy ? t('Planty is checking…', 'Planty দেখছে…') : t('Check with Planty', 'Planty-কে দিয়ে যাচাই')}</button></div>
    ${!ui.result && !revealed ? `<p class="adv-skip"><button type="button" class="text-link" data-action="show-rotations">${t('Not sure? Compare the standard rotations first', 'নিশ্চিত নন? আগে সাধারণ ফসলচক্র তুলনা করুন')}</button></p>` : ''}
    ${busy ? `<div class="adv-skeleton" aria-hidden="true"><i></i><i></i><i></i></div>` : ''}
    ${ui.error ? `<p class="adv-error" role="alert">${esc(ui.error)}</p>` : ''}
    ${ui.result ? resultHtml(ui.result) : ''}
  </section>`;
}

function rerender() {
  const card = document.querySelector('#advisor-card');
  if (card) card.outerHTML = advisorCard();
}

export async function advisorAction(action, value) {
  const notes = document.querySelector('#adv-notes');
  if (notes) ui.notes = notes.value;
  if (action === 'adv-use') { useInPlanner(); return; }
  if (action === 'adv-exit') { ui.result = null; ui.error = ''; ui.crops = []; rerender(); return; }
  if (action === 'adv-try') {
    const g = ui.result?.suggestions?.[Number(value)];
    if (!g) return;
    ui.crops = g.crops.slice(0, 2); ui.notes = '';
    return advisorAction('adv-check');
  }
  if (action === 'show-rotations') {
    reveal();
    requestAnimationFrame(() => document.querySelector('#rotation-scored')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return;
  }
  if (action === 'adv-mode') { ui.mode = value; rerender(); return; }
  if (action === 'adv-crop') {
    ui.crops = ui.crops.includes(value) ? ui.crops.filter((c) => c !== value) : ui.crops.length < 2 ? [...ui.crops, value] : ui.crops;
    rerender(); return;
  }
  if (action === 'adv-add') {
    const input = document.querySelector('#adv-other');
    const v = (input?.value || '').trim().slice(0, 40);
    if (v && !ui.crops.includes(v) && ui.crops.length < 2) ui.crops = [...ui.crops, v];
    rerender(); return;
  }
  if (action === 'adv-check' && ui.crops.length) {
    ui.status = 'loading'; ui.error = ''; ui.result = null; rerender();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 40000);
    try {
      const res = await fetch('/api/rotation-advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(advisorRequest(fieldContext())), signal: controller.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || 'unavailable');
      ui.result = data;
      reveal();
    } catch (e) {
      ui.error = !navigator.onLine
        ? t("Planty can't reach the internet right now — the built-in rotations still work offline.", 'এখন ইন্টারনেট নেই — তৈরি ফসলচক্রগুলো অফলাইনেও কাজ করে।')
        : e.message === 'rate_limited' ? t('Too many checks — please wait a few minutes.', 'অনেকবার যাচাই হয়েছে — কয়েক মিনিট অপেক্ষা করুন।')
          : t('Planty could not check this right now. Please try again.', 'এখন যাচাই করা গেল না। আবার চেষ্টা করুন।');
    } finally {
      clearTimeout(timer); ui.status = 'idle'; rerender();
    }
  }
}

// ---- Custom plan hand-off to the Planting planner ----
const CUSTOM_KEY = 'ropon_custom_plan_v1';
export function getCustomPlan() {
  try {
    const p = JSON.parse(localStorage.getItem(CUSTOM_KEY) || 'null');
    return p && Array.isArray(p.planting) && p.planting.length && p.fieldId === state.fieldId ? p : null;
  } catch { return null; }
}
let customSeasonIdx = 0;
export function setCustomSeason(i) { customSeasonIdx = Math.max(0, Number(i) || 0); }
// What the planner 3D draws: a rotation shows one season's crop on the whole field; mixed/hybrid/orchard split the land.
export function customPlanFor3d() {
  const p = getCustomPlan();
  if (!p) return null;
  if (p.mode !== 'rotation') return p;
  const c = p.planting[Math.min(customSeasonIdx, p.planting.length - 1)];
  return { ...p, planting: [{ ...c, sharePct: 100 }] };
}
export function clearCustomPlan() { try { localStorage.removeItem(CUSTOM_KEY); } catch { /* ignore */ } }
function useInPlanner() {
  const r = ui.result;
  if (!r?.planting?.length || r.verdict === 'not_suitable') return;
  // Mode follows the auto-detected category (two crops together = mixed land split; one crop = whole field).
  const plan = { fieldId: state.fieldId, title: r.title, verdict: r.verdict, mode: advisorRequest({}).mode, planting: r.planting, calendar: r.calendar, savedAt: new Date().toISOString() };
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(plan)); } catch { /* ignore */ }
  location.hash = '#planner';
}
// Pure: estimated plant count for one crop's share of the usable area.
export function customCount(areaHa, usablePct, item) {
  const m2 = Number(areaHa) * 10000 * (Number(usablePct) / 100) * (item.sharePct / 100);
  const each = (item.rowSpacingCm / 100) * (item.withinRowCm / 100);
  return m2 > 0 && each > 0 ? Math.floor(m2 / each) : 0;
}
export function customPlanBanner() {
  const p = getCustomPlan();
  if (!p) return '';
  const [mark, en, bn, cls] = VERDICT[p.verdict] || VERDICT.possible_with_conditions;
  const usable = Number(state.planner?.usable) || 88;
  const rotation = p.mode === 'rotation';
  const seasonIdx = Math.min(customSeasonIdx, p.planting.length - 1);
  return `<section class="panel adv-plan-banner adv-${cls}" aria-label="${t('Custom plan', 'কাস্টম পরিকল্পনা')}">
    <div class="adv-plan-head"><span class="adv-mark">${mark}</span><div><span class="eyebrow">${t('Custom plan from Rotation studio', 'ফসলচক্র থেকে কাস্টম পরিকল্পনা')} · ${t(en, bn)}</span><h2>${esc(p.title || '')}</h2></div>
      <button type="button" class="button small" data-action="custom-plan-clear">${t('Back to standard planting', 'সাধারণ বপনে ফিরুন')}</button></div>
    ${rotation ? `<p class="note">${t('Season rotation: each crop uses the whole field in its own season — pick a season to see it in 3D.', 'মৌসুমি চক্র: প্রতিটি ফসল নিজের মৌসুমে পুরো জমি নেয় — ৩ডি-তে দেখতে মৌসুম বাছুন।')}</p>` : ''}
    <div class="adv-plan-crops">${p.planting.map((c, i) => `<${rotation ? `button type="button" data-action="custom-season" data-value="${i}" aria-pressed="${i === seasonIdx}"` : 'div'} class="adv-plan-crop${rotation && i === seasonIdx ? ' on' : ''}"><i style="background:${esc(c.color)}"></i><div><strong>${esc(c.crop)}</strong>
      <small>${rotation ? t('whole field in its season', 'নিজের মৌসুমে পুরো জমি') : `${c.sharePct}% ${t('of the field', 'জমির')}`} · ${esc(c.model)} · ${c.rowSpacingCm} × ${c.withinRowCm} cm · ~${customCount(area(), usable, rotation ? { ...c, sharePct: 100 } : c).toLocaleString()} ${t('plants', 'চারা')}</small></div></${rotation ? 'button' : 'div'}>`).join('')}</div>
    <p class="note">${t('3D shows each crop in its share of the land (generic tree / bush / field-crop models; colours and spacing suggested by AI — general guidance, not measurements). Plant counts use your usable area.', '৩ডি-তে প্রতিটি ফসল তার জমির অংশে (সাধারণ গাছ/ঝোপ/মাঠফসলের মডেল; রং ও দূরত্ব এআই প্রস্তাবিত — সাধারণ নির্দেশনা)।')}</p>
  </section>`;
}

// ---- Custom plan: planting settings for the crops chosen in the Rotation studio ----
const CUSTOM_KEY_SET = 'ropon_custom_plan_v1';
function saveCustom(p) { try { localStorage.setItem(CUSTOM_KEY_SET, JSON.stringify(p)); } catch { /* ignore */ } }
export function customSettingsPanel() {
  const p = getCustomPlan();
  if (!p) return '';
  const rotation = p.mode === 'rotation';
  const usable = Number(state.planner?.usable) || 88;
  const total = p.planting.reduce((a, c) => a + customCount(area(), usable, rotation ? { ...c, sharePct: 100 } : c), 0);
  const slider = (i, key, label, min, max, step, value, unit) => `<label class="cs-row"><span>${label}</span>
    <input type="range" name="custom-${key}" data-idx="${i}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${esc(label)}">
    <output>${value}${unit}</output></label>`;
  return `<section class="panel plan-settings cs-panel"><div class="panel-header"><div><span class="eyebrow">${t('Your crops · from Rotation studio', 'আপনার ফসল · ফসলচক্র থেকে')}</span>
    <h2>${t('Planting settings', 'বপনের মাপ')}</h2></div></div><div class="panel-body">
    <p class="note">${t('Crops are set by your custom plan. Adjust spacing and the land split here; to change crops, go back to the decision helper.', 'ফসল আপনার কাস্টম পরিকল্পনা থেকে। দূরত্ব ও জমির ভাগ এখানে বদলান; ফসল বদলাতে সিদ্ধান্ত সহায়কে ফিরুন।')}
      <a href="#rotations" class="cs-change">${t('Change crops', 'ফসল বদলান')}</a></p>
    ${!rotation && p.planting.length === 2 ? `<div class="cs-split"><div class="cs-split-head"><span><i style="background:${esc(p.planting[0].color)}"></i>${esc(p.planting[0].crop)} ${p.planting[0].sharePct}%</span><span>${esc(p.planting[1].crop)} ${p.planting[1].sharePct}%<i style="background:${esc(p.planting[1].color)}"></i></span></div>
      <input type="range" name="custom-split" min="10" max="90" step="5" value="${Math.round(p.planting[0].sharePct)}" aria-label="${t('Land split', 'জমির ভাগ')}"><small>${t('Land split between the two crops', 'দুই ফসলের জমির ভাগ')}</small></div>` : ''}
    ${p.planting.map((c, i) => `<div class="cs-crop"><div class="cs-crop-head"><i style="background:${esc(c.color)}"></i><strong>${esc(c.crop)}</strong>
      <small>${rotation ? t('whole field in its season', 'নিজের মৌসুমে পুরো জমি') : `${c.sharePct}% ${t('of the field', 'জমির')}`} · ~${customCount(area(), usable, rotation ? { ...c, sharePct: 100 } : c).toLocaleString()} ${t('plants', 'চারা')}</small></div>
      ${slider(i, 'row', t('Row spacing', 'সারির দূরত্ব'), c.model === 'tree' ? 200 : 10, c.model === 'tree' ? 1200 : 150, c.model === 'tree' ? 50 : 5, c.rowSpacingCm, ' cm')}
      ${slider(i, 'within', t('Within-row spacing', 'সারিতে দূরত্ব'), c.model === 'tree' ? 200 : 5, c.model === 'tree' ? 1200 : 120, c.model === 'tree' ? 50 : 5, c.withinRowCm, ' cm')}</div>`).join('')}
    <p class="cs-total">${t('Total plants', 'মোট চারা')}: <strong>~${total.toLocaleString()}</strong> <span class="truth">◌ ${t('Scenario', 'কাল্পনিক')}</span></p>
    <p class="note">${t('Spacing suggested by AI (general guidance). Usable area comes from your field widths.', 'দূরত্ব এআই প্রস্তাবিত (সাধারণ নির্দেশনা)। চাষযোগ্য জমি আপনার জমির মাপ থেকে।')}</p>
  </div></section>`;
}
// Returns true if the input belonged to the custom panel (caller re-renders).
export function customInput(el) {
  if (!el?.name?.startsWith('custom-')) return false;
  const p = getCustomPlan(); if (!p) return false;
  const v = Number(el.value);
  if (el.name === 'custom-split' && p.planting.length === 2) { p.planting[0].sharePct = v; p.planting[1].sharePct = 100 - v; }
  else { const c = p.planting[Number(el.dataset.idx)]; if (!c) return false; if (el.name === 'custom-row') c.rowSpacingCm = v; if (el.name === 'custom-within') c.withinRowCm = v; }
  saveCustom(p);
  return true;
}
