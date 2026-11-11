import {
  nasaBadge,
  recordId,
  state,
  agronomy,
  persist,
  t,
  esc,
  num,
  field,
  fieldName,
  cropName,
  icon,
  button,
  header,
  panel,
  tag,
  truth,
  chips,
  input,
  select,
  sources,
  tabs,
  monthControl,
  toast,
  repaint,
  modal,
  close,
  download,
  csv,
  chart,
  stateEmpty,
} from './ui.js';
import { mean, pairedQA } from './engine.js';

let qaMode = 'totals',
  opticalIndex = 0;
const kinds = [
  ['harvest', 'Variety & harvest', 'জাত ও ফলন'],
  ['soil', 'Soil test', 'মাটি পরীক্ষা'],
  ['rain', 'Rain gauge', 'বৃষ্টিমাপক'],
  ['moisture', 'Soil moisture', 'মাটির আর্দ্রতা'],
  ['clinic', 'Crop observation', 'ফসল পর্যবেক্ষণ'],
];
function kindLabel(kind) {
  const k = kinds.find((x) => x[0] === kind);
  return k ? t(k[1], k[2]) : kind;
}
function research() {
  const selected = state.tabs.research;
  return (
    header(
      t('Research tools  /  07', 'গবেষণার সরঞ্জাম  /  ০৭'),
      t('Research lab', 'গবেষণাগার'),
      t(
        'Inspect the satellite record and connect it to observations from the field.',
        'স্যাটেলাইটের তথ্য যাচাই করুন এবং মাঠের পর্যবেক্ষণের সঙ্গে তুলনা করুন।'
      ),
      button(
        t('Add observation', 'পর্যবেক্ষণ যোগ করুন'),
        'new-record',
        'primary',
        'add'
      )
    ) +
    chips() +
    tabs('research', [
      ['qa', t('Sensor QA', 'তথ্য যাচাই')],
      ['log', t('Field log', 'মাঠের খাতা')],
      ['trials', t('Trial evidence', 'গবেষণার প্রমাণ')],
    ]) +
    (selected === 'log'
      ? logView()
      : selected === 'trials'
        ? trialView()
        : qaView())
  );
}
function indicator(title, value, foot) {
  return `<article class="research-stat"><div class="eyebrow">${esc(title)} ${nasaBadge(["power", "imerg"])}</div><strong>${esc(value)}</strong><span>${esc(foot)}</span>${truth('MODELED', { source: 'Paired daily QA' })}</article>`;
}
function qaView() {
  const f = field(),
    q = f.qa,
    epochs = f.opticalHistory || [],
    epoch = epochs[opticalIndex],
    base = f.imagery[0];
  const im = epoch
    ? {
        ...base,
        ...epoch,
        ndvi: epoch.opticalQA.ndvi,
        validFraction: epoch.opticalQA.validFraction,
        qualityNote:
          t('Fixed 900 m window.', '৯০০ মিটারের নির্দিষ্ট জানালা।') +
          ' ' +
          num(epoch.opticalQA.validPixels) +
          ' / ' +
          num(epoch.opticalQA.pixels) +
          ' ' +
          t('samples passed QA.', 'টি পিক্সেল যাচাইয়ে উত্তীর্ণ।'),
      }
    : base;
  const period = field().daily,
    monthly = f.monthly,
    monthPairs = monthly.map((m) =>
      pairedQA(period.filter((d) => d.date.startsWith(m.month)))
    );
  const series =
    qaMode === 'totals'
      ? [
          {
            label: 'POWER',
            values: monthly.map((m) => m.rainPower),
            color: '#828a54',
          },
          {
            label: 'GPM IMERG',
            values: monthly.map((m) => m.rainGpm),
            color: '#4d7c8d',
          },
        ]
      : [
          {
            label: t('Mean daily difference', 'দৈনিক গড় পার্থক্য'),
            values: monthPairs.map((m) => m.meanDifference),
            color: '#4d7c8d',
          },
        ];
  const ground = compareGauges();
  const imgMeasure = im?.opticalQA || im?.qualityMetrics || {};
  const cloud = Number.isFinite(imgMeasure.cloudMaskLoss)
    ? imgMeasure.cloudMaskLoss
    : Number.isFinite(im?.cloudMaskLoss)
      ? im.cloudMaskLoss
      : null;
  return `<div class="research-stats">${indicator(t('Matched daily pairs', 'একই দিনের জোড়া'), num(q.pairedDays), '2024 · UTC')}${indicator(t('Mean difference', 'গড় পার্থক্য'), `${num(q.meanDifferenceMm, 2)} mm`, t('POWER minus IMERG per day', 'দৈনিক POWER থেকে IMERG বাদ'))}${indicator(t('Mean absolute gap', 'গড় পরম ব্যবধান'), `${num(q.maeMm, 2)} mm`, t('Paired days only', 'শুধু একই দিনের যুগল'))}</div>
 <div class="grid-two">${panel(
   t('Rainfall comparison', 'বৃষ্টির তুলনা'),
   `<div class="segmented">${[
     ['totals', t('Monthly totals', 'মাসিক মোট')],
     ['spread', t('Difference band', 'পার্থক্যের বিস্তার')],
   ]
     .map(
       ([id, label]) =>
         `<button class="${qaMode === id ? 'active' : ''}" data-action="qa-mode" data-value="${id}">${label}</button>`
     )
     .join(
       ''
     )}</div>${chart(series, { band: qaMode === 'spread' ? monthPairs.map((q) => [q.q10, q.q90]) : null, unit: qaMode === 'spread' ? 'mm / day' : 'mm / month', description: 'Observed rainfall product comparison' })}
 <p class="note">${qaMode === 'totals' ? t('Both products estimate rainfall. Their difference measures disagreement. An independent gauge is needed to assess bias against a reference.', 'দুটি উৎসই বৃষ্টির অনুমান দেয়। পার্থক্য তাদের অমিল বোঝায়। পক্ষপাত যাচাইয়ে স্বতন্ত্র বৃষ্টিমাপ দরকার।') : t('Shading spans the 10th–90th percentiles of paired daily differences within each month. It describes observed spread.', 'ছায়া প্রতি মাসের দৈনিক পার্থক্যের ১০ম থেকে ৯০তম পার্সেন্টাইল দেখায়। এটি দেখা ওঠানামার বিস্তার।')}</p>${monthControl()}<p class="note">${t('Approximate 95% interval for the annual mean difference', 'বার্ষিক গড় পার্থক্যের আনুমানিক ৯৫% পরিসর')} ${q.meanDifference95CI.map((v) => num(v, 2)).join(' to ')} mm/d ${truth('MODELED')} · ${t('Assumes independent days. Serial correlation can make it too narrow.', 'দৈনিক মান স্বতন্ত্র ধরে হিসাব। পরপর দিনের সম্পর্ক থাকলে পরিসরটি ছোট হতে পারে।')}</p>`, nasaBadge(["power", "imerg"])
 )}
 ${panel(
   t('Optical quality check', 'স্যাটেলাইট ছবির মান'),
   `<div class="eyebrow">LANDSAT / 30 m</div>${
     epochs.length
       ? select(
           t('Optical acquisition', 'ছবির তারিখ'),
           'opticalIndex',
           epochs.map((e, i) => [i, e.date]),
           opticalIndex
         )
       : ''
   }<dl class="quality-list"><div><dt>${t('Whole-scene cloud cover', 'পুরো দৃশ্যে মেঘ')}</dt><dd>${num(im?.sceneCloudPercent, 1)}% ${truth('REMOTE_OBSERVED', { source: 'Landsat' })}</dd></div><div><dt>${t('Cloud / shadow mask loss', 'মেঘ ও ছায়ায় বাদ পড়া অংশ')}</dt><dd>${cloud === null ? t('Unavailable', 'তথ্য নেই') : `${num(cloud * 100, 1)}% ${truth('REMOTE_OBSERVED', { source: 'Landsat QA' })}`}</dd></div><div><dt>${t('Usable optical pixels', 'ব্যবহারযোগ্য পিক্সেল')}</dt><dd>${Number.isFinite(im?.validFraction) ? num(im.validFraction * 100, 1) + '%' : '—'} ${im?.validFraction ? truth('REMOTE_OBSERVED', { source: 'Landsat' }) : ''}</dd></div><div><dt>NDVI</dt><dd>${num(im?.ndvi, 3)} ${im?.ndvi ? truth('REMOTE_OBSERVED', { source: 'Landsat NDVI' }) : ''}</dd></div></dl><p class="note">${esc(im?.qualityNote || q.cloudMaskNote)} ${im?.validFraction < 0.25 ? t('Low clear coverage. Treat the surviving samples cautiously.', 'পরিষ্কার অংশ কম। অবশিষ্ট নমুনা সতর্কভাবে দেখুন।') : ''}</p>${epoch ? `<a class="source-link" href="${esc(epoch.opticalQA.dataRequest)}" target="_blank" rel="noopener">${t('Original analysis window ↗', 'বিশ্লেষণের মূল ছবি ↗')}</a>` : ''}<div class="spacer"></div>${sources(['landsat'])}`, nasaBadge("landsat")
 )}</div>
 <div class="grid-equal section-space">${panel(t('Independent rain gauge', 'স্বতন্ত্র বৃষ্টিমাপ'), ground.n ? `<p class="notice">${num(ground.n)} ${t('matched UTC dates', 'দিনের UTC মিল')}.</p><dl class="quality-list"><div><dt>POWER ${t('mean bias', 'গড় পক্ষপাত')}</dt><dd>${num(ground.powerBias, 2)} mm/d</dd></div><div><dt>IMERG ${t('mean bias', 'গড় পক্ষপাত')}</dt><dd>${num(ground.gpmBias, 2)} mm/d</dd></div></dl><p class="note">${t('Gauge observations are locally entered. Repeated readings on the same date are averaged before comparison.', 'বৃষ্টিমাপ স্থানীয়ভাবে দেওয়া। একই দিনের একাধিক মাপের গড় নিয়ে তুলনা করা হয়।')}</p>${button(t('Add a gauge reading', 'বৃষ্টিমাপ লিখুন'), 'new-rain', 'small', 'add')}` : `<p class="note">${t('No paired independent gauge reading yet. Add a 24-hour UTC total from a 2024 date to enable a measured reference comparison.', 'এখনও ২০২৪ সালের একই দিনের স্বতন্ত্র বৃষ্টিমাপ নেই। ২৪ ঘণ্টার UTC মোট দিলে তুলনা করা যাবে।')}</p><div class="spacer"></div>${button(t('Add a gauge reading', 'বৃষ্টিমাপ লিখুন'), 'new-rain', '', 'add')}`, ground.n ? nasaBadge(["power", "imerg"]) : "")}
 ${panel(t('Coverage and source grids', 'তথ্য ও উৎসের মাপ'), `<p class="note">POWER / MERRA-2 · 0.5° × 0.625°<br>IMERG · 0.1°<br>Landsat · 30 m</p><p class="note">${t('Missing paired days', 'অনুপস্থিত যুগল দিন')} ${num(period.length - q.pairedDays)} / ${num(period.length)}. ${t('Mithapukur and Pirganj share the same POWER grid anchor. Each IMERG request uses its prepared centre.', 'মিঠাপুকুর ও পীরগঞ্জ একই POWER গ্রিড ব্যবহার করে। IMERG প্রতিটি কেন্দ্রের স্থানাঙ্ক দিয়ে নেওয়া।')}</p><a class="source-link" href="${esc(f.provenance.meteorologyRequest)}" target="_blank" rel="noopener">POWER request ↗</a> · <a class="source-link" href="${esc(f.provenance.gpmRequest)}" target="_blank" rel="noopener">IMERG request ↗</a><div class="spacer"></div>${button(t('Download paired days', 'দৈনিক জোড়ার তথ্য নিন'), 'export-days', 'small', 'download')}`, nasaBadge(["power", "imerg", "landsat"]))}</div>`;
}
function compareGauges() {
  const f = field(),
    days = new Map(f.daily.map((d) => [d.date, d])),
    group = new Map();
  state.records
    .filter(
      (r) =>
        r.fieldId === f.id &&
        r.kind === 'rain' &&
        r.utcDay === true &&
        Number.isFinite(r.rainMm)
    )
    .forEach((r) => {
      if (!group.has(r.date)) group.set(r.date, []);
      group.get(r.date).push(r.rainMm);
    });
  const power = [],
    gpm = [];
  for (const [date, values] of group) {
    const d = days.get(date);
    if (!d || !Number.isFinite(d.rainPower) || !Number.isFinite(d.rainGpm))
      continue;
    power.push(d.rainPower - mean(values));
    gpm.push(d.rainGpm - mean(values));
  }
  return { n: power.length, powerBias: mean(power), gpmBias: mean(gpm) };
}
function logView() {
  const records = state.records
    .filter((r) => r.fieldId === state.fieldId)
    .sort((a, b) => b.date.localeCompare(a.date));
  const cols = [
    t('Date', 'তারিখ'),
    t('Record', 'রেকর্ড'),
    t('Observation', 'পর্যবেক্ষণ'),
    t('Reviewed by', 'উৎসের অবস্থা'),
    t('Open', 'খুলুন'),
  ];
  return `<div class="notice">${t('These entries are stored in this browser. Export a copy to share with a research team. Unreviewed labels stay separate from verified results.', 'তথ্য এই ব্রাউজারে থাকে। গবেষণা দলের জন্য কপি রপ্তানি করুন। যাচাই হয়নি এমন রেকর্ড আলাদাভাবে চিহ্নিত থাকে।')}</div><section class="panel section-space"><div class="panel-header"><h2>${t('Field observations', 'মাঠের পর্যবেক্ষণ')} <span class="record-count">${num(records.length)}</span></h2><div class="toolbar-inline">${button('CSV', 'export-log', 'small', 'download', 'csv')}${button('JSON', 'export-log', 'small', 'download', 'json')}</div></div>${records.length ? `<div class="table-wrap"><table class="data-table"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${records.map((r) => `<tr><td>${esc(r.date)}</td><td>${esc(kindLabel(r.kind))}</td><td>${summary(r)}</td><td>${esc(r.reviewStatus)}</td><td>${button(t('View', 'দেখুন'), 'view-record', 'small', 'note', r.id)}</td></tr>`).join('')}</tbody></table></div>` : stateEmpty(t('Your field record starts here', 'আপনার মাঠের খাতা এখান থেকে শুরু'), t('Add first observation', 'প্রথম পর্যবেক্ষণ লিখুন'), 'new-record')}</section>`;
}
function summary(r) {
  if (r.kind === 'harvest')
    return `${esc(r.variety || cropName(r.crop))} · ${num(r.yieldKg / r.harvestedAreaHa / 1000, 2)} t/ha ${truth('FARMER_REPORTED', { source: r.observerRole })}`;
  if (r.kind === 'soil') return `${esc(r.labName)} · pH ${num(r.soilPH, 2)} ${truth(r.reviewStatus === 'Laboratory confirmed' ? 'MEASURED' : 'FARMER_REPORTED', { source: r.reviewStatus })}`;
  if (r.kind === 'rain') return `${num(r.rainMm, 2)} mm ${truth('FARMER_REPORTED', { source: r.instrument || r.observerRole })}`;
  if (r.kind === 'moisture')
    return `${num(r.waterContent, 3)} m³/m³ · ${num(r.depthCm)} cm ${truth('FARMER_REPORTED', { source: r.instrument || r.observerRole })}`;
  return `${esc(cropName(r.crop))} · ${num(r.symptomIds?.length || 0)} ${t('signs', 'টি লক্ষণ')} ${truth('FARMER_REPORTED', { source: r.observerRole })}`;
}
function trialView() {
  return panel(
    t('Published Rangpur evidence', 'রংপুরের প্রকাশিত গবেষণা'),
    agronomy.rotations
      .map(
        (r, i) =>
          `<article class="trial-row"><span class="source-no">T0${i + 1}</span><div><h3>${esc(t(r.label, r.bn))}</h3><p class="note">${esc(r.rationale)}</p><p class="note">${t('Irrigation observed in trials', 'গবেষণায় সেচ')} <b>${r.referenceIrrigationMm ? r.referenceIrrigationMm.join('–') + ' mm ' + truth('MODELED', { source: 'Trial observations' }) : t('not reported', 'তথ্য নেই')}</b> · ${sources(r.sourceIds)}</p></div></article>`
      )
      .join('') +
      `<div class="notice">${t('Published trial results retain their own sites, varieties and dates. They are reference evidence for planning.', 'প্রকাশিত ফলাফল গবেষণার নিজস্ব জমি, জাত ও সময়ের। পরিকল্পনায় এগুলো তুলনার তথ্য।')}</div>`
  );
}
function observationFields(kind) {
  if (kind === 'harvest')
    return `${select(
      t('Crop', 'ফসল'),
      'crop',
      agronomy.crops.map((c) => [c.id, cropName(c.id)]),
      'aman'
    )}${input(t('Variety', 'জাত'), 'variety', '', 'required maxlength="100"', 'text')}${input(t('Harvested area (ha)', 'কাটা জমির আয়তন (হেক্টর)'), 'harvestedAreaHa', '', 'min=".0001" step="any" required')}${input(t('Measured harvest (kg)', 'ওজন করা ফলন (কেজি)'), 'yieldKg', '', 'min="0" step="any" required')}${input(t('Harvest moisture (%) if known', 'ফসলের আর্দ্রতা (%) জানা থাকলে'), 'yieldMoisturePct', '', 'min="0" max="100" step="any"')}${select(
      t('Harvest basis', 'ফলনের ধরন'),
      'yieldBasis',
      [
        ['paddy', t('Unmilled paddy', 'ধান')],
        ['dry seed', t('Dry seed/grain', 'শুকনা বীজ বা শস্য')],
        ['fresh tuber', t('Fresh tuber', 'তাজা আলু')],
      ],
      'paddy'
    )}`;
  if (kind === 'soil')
    return `${input(t('Laboratory', 'পরীক্ষাগার'), 'labName', '', 'required maxlength="150"', 'text')}${input(t('Sample depth (cm)', 'নমুনার গভীরতা (সেমি)'), 'depthCm', '', 'min="0" max="300" step="any" required')}${input(t('Soil pH', 'মাটির pH'), 'soilPH', '', 'min="0" max="14" step="any" required')}${input(t('pH method', 'pH পদ্ধতি'), 'pHMethod', '', 'required maxlength="80" placeholder="e.g. soil:water 1:2.5"', 'text')}${input(t('Organic carbon (%)', 'জৈব কার্বন (%)'), 'organicCarbonPct', '', 'min="0" max="100" step="any"')}${input(t('N/P/K result with units & method', 'N/P/K ফল, একক ও পদ্ধতি'), 'testResult', '', 'maxlength="250"', 'text')}`;
  if (kind === 'moisture')
    return `${input(t('Volumetric water content (m³/m³)', 'আয়তনভিত্তিক আর্দ্রতা (ঘনমিটার/ঘনমিটার)'), 'waterContent', '', 'min="0" max="1" step="any" required')}${input(t('Probe depth (cm)', 'সেন্সরের গভীরতা (সেমি)'), 'depthCm', '', 'min="0" max="300" step="any" required')}${input(t('Instrument / method', 'যন্ত্র বা পদ্ধতি'), 'instrument', '', 'required maxlength="100"', 'text')}`;
  return `${input(t('Measured rainfall (mm)', 'মাপা বৃষ্টি (মিমি)'), 'rainMm', '', 'min="0" max="3000" step="any" required')}${input(t('Gauge / station ID', 'যন্ত্র বা স্টেশনের পরিচয়'), 'instrument', '', 'required maxlength="100"', 'text')}<label class="check-label wide"><input type="checkbox" name="utcDay">${t('This is a full 24-hour total aligned to the UTC date above. Only matching totals enter the bias comparison.', 'উপরের UTC তারিখের সম্পূর্ণ ২৪ ঘণ্টার মাপ। এমন মাপই পক্ষপাতের তুলনায় যায়।')}</label>`;
}
function newRecord(kind = 'harvest') {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  modal(
    t('Add a field observation', 'মাঠের পর্যবেক্ষণ লিখুন'),
    `<p class="note">${esc(fieldName())} · ${t('Saved on this device', 'এই যন্ত্রে সংরক্ষিত')}</p><form id="record-form"><div class="form-grid section-space">${select(
      t('Observation type', 'পর্যবেক্ষণের ধরন'),
      'kind',
      kinds.filter((k) => k[0] !== 'clinic').map((k) => [k[0], t(k[1], k[2])]),
      kind
    )}${input(t('Observation date', 'পর্যবেক্ষণের তারিখ'), 'date', today, `required max="${today}"`, 'date')}${select(
      t('Observer role', 'পর্যবেক্ষকের ভূমিকা'),
      'observerRole',
      [
        ['Farmer', t('Farmer', 'কৃষক')],
        [
          'Upazila extension officer',
          t('Upazila extension officer', 'উপজেলা কৃষি কর্মকর্তা'),
        ],
        ['Researcher', t('Researcher', 'গবেষক')],
      ],
      'Farmer'
    )}${select(
      t('Reported review status', 'জানানো যাচাই অবস্থা'),
      'reviewStatus',
      [
        ['Farmer observation', t('Farmer observation', 'কৃষকের পর্যবেক্ষণ')],
        ['Officer reviewed', t('Officer reviewed', 'কর্মকর্তার পর্যালোচনা')],
        ['Laboratory confirmed', t('Laboratory confirmed', 'ল্যাব নিশ্চিত')],
      ],
      'Farmer observation'
    )}</div><div class="form-grid section-space" id="type-fields">${observationFields(kind)}</div>
 <div class="form-field section-space"><label for="record-notes">${t('Management, symptoms, or review reference', 'পরিচর্যা, লক্ষণ বা যাচাইয়ের উল্লেখ')}</label><textarea id="record-notes" name="notes" maxlength="1500"></textarea></div><label class="check-label"><input type="checkbox" name="consentForResearch">${t('Record permission for future research use. Export and sharing are separate actions.', 'ভবিষ্যৎ গবেষণায় ব্যবহারের সম্মতি থাকলে চিহ্নিত করুন। রপ্তানি ও শেয়ার আলাদা কাজ।')}</label><button class="button primary">${t('Save observation', 'পর্যবেক্ষণ সংরক্ষণ করুন')}</button></form>`
  );
}
function recordDetail(id) {
  const r = state.records.find((r) => r.id === id);
  if (!r) return;
  modal(
    t('Observation detail', 'পর্যবেক্ষণের বিবরণ'),
    `<div class="eyebrow">${esc(kindLabel(r.kind))} / ${esc(r.date)}</div><h3>${summary(r)}</h3><div class="table-wrap"><table class="data-table"><tbody>${Object.entries(
      r
    )
      .filter(
        ([key]) => !['photo', 'id', 'fieldId', 'kind', 'date'].includes(key)
      )
      .map(
        ([k, v]) =>
          `<tr><th>${esc(k)}</th><td>${esc(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`
      )
      .join(
        ''
      )}</tbody></table></div>${r.photo ? `<img class="record-photo" src="${esc(r.photo)}" alt="${t('Farmer’s field photo', 'জমির ছবি')}">` : ''}<div class="spacer"></div>${button(t('Export observation', 'রেকর্ড রপ্তানি'), 'export-one', 'small', 'download', id)}`
  );
}
function researchAction(action, value) {
  if (action === 'qa-mode') {
    qaMode = value;
    repaint();
  }
  if (action === 'new-record' || action === 'new-harvest') newRecord('harvest');
  if (action === 'new-rain') newRecord('rain');
  if (action === 'new-soil') newRecord('soil');
  if (action === 'open-log') {
    close();
    state.tabs.research = 'log';
    persist();
    if (location.hash === '#research') repaint();
    else location.hash = 'research';
  }
  if (action === 'view-record') recordDetail(value);
  if (action === 'export-one') {
    const r = state.records.find((r) => r.id === value);
    if (r)
      download(
        `ropon-observation-${r.id.slice(0, 8)}.json`,
        JSON.stringify(r, null, 2)
      );
  }
  if (action === 'export-log') {
    const data = state.records.filter((r) => r.fieldId === state.fieldId);
    if (!data.length) {
      toast(
        t(
          'Add an observation before exporting',
          'রপ্তানির আগে পর্যবেক্ষণ লিখুন'
        )
      );
      return;
    }
    download(
      `ropon-${state.fieldId}-log.${value}`,
      value === 'json'
        ? JSON.stringify(data, null, 2)
        : csv(
            data.map(({ photo, ...other }) => ({
              ...other,
              photoAttached: !!photo,
            }))
          ),
      value === 'json' ? 'application/json' : 'text/csv;charset=utf-8'
    );
  }
}
function researchChange(el) {
  if (el.name === 'opticalIndex') {
    opticalIndex = Number(el.value);
    repaint();
    return;
  }
  if (el.name === 'kind' && el.closest('#record-form'))
    document.querySelector('#type-fields').innerHTML = observationFields(
      el.value
    );
}
function researchSubmit(form) {
  if (form.id !== 'record-form') return false;
  const data = Object.fromEntries(new FormData(form));
  for (const key of [
    'harvestedAreaHa',
    'yieldKg',
    'yieldMoisturePct',
    'depthCm',
    'soilPH',
    'organicCarbonPct',
    'rainMm',
    'waterContent',
  ])
    if (key in data) data[key] = data[key] === '' ? null : Number(data[key]);
  const record = {
    ...data,
    id: recordId(),
    fieldId: state.fieldId,
    createdAt: new Date().toISOString(),
    utcDay: data.utcDay === 'on',
    consentForResearch: data.consentForResearch === 'on',
  };
  state.records.push(record);
  state.tabs.research = 'log';
  if (!persist()) {
    state.records.pop();
    return true;
  }
  close();
  if (location.hash === '#research') repaint();
  else location.hash = 'research';
  toast(
    t('Observation saved on this device', 'এই যন্ত্রে পর্যবেক্ষণ সংরক্ষিত')
  );
  return true;
}

export { research, researchAction, researchChange, researchSubmit };
