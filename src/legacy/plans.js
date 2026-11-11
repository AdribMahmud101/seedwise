import {
  state, earth, agronomy, t, esc, num,
  header, button, toast, repaint, download, promptModal,
} from './ui.js';
import {
  listPlans, getSavedPlan, savePlan, openPlan, renamePlan,
  duplicatePlan, deletePlan, migrateActivePlanOnce,
} from './journey.js';
import { plantyMascot } from './planty.js';
import { guide } from './planty-guide.js';
import { buildExportHTML, cropGlyph, cropLabel } from './plan.js';

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_BN = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const CROP_BAR = {
  aman: '#35702b', rice: '#35702b', boro: '#2b5f70',
  mustard: '#6b7a2b', potato: '#33571f', mungbean: '#3d702f', fallow: '#b8ab93',
};

function planMonths(season) {
  const months = [];
  let m = season.sowMonth;
  for (let i = 0; i < 12; i++) {
    months.push(m - 1);
    if (m === season.harvestMonth) break;
    m = (m % 12) + 1;
  }
  return months;
}

export function miniSeasonCalendarSVG(seasons = [], { lang = 'en', uid = 'mcal' } = {}) {
  const width = 240, height = 28, pad = 2;
  const colW = (width - pad * 2) / 12;
  const barH = 14;
  let svg = '';
  // Month grid subtle cells
  for (let m = 0; m < 12; m++) {
    const x = pad + m * colW;
    svg += `<rect x="${x}" y="${pad}" width="${colW - 1}" height="${barH}" fill="#f0efe9" rx="2"/>`;
  }
  // Season fills
  seasons.forEach((season) => {
    const months = planMonths(season);
    const color = CROP_BAR[season.crop] || '#4f9a3d';
    months.forEach((m) => {
      const x = pad + m * colW;
      svg += `<rect x="${x}" y="${pad}" width="${colW - 1}" height="${barH}" fill="${color}" rx="2"><title>${esc(lang === 'bn' ? season.cropBn : cropLabel(season.crop, lang))}: ${m + 1}</title></rect>`;
    });
  });
  // Month initials line
  const initials = lang === 'bn' ? MONTH_BN : MONTH_EN;
  for (let m = 0; m < 12; m += 2) {
    const x = pad + m * colW + colW / 2;
    svg += `<text x="${x}" y="${pad + barH + 9}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc(initials[m][0])}</text>`;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(lang === 'bn' ? 'মৌসুমের রেখাচিত্র' : 'Season strip')}" class="mini-cal-svg">${svg}</svg>`;
}

export function plans() {
  migrateActivePlanOnce();
  const list = listPlans();
  const highlightedId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ropon_highlight_plan_id') : null;
  const eyebrow = t('My plans  /  04', 'আমার পরিকল্পনা  /  ০৪');
  const title = t('My plans', 'আমার পরিকল্পনা');
  const desc = t('All your saved and draft season plans.', 'আপনার সকল সংরক্ষিত ও খসড়া মৌসুম পরিকল্পনা।');

  if (!list.length) {
    return `<div class="plans-page">` +
      header(eyebrow, title, desc) +
      `<section class="panel plans-empty"><div class="plans-empty-inner">
        <span class="plans-planty">${plantyMascot('happy')}</span>
        <div>
          <h2>${t('No plans yet', 'এখনও পরিকল্পনা নেই')}</h2>
          <p>${t('Choose your field, compare rotations, and build a season plan.', 'জমি বেছে নিন, ফসলচক্র তুলনা করুন এবং মৌসুমের পরিকল্পনা তৈরি করুন।')}</p>
          <p class="plans-empty-actions">
            <button type="button" class="button primary" data-journey="own">${t('Plan my season', 'আমার মৌসুমের পরিকল্পনা')}</button>
          </p>
        </div>
      </div></section></div>`;
  }

  const cardsHtml = list.map((entry) => {
    const p = entry.plan;
    const isReady = entry.status === 'ready';
    const isHighlighted = highlightedId === entry.id;
    const dateStr = (entry.updatedAt || '').slice(0, 10);
    const seasons = p.rotation?.seasons ?? [];
    const names = state.lang === 'bn' ? MONTH_BN : MONTH_EN;
    const chips = seasons.map(season =>
      `<span class="plan-chip plan-chip--compact plan-crop-${esc(season.crop)}">${cropGlyph(season.crop)}<span><b>${esc(state.lang === 'bn' ? season.cropBn : cropLabel(season.crop, state.lang))}</b><small>${esc(names[season.sowMonth - 1])}–${esc(names[season.harvestMonth - 1])}</small></span></span>`).join('');

    return `
      <article class="plan-card ${isHighlighted ? 'plan-card--highlighted' : ''}" data-plan-id="${esc(entry.id)}" data-plan-status="${esc(entry.status)}">
        <div class="plan-card-head">
          <div class="plan-card-titles">
            <div class="plan-card-status-row">
              <span class="plan-status-badge ${isReady ? 'plan-status-badge--ready' : 'plan-status-badge--draft'}">
                ${isReady ? t('Ready ✓', 'তৈরি ✓') : t('Draft', 'খসড়া')}
              </span>
              <span class="plan-card-date">${esc(dateStr)}</span>
            </div>
            <h3 class="plan-card-title">${esc(entry.name)}</h3>
            ${p.field ? `<p class="plan-card-meta">${esc(p.field.name)} · ${num(p.field.areaHa, 2)} ha</p>` : ''}
          </div>
        </div>
        <div class="plan-card-chips" role="list">${chips}</div>
        <div class="plan-card-calendar">
          ${miniSeasonCalendarSVG(seasons, { lang: state.lang, uid: `cal-${entry.id}` })}
        </div>
        <div class="plan-card-actions">
          <button type="button" class="button primary plan-open-btn ${isHighlighted ? 'journey-cta-pulse' : ''}" data-plans-action="open" data-plan-id="${esc(entry.id)}">
            ${isReady ? t('Open plan →', 'পরিকল্পনা দেখুন →') : t('Resume draft →', 'খসড়া চালু করুন →')}
          </button>
          <button type="button" class="button ghost" data-plans-action="rename" data-plan-id="${esc(entry.id)}" title="${t('Rename', 'নাম বদলান')}">${t('Rename', 'নাম বদলান')}</button>
          <button type="button" class="button ghost" data-plans-action="duplicate" data-plan-id="${esc(entry.id)}" title="${t('Duplicate', 'অনুলিপি')}">${t('Duplicate', 'অনুলিপি')}</button>
          <button type="button" class="button ghost" data-plans-action="download" data-plan-id="${esc(entry.id)}" title="${t('Download', 'ডাউনলোড')}">${t('Download', 'ডাউনলোড')}</button>
          <button type="button" class="button ghost plan-delete-btn" data-plans-action="delete" data-plan-id="${esc(entry.id)}" style="color:#b0452b;" title="${t('Delete', 'মুছুন')}">${t('Delete', 'মুছুন')}</button>
        </div>
      </article>
    `;
  }).join('');

  return `<div class="plans-page">` +
    header(eyebrow, title, desc, `<button type="button" class="button primary" data-journey="own">+ ${t('New plan', 'নতুন পরিকল্পনা')}</button>`) +
    `<div class="plans-grid">${cardsHtml}</div></div>`;
}

export function mountPlans() {
  const highlightedId = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('ropon_highlight_plan_id') : null;
  if (highlightedId) {
    sessionStorage.removeItem('ropon_highlight_plan_id');
    const card = document.querySelector(`.plan-card[data-plan-id="${highlightedId}"]`);
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      guide.celebrate(t('Your plan is saved!', 'আপনার পরিকল্পনা সংরক্ষিত হয়েছে!'));
      guide.hint(card, t('Here is your plan. Click Open to view it.', 'এই আপনার পরিকল্পনা। দেখতে ‘পরিকল্পনা দেখুন’ চাপুন।'));
    }
  }
}

export function disposePlans() {}

export function plansAction(action, value) {
  if (action === 'open') {
    const entry = getSavedPlan(value);
    if (!entry) return;
    openPlan(value);
    if (entry.status === 'ready') {
      location.hash = 'plan';
    } else {
      // Draft: resume at its next step
      const steps = ['field', 'rotation', 'planting', 'plan'];
      const routeMap = { field: 'field', rotation: 'rotations', planting: 'planner', plan: 'plan' };
      const next = steps.find(s => entry.plan.steps[s] !== 'done') || 'planner';
      location.hash = routeMap[next] || next;
    }
  } else if (action === 'rename') {
    const entry = getSavedPlan(value);
    if (!entry) return;
    promptModal(
      t('Rename plan', 'পরিকল্পনার নাম পরিবর্তন'),
      t('Enter a new name for this plan:', 'এই পরিকল্পনার একটি নতুন নাম লিখুন:'),
      entry.name,
      (newName) => {
        if (newName && newName.trim()) {
          renamePlan(value, newName.trim());
          toast(t('Plan renamed', 'পরিকল্পনার নাম পরিবর্তিত হয়েছে'));
          repaint();
        }
      }
    );
  } else if (action === 'duplicate') {
    const dup = duplicatePlan(value);
    if (dup) {
      toast(t('Plan duplicated', 'পরিকল্পনার অনুলিপি তৈরি হয়েছে'));
      repaint();
    }
  } else if (action === 'download') {
    const entry = getSavedPlan(value);
    if (!entry) return;
    const p = entry.plan;
    const monthly = earth?.fields?.find(item => item.id === p.field?.id)?.monthly ?? null;
    const html = buildExportHTML(p, {
      monthly,
      lang: state.lang,
      sources: [...(earth?.sources ?? []), ...(agronomy?.sources ?? [])],
    });
    const slug = (entry.name || 'plan').toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-+|-+$/g, '') || 'plan';
    download(`ropon-plan-${slug}.html`, html, 'text/html');
    toast(t('Plan downloaded — opens offline', 'পরিকল্পনা ডাউনলোড হয়েছে — অফলাইনে খোলে'));
  } else if (action === 'delete') {
    const entry = getSavedPlan(value);
    if (!entry) return;
    const confirmed = confirm(t(`Are you sure you want to delete "${entry.name}"?`, `আপনি কি নিশ্চিত যে "${entry.name}" মুছে ফেলতে চান?`));
    if (confirmed) {
      deletePlan(value);
      toast(t('Plan deleted', 'পরিকল্পনা মুছে ফেলা হয়েছে'));
      repaint();
    }
  }
}
