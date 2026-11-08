import {
  state,
  t,
  esc,
  num,
  field,
  fieldName,
  area,
  profile,
  monthName,
  timeline,
  sources,
  button,
  modal,
} from './ui.js';
import { rotationEvidence, STRATEGIES, PLANTING, capacity } from './engine.js';

function fieldReport() {
  const f = field(),
    p = profile(),
    m = f.monthly[state.month],
    saved = state.plans.filter((r) => r.fieldId === f.id).at(-1);
  const suggestion = rotationEvidence(f.monthly, state.weights, p)[0];
  const r = saved
    ? STRATEGIES.find((r) => r.id === saved.rotation)
    : suggestion;
  const weights = saved?.weights || state.weights,
    options = saved?.constraints || p;
  const s = state.planner,
    layout = capacity(
      area(),
      s.usable,
      s.crop,
      s.crop === 'mustard' ? 0 : s.row / 100,
      s.crop === 'mustard' ? 0 : s.spacing / 100
    );
  const today = new Intl.DateTimeFormat(
    state.lang === 'bn' ? 'bn-BD' : 'en-GB',
    { dateStyle: 'medium', timeZone: 'Asia/Dhaka' }
  ).format(new Date());
  const crop = PLANTING[s.crop];
  const conditions = saved?.conditions || suggestion.issues;
  const html = `<div class="eyebrow">ROPON RADAR / ${esc(today)}</div><h2>${esc(fieldName())} · ${num(area(), 2)} ha</h2><p class="note">${t('Boundary', 'সীমানা')} · ${state.boundaries[f.id] ? t('Farmer drawn', 'কৃষকের আঁকা') : t('Demo outline', 'নমুনা সীমানা')} · ${esc(f.lat)}° N, ${esc(f.lon)}° E</p><div class="report-section"><h3>${saved ? t('Saved rotation', 'সংরক্ষিত চক্র') : t('Current comparison leader', 'বর্তমান তুলনার প্রথম চক্র')}</h3><p>${esc(t(r.crops.join(' → '), r.bnCrops.join(' → ')))} · ${num(saved ? saved.score : suggestion.score)} / 100</p>${timeline(r.months)}<p class="note">${t('Weights · water / soil / cost / risk', 'ওজন · পানি / মাটি / খরচ / ঝুঁকি')} ${weights.water} / ${weights.soil} / ${weights.cost} / ${weights.risk}. ${t('Expected Aman harvest', 'সম্ভাব্য আমন কাটার দিন')} ${esc(options.harvest)}. ${t('Disruption delay', 'দুর্যোগে দেরি')} ${num(options.floodDays)} d.</p>${conditions.length ? `<p class="notice amber">${conditions.map(esc).join(' ')}</p>` : ''}</div>
 <div class="report-section"><h3>${t('Historical field context', 'এলাকার পুরনো তথ্য')}</h3><p>${monthName()} 2024 · ${t('IMERG rain', 'IMERG বৃষ্টি')} ${num(m.rainGpm, 1)} mm · ${t('POWER surface wetness index', 'POWER পৃষ্ঠের আর্দ্রতা সূচক')} ${num(m.wetness, 2)} · ETo ${num(m.et0, 1)} mm.</p></div><div class="report-section"><h3>${t('Planting layout', 'বপনের হিসাব')}</h3><p>${esc(t(crop.label, crop.bn))} · ${num(layout.net, 2)} ha · ${s.crop === 'mustard' ? num(layout.seedKg, 1) + ' kg ' + t('seed', 'বীজ') : num(layout.positions) + ' ' + t(crop.unit, crop.bn)}.</p><p class="note">${t('Illustrative harvest if published trial yield is reached', 'গবেষণার ফলন পাওয়া গেলে আনুমানিক ফসল')} ${num(layout.low, 1)}–${num(layout.high, 1)} t. ${t('Verify spacing, water access and market before planting.', 'বপনের আগে দূরত্ব, পানি ও বাজার যাচাই করুন।')}</p></div>
 <div class="report-section"><h3>${t('Evidence', 'তথ্যসূত্র')}</h3><p class="note">${sources(['power', 'gpm', 'fao56', r.id === 'legume' ? 'islam2014' : 'hossain2022', 'barc-frg2024'])}</p></div>`;
  modal(
    t('Printable field plan', 'ছাপার জন্য জমির পরিকল্পনা'),
    `<article id="report-content">${html}</article><div class="spacer"></div>${button(t('Print or save as PDF', 'ছাপুন বা PDF রাখুন'), 'print-report', 'primary', 'print')}`
  );
}
function printReport() {
  const output = document.createElement('article');
  output.className = 'paper-report';
  output.innerHTML = document.querySelector('#report-content').innerHTML;
  document.body.append(output);
  document.body.classList.add('print-report');
  const clean = () => {
    output.remove();
    document.body.classList.remove('print-report');
  };
  window.addEventListener('afterprint', clean, { once: true });
  window.print();
}

export { fieldReport, printReport };
