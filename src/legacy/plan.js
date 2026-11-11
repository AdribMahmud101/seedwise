import {
  state, earth, agronomy, allFields, polygon, t, esc, num,
  nasaBadge, truth, header, panel, tag, button, toast, repaint, download,
  outlook as outlookPack, floodFields,
} from './ui.js';
import { monthlyRotationWater, CROP_KC } from './engine.js';
import { outlookPlanHint, outlookSummaryLine, floodSummaryLine } from './outlook-flood.js';
import { getPlan, getReadyPlan, editReadyPlan, importPlanJSON, markPlanGenerated, stepStatus } from './journey.js';
import { plantyMascot } from './planty.js';
import { guide } from './planty-guide.js';
import { setPlannerSeason } from './planner.js';
import { netInputsFor, isNetEdited } from './fields.js';
import { recommendedSettings } from './planner-controls.js';

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const CROP_NAMES = {
  aman: ['Aman rice', 'আমন'], boro: ['Boro rice', 'বোরো'], rice: ['Rice', 'ধান'],
  mustard: ['Mustard', 'সরিষা'], potato: ['Potato', 'আলু'],
  mungbean: ['Mungbean', 'মুগ'], fallow: ['Fallow', 'পতিত'],
};
const CROP_BAR = {
  aman: { sow: '#35702b', grow: '#4f9a3d', harvest: '#cfa44e' },
  rice: { sow: '#35702b', grow: '#4f9a3d', harvest: '#cfa44e' },
  boro: { sow: '#2b5f70', grow: '#3d8a9e', harvest: '#cfa44e' },
  mustard: { sow: '#6b7a2b', grow: '#9fc24b', harvest: '#e8c93a' },
  potato: { sow: '#33571f', grow: '#4f8f3a', harvest: '#b89a66' },
  mungbean: { sow: '#3d702f', grow: '#5fa044', harvest: '#8fbf5a' },
  fallow: { sow: '#b8ab93', grow: '#c9bda6', harvest: '#b8ab93' },
};
export const cropLabel = (crop, lang) => (CROP_NAMES[crop] ?? [crop, crop])[lang === 'bn' ? 1 : 0];

const displayPlan = () => getPlan() ?? getReadyPlan()?.plan;

// 0-based month indices covered by a season, following sow → harvest across New Year.
export function planMonths(season) {
  const months = [];
  let m = season.sowMonth;
  for (let i = 0; i < 12; i++) {
    months.push(m - 1);
    if (m === season.harvestMonth) break;
    m = (m % 12) + 1;
  }
  return months;
}

export function calendarGeometry(seasons, nowMonth = new Date().getMonth()) {
  const rows = (seasons ?? []).map(season => {
    const months = planMonths(season);
    const parts = months.map((month, i) => ({
      month, part: months.length === 1 ? 'grow' : i === 0 ? 'sow' : i === months.length - 1 ? 'harvest' : 'grow',
    }));
    return { key: season.key, crop: season.crop, cropBn: season.cropBn, months, parts };
  });
  const covered = new Set(rows.flatMap(row => row.months));
  const gaps = Array.from({ length: 12 }, (_, m) => m).filter(m => !covered.has(m));
  return { rows, gaps, nowMonth };
}

// Maximal contiguous x-runs within one part (a season can wrap across New Year).
function partRuns(parts) {
  const runs = [];
  for (const cell of parts) {
    const last = runs.at(-1);
    if (last && last.part === cell.part && cell.month === last.end + 1) last.end = cell.month;
    else runs.push({ part: cell.part, start: cell.month, end: cell.month });
  }
  return runs;
}

export function calendarSVG(seasons, { nowMonth = new Date().getMonth(), lang = 'en', uid = 'p1' } = {}) {
  const { rows, gaps } = calendarGeometry(seasons, nowMonth);
  const labelW = 76, colW = 44, rowH = 30, headH = 24, legH = 30, pad = 8;
  const width = labelW + colW * 12 + pad * 2;
  const gapRows = gaps.length ? 1 : 0;
  const height = headH + (rows.length + gapRows) * rowH + legH + pad * 2;
  const names = lang === 'bn' ? MONTH_BN : MONTH_EN;
  const x = m => pad + labelW + m * colW;
  const hatch = `plan-hatch-${uid}`;
  let svg = `<defs><pattern id="${hatch}" width="7" height="7" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#e6ddc9"/><line x1="0" y1="0" x2="0" y2="7" stroke="#b8ab93" stroke-width="2"/></pattern></defs>`;
  svg += names.map((name, m) => `<text x="${x(m) + colW / 2}" y="${pad + 15}" text-anchor="middle" class="plan-cal-month">${esc(name)}</text>`).join('');
  // Current-month marker behind the bars.
  svg += `<rect x="${x(nowMonth)}" y="${pad + headH - 4}" width="${colW}" height="${(rows.length + gapRows) * rowH}" rx="4" class="plan-cal-today"/>`;
  rows.forEach((row, i) => {
    const y = pad + headH + i * rowH;
    const fallow = row.crop === 'fallow';
    svg += `<text x="${pad + labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="plan-cal-crop">${esc(lang === 'bn' ? row.cropBn : cropLabel(row.crop, lang))}</text>`;
    if (fallow) {
      for (const run of partRuns(row.parts)) {
        svg += `<rect x="${x(run.start) + 1}" y="${y + 5}" width="${(run.end - run.start + 1) * colW - 2}" height="${rowH - 10}" rx="4" fill="url(#${hatch})" stroke="#b8ab93" stroke-width="1"/>`;
      }
    } else {
      const colors = CROP_BAR[row.crop] ?? CROP_BAR.rice;
      for (const run of partRuns(row.parts)) {
        svg += `<rect x="${x(run.start) + 1}" y="${y + 5}" width="${(run.end - run.start + 1) * colW - 2}" height="${rowH - 10}" rx="5" fill="${colors[run.part]}"><title>${esc(run.part)}: ${run.start + 1}–${run.end + 1}</title></rect>`;
      }
    }
  });
  if (gaps.length) {
    const y = pad + headH + rows.length * rowH;
    svg += `<text x="${pad + labelW - 8}" y="${y + rowH / 2 + 4}" text-anchor="end" class="plan-cal-crop">${esc(lang === 'bn' ? 'খালি' : 'Gap')}</text>`;
    for (const m of gaps) svg += `<rect x="${x(m) + 1}" y="${y + 5}" width="${colW - 2}" height="${rowH - 10}" rx="4" fill="url(#${hatch})" stroke="#b8ab93" stroke-width="1"/>`;
  }
  const legend = lang === 'bn'
    ? [['#35702b', 'বপন'], ['#4f9a3d', 'বৃদ্ধি'], ['#cfa44e', 'ফসল তোলা'], [`url(#${hatch})`, 'পতিত'], ['today', 'এই মাস']]
    : [['#35702b', 'Sow'], ['#4f9a3d', 'Grow'], ['#cfa44e', 'Harvest'], [`url(#${hatch})`, 'Fallow'], ['today', 'This month']];
  const ly = height - pad - 8;
  svg += legend.map(([fill, label], i) => {
    const lx = pad + 12 + i * 104;
    const box = fill === 'today'
      ? `<rect x="${lx}" y="${ly - 10}" width="14" height="12" rx="3" class="plan-cal-today"/>`
      : `<rect x="${lx}" y="${ly - 10}" width="14" height="12" rx="3" fill="${fill}" stroke="#00000022"/>`;
    return `${box}<text x="${lx + 19}" y="${ly}" class="plan-cal-legend">${esc(label)}</text>`;
  }).join('');
  const label = lang === 'bn' ? 'মৌসুমের ক্যালেন্ডার' : 'Season calendar';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" class="plan-cal-svg">${svg}</svg>`;
}

// Deterministic step-by-step list from the plan: one sow item per planted
// season in rotation order, then conditional soil/irrigation/outlook items. ≤10 items.
export function deriveChecklist(plan, outlookHint = null) {
  const items = [];
  const seasons = plan?.rotation?.seasons ?? [];
  for (const season of seasons) {
    if (season.crop === 'fallow') continue;
    const settings = plan.planting?.[season.key];
    if (!settings) continue;
    const mon = MONTH_EN[season.sowMonth - 1];
    const monBn = MONTH_BN[season.sowMonth - 1];
    const id = `sow-${season.key}`;
    if (settings.crop === 'mustard') {
      const seed = settings.counts?.seedKg;
      const seedText = Number.isFinite(seed) ? ` (${seed.toFixed(1)} kg seed)` : '';
      const seedBn = Number.isFinite(seed) ? ` (${seed.toFixed(1)} কেজি বীজ)` : '';
      items.push({ id, en: `${mon}: sow mustard${seedText}`, bn: `${monBn}: সরিষা বুনুন${seedBn}` });
    } else {
      const verb = settings.crop === 'rice' ? 'transplant' : settings.crop === 'potato' ? 'plant' : 'sow';
      const verbBn = settings.crop === 'rice' ? 'রোপণ করুন' : settings.crop === 'potato' ? 'লাগান' : 'বুনুন';
      const name = settings.crop === 'rice' ? cropLabel(season.crop, 'en') : cropLabel(settings.crop, 'en');
      const nameBn = settings.crop === 'rice' ? cropLabel(season.crop, 'bn') : cropLabel(settings.crop, 'bn');
      items.push({ id,
        en: `${mon}: ${verb} ${name} at ${settings.rowSpacingCm}×${settings.withinRowCm} cm`,
        bn: `${monBn}: ${nameBn} ${verbBn} ${settings.rowSpacingCm}×${settings.withinRowCm} সেমিতে` });
    }
    if (season.crop === 'potato' || settings.crop === 'potato') {
      items.push({ id: 'soil-potato', en: 'Before potato: soil test for P and K', bn: 'আলুর আগে: P ও K মাটি পরীক্ষা' });
    }
  }
  if (seasons.some(season => season.crop === 'boro')) {
    items.push({ id: 'irrig-boro', en: 'Check irrigation before Boro sowing', bn: 'বোরোর আগে সেচ নিশ্চিত করুন' });
  }
  const winter = seasons.find(season =>
    season.crop !== 'fallow' && season.sowMonth === 11 && plan.planting?.[season.key]);
  if (outlookHint?.novRain === 'above' && winter?.crop === 'potato') {
    items.push({ id: 'outlook-drainage', en: 'Outlook: November rain above usual — check drainage before potato', bn: 'আউটলুক: নভেম্বরে বেশি বৃষ্টি — আলুর আগে পানি নিষ্কাশন দেখুন' });
  } else if (outlookHint?.novRain === 'below' && winter) {
    const name = cropLabel(winter.crop, 'en'), nameBn = cropLabel(winter.crop, 'bn');
    items.push({ id: 'outlook-irrigation', en: `Outlook: November rain below usual — plan irrigation for ${name}`, bn: `আউটলুক: নভেম্বরে কম বৃষ্টি — ${nameBn}-এর জন্য সেচের ব্যবস্থা করুন` });
  }
  items.push({ id: 'well-reading', en: 'Add a well water reading', bn: 'কূপের পানির মাপ যোগ করুন' });
  return items.slice(0, 10);
}

const plannerCropOf = crop => crop === 'mungbean' ? 'pulse' : crop === 'rice' ? 'aman' : crop;

// Water need (ETo × Kc) vs effective rain (65% of GPM) summed over a season.
export function seasonWater(monthly, season) {
  const kc = CROP_KC[plannerCropOf(season.crop)] ?? 0;
  let needMm = 0, rainMm = 0, ok = true;
  for (const m of planMonths(season)) {
    const month = monthly?.[m];
    if (!Number.isFinite(month?.et0) || !Number.isFinite(month?.rainGpm)) { ok = false; break; }
    needMm += month.et0 * kc;
    rainMm += month.rainGpm * 0.65;
  }
  if (!ok) return { needMm: null, rainMm: null };
  return { needMm, rainMm };
}

const deficitOf = (monthly, rotationId) =>
  monthlyRotationWater(monthly, rotationId).reduce((sum, m) => sum + (m.shortfallMm ?? 0), 0);

// Saved irrigation shortfall vs rice–fallow–rice (baseline) under the same weather.
export function rotationSavingMm(monthly, rotationId) {
  if (!monthly?.length) return null;
  try {
    return deficitOf(monthly, 'baseline') - deficitOf(monthly, rotationId);
  } catch {
    return null;
  }
}

export function waterChartSVG(rows, { lang = 'en', uid = 'w1' } = {}) {
  const width = 560, rowH = 44, labelW = 92, pad = 12, top = 26;
  const max = Math.max(1, ...rows.flatMap(row => [row.needMm ?? 0, row.rainMm ?? 0]));
  const height = top + rows.length * rowH + 26;
  const scale = (width - labelW - pad * 3 - 44) / max;
  const needLabel = lang === 'bn' ? 'চাহিদা' : 'Need';
  const rainLabel = lang === 'bn' ? 'বৃষ্টি' : 'Rain';
  let svg = `<text x="${pad + labelW}" y="14" class="plan-cal-legend">${esc(needLabel)} vs ${esc(rainLabel)} (mm)</text>`;
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    svg += `<text x="${pad + labelW - 8}" y="${y + 24}" text-anchor="end" class="plan-cal-crop">${esc(row.label)}</text>`;
    const need = Math.max(0, row.needMm ?? 0) * scale;
    const rain = Math.max(0, row.rainMm ?? 0) * scale;
    svg += `<rect x="${pad + labelW}" y="${y + 4}" width="${need.toFixed(1)}" height="11" rx="3" fill="#3d8a9e"><title>${esc(needLabel)}: ${(row.needMm ?? 0).toFixed(0)} mm</title></rect>`;
    svg += `<rect x="${pad + labelW}" y="${y + 19}" width="${rain.toFixed(1)}" height="11" rx="3" fill="#8fc1d4"><title>${esc(rainLabel)}: ${(row.rainMm ?? 0).toFixed(0)} mm</title></rect>`;
    const needText = `${needLabel} ${((row.needMm ?? 0)).toFixed(0)} mm`;
    const rainText = `${rainLabel} ${((row.rainMm ?? 0)).toFixed(0)} mm`;
    svg += `<text x="${pad + labelW + Math.max(need, rain) + 6}" y="${y + 24}" class="plan-cal-legend">${needText} · ${rainText}</text>`;
  });
  const label = lang === 'bn' ? 'পানির চাহিদা ও বৃষ্টি' : 'Water need vs rain';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" class="plan-water-svg">${svg}</svg>`;
}

// Static top-view of the planting layout: field outline with a row/dot grid
// clipped to the usable-area share. Pure SVG, no WebGL.
export function planTopViewSVG(plan, seasonKey, { lang = 'en', uid = 't1' } = {}) {
  const settings = plan?.planting?.[seasonKey];
  const outline = plan?.field?.outline;
  const width = 320, height = 220, pad = 14;
  const usable = settings ? Math.sqrt(Math.min(100, Math.max(0, settings.usableAreaPct)) / 100) : 1;
  let ring;
  if (Array.isArray(outline) && outline.length >= 3) {
    const lat = outline.reduce((sum, point) => sum + point[0], 0) / outline.length;
    const scaleX = 111195.08 * Math.cos((lat * Math.PI) / 180);
    const [originLat, originLon] = outline[0];
    ring = outline.map(([pointLat, pointLon]) => [(pointLon - originLon) * scaleX, (pointLat - originLat) * 111195.08]);
  } else {
    ring = [[0, 0], [40, 0], [40, 30], [0, 30]];
  }
  const xs = ring.map(point => point[0]), ys = ring.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const spanX = Math.max(1e-6, maxX - minX), spanY = Math.max(1e-6, maxY - minY);
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const project = ([px, py], shrink = 1) => [
    width / 2 + (px - cx) * scale * shrink, height / 2 - (py - cy) * scale * shrink,
  ];
  const inside = ([px, py]) => {
    let found = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [u, v] = ring[i], [w, z] = ring[j];
      if (v > py !== z > py && px < ((w - u) * (py - v)) / (z - v) + u) found = !found;
    }
    return found;
  };
  const dotColor = (CROP_BAR[settings?.crop] ?? CROP_BAR.rice).grow;
  const points = `${ring.map(point => project(point).map(n => n.toFixed(1)).join(',')).join(' ')}`;
  const inner = `${ring.map(point => project(point, usable).map(n => n.toFixed(1)).join(',')).join(' ')}`;
  let dots = '';
  if (settings) {
    const broadcast = settings.crop === 'mustard';
    const stepX = broadcast ? 1.2 : Math.max(0.2, settings.withinRowCm / 100);
    const stepY = broadcast ? 1.2 : Math.max(0.2, settings.rowSpacingCm / 100);
    // Thin the grid so the static view stays airy; stride keeps every nth point.
    let stride = 1;
    const estimate = (spanX / stepX) * (spanY / stepY);
    if (estimate > 220) stride = Math.ceil(Math.sqrt(estimate / 220));
    let index = 0;
    for (let gx = minX + stepX / 2; gx < maxX; gx += stepX) {
      for (let gy = minY + stepY / 2; gy < maxY; gy += stepY) {
        index++;
        if (index % stride !== 0) continue;
        const jx = broadcast ? ((index * 37) % 10) / 10 - 0.5 : 0;
        const jy = broadcast ? ((index * 53) % 10) / 10 - 0.5 : 0;
        const point = [gx + jx * stepX, gy + jy * stepY];
        if (!inside([cx + (point[0] - cx) / usable, cy + (point[1] - cy) / usable])) continue;
        const [dx, dy] = project(point);
        dots += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="1.6" fill="${dotColor}"/>`;
      }
    }
  }
  const label = lang === 'bn' ? 'জমির উপর থেকে নকশা' : 'Field layout, top view';
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}" class="plan-topview-svg"><polygon points="${points}" fill="#e9eee3" stroke="#7f8060" stroke-width="1.5"/><polygon points="${inner}" fill="#dfe8d2" stroke="#526348" stroke-width="1" stroke-dasharray="4,3"/>${dots}</svg>`;
}

// Trimmed payload for /api/plan-summary (the worker whitelists again).
export function summaryPayload(plan) {
  const outlook = outlookSummaryLine(plan.field?.id, outlookPack, state.lang);
  const flood = floodSummaryLine(plan.field?.id, floodFields, state.lang);
  return {
    mode: plan.mode,
    field: plan.field ? { id: plan.field.id, name: plan.field.name, areaHa: plan.field.areaHa } : null,
    ...(outlook ? { outlook } : {}),
    ...(flood ? { flood } : {}),
    rotation: plan.rotation ? { id: plan.rotation.id, name: plan.rotation.name,
      seasons: plan.rotation.seasons.map(season => ({ key: season.key, crop: season.crop,
        cropBn: season.cropBn, sowMonth: season.sowMonth, harvestMonth: season.harvestMonth })) } : null,
    planting: Object.fromEntries(Object.entries(plan.planting ?? {}).map(([key, settings]) =>
      [key, { crop: settings.crop, rowSpacingCm: settings.rowSpacingCm,
        withinRowCm: settings.withinRowCm, usableAreaPct: settings.usableAreaPct, counts: settings.counts }])),
  };
}

// Offline fallback when the AI summary is unavailable: plain sentences from the plan.
export function fallbackSummary(plan, lang = 'en') {
  const seasons = plan?.rotation?.seasons?.filter(season => season.crop !== 'fallow') ?? [];
  const names = seasons.map(season => cropLabel(season.crop, lang)).join(lang === 'bn' ? ', ' : ', ');
  if (lang === 'bn') {
    return `আপনার ${plan?.field?.areaHa?.toFixed(2) ?? '—'} হেক্টর জমিতে ${seasons.length}টি মৌসুমের পরিকল্পনা তৈরি: ${names}। প্রতিটি মৌসুমের বপনের মাপ ও পানির হিসাব নিচে দেওয়া আছে।`;
  }
  return `Your ${plan?.field?.areaHa?.toFixed(2) ?? '—'} ha field has a ${seasons.length}-season plan: ${names}. Spacing, counts, and water for each season are listed below.`;
}

const EXPORT_CSS = `:root{color-scheme:light}*{box-sizing:border-box}body{font-family:system-ui,'Noto Sans Bengali',sans-serif;margin:0;background:#f2f4ec;color:#233d2b;line-height:1.5}.wrap{max-width:760px;margin:0 auto;padding:16px}header.hero{background:#233d2b;color:#f2f4ec;border-radius:14px;padding:18px;margin-bottom:14px}header.hero h1{margin:0 0 4px;font-size:22px}header.hero p{margin:2px 0;color:#cfd8c6}.card{background:#fff;border:1px solid #d9e0d2;border-radius:14px;padding:14px;margin-bottom:14px}.card h2{margin:0 0 8px;font-size:17px}.scroll{overflow-x:auto;border-radius:8px}svg text{font-family:inherit}.plan-cal-month{font-size:11px;fill:#536456}.plan-cal-crop{font-size:12px;fill:#233d2b}.plan-cal-legend{font-size:12px;fill:#536456}.plan-cal-today{fill:#cfe0ef;opacity:.8}.tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.tabs button{border:1px solid #9db3a4;background:#eef3e8;color:#233d2b;border-radius:999px;padding:8px 14px;font-size:14px;cursor:pointer}.tabs button[aria-selected="true"]{background:#233d2b;color:#fff}.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.tile{background:#f6f8f1;border:1px solid #d9e0d2;border-radius:10px;padding:10px}.tile b{display:block;font-size:18px}.tile span{font-size:12px;color:#536456}label.rec{display:flex;justify-content:space-between;gap:8px;margin:6px 0;font-size:14px}label.rec input{width:90px;padding:6px;border:1px solid #9db3a4;border-radius:8px}ul.check{list-style:none;padding:0;margin:0}ul.check li{padding:7px 2px;border-bottom:1px solid #e3e8da;font-size:14px}ul.check li:last-child{border-bottom:0}.note{font-size:12px;color:#536456}.src{font-size:12px}footer{font-size:12px;color:#536456;margin:16px 0 40px}@media print{body{background:#fff}.card,header.hero{break-inside:avoid;box-shadow:none}header.hero{color:#000;background:#fff;border:1px solid #999}header.hero p{color:#333}.tabs,.no-print{display:none!important}.season-pane{display:block!important}}`;

const EXPORT_JS = `function recalc(areaHa){var panes=document.querySelectorAll('.season-pane');panes.forEach(function(pane){var crop=pane.dataset.crop;var rowEl=pane.querySelector('[data-field="row"]');var withinEl=pane.querySelector('[data-field="within"]');var usableEl=pane.querySelector('[data-field="usable"]');var row=rowEl?parseFloat(rowEl.value):20;var within=withinEl?parseFloat(withinEl.value):20;var usable=usableEl?parseFloat(usableEl.value):88;if(!(row>0))row=20;if(!(within>0))within=20;if(!(usable>0))usable=88;if(usable>100)usable=100;var net=Math.max(0,areaHa)*Math.min(100,Math.max(0,usable))/100;net*=pane.dataset.share===undefined?1:Number(pane.dataset.share)/100;var out=pane.querySelector('[data-result]');if(crop==='mustard'&&pane.dataset.source!=='ai'){out.textContent=(net*7).toFixed(1)+' kg seed · '+net.toFixed(2)+' ha usable';}else{var positions=Math.floor((net*1e4)/((row/100)*(within/100))+1e-8);out.textContent=positions.toLocaleString()+' positions · '+net.toFixed(2)+' ha usable';}});}
document.querySelectorAll('.tabs button').forEach(function(btn){btn.addEventListener('click',function(){document.querySelectorAll('.tabs button').forEach(function(b){b.setAttribute('aria-selected','false');});btn.setAttribute('aria-selected','true');document.querySelectorAll('.season-pane').forEach(function(pane){pane.hidden=pane.dataset.season!==btn.dataset.season;});});});
document.querySelectorAll('.season-pane input').forEach(function(input){input.addEventListener('input',function(){recalc(parseFloat(document.body.dataset.areaHa));});});`;

export function buildExportHTML(plan, { monthly = null, lang = 'en', nowMonth = new Date().getMonth(), sources: sourceLinks = [] } = {}) {
  const bn = lang === 'bn';
  const seasons = plan.rotation?.seasons ?? [];
  const planted = seasons.filter(season => season.crop !== 'fallow');
  const generated = (plan.plan?.generatedAt ?? plan.updatedAt ?? '').slice(0, 10);
  const title = bn ? 'আপনার পরিকল্পনা' : 'Your plan';
  const waterRows = monthly && !plan.rotation.customPlan ? planted.map(season => {
    const { needMm, rainMm } = seasonWater(monthly, season);
    return { label: cropLabel(season.crop, lang), needMm: needMm ?? 0, rainMm: rainMm ?? 0 };
  }) : [];
  const saving = waterRows.length ? rotationSavingMm(monthly, plan.rotation.id) : null;
  const panes = planted.map((season, i) => {
    const settings = plan.planting[season.key];
    const names = MONTH_EN;
    const seed = settings.source !== 'ai' && settings.crop === 'mustard';
    const span = `${names[season.sowMonth - 1]}–${names[season.harvestMonth - 1]}`;
    const total = seed
      ? `${(settings.counts.seedKg ?? 0).toFixed(1)} kg seed`
      : `${(settings.counts.plants ?? 0).toLocaleString('en-GB')} ${settings.crop === 'rice' ? 'hills' : 'positions'}`;
    return `<section class="season-pane" data-season="${esc(season.key)}" data-crop="${esc(settings.crop)}" data-source="${esc(settings.source ?? '')}" data-share="${settings.source === 'ai' ? settings.sharePct : 100}"${i > 0 ? ' hidden' : ''}>
      <h3>${esc(cropLabel(season.crop, lang))} · ${esc(span)}</h3>
      ${planTopViewSVG(plan, season.key, { lang, uid: `x${i}` })}
      <p><b data-result>${esc(total)} · ${(plan.field.areaHa * settings.usableAreaPct / 100 * (settings.source === 'ai' ? settings.sharePct / 100 : 1)).toFixed(2)} ha usable</b></p>
      ${seed ? '' : `<label class="rec">Row cm <input type="number" data-field="row" value="${settings.rowSpacingCm}" min="2"></label>
      <label class="rec">Within-row cm <input type="number" data-field="within" value="${settings.withinRowCm}" min="2"></label>`}
      <label class="rec">Usable % <input type="number" data-field="usable" value="${settings.usableAreaPct}" min="1" max="100"></label>
    </section>`;
  }).join('');
  const tabs = planted.map((season, i) =>
    `<button type="button" data-season="${esc(season.key)}" aria-selected="${i === 0}">${esc(cropLabel(season.crop, lang))}</button>`).join('');
  const checklist = deriveChecklist(plan, outlookPlanHint(plan.field?.id, outlookPack)).map(item => `<li>☐ ${esc(bn ? item.bn : item.en)}</li>`).join('');
  const embedded = JSON.stringify(plan).replaceAll('<', '\\u003c');
  const links = sourceLinks.slice(0, 8).map(source =>
    `<a href="${esc(source.url)}" target="_blank" rel="noopener">${esc(source.name || source.title || source.url)} ↗</a>`).join(' · ');
  return `<!doctype html><html lang="${bn ? 'bn' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} · Ropon Radar</title><style>${EXPORT_CSS}</style></head>
<body data-area-ha="${plan.field.areaHa}"><div class="wrap">
<header class="hero"><h1>${esc(title)} ✓</h1><p>${esc(plan.field.name)} · ${plan.field.areaHa.toFixed(2)} ha · ${esc(plan.rotation.name)}</p><p>${esc(generated)}${plan.mode === 'demo' ? ' · Demo' : ''}</p></header>
<section class="card"><h2>${bn ? 'মৌসুমের ক্যালেন্ডার' : 'Season calendar'}</h2><div class="scroll">${calendarSVG(seasons, { lang, nowMonth, uid: 'xcal' })}</div></section>
<section class="card"><h2>${bn ? 'প্রতি মৌসুমের বিন্যাস' : 'Each season'}</h2><div class="tabs" role="tablist">${tabs}</div>${panes}
<p class="note">${bn ? 'ব্যবধান বদলালে সংখ্যা আবার হিসাব হয় (অফলাইন)।' : 'Change spacing to recalculate counts (offline).'} ${bn ? 'সংখ্যা: চাষযোগ্য মিটার² ÷ (সারি × গাছের দূরত্ব)।' : 'Counts: usable m² ÷ (row × plant spacing).'}</p></section>
${waterRows.length ? `<section class="card"><h2>${bn ? 'পানি' : 'Water'} (mm)</h2><div class="scroll">${waterChartSVG(waterRows, { lang, uid: 'xw' })}</div>
<p>${saving !== null && saving > 0.5 ? esc(bn ? `ভাত–পতিত–ভাতের চেয়ে ${saving.toFixed(0)} মিমি কম সেচের ঘাটতি।` : `Saves ~${saving.toFixed(0)} mm shortfall vs rice–fallow–rice.`) : esc(bn ? 'ভাত–পতিত–ভাতের সমান পানির হিসাব।' : 'Same water as rice–fallow–rice.')}</p></section>` : ''}
<section class="card"><h2>${bn ? 'কী করবেন' : 'What to do'}</h2><ul class="check">${checklist}</ul></section>
${links ? `<section class="card src"><h2>${bn ? 'উৎস' : 'Sources'}</h2><p>${links}</p></section>` : ''}
<footer>Ropon Radar · ${esc(generated)} · ${bn ? 'অফলাইন ফাইল — ইন্টারনেট ছাড়াই খোলে।' : 'Offline file — opens without internet.'}</footer>
</div><script id="ropon-plan-json" type="application/json">${embedded}</script><script>${EXPORT_JS}</script></body></html>`;
}

export function extractPlanFromHTML(html) {
  const match = String(html ?? '').match(/<script id="ropon-plan-json" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new SyntaxError('No embedded plan found');
  return JSON.stringify(JSON.parse(match[1]));
}

export function cropGlyph(crop) {
  const shapes = {
    rice: '<path d="M12 22V5m0 8C5 13 5 8 5 6c5 0 7 3 7 7Zm0 6c7 0 7-5 7-7-5 0-7 3-7 7Z"/>',
    aman: '<path d="M12 22V5m0 8C5 13 5 8 5 6c5 0 7 3 7 7Zm0 6c7 0 7-5 7-7-5 0-7 3-7 7Z"/>',
    boro: '<path d="M12 22V5m0 8C5 13 5 8 5 6c5 0 7 3 7 7Zm0 6c7 0 7-5 7-7-5 0-7 3-7 7Z"/>',
    potato: '<path d="M12 14V4m0 6C6 10 5 6 5 3c5 0 7 3 7 7Zm0 0c6 0 7-4 7-7-5 0-7 3-7 7Z"/><ellipse cx="12" cy="19" rx="8" ry="5"/>',
    mustard: '<path d="M12 23V10m0 7-6-4m6 6 6-4"/><circle cx="12" cy="6" r="3"/>',
    mungbean: '<path d="M5 4c12 0 16 10 12 16-4 6-15-2-12-16Z"/><path d="m8 8 7 10"/>',
    fallow: '<path d="M4 18c3-6 6 2 8-4s5 2 8-4"/>',
  };
  return `<svg width="20" height="20" viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="plan-crop-glyph">${shapes[crop] ?? shapes.fallow}</svg>`;
}

function planMonthly(plan) {
  return allFields().find(item => item.id === plan?.field?.id)?.monthly ?? null;
}

function heroCard(plan) {
  const generated = plan.plan?.generatedAt;
  const ready = (plan.steps?.plan === 'done' && generated) || getReadyPlan()?.id === plan.id;
  const date = (generated ?? plan.updatedAt ?? '').slice(0, 10);
  const seasons = plan.rotation?.seasons ?? [];
  const names = state.lang === 'bn' ? MONTH_BN : MONTH_EN;
  const chips = seasons.map(season =>
    `<span class="plan-chip plan-crop-${esc(season.crop)}">${cropGlyph(season.crop)}<span><b>${esc(state.lang === 'bn' ? season.cropBn : cropLabel(season.crop, state.lang))}</b><small>${esc(names[season.sowMonth - 1])}–${esc(names[season.harvestMonth - 1])}</small></span></span>`).join('');
  return `<section class="panel plan-hero"><div class="plan-hero-top"><span class="plan-planty">${plantyMascot('happy')}</span>
    <div><div class="eyebrow">${ready ? t('Plan ready ✓', 'পরিকল্পনা তৈরি ✓') : t('Draft plan', 'খসড়া পরিকল্পনা')} · ${esc(date)}</div>
    <h2>${esc(plan.field?.name ?? t('My field', 'আমার জমি'))}</h2>
    <p>${num(plan.field?.areaHa ?? 0, 2)} ha · ${esc(plan.rotation?.name ?? '')} ${truth('SCENARIO')}</p></div></div>
    ${plan.mode === 'demo' ? `<p class="plan-demo-ribbon">${tag(t("Demo — Rahim's field", 'ডেমো — রহিমের জমি'), 'amber')}</p>` : ''}
    <div class="plan-ribbon" role="list" aria-label="${t('Rotation seasons', 'ফসলচক্রের মৌসুম')}">${chips}</div></section>`;
}

function calendarCard(plan) {
  return panel(t('Season calendar', 'মৌসুমের ক্যালেন্ডার'),
    `<div class="plan-scroll" id="plan-calendar" tabindex="0" role="region" aria-label="${t('Season calendar, scroll sideways', 'মৌসুমের ক্যালেন্ডার, পাশে স্ক্রল করুন')}">${calendarSVG(plan.rotation.seasons, { lang: state.lang, uid: 'cal' })}</div>
    <p class="note">${t('Sow, grow, and harvest months for each season. Hatched months rest.', 'প্রতি মৌসুমের বপন, বৃদ্ধি ও ফসল তোলার মাস। ডোরাকাটা মাসে জমি বিশ্রামে থাকে।')}</p>`);
}

function field3dCard(plan, activeKey) {
  const planted = (plan.rotation?.seasons ?? []).filter(season => season.crop !== 'fallow');
  const chips = planted.map(season =>
    `<button type="button" class="plan-chip${season.key === activeKey ? ' active' : ''}" data-action="plan-season3d" data-value="${esc(season.key)}" aria-pressed="${season.key === activeKey}">${cropGlyph(season.crop)}<span>${esc(state.lang === 'bn' ? season.cropBn : cropLabel(season.crop, state.lang))}</span></button>`).join('');
  return `<section class="panel plan-3d"><div class="panel-header"><h2>${t('Your field in 3D', '৩ডি-তে আপনার জমি')}</h2>${tag(t('Planting model', 'বপনের নকশা'), 'green')}</div>
    <div class="panel-body"><div class="plan-chip-row" role="group" aria-label="${t('Season to preview', 'কোন মৌসুম দেখবেন')}">${chips}</div>
    <div class="planner3d-stage-wrap plan-stage"><div class="planner3d-stage-canvas-host plan-canvas-host" tabindex="0" role="region" aria-label="${t('Field model. Drag to rotate.', 'জমির মডেল। ঘোরাতে টানুন।')}"><canvas id="plan-model" class="planner-canvas" aria-label="${t('Planting rows in 3D', '৩ডি-তে সারির নকশা')}"></canvas></div>
    <div class="planner3d-footer"><span class="planner3d-crop-chip">${t('Illustrative · rows drawn at readable scale', 'কাল্পনিক · বোঝার সুবিধায় সারি বড় করে দেখানো')}</span></div></div>
    <p class="note plan-fallback-note" hidden>${t('3D is not available here — the layout below shows the same plan.', 'এখানে ৩ডি নেই — নিচের নকশায় একই পরিকল্পনা দেখুন।')}</p>
    <div class="plan-static-layout">${planTopViewSVG(plan, activeKey, { lang: state.lang, uid: 'hero' })}</div></div></section>`;
}

export function spacingTruth(settings) {
  if (!settings) return truth('RECOMMENDED');
  if (settings.source === 'ai') return truth('SCENARIO', { source: 'AI' });
  const defaults = recommendedSettings(settings.crop);
  const isChanged = settings.custom ||
    settings.rowSpacingCm !== defaults.row ||
    settings.withinRowCm !== defaults.spacing;
  return isChanged ? truth('FARMER_REPORTED') : truth('RECOMMENDED');
}

function numbersCard(plan) {
  const planted = (plan.rotation?.seasons ?? []).filter(season => season.crop !== 'fallow');
  const tiles = planted.map(season => {
    const settings = plan.planting[season.key];
    const seed = settings.source !== 'ai' && settings.crop === 'mustard';
    const total = seed ? settings.counts.seedKg : settings.counts.plants;
    const unit = seed ? t('kg seed', 'কেজি বীজ') : settings.crop === 'rice' ? t('hills', 'গোছা') : t('plants', 'গাছ');
    const usableHa = plan.field.areaHa * settings.usableAreaPct / 100 * (settings.source === 'ai' ? settings.sharePct / 100 : 1);
    return `<div class="plan-tile"><b>${esc(state.lang === 'bn' ? season.cropBn : cropLabel(season.crop, state.lang))}</b>
      <strong><span data-plan-count="${total ?? 0}" data-places="${seed ? 1 : 0}">${num(total ?? 0, seed ? 1 : 0)}</span> <small>${unit}</small></strong> ${truth('SCENARIO')}
      <span>${seed ? t('Broadcast · no rows', 'ছিটিয়ে বপন · সারি নেই') : `${num(settings.rowSpacingCm)}×${num(settings.withinRowCm)} cm`} ${spacingTruth(settings)}</span>
      <span>${num(usableHa, 2)} ha ${t('usable', 'চাষযোগ্য')} ${truth('SCENARIO')}</span></div>`;
  }).join('');
  const monthly = planMonthly(plan);
  let water = '';
  if (monthly && !plan.rotation.customPlan) {
    const rows = planted.map(season => {
      const { needMm, rainMm } = seasonWater(monthly, season);
      return { label: state.lang === 'bn' ? season.cropBn : cropLabel(season.crop, state.lang), needMm: needMm ?? 0, rainMm: rainMm ?? 0 };
    });
    const saving = rotationSavingMm(monthly, plan.rotation.id);
    water = `<h3>${t('Water per season (mm)', 'প্রতি মৌসুমে পানি (মিমি)')} ${nasaBadge(['imerg', 'eto'])}</h3>
      <div class="plan-scroll" tabindex="0" role="region" aria-label="${t('Water chart, scroll sideways', 'পানির চার্ট, পাশে স্ক্রল করুন')}">${waterChartSVG(rows, { lang: state.lang, uid: 'main' })}</div>
      <p>${saving !== null && saving > 0.5
        ? `${t('Saves', 'বাঁচে')} <b>~${num(saving, 0)} mm</b> ${t('shortfall vs rice–fallow–rice', 'ঘাটতি ভাত–পতিত–ভাতের চেয়ে কম')} ${truth('MODELED', { source: 'IMERG/POWER FAO-56', date: '2024' })}`
        : `${t('Same water as rice–fallow–rice', 'ভাত–পতিত–ভাতের সমান পানি')} ${truth('MODELED', { source: 'IMERG/POWER FAO-56', date: '2024' })}`}</p>`;
  }
  return `<section class="panel"><div class="panel-header"><h2>${t('Your numbers', 'আপনার সংখ্যা')}</h2></div>
    <div class="panel-body"><div class="plan-tiles">${tiles}</div>${water}</div></section>`;
}

function checklistCard(plan) {
  const done = plan.checklist ?? {};
  const items = deriveChecklist(plan, outlookPlanHint(plan.field?.id, outlookPack)).map(item =>
    `<li><label><input type="checkbox" data-check="${esc(item.id)}"${done[item.id] ? ' checked' : ''}${getPlan() ? '' : ' disabled'}><span>${esc(t(item.en, item.bn))}</span></label></li>`).join('');
  return `<section class="panel"><div class="panel-header"><h2>${t('What to do, step by step', 'ধাপে ধাপে কী করবেন')}</h2></div>
    <div class="panel-body"><ul class="plan-check" id="plan-checklist">${items}</ul></div></section>`;
}

function summaryCard() {
  return `<section class="panel"><div class="panel-header"><h2>${t("Planty's summary", 'Planty-এর সারসংক্ষেপ')}</h2></div>
    <div class="panel-body"><div class="plan-summary" id="plan-summary-body" role="status" aria-live="polite"><div class="plan-skeleton" aria-hidden="true"><span></span><span></span><span></span></div></div>
    <p class="note">${t('AI summary — check with your extension officer', 'এআই সারসংক্ষেপ — কৃষি কর্মকর্তার পরামর্শ নিন')}</p></div></section>`;
}

function editCard(plan) {
  const planted = (plan.rotation?.seasons ?? []).filter(season => season.crop !== 'fallow');
  const seasons = planted.map(season =>
    `<button type="button" class="plan-chip" data-action="plan-edit-season" data-value="${esc(season.key)}">${cropGlyph(season.crop)}<span>${esc(state.lang === 'bn' ? season.cropBn : cropLabel(season.crop, state.lang))}</span></button>`).join('');
  return `<section class="panel"><div class="panel-header"><h2>${t('Edit', 'বদলান')}</h2></div>
    <div class="panel-body"><div class="plan-chip-row">
    <a class="plan-chip" href="#field">${t('Edit field', 'জমি বদলান')}</a>
    <a class="plan-chip" href="#rotations">${t('Edit rotation', 'ফসলচক্র বদলান')}</a>${seasons}</div></div></section>`;
}

function exportCard() {
  return `<section class="panel"><div class="panel-header"><h2>${t('Keep your plan', 'পরিকল্পনা রাখুন')}</h2></div>
    <div class="panel-body plan-export"><div class="plan-chip-row">
    ${button(t('Download plan (.html)', 'পরিকল্পনা ডাউনলোড (.html)'), 'plan-download', 'primary', 'download').replace('<button ', '<button id="plan-download" ')}
    ${button(t('Print / Save as PDF', 'ছাপুন / PDF'), 'plan-print', '', 'print')}
    <label class="button plan-import">${t('Continue later', 'পরে চালিয়ে যান')}<input type="file" data-plan-import accept=".html,.json,application/json,text/html" hidden></label></div>
    <p class="note">${t('The file works offline. Open it anytime, or load it back here.', 'ফাইলটি অফলাইনে খোলে। যেকোনো সময় খুলুন, বা এখানে আবার লোড করুন।')}</p></div></section>`;
}

export function importControl() {
  return `<label class="button plan-import">${t('Continue later', 'পরে চালিয়ে যান')}<input type="file" data-plan-import accept=".html,.json,application/json,text/html" hidden></label>`;
}

function emptyPlan() {
  return header(
    t('Your plan  /  04', 'আপনার পরিকল্পনা  /  ০৪'),
    t('Your plan', 'আপনার পরিকল্পনা'),
    t('Your finished season plan will live here.', 'আপনার চূড়ান্ত পরিকল্পনা এখানে থাকবে।'),
  ) + `<section class="panel plan-empty"><div class="plan-empty-inner"><span class="plan-planty">${plantyMascot('happy')}</span>
    <div><h2>${t('No plan yet', 'এখনও পরিকল্পনা নেই')}</h2>
    <p>${t('Pick a field, choose a rotation, and set planting. It takes a few minutes.', 'জমি বেছে নিন, ফসলচক্র ঠিক করুন, বপনের মাপ দিন। কয়েক মিনিট লাগবে।')}</p>
    <p class="plan-chip-row"><a class="button primary" href="#field">${t('Start my plan', 'পরিকল্পনা শুরু করুন')}</a>${importControl()}</p></div></div></section>`;
}

let active3dKey = null;

export function plan() {
  const current = displayPlan();
  if (!current?.field || !current?.rotation) return emptyPlan();
  const planted = current.rotation.seasons.filter(season => season.crop !== 'fallow');
  if (!planted.some(season => season.key === active3dKey)) active3dKey = planted[0]?.key ?? null;
  const backLink = `<div class="plan-back-bar"><a class="button ghost plan-back-link" href="#plans">← ${t('My plans', 'আমার পরিকল্পনা')}</a>${!getPlan() ? `<button type="button" class="button primary" data-action="plan-edit">${t('Edit this plan', 'এই পরিকল্পনা বদলান')}</button>` : ''}</div>`;
  return `<div class="plan-page">${backLink}` + header(
    t('Your plan  /  04', 'আপনার পরিকল্পনা  /  ০৪'),
    t('Your plan', 'আপনার পরিকল্পনা'),
    t('Your finished season plan — numbers, steps, and file.', 'আপনার চূড়ান্ত পরিকল্পনা — সংখ্যা, ধাপ ও ফাইল।'),
  ) + heroCard(current) + calendarCard(current) + field3dCard(current, active3dKey) +
    numbersCard(current) + checklistCard(current) + summaryCard() + (getPlan() ? editCard(current) : '') + exportCard() + `</div>`;
}

export async function fetchPlanSummary(plan, lang) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('/api/plan-summary', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: summaryPayload(plan), lang }), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok || typeof data?.summary !== 'string' || !data.summary.trim()) throw new Error('unavailable');
    return data.summary.trim();
  } finally {
    clearTimeout(timeout);
  }
}

function tweenCounts(host) {
  const nodes = [...host.querySelectorAll('[data-plan-count]')];
  if (!nodes.length) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const start = performance.now(), duration = 900;
  const frame = now => {
    const progress = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    for (const node of nodes) {
      const target = Number(node.dataset.planCount);
      const places = Number(node.dataset.places ?? 0);
      node.textContent = num(target * eased, places);
    }
    if (progress < 1 && host.isConnected) requestAnimationFrame(frame);
    else for (const node of nodes) node.textContent = num(Number(node.dataset.planCount), Number(node.dataset.places ?? 0));
  };
  requestAnimationFrame(frame);
}

let planner3dModule = null;
let planner3dPromise = null;
let soilProfilePromise = null;
let planTimer = null;
let planHost = null;
let planVersion = 0;
let summaryRequest = 0;

function hasWebGL() {
  try {
    const probe = document.createElement('canvas');
    const context = window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl'));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function planFieldInput(current) {
  const found = allFields().find(item => item.id === current.field.id);
  const outline = current.field.outline ?? polygon();
  return {
    field: found ?? { id: current.field.id, name: current.field.name, lat: 25.54, lon: 89.27 },
    polygon: Array.isArray(outline) && outline.length >= 3 ? outline : polygon(),
  };
}

function schedulePlan3d() {
  clearTimeout(planTimer);
  const version = ++planVersion;
  const host = planHost;
  const current = displayPlan();
  if (!host || !current?.field) return;
  if (!planner3dModule && !hasWebGL()) {
    const wrap = host.closest('.planner3d-stage-wrap');
    if (wrap) wrap.hidden = true;
    host.closest('.panel-body')?.querySelector('.plan-fallback-note')?.removeAttribute('hidden');
    return;
  }
  planTimer = setTimeout(async () => {
    try {
      planner3dPromise ||= import('./planner3d.js').catch(error => { planner3dPromise = null; throw error; });
      soilProfilePromise ||= fetch('data/soil-profile.json')
        .then(response => response.ok ? response.json() : null).catch(() => null);
      const [mod, soilProfile] = await Promise.all([planner3dPromise, soilProfilePromise]);
      planner3dModule = mod;
      if (version !== planVersion || !host.isConnected || host !== planHost) return;
      const fresh = displayPlan();
      const settings = fresh.planting[active3dKey];
      if (!settings) return;
      const { field: planField, polygon: outline } = planFieldInput(fresh);
      await mod.mountPlanner3d(host, {
        field: planField, polygon: outline, rotationId: fresh.rotation.id, agronomy, soilProfile,
        ...(fresh.rotation.customPlan ? { custom: { ...fresh.rotation.customPlan, planting: [{ ...settings, sharePct: 100 }] } } : {}),
        planner: { crop: settings.crop, row: settings.rowSpacingCm, spacing: settings.withinRowCm, usable: settings.usableAreaPct },
        net: { inputs: fresh.field.netInputs ?? netInputsFor(fresh.field.id),
          edited: fresh.field.netEdited ?? isNetEdited(fresh.field.id) },
      });
    } catch (error) {
      if (version !== planVersion) return;
      const wrap = host.closest('.planner3d-stage-wrap');
      if (wrap) wrap.hidden = true;
      host.closest('.panel-body')?.querySelector('.plan-fallback-note')?.removeAttribute('hidden');
    }
  }, 120);
}

export function disposePlan() {
  ++planVersion;
  ++summaryRequest;
  clearTimeout(planTimer);
  planTimer = null;
  planHost = null;
  planner3dModule?.disposePlanner3d();
}

function maybeCelebrate(current) {
  try {
    const key = 'ropon_plan_guide_v1';
    if (localStorage.getItem(key) === current.id) return;
    localStorage.setItem(key, current.id);
  } catch { return; }
  guide.celebrate(t('Your plan is ready!', 'আপনার পরিকল্পনা তৈরি!'));
  setTimeout(() => {
    if (!document.querySelector('.plan-page')) return;
    guide.sequence([
      { target: '#plan-calendar', text: t('Your seasons, month by month', 'মাস অনুযায়ী আপনার মৌসুম') },
      { target: '#plan-checklist', text: t('Tick off each step as you go', 'কাজ শেষে প্রতিটি ধাপে টিক দিন') },
      { target: '#plan-download', text: t('Keep an offline copy', 'অফলাইন কপি রাখুন') },
    ]);
  }, 3100);
}

export function mountPlan() {
  const current = displayPlan();
  if (!current?.field || !current?.rotation) return;
  try {
    const statuses = stepStatus();
    if (getPlan() && statuses.plan !== 'done' && statuses.field === 'done' && statuses.rotation === 'done' && statuses.planting === 'done') {
      markPlanGenerated({});
    }
  } catch (error) {
    console.warn('Plan could not be marked ready', error);
  }
  tweenCounts(document.querySelector('.plan-page') ?? document);
  const host = document.querySelector('#plan-model')?.parentElement;
  if (host) {
    planHost = host;
    schedulePlan3d();
  }
  const body = document.querySelector('#plan-summary-body');
  if (body) {
    const request = ++summaryRequest;
    const fresh = displayPlan();
    fetchPlanSummary(fresh, state.lang).then(
      summary => { if (request === summaryRequest && body.isConnected) body.innerHTML = `<p>${esc(summary)}</p>`; },
      () => { if (request === summaryRequest && body.isConnected) body.innerHTML = `<p>${esc(fallbackSummary(fresh, state.lang))}</p><p class="note">${esc(t('Offline note — AI unavailable', 'অফলাইন নোট — এআই নেই'))}</p>`; },
    );
  }
  if (getPlan()) maybeCelebrate(current);
}

export function planAction(action, value) {
  if (action === 'plan-edit') {
    if (editReadyPlan()) location.hash = 'planner';
  } else if (action === 'plan-season3d') {
    const current = displayPlan();
    if (!current?.planting[value]) return;
    active3dKey = value;
    document.querySelectorAll('[data-action="plan-season3d"]').forEach(chip => {
      const on = chip.dataset.value === value;
      chip.classList.toggle('active', on);
      chip.setAttribute('aria-pressed', String(on));
    });
    const layout = document.querySelector('.plan-static-layout');
    if (layout) layout.innerHTML = planTopViewSVG(current, value, { lang: state.lang, uid: 'hero' });
    schedulePlan3d();
  } else if (action === 'plan-edit-season') {
    if (!getPlan()) return;
    setPlannerSeason(value);
    location.hash = 'planner';
  } else if (action === 'plan-download') {
    const current = displayPlan();
    if (!current) return;
    const html = buildExportHTML(current, {
      monthly: planMonthly(current), lang: state.lang,
      sources: [...(earth?.sources ?? []), ...(agronomy?.sources ?? [])],
    });
    const slug = (current.field.name ?? 'field').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'field';
    download(`ropon-plan-${slug}.html`, html, 'text/html');
    toast(t('Plan downloaded — opens offline', 'পরিকল্পনা ডাউনলোড হয়েছে — অফলাইনে খোলে'));
  } else if (action === 'plan-print') {
    window.print();
  }
}

export function planChange(element) {
  if (element?.matches?.('[data-plan-import]')) {
    const file = element.files?.[0];
    element.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const json = /ropon-plan-json/.test(text) ? extractPlanFromHTML(text) : text;
        importPlanJSON(json);
        toast(t('Plan loaded', 'পরিকল্পনা লোড হয়েছে'));
        if (location.hash !== '#plan') location.hash = 'plan';
        else repaint();
      } catch {
        toast(t('That file is not a Ropon plan', 'এই ফাইলটি রোপণ পরিকল্পনা নয়'));
      }
    };
    reader.readAsText(file);
    return true;
  }
  if (element?.matches?.('[data-check]')) {
    const current = getPlan();
    if (!current) return true;
    const checklist = { ...(current.checklist ?? {}), [element.dataset.check]: element.checked };
    try {
      importPlanJSON(JSON.stringify({ ...current, checklist }));
    } catch (error) {
      console.warn('Checklist could not be saved', error);
    }
    return true;
  }
  return false;
}
