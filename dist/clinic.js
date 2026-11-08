import {
  recordId,
  state,
  agronomy,
  persist,
  t,
  esc,
  num,
  area,
  fieldName,
  profile,
  cropName,
  icon,
  button,
  header,
  panel,
  tag,
  chips,
  input,
  select,
  sources,
  tabs,
  toast,
  repaint,
  modal,
} from './ui.js';
import { nutrientProducts } from './engine.js';

let photo = null,
  previewName = '',
  checked = false;
function symptomList() {
  const possible = new Set(
    agronomy.conditions
      .filter((c) => c.cropIds.includes(state.clinic.crop))
      .flatMap((c) => c.symptomIds)
  );
  return agronomy.symptoms.filter((s) => possible.has(s.id));
}
function clinic() {
  const tab = state.tabs.clinic;
  return (
    header(
      t('Field care  /  05', 'ফসলের যত্ন  /  ০৫'),
      t('Crop clinic', 'ফসলের চিকিৎসাঘর'),
      t(
        'Describe what you see. Get field checks to try and a note to take to an extension officer.',
        'জমিতে যা দেখছেন লিখুন। কী কী যাচাই করবেন দেখুন এবং কৃষি কর্মকর্তার জন্য নোট রাখুন।'
      )
    ) +
    chips() +
    tabs('clinic', [
      ['symptoms', t('Bugs & symptoms', 'পোকা ও লক্ষণ')],
      ['fertilizer', t('Fertilizer calculator', 'সারের হিসাব')],
    ]) +
    (tab === 'fertilizer' ? fertilizer() : symptomView())
  );
}
function symptomView() {
  return `<div class="grid-equal">${panel(
    t('What do you see?', 'কী লক্ষণ দেখছেন?'),
    `<div class="step-indicator">01 / ${t('Choose crop', 'ফসল বাছুন')}</div>${select(
      t('Affected crop', 'আক্রান্ত ফসল'),
      'clinicCrop',
      agronomy.crops.map((c) => [c.id, cropName(c.id)]),
      state.clinic.crop
    )}
 <div class="spacer"></div><div class="step-indicator">02 / ${t('Mark observed signs', 'লক্ষণ নির্বাচন করুন')}</div><div class="symptom-grid">${symptomList()
   .map(
     (s) =>
       `<label class="symptom-option"><input type="checkbox" data-symptom="${s.id}" ${state.clinic.symptoms.includes(s.id) ? 'checked' : ''}>${esc(t(s.label, s.bn))}</label>`
   )
   .join('')}</div>
 <label class="photo-drop">${photo ? `<img src="${photo}" alt="${t('Your crop photograph', 'আপনার ফসলের ছবি')}">` : icon('camera', 26)}<span>${photo ? esc(previewName) : t('Attach a field photo (optional)', 'জমির ছবি দিন (ঐচ্ছিক)')}</span><small>${t('Photo for the field note. Symptoms determine the suggestions.', 'ছবিটি নোটের জন্য। সম্ভাব্য কারণগুলো নির্বাচিত লক্ষণ থেকে আসে।')}</small><input type="file" class="file-native" id="clinic-photo" accept="image/jpeg,image/png,image/webp"></label>
 ${photo ? button(t('Remove photo', 'ছবি বাদ দিন'), 'clear-photo', 'ghost small') : ''}<div class="spacer"></div>${button(t('Check possible causes', 'সম্ভাব্য কারণ দেখুন'), 'clinic-check', 'primary full', 'bug')}`
  )}
 <section class="panel" id="clinic-result">${result()}</section></div>`;
}
function matchConditions() {
  const signs = state.clinic.symptoms;
  return agronomy.conditions
    .filter((c) => c.cropIds.includes(state.clinic.crop))
    .map((c) => ({
      ...c,
      matched: c.symptomIds.filter((s) => signs.includes(s)).length,
    }))
    .filter((c) => c.matched > 0)
    .sort((a, b) => b.matched - a.matched);
}
function result() {
  if (!checked)
    return `<div class="clinic-placeholder"><div class="eyebrow">${t('Field checklist', 'জমিতে দেখার তালিকা')}</div>${icon('clinic', 44)}<h2>${t('Start with the leaf.', 'পাতা থেকে শুরু করুন।')}</h2><p>${t('Look at several plants, including healthy neighbours. Record whether the damage is on old leaves, new shoots, stems, or insects.', 'সুস্থ গাছসহ কয়েকটি গাছ দেখুন। পুরনো পাতা, কচি ডগা বা কাণ্ডে ক্ষতি আছে কি না, পোকা দেখা যাচ্ছে কি না লিখুন।')}</p></div>`;
  const list = matchConditions().slice(0, 3);
  return `<div class="panel-header"><h2>${t('Possibilities to check', 'যা যাচাই করবেন')}</h2>${tag(t('Field review', 'মাঠে যাচাই'), 'amber')}</div>${list.length ? list.map((c) => `<article class="condition-result"><h3>${esc(t(c.label, c.bn))}</h3><p>${esc(t(c.possibleCause, c.possibleCauseBn))}</p><ul>${[...t(c.checks, c.checksBn), ...t(c.actions, c.actionsBn)].map((v) => `<li>${esc(v)}</li>`).join('')}</ul><div>${sources(c.sourceIds)}</div></article>`).join('') : `<div class="empty">${t('No matching pathway. Save the observations for an officer to review.', 'মিল পাওয়া যায়নি। কৃষি কর্মকর্তার জন্য লক্ষণগুলো সংরক্ষণ করুন।')}</div>`}<div class="panel-body"><div class="notice amber">${t('Similar signs can have different causes. An officer or lab can confirm the cause before treatment.', 'একই লক্ষণের নানা কারণ হতে পারে। ব্যবস্থা নেওয়ার আগে কর্মকর্তা বা পরীক্ষাগারে নিশ্চিত করুন।')}</div><div class="spacer"></div>${button(t('Save observation to field log', 'জমির খাতায় লিখুন'), 'save-case', 'primary', 'save')}</div>`;
}
function fertilizer() {
  return `<div class="grid-equal">${panel(
    t('Convert a soil-test recommendation', 'মাটি পরীক্ষার সুপারিশ থেকে হিসাব'),
    `<p class="note">${t('Enter the remaining elemental nutrients specified by your lab or officer, after crediting manure and fertilizer already applied. Blank values stay unanswered.', 'ইতিমধ্যে দেওয়া সার ও জৈবসার বাদ দিয়ে ল্যাব বা কর্মকর্তার দেওয়া অবশিষ্ট মৌলিক পুষ্টির পরিমাণ লিখুন।')}</p><form id="fertilizer-form"><div class="form-grid section-space">${select(
      t('Crop', 'ফসল'),
      'fertCrop',
      agronomy.crops.map((c) => [c.id, cropName(c.id)]),
      profile().crop
    )}${input(t('Variety', 'জাত'), 'variety', '', 'required maxlength="100"', 'text')}${input(t('Lab or extension office', 'ল্যাব বা কৃষি অফিস'), 'lab', '', 'required maxlength="120"', 'text')}${input(t('Soil test date', 'মাটি পরীক্ষার দিন'), 'testDate', '', 'required', 'date')}${input(t('Area receiving fertilizer (ha)', 'সার প্রয়োগের জমি (হেক্টর)'), 'fertArea', area().toFixed(2), 'min="0.001" max="100000" step="any" required')}${input(t('Net N (kg/ha)', 'অবশিষ্ট N (কেজি/হেক্টর)'), 'n', '', 'min="0" max="1000" step="any" required')}${input(t('Net P (kg/ha)', 'অবশিষ্ট P (কেজি/হেক্টর)'), 'p', '', 'min="0" max="1000" step="any" required')}${input(t('Net K (kg/ha)', 'অবশিষ্ট K (কেজি/হেক্টর)'), 'k', '', 'min="0" max="1000" step="any" required')}</div>
 <label class="check-label"><input type="checkbox" required>${t('My recommendation uses elemental N, P and K, with previous inputs already credited.', 'আমার সুপারিশ মৌলিক N, P, K হিসেবে দেওয়া এবং আগের সার বাদ দেওয়া হয়েছে।')}</label><button class="button primary">${t('Calculate product amounts', 'সারের পরিমাণ হিসাব করুন')}</button></form>`
  )}
 <section class="panel"><div class="panel-header"><h2>${t('Product amounts', 'সারের পরিমাণ')}</h2>${tag('BARC 2024', 'green')}</div><div class="panel-body"><div id="fert-result" class="notice">${t('Enter the soil-test recommendation to calculate amounts for this field.', 'এই জমির সারের পরিমাণ দেখতে মাটি পরীক্ষার সুপারিশ লিখুন।')}</div><div class="spacer"></div><p class="note">${t('BARC product fractions: urea 46% N, TSP 20% elemental P, and MOP 50% elemental K. Oxide-based P₂O₅ and K₂O values require a separate conversion. Mixed products require joint accounting.', 'BARC অনুযায়ী ইউরিয়ায় ৪৬% N, TSP-তে ২০% মৌলিক P ও MOP-তে ৫০% মৌলিক K। P₂O₅ বা K₂O হলে আগে মৌলিক এককে রূপান্তর করতে হবে।')}</p>${sources(['barc-frg2024'])}</div></section></div>`;
}
function saveCase() {
  const r = {
    id: recordId(),
    kind: 'clinic',
    fieldId: state.fieldId,
    date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Dhaka' }),
    crop: state.clinic.crop,
    symptomIds: [...state.clinic.symptoms],
    possibleCauseIds: matchConditions()
      .slice(0, 3)
      .map((c) => c.id),
    photo: photo || null,
    photoName: previewName,
    reviewStatus: 'Farmer observation',
    observerRole: 'Farmer',
    consentForResearch: false,
    notes: 'Symptom checklist. Confirmation pending.',
  };
  state.records.push(r);
  if (!persist()) {
    state.records.pop();
    return;
  }
  toast(
    t(
      'Crop observation saved on this device',
      'এই যন্ত্রে ফসলের পর্যবেক্ষণ সংরক্ষিত'
    )
  );
  modal(
    t('Field note saved', 'জমির নোট সংরক্ষিত'),
    `<p>${esc(fieldName())} · ${esc(r.date)} · ${cropName(r.crop)}</p><p class="note">${t('Open Research lab → Field log to review or export this entry.', 'গবেষণাগারের মাঠের খাতা থেকে নোটটি দেখা বা রপ্তানি করা যায়।')}</p>${button(t('Open field log', 'খাতা খুলুন'), 'open-log', '', 'right')}`
  );
}
function clinicAction(action) {
  if (action === 'clinic-check') {
    if (!state.clinic.symptoms.length) {
      toast(t('Choose at least one observed sign', 'অন্তত একটি লক্ষণ বাছুন'));
      return;
    }
    checked = true;
    document.querySelector('#clinic-result').innerHTML = result();
  }
  if (action === 'save-case') saveCase();
  if (action === 'clear-photo') {
    photo = null;
    previewName = '';
    repaint();
  }
}
async function clinicChange(el) {
  if (el.name === 'clinicCrop') {
    state.clinic = { crop: el.value, symptoms: [] };
    checked = false;
    photo = null;
    previewName = '';
    persist();
    repaint();
  }
  if (el.dataset.symptom) {
    const id = el.dataset.symptom;
    state.clinic.symptoms = el.checked
      ? [...new Set([...state.clinic.symptoms, id])]
      : state.clinic.symptoms.filter((s) => s !== id);
    checked = false;
    persist();
    document.querySelector('#clinic-result').innerHTML = result();
  }
  if (el.id === 'clinic-photo' && el.files?.[0]) {
    const file = el.files[0];
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 12e6
    ) {
      toast(
        t(
          'Use a JPG, PNG or WebP below 12 MB.',
          '১২ এমবির কম JPG, PNG বা WebP দিন।'
        )
      );
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext('2d')
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      photo = canvas.toDataURL('image/jpeg', 0.72);
      previewName = file.name;
      repaint();
    } catch {
      toast(t('This photo could not be read.', 'এই ছবি পড়া যায়নি।'));
    }
  }
}
function clinicSubmit(form) {
  if (form.id !== 'fertilizer-form') return false;
  const d = Object.fromEntries(new FormData(form));
  const products = nutrientProducts(+d.n, +d.p, +d.k);
  document.querySelector('#fert-result').className = 'fertilizer-output';
  document.querySelector('#fert-result').innerHTML =
    `<b>${esc(d.variety)} · ${num(+d.fertArea, 2)} ha</b><dl>${Object.entries(
      products
    )
      .map(
        ([key, value]) =>
          `<dt>${{ urea: t('Urea', 'ইউরিয়া'), tsp: 'TSP', mop: 'MOP' }[key]}</dt><dd>${num(value * +d.fertArea, 2)} kg <small>(${num(value, 2)} kg/ha)</small></dd>`
      )
      .join(
        ''
      )}</dl><p class="note">${esc(d.lab)} · ${esc(d.testDate)} · ${t('Confirm timing and split applications locally.', 'প্রয়োগের সময় ও ভাগ স্থানীয়ভাবে যাচাই করুন।')}</p>`;
  return true;
}

export { clinic, clinicAction, clinicChange, clinicSubmit };
