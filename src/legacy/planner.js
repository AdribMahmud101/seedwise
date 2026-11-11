import {
  state,
  agronomy,
  persist,
  t,
  esc,
  num,
  monthName,
  cropName,
  field,
  fieldName,
  polygon,
  area,
  button,
  header,
  panel,
  tag,
  truth,
  chips,
  sources,
  repaint,
  toast,
} from './ui.js';
import { PLANTING, capacity } from './engine.js';
import { recommendedSettings, controlLimits, clampPlannerValue, syncPlannerControl, plantyContext } from './planner-controls.js';
import { plantyPanel, mountPlanty, refreshPlantySuggestions } from './planty.js';
import { guide } from './planty-guide.js';
import { getPlan, getReadyPlan, setPlanting } from './journey.js';
import { journeyFinishCTA } from './journey-bar.js';

let plannerSeasonKey = null;
let plannerPlanId = null;
function seasonPlan() {
  const plan = getPlan();
  return plan?.rotation?.confirmedAt && plan.field.id === field()?.id ? plan : null;
}
function activeSeason(plan = seasonPlan()) {
  if (!plan) return null;
  if (plannerPlanId !== plan.id) {
    plannerPlanId = plan.id;
    plannerSeasonKey = null;
  }
  const seasons = plan.rotation.seasons.filter(season => season.crop !== 'fallow');
  const season = seasons.find(season => season.key === plannerSeasonKey) ?? seasons[0];
  plannerSeasonKey = season?.key ?? null;
  return season;
}
const seasonCrop = season => ['aman', 'boro'].includes(season.crop) ? 'rice' : season.crop;
function loadSeason(season, plan) {
  const settings = plan.planting[season.key];
  Object.assign(state.planner, { crop: settings.crop, row: settings.rowSpacingCm,
    spacing: settings.withinRowCm, usable: settings.usableAreaPct });
}
function saveSeasonPlanting(extra = {}) {
  const season = activeSeason();
  if (!season) return;
  try {
    return setPlanting(season.key, { crop: state.planner.crop, rowSpacingCm: state.planner.row,
      withinRowCm: state.planner.spacing, usableAreaPct: state.planner.usable, ...extra });
  } catch (error) {
    console.warn('Season planting could not be saved', error);
    toast(t('Season settings could not be saved. Please try again.', 'মৌসুমের মাপ সংরক্ষণ হয়নি। আবার চেষ্টা করুন।'));
  }
}

function seasonLabel(season) {
  return esc(t(season.crop === 'fallow' ? 'Fallow' : cropName(season.crop), season.cropBn));
}
function seasonTabs(plan = seasonPlan()) {
  if (!plan && getReadyPlan()) return '';
  if (!plan) return `<p class="note plan-rotation-note"><a href="#rotations">${t('Choose a rotation first to plan every season', 'প্রতি মৌসুমের পরিকল্পনা করতে আগে ফসলচক্র বাছুন')}</a></p>`;
  const selected = activeSeason(plan);
  return `<div class="plan-season-tabs" role="tablist" aria-label="${t('Rotation seasons', 'ফসলচক্রের মৌসুম')}">${plan.rotation.seasons.map((season, index) => {
    const fallow = season.crop === 'fallow';
    const checked = plan.planting[season.key]?.confirmedAt;
    const active = selected?.key === season.key;
    return `<button type="button" id="plan-season-tab-${index}" role="tab" data-action="plan-season" data-value="${esc(season.key)}" aria-controls="plan-season-panel" aria-selected="${active}" tabindex="${active ? 0 : -1}" ${fallow ? 'disabled' : ''}><span>${String.fromCodePoint(0x2460 + index)} ${seasonLabel(season)} · ${monthName(season.sowMonth - 1, true)}–${monthName(season.harvestMonth - 1, true)}</span>${checked ? `<span class="plan-season-check" aria-label="${t('Reviewed', 'যাচাই করা হয়েছে')}">✓</span>` : ''}</button>`;
  }).join('')}</div><div class="plan-season-summary" role="region" tabindex="0" aria-label="${t('Season estimates and review status', 'মৌসুমের হিসাব ও যাচাইয়ের অবস্থা')}">${plan.rotation.seasons.map(season => {
    const settings = plan.planting[season.key];
    const custom = settings && (settings.custom || settings.crop !== seasonCrop(season));
    const counts = !settings ? t('No planting', 'বপন নেই') : settings.crop === 'mustard'
      ? `${num(settings.counts.seedKg, 1)} ${t('kg seed', 'কেজি বীজ')}`
      : `${num(settings.counts.plants)} ${settings.crop === 'rice' ? t('hills', 'গোছা') : t('plants', 'গাছ')}`;
    return `<div class="plan-season-summary-chip"><b>${seasonLabel(season)}${custom ? ` · ${esc(t(PLANTING[settings.crop].label, PLANTING[settings.crop].bn))} (${t('Custom', 'নিজস্ব')})` : ''}</b><span>${counts} · ${!settings ? t('Fallow', 'পতিত') : settings.confirmedAt ? t('Reviewed ✓', 'যাচাই হয়েছে ✓') : t('Needs review', 'যাচাই বাকি')}</span></div>`;
  }).join('')}</div>`;
}
// Next non-fallow season in the rotation's order (the timeline the farmer follows).
function nextSeason(plan, season) {
  const seasons = plan.rotation.seasons;
  return seasons.slice(seasons.indexOf(season) + 1).find(item => item.crop !== 'fallow') || null;
}
function seasonConfirmation(plan = seasonPlan()) {
  const season = activeSeason(plan);
  if (!season) return '';
  const confirmed = plan.planting[season.key].confirmedAt;
  const next = nextSeason(plan, season);
  const label = next
    ? t(`Save & next: ${seasonLabel(next)} · ${monthName(next.sowMonth - 1, true)}–${monthName(next.harvestMonth - 1, true)} →`, `সংরক্ষণ করে পরের মৌসুম: ${seasonLabel(next)} →`)
    : t('Save & see my plan →', 'সংরক্ষণ করে পুরো পরিকল্পনা দেখুন →');
  return `<button type="button" class="button primary plan-confirm" data-action="plan-confirm" ${plan.steps.rotation !== 'done' ? 'disabled' : ''}>${confirmed ? '✓ ' : ''}${label}</button>${plan.steps.rotation !== 'done' ? `<p class="note"><a href="#rotations">${t('Review your rotation first', 'আগে ফসলচক্র যাচাই করুন')}</a></p>` : ''}`;
}

const cropIds = {
  rice: 'aman',
  mustard: 'mustard',
  potato: 'potato',
  mungbean: 'mungbean',
};
function setPlannerSeason(key) {
  plannerSeasonKey = key;
  plannerPlanId = getPlan()?.id ?? null;
}
function setPlantCrop(id) {
  if (!Object.hasOwn(PLANTING, id)) return;
  Object.assign(state.planner, { ...recommendedSettings(id), usable: state.planner.usable });
  persist();
  saveSeasonPlanting({ custom: true });
}
function cropIcon(crop) {
  const shapes = {
    rice: '<path d="M12 22V5m0 8C5 13 5 8 5 6c5 0 7 3 7 7Zm0 6c7 0 7-5 7-7-5 0-7 3-7 7Z"/>',
    potato: '<path d="M12 14V4m0 6C6 10 5 6 5 3c5 0 7 3 7 7Zm0 0c6 0 7-4 7-7-5 0-7 3-7 7Z"/><ellipse cx="12" cy="19" rx="8" ry="5"/><path d="m8 18 1 1m6 0 1 1"/>',
    mustard: '<path d="M12 23V10m0 7-6-4m6 6 6-4"/><path d="M12 3c5-5 9 3 3 5 6 2 0 9-3 4-3 5-9-2-3-4-6-2-2-10 3-5Z"/>',
    mungbean: '<path d="M5 4c12 0 16 10 12 16-4 6-15-2-12-16Z"/><path d="m8 8 7 10m-4-9 2 1m-1 4 2 1"/>',
  };
  return `<svg viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[crop]}</svg>`;
}
function numericControl(name, label, unit) {
  const p = state.planner;
  const { min, max, step } = controlLimits(p.crop, name);
  const value = p[name];
  return `<div class="plan-control" style="--progress:${(value - min) / (max - min) * 100}%">
    <div class="plan-control-label"><label for="plan-${name}">${label}</label><span class="plan-number"><input id="plan-${name}" name="${name}" type="number" min="${min}" max="${max}" step="${step}" value="${value}" inputmode="numeric" required aria-describedby="plan-${name}-limits"><span>${unit}</span></span></div>
    <div class="plan-range-wrap"><output for="plan-${name} plan-${name}-range" aria-hidden="true">${num(value)} ${unit}</output><input id="plan-${name}-range" name="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label} (${unit})"></div>
    <div id="plan-${name}-limits" class="plan-range-limits"><span>${num(min)} ${unit}</span><span>${num(max)} ${unit}</span></div></div>`;
}
function plannerSettings() {
  const p = state.planner;
  const plan = seasonPlan();
  const season = activeSeason(plan);
  const settings = season && plan.planting[season.key];
  const locked = settings && !settings.custom && settings.crop === seasonCrop(season);
  return `<section class="panel plan-settings"><div class="panel-header"><div>${season ? (() => { const i = plan.rotation.seasons.indexOf(season); const months = `${monthName(season.sowMonth - 1, true)}–${monthName(season.harvestMonth - 1, true)}`; return `<span class="eyebrow">${t(`SEASON ${i + 1} OF ${plan.rotation.seasons.length} · ${months}`, `মৌসুম ${i + 1}/${plan.rotation.seasons.length} · ${months}`)}</span><h2>${t(`Planting for ${seasonLabel(season)}`, `${seasonLabel(season)} — বপনের মাপ`)}</h2><p class="note plan-season-scope">${t(`These settings apply only to the ${seasonLabel(season)} season (${months}). Other seasons keep their own.`, `এই মাপ শুধু ${seasonLabel(season)} মৌসুমের (${months}) জন্য। অন্য মৌসুমের মাপ আলাদা থাকে।`)}</p>`; })() : `<span class="eyebrow">${t('MAKE IT YOUR FIELD', 'নিজের জমির মাপ দিন')}</span><h2>${t('Planting settings', 'বপনের মাপ')}</h2>`}</div></div><div class="panel-body">
    <form id="plant-controls">${locked ? `<div class="plan-locked-crop"><div>${cropIcon(p.crop)}<b>${seasonLabel(season)}</b></div><button type="button" class="plan-change-crop" data-action="plan-change-crop">${t('Change crop', 'ফসল বদলান')}</button></div>` : `<fieldset class="plan-crops"><legend>${season ? t('Custom crop', 'নিজস্ব ফসল') : t('Choose your crop', 'আপনার ফসল বাছুন')}</legend><div class="plan-crop-grid">${Object.entries(PLANTING).map(([id, crop]) => `<label class="plan-crop"><input type="radio" name="plantCrop" value="${id}" ${id === p.crop ? 'checked' : ''}><span>${cropIcon(id)}<span>${t(crop.label, crop.bn)}</span></span></label>`).join('')}</div></fieldset>`}
    ${numericControl('usable', t('Usable area', 'চাষযোগ্য জমি'), '%')}
    ${p.crop === 'mustard' ? `<p class="plan-broadcast note">${t('Broadcast sowing · no rows. Seed uses the published 7 kg/ha reference rate.', 'ছিটিয়ে বপন · সারি নেই। প্রকাশিত ৭ কেজি/হেক্টর হার ধরে বীজের হিসাব।')}</p>` : numericControl('row', t('Row spacing', 'সারির দূরত্ব'), 'cm') + numericControl('spacing', t('Within-row spacing', 'গাছের দূরত্ব'), 'cm')}
    <button type="button" class="plan-reset" data-action="plan-reset">↺ ${t('Reset to recommended', 'প্রস্তাবিত মাপে ফিরুন')}</button><div class="plan-season-confirmation">${seasonConfirmation(plan)}</div></form></div></section>`;
}
function resultNumber(key, value, places = 0) {
  return `<span data-plan-number="${key}" data-value="${value}" data-places="${places}">${num(value, places)}</span>`;
}
function estimate() {
  const p = state.planner;
  return capacity(
    area(),
    p.usable,
    p.crop,
    p.crop === 'mustard' ? 0 : p.row / 100,
    p.crop === 'mustard' ? 0 : p.spacing / 100
  );
}
function plannerResult() {
  const p = state.planner,
    c = PLANTING[p.crop],
    q = estimate(),
    record = agronomy.crops.find((x) => x.id === cropIds[p.crop]);
  const isSeed = p.crop === 'mustard';
  const rows = isSeed ? 0 : Math.max(1, Math.floor(Math.sqrt(q.net * 1e4) / (p.row / 100)));
  return `<div class="plan-result"><div class="eyebrow">${isSeed ? t('Seed you need', 'কতটা বীজ লাগবে') : t('Plants to sow', 'কতগুলো গাছ লাগাবেন')}</div><div class="plan-result-total"><strong>${resultNumber('total', isSeed ? q.seedKg : q.positions, isSeed ? 1 : 0)}</strong><span>${isSeed ? t('kg seed', 'কেজি বীজ') : p.crop === 'rice' ? t('hills', 'গোছা') : t('positions', 'স্থান')}</span></div>${truth('SCENARIO')}</div>
    <dl class="field-meta plan-metrics"><div><dt>${t('Usable area', 'চাষযোগ্য জমি')}</dt><dd>${resultNumber('net', q.net, 2)} ha ${truth('SCENARIO')}</dd></div><div><dt>${isSeed ? t('Reference seed rate', 'বীজের হার') : t('Spacing', 'দূরত্ব')}</dt><dd>${isSeed ? `${num(c.seedRate)} kg/ha ${truth('MODELED', { source: 'Trial reference' })}` : `${num(p.row)} × ${num(p.spacing)} cm ${truth('FARMER_REPORTED')}`}</dd></div>${isSeed ? '' : `<div class="plan-rows"><dt>${t('Rows × plants per row', 'সারি × প্রতি সারিতে গাছ')}</dt><dd>${resultNumber('rows', rows)} × ~${resultNumber('perRow', q.positions / rows)} ${truth('MODELED')}</dd><small>${t('Equivalent square layout · estimated, not surveyed rows', 'সমান আয়তনের বর্গাকার জমি ধরে অনুমান · জরিপ করা সারি নয়')}</small></div>`}</dl>
    <div class="plan-harvest"><svg viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M16 38h32l-4 19H20Z" fill="#d9ba83"/><path d="m24 38 8-17 8 17M13 38h38" stroke="#826c40" stroke-width="3" stroke-linecap="round"/><path d="M32 28V6m0 14C19 20 19 11 19 8c9 0 13 5 13 12Zm0-3c12 0 13-8 13-12-9 0-13 5-13 12Z" stroke="#567b43" stroke-width="2" fill="#d9e9a6"/></svg><div><b>${t('Trial-based harvest illustration', 'গবেষণার ফলন ধরে উদাহরণ')}</b><div class="plan-harvest-value">${resultNumber('low', q.low, 1)}–${resultNumber('high', q.high, 1)} t ${truth('MODELED', { source: 'Trial evidence' })}</div><p class="note">${t('On this usable area, if the published trial yield were achieved.', 'এই চাষযোগ্য জমিতে, যদি গবেষণার ফলনের সমান ফল পাওয়া যায়।')} (${record.referenceYieldTHa.join('–')} t/ha).</p>${sources(record.sourceIds)}</div></div>`;
}
function planner() {
  const p = state.planner;
  const plan = seasonPlan();
  const season = activeSeason(plan);
  if (season) loadSeason(season, plan);
  if (!Object.hasOwn(PLANTING, p.crop)) Object.assign(p, recommendedSettings('rice'));
  for (const name of ['usable', 'row', 'spacing']) {
    if (p.crop === 'mustard' && name !== 'usable') continue;
    p[name] = clampPlannerValue(p.crop, name, Number.isFinite(p[name]) ? p[name] : recommendedSettings(p.crop)[name]);
  }
  return (
    header(
      t('Planting desk  /  03', 'বপনের নকশা  /  ০৩'),
      t('Planting planner', 'বপনের পরিকল্পনা'),
      t(
        'Turn the field boundary into a row layout and an approximate planting count.',
        'জমির সীমানা থেকে সারি ও আনুমানিক গাছের সংখ্যা দেখুন।'
      ),
      button(t('Guide me', 'আমাকে দেখান'), 'plan-guide') +
      button(t('Print field plan', 'পরিকল্পনা ছাপুন'), 'print', '', 'print')
    ) +
    chips() +
    `<div id="journey-finish-slot">${journeyFinishCTA()}</div><section id="plan-seasons">${seasonTabs(plan)}</section>
    <div id="plan-season-panel" ${season ? `role="tabpanel" aria-labelledby="plan-season-tab-${plan.rotation.seasons.indexOf(season)}"` : ''} class="planner-workbench"><div class="grid-two planner3d-layout"><section class="panel planner3d-panel"><div class="panel-header"><h2>${t('Field preview', 'জমির পূর্বদৃশ্য')}</h2>${tag(t('Planting model', 'বপনের নকশা'), 'green')}</div>
 <div class="planner3d-stage-wrap">
 <div class="planner3d-toolbar"><div class="planner3d-view-toggle" role="group" aria-label="${t('Field view', 'জমির দৃশ্য')}">
 <button type="button" class="planner3d-view-btn ${p.view !== 'top' ? 'active' : ''}" data-action="plan-view" data-value="3d" aria-pressed="${p.view !== 'top'}">${t('3D', '৩ডি')}</button>
 <button type="button" class="planner3d-view-btn ${p.view === 'top' ? 'active' : ''}" data-action="plan-view" data-value="top" aria-pressed="${p.view === 'top'}">${t('Top', 'উপর থেকে')}</button></div>
 <div class="planner3d-zoom-controls"><button type="button" class="planner3d-ctrl-btn" data-action="plan-zoom" data-value="1" aria-label="${t('Zoom in', 'কাছে আনুন')}">+</button><button type="button" class="planner3d-ctrl-btn" data-action="plan-zoom" data-value="-1" aria-label="${t('Zoom out', 'দূরে নিন')}">−</button></div></div>
 <div class="planner3d-stage-canvas-host" tabindex="0" role="region" aria-label="${t('Field model. Drag or use arrow keys to rotate; scroll, pinch or use zoom buttons to zoom.', 'জমির মডেল। ঘোরাতে টানুন বা তীরচিহ্নের কী ব্যবহার করুন; জুম করতে স্ক্রল, দুই আঙুল বা জুম বোতাম ব্যবহার করুন।')}"><canvas id="plant-model" class="planner-canvas" aria-label="${t('Schematic of planting rows within the field boundary', 'জমির সীমানায় সারির নমুনা নকশা')}"></canvas></div>
 <div class="planner3d-footer"><span class="planner3d-crop-chip">${t('Illustrative · rows drawn at readable scale', 'কাল্পনিক · বোঝার সুবিধায় সারি বড় করে দেখানো')}</span><span class="note planner3d-fallback-note">${t('2D fallback · flat ground · drag to rotate', '২ডি বিকল্প · সমতল জমি · ঘোরাতে টানুন')}</span></div></div></section>
 <section class="panel plan-live" aria-label="${t('Live planting results', 'বপনের সরাসরি হিসাব')}"><div id="plan-estimate" role="status" aria-live="polite" aria-atomic="true">${plannerResult()}</div></section>
 ${plannerSettings()}</div>${plantyPanel(p)}</div>
 <div id="planner-finish-slot"></div><div class="section-space">${panel(t('Read the estimate', 'হিসাব বুঝুন'), `<p class="note">${t('Usable area reserves room for paths, drains or a tree border. Row crops use usable square metres divided by row × plant spacing. Broadcast mustard uses BARI Shorisha-14’s reference seed rate. The model draws representative plants. Rice is counted in hills.', 'আইল, নালা ও গাছের জন্য জমি বাদ দিয়ে চাষযোগ্য অংশ ঠিক করুন। সারির ফসলে চাষযোগ্য বর্গমিটারকে দুই দূরত্বের গুণফল দিয়ে ভাগ করা হয়। ছিটানো সরিষায় বারি সরিষা-১৪ এর বীজের হার ধরা হয়। ধানের হিসাব গোছায়।')}</p>`)}</div>`
  );
}
function drawPlanner() {
  const canvas = document.querySelector('#plant-model');
  if (!canvas || canvas.closest('.planner3d-ready')) return;
  const bounds = canvas.getBoundingClientRect(),
    width = bounds.width,
    height = bounds.height,
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx || !width || !height) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#e9eee3';
  ctx.fillRect(0, 0, width, height);
  const poly = polygon(),
    center = poly.reduce(
      (a, [lat, lon]) => [a[0] + lat / poly.length, a[1] + lon / poly.length],
      [0, 0]
    );
  const raw = poly.map(([lat, lon]) => [
    (lon - center[1]) * 111195 * Math.cos((center[0] * Math.PI) / 180),
    (lat - center[0]) * 111195,
  ]);
  const radius = Math.max(...raw.map(([x, y]) => Math.hypot(x, y)));
  const overhead = state.planner.view === 'top';
  const s = Math.min(width * 0.39, height * (overhead ? 0.42 : 0.61)) / radius,
    a = state.planner.angle,
    c = Math.cos(a),
    sn = Math.sin(a);
  function project(x, y, z = 0) {
    return [
      width * 0.5 + (x * c - y * sn) * s,
      height * 0.48 +
        (x * sn + y * c) * s * (overhead ? 1 : 0.53) -
        (overhead ? 0 : z * s),
    ];
  }
  function path(points, fill, stroke) {
    ctx.beginPath();
    points.forEach((v, i) => (i ? ctx.lineTo(...v) : ctx.moveTo(...v)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }
  for (let z = -radius * 2; z <= radius * 2; z += radius / 8) {
    ctx.beginPath();
    ctx.moveTo(...project(-radius * 2, z, -7));
    ctx.lineTo(...project(radius * 2, z, -7));
    ctx.moveTo(...project(z, -radius * 2, -7));
    ctx.lineTo(...project(z, radius * 2, -7));
    ctx.strokeStyle = '#d7dfd1';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  const surface = raw.map((p) => project(...p)),
    under = raw.map(([x, y]) => project(x, y, -7));
  path(under, '#8e7962');
  raw
    .map((p, i) => [i, (surface[i][1] + surface[(i + 1) % raw.length][1]) / 2])
    .sort((u, v) => u[1] - v[1])
    .forEach(([i]) => {
      const j = (i + 1) % raw.length;
      path([surface[i], surface[j], under[j], under[i]], '#a18968', '#897559');
    });
  path(surface, '#af9e6f', '#7f8060');
  const usable = Math.sqrt(state.planner.usable / 100);
  const inner = raw.map(([x, y]) => [x * usable, y * usable]);
  path(
    inner.map((p) => project(...p)),
    '#8c9761'
  );
  function inside(x, y) {
    let found = false;
    for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) {
      const [u, v] = inner[i],
        [w, z] = inner[j];
      if (v > y !== z > y && x < ((w - u) * (y - v)) / (z - v) + u)
        found = !found;
    }
    return found;
  }
  const sx = Math.max(3.7, radius * (0.075 + state.planner.spacing / 550)),
    sy = Math.max(4, radius * (0.07 + state.planner.row / 400));
  const pts = [];
  ctx.save();
  ctx.beginPath();
  inner
    .map((p) => project(...p))
    .forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.closePath();
  ctx.clip();
  for (let y = -radius; y <= radius; y += sy) {
    ctx.beginPath();
    ctx.moveTo(...project(-radius, y));
    ctx.lineTo(...project(radius, y));
    ctx.strokeStyle = '#526348';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let x = -radius; x <= radius; x += sx)
      if (inside(x, y)) pts.push(project(x, y));
  }
  ctx.restore();
  pts.sort((u, v) => u[1] - v[1]);
  const crop = state.planner.crop;
  for (const [x, y] of pts) {
    const size = Math.min(width, height) / 500;
    ctx.beginPath();
    ctx.strokeStyle = crop === 'potato' ? '#456f3e' : '#506e40';
    ctx.lineWidth = 1.4;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3 * size, y - 6 * size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 * size, y - 8 * size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5 * size, y - 4 * size);
    ctx.stroke();
    if (crop === 'potato' || crop === 'mungbean') {
      ctx.fillStyle = crop === 'potato' ? '#47723e' : '#658747';
      for (const offset of [-2, 2]) {
        ctx.beginPath();
        ctx.ellipse(
          x + offset * size,
          y - 5 * size,
          3 * size,
          1.8 * size,
          offset * 0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    if (crop === 'mustard') {
      ctx.fillStyle = '#d5ae49';
      ctx.fillRect(x - 3 * size, y - 7 * size, 3 * size, 3 * size);
    }
  }
  ctx.fillStyle = '#536348';
  ctx.font = '11px monospace';
  ctx.fillText(
    `${field().name.toUpperCase()}  /  ${num(area(), 2)} ha`,
    18,
    26
  );
  ctx.fillText('N', width - 40, 26);
  const north = project(0, radius * 0.25);
  ctx.beginPath();
  ctx.moveTo(width - 34, 43);
  ctx.lineTo(
    width - 34 + (north[0] - width * 0.5) / 15,
    43 + (north[1] - height * 0.48) / 15
  );
  ctx.strokeStyle = '#445a42';
  ctx.stroke();
}
let planner3dModule = null;
let planner3dPromise = null;
let soilProfilePromise = null;
let plannerTimer = null;
let plannerHost = null;
let plannerVersion = 0;
let disposePlanty = null;
let resultFrame = null;

function hasPlannerWebGL() {
  try {
    const probe = document.createElement('canvas');
    const context = window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl'));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function schedulePlanner3d() {
  clearTimeout(plannerTimer);
  const version = ++plannerVersion;
  const host = plannerHost;
  if (!host || (!planner3dModule && !hasPlannerWebGL())) return;
  plannerTimer = setTimeout(async () => {
    try {
      planner3dPromise ||= import('./planner3d.js').catch((error) => {
        planner3dPromise = null;
        throw error;
      });
      soilProfilePromise ||= fetch('data/soil-profile.json')
        .then((response) => response.ok ? response.json() : null).catch(() => null);
      const [mod, soilProfile] = await Promise.all([planner3dPromise, soilProfilePromise]);
      planner3dModule = mod;
      if (version !== plannerVersion || !host.isConnected || host !== plannerHost) return;
      await mod.mountPlanner3d(host, {
        field: field(), polygon: polygon(), agronomy, soilProfile,
        planner: { ...state.planner },
      });
    } catch (error) {
      if (version !== plannerVersion) return;
      planner3dModule?.disposePlanner3d();
      drawPlanner();
      console.warn('Planner 3D unavailable; using schematic:', error);
    }
  }, 120);
}

function disposePlanner() {
  disposePlanty?.();
  disposePlanty = null;
  cancelAnimationFrame(resultFrame);
  ++plannerVersion;
  clearTimeout(plannerTimer);
  plannerTimer = null;
  plannerHost = null;
  planner3dModule?.disposePlanner3d();
}

function mountPlanner() {
  disposePlanty?.();
  disposePlanty = mountPlanty(() => plantyContext(field().id, state.planner, estimate(), state.lang, { fieldName: fieldName(), month: state.month + 1 }));
  document.querySelector('#plant-controls').onsubmit = event => event.preventDefault();
  document.querySelector('#plan-seasons').onkeydown = event => {
    if (event.target.getAttribute('role') !== 'tab' || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('.plan-season-tabs [role="tab"]:not(:disabled)')];
    const index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    event.preventDefault();
    plannerAction('plan-season', tabs[next].dataset.value);
  };
  const cv = document.querySelector('#plant-model');
  if (!cv) return;
  plannerHost = cv.parentElement;
  drawPlanner();
  schedulePlanner3d();
  plannerHost.addEventListener('keydown', (event) => {
    if (cv.closest('.planner3d-ready') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    state.planner.angle += (event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 6;
    persist();
    drawPlanner();
  });
  let drag = null;
  cv.onpointerdown = (e) => {
    drag = e.clientX;
    cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = (e) => {
    if (drag === null) return;
    state.planner.angle += (e.clientX - drag) / 110;
    drag = e.clientX;
    drawPlanner();
  };
  cv.onpointerup = cv.onpointercancel = () => {
    drag = null;
    persist();
  };
}
function refreshSeasonChrome() {
  const plan = seasonPlan();
  const host = document.querySelector('#plan-seasons');
  if (host) {
    const scroll = ['.plan-season-tabs', '.plan-season-summary'].map(selector => [selector, host.querySelector(selector)?.scrollLeft ?? 0]);
    host.innerHTML = seasonTabs(plan);
    for (const [selector, left] of scroll) {
      const strip = host.querySelector(selector);
      if (strip) strip.scrollLeft = left;
    }
  }
  const confirmation = document.querySelector('.plan-season-confirmation');
  if (confirmation) confirmation.innerHTML = seasonConfirmation(plan);
  const season = activeSeason(plan);
  if (season) document.querySelector('#plan-season-panel')?.setAttribute('aria-labelledby',
    `plan-season-tab-${plan.rotation.seasons.indexOf(season)}`);
}
function refreshPlannerSettings() {
  const host = document.querySelector('.plan-settings');
  if (!host) { repaint(); return; }
  // Keep the canvas host mounted so planner3d can transition between crops.
  host.outerHTML = plannerSettings();
  document.querySelector('#plant-controls').onsubmit = event => event.preventDefault();
  refreshSeasonChrome();
  updatePlannerResults();
}
function focusSeasonTab() {
  const tab = document.querySelector('.plan-season-tabs [aria-selected="true"]');
  tab?.focus({ preventScroll: true });
  tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
function plannerAction(action, value) {
  if (action === 'plan-season') {
    const plan = seasonPlan();
    activeSeason(plan);
    const season = plan?.rotation.seasons.find(item => item.key === value && item.crop !== 'fallow');
    if (!season) return;
    plannerSeasonKey = season.key;
    loadSeason(season, plan);
    persist();
    refreshPlannerSettings();
    focusSeasonTab();
  }
  if (action === 'plan-change-crop' && activeSeason()) {
    if (!saveSeasonPlanting({ custom: true })) return;
    refreshPlannerSettings();
    document.querySelector('[name="plantCrop"]:checked')?.focus({ preventScroll: true });
  }
  if (action === 'plan-confirm' && activeSeason()) {
    const plan = seasonPlan();
    const next = nextSeason(plan, activeSeason(plan));
    saveSeasonPlanting({ confirmedAt: new Date().toISOString() });
    refreshSeasonChrome();
    // Save moves along the timeline: open the next season, or finish on the last one.
    if (next) document.querySelector(`#plan-seasons [role="tab"][data-value="${next.key}"]`)?.click();
    else document.querySelector('[data-journey="finish"]:not(:disabled)')?.click();
    document.querySelector('[data-action="plan-confirm"]')?.focus({ preventScroll: true });
  }
  if (action === 'plan-guide') guide.sequence([
    { target: '.plan-crop-grid, .plan-locked-crop', text: { en: 'Review your crop. Planty will walk through your planting settings.', bn: 'আপনার ফসল দেখুন। Planty আপনার বপনের মাপ দেখাবে।' }, pose: 'pointing', action: 'click' },
    { target: '#plan-row-range', text: { en: 'Try changing the distance between rows.', bn: 'সারির দূরত্ব বদলে দেখুন।' }, pose: 'thinking', action: 'input', timeout: 1200 },
    { target: '.planty-launch', text: { en: 'Ask Planty about your current crop and settings.', bn: 'আপনার ফসল ও মাপ নিয়ে Planty-কে প্রশ্ন করুন।' }, pose: 'happy', action: 'click',
      onDone: () => guide.celebrate({ en: 'You’re ready to plan your planting!', bn: 'আপনি বপনের পরিকল্পনা করতে প্রস্তুত!' }) },
  ]);
  if (action === 'plan-reset') {
    Object.assign(state.planner, recommendedSettings(state.planner.crop));
    persist();
    saveSeasonPlanting();
    refreshPlannerSettings();
    document.querySelector('.plan-reset')?.focus({ preventScroll: true });
  }
  if (action === 'plan-view') {
    state.planner.view = value === 'top' ? 'top' : '3d';
    persist();
    document.querySelectorAll('[data-action="plan-view"]').forEach((control) => {
      const active = control.dataset.value === state.planner.view;
      control.classList.toggle('active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    planner3dModule?.setPlanner3dView(state.planner.view);
    drawPlanner();
    schedulePlanner3d();
  }
  if (action === 'plan-zoom') planner3dModule?.zoomPlanner3d(Number(value));
}
function updatePlannerResults() {
  const host = document.querySelector('#plan-estimate');
  if (!host) return;
  cancelAnimationFrame(resultFrame);
  const previous = new Map([...host.querySelectorAll('[data-plan-number]')].map(el => [el.dataset.planNumber, Number(el.dataset.display ?? el.dataset.value)]));
  host.innerHTML = plannerResult();
  const numbers = [...host.querySelectorAll('[data-plan-number]')];
  const start = performance.now();
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    // Hide animated intermediates from live announcements; announce the final estimate once.
    host.setAttribute('aria-busy', 'true');
    const tick = now => {
      if (!host.isConnected) return;
      const progress = Math.min(1, (now - start) / 240);
      const eased = 1 - (1 - progress) ** 3;
      for (const el of numbers) {
        const target = Number(el.dataset.value);
        const from = previous.get(el.dataset.planNumber) ?? target;
        const display = from + (target - from) * eased;
        el.dataset.display = display;
        el.textContent = num(display, Number(el.dataset.places));
      }
      if (progress < 1) resultFrame = requestAnimationFrame(tick);
      else host.setAttribute('aria-busy', 'false');
    };
    resultFrame = requestAnimationFrame(tick);
  }
  refreshPlantySuggestions(state.planner);
  drawPlanner();
  schedulePlanner3d();
}
function plannerInput(el) {
  if (!el.closest('#plant-controls') || el.name === 'plantCrop') return;
  const { min, max } = controlLimits(state.planner.crop, el.name);
  // Keep partial number drafts editable; commit and clamp on change.
  if (el.type === 'number' && (el.value === '' || Number(el.value) < min || Number(el.value) > max)) return;
  if (syncPlannerControl(el, state.planner) === null) return;
  persist();
  saveSeasonPlanting();
  refreshSeasonChrome();
  updatePlannerResults();
}
function plannerChange(el) {
  if (!el.closest('#plant-controls')) return;
  if (el.name === 'plantCrop') {
    setPlantCrop(el.value);
    refreshPlannerSettings();
    document.querySelector(`[name="plantCrop"][value="${state.planner.crop}"]`)?.focus({ preventScroll: true });
  } else {
    if (el.value === '' || !Number.isFinite(Number(el.value))) el.value = state.planner[el.name];
    syncPlannerControl(el, state.planner);
    persist();
    saveSeasonPlanting();
    refreshSeasonChrome();
    updatePlannerResults();
  }
}

export {
  setPlannerSeason,
  setPlantCrop,
  planner,
  drawPlanner,
  mountPlanner,
  disposePlanner,
  plannerAction,
  plannerInput,
  plannerChange,
};
