// HOWTO pilot: per-sub-step guidance model for the My field coach card.
// Data-driven so the other pages can reuse it later: each sub-step carries its
// bilingual copy, its spotlight target, the real action that ticks it, its
// lazy "Watch how" clip, and the micro-sequence Show me walks through.
import { t } from './ui.js';

export const HOWTO_ASSET_DIR = '/assets/howto';

export const HOWTO_IDS = ['field-map', 'field-area', 'field-constraints', 'field-use'];

// Micro-step action: DOM event the guide waits for ('none' = Next continues).
// inDialog marks steps whose target lives inside the #modal top layer.
export const FIELD_HOWTO_STEPS = [
  {
    id: 'field-map',
    title: { en: 'Check your plot on the map', bn: 'মানচিত্রে আপনার জমি দেখুন' },
    why: { en: 'Make sure this is your field', bn: 'এটি আপনার জমি কিনা নিশ্চিত হন' },
    how: { en: 'Look at the outlined plot; zoom with + or pinch', bn: 'রূপরেখা আঁকা জমি দেখুন; + বা চিমটিতে জুম করুন' },
    target: '#field-map, .leaflet-container',
    doneEvent: 'map-interact',
    clip: `${HOWTO_ASSET_DIR}/field-map.webp`,
    poster: `${HOWTO_ASSET_DIR}/field-map.jpg`,
    seconds: 4,
    micro: [
      { target: '#field-map .leaflet-overlay-pane path[stroke="#e3f9a2"]', action: 'click', text: { en: 'This is your field', bn: 'এটি আপনার জমি' } },
      { target: '.leaflet-control-zoom-in', action: 'click', text: { en: 'Zoom in', bn: 'জুম করুন' } },
      { target: '#field-map', action: 'pointerup', text: { en: 'Drag to look around', bn: 'ঘুরে দেখতে টানুন' } },
    ],
  },
  {
    id: 'field-area',
    title: { en: 'Check the area', bn: 'জমির আয়তন দেখুন' },
    why: { en: 'Area sets plant and seed counts', bn: 'আয়তন ঠিক করে চারা ও বীজের সংখ্যা' },
    how: { en: 'Tap Edit next to Cultivable area to change it', bn: 'চাষযোগ্য আয়তনের পাশে Edit চাপুন' },
    target: '.field-meta, .field-intro',
    doneEvent: 'area-opened | area-saved | area-confirmed',
    clip: `${HOWTO_ASSET_DIR}/field-area.webp`,
    poster: `${HOWTO_ASSET_DIR}/field-area.jpg`,
    seconds: 4,
    micro: [
      { target: '.field-meta > div:nth-child(2) dd', action: 'none', text: { en: 'Your usable area', bn: 'আপনার চাষযোগ্য আয়তন' } },
      { target: '[data-action="edit-net-area"]', action: 'click', text: { en: 'Tap Edit', bn: 'Edit চাপুন' } },
      { target: '#in-bundWidthM', action: 'none', inDialog: true, text: { en: 'Bund width: the earth ridge around your plot. Change it if needed, then tap Next', bn: 'আলের প্রস্থ: জমির চারপাশের মাটির আল। দরকার হলে বদলান, তারপর Next চাপুন' } },
      { target: '#in-drainWidthM', action: 'none', inDialog: true, text: { en: 'Drain width: leave 0 if there is no drain, then tap Next', bn: 'নালার প্রস্থ: নালা না থাকলে 0 রাখুন, তারপর Next চাপুন' } },
      { target: '#in-pathWidthM', action: 'none', inDialog: true, text: { en: 'Path width: any walkway inside the plot, then tap Next', bn: 'পথের প্রস্থ: জমির ভেতরের হাঁটার পথ, তারপর Next চাপুন' } },
      { target: '#in-otherDecimals', action: 'none', inDialog: true, text: { en: 'Other land you cannot farm (decimals), then tap Next', bn: 'চাষ করা যায় না এমন অন্য জমি (শতক), তারপর Next চাপুন' } },
      { target: '#net-area-form button[type="submit"]', action: 'click', inDialog: true, text: { en: 'Save', bn: 'সংরক্ষণ করুন' } },
    ],
  },
  {
    id: 'field-constraints',
    title: { en: 'Set irrigation & budget', bn: 'সেচ ও বাজেট ঠিক করুন' },
    why: { en: 'Water and money decide which rotations fit', bn: 'পানি ও টাকা ঠিক করে কোন চক্র মিলবে' },
    how: { en: 'Tap Edit field assumptions, pick Irrigation and Budget, Save', bn: 'Edit field assumptions চেপে Irrigation ও Budget বেছে Save করুন' },
    target: '[data-action="profile"], .field-bottom button',
    doneEvent: 'constraints-saved',
    clip: `${HOWTO_ASSET_DIR}/field-constraints.webp`,
    poster: `${HOWTO_ASSET_DIR}/field-constraints.jpg`,
    seconds: 6,
    micro: [
      { target: '[data-action="profile"]', action: 'click', text: { en: 'Tap Edit field assumptions', bn: 'Edit field assumptions চাপুন' } },
      { target: '#in-crop', action: 'none', inDialog: true, text: { en: 'Planning crop for this field', bn: 'এই জমির পরিকল্পনার ফসল' } },
      { target: '#in-irrigation', action: 'change', inDialog: true, text: { en: 'Pick how sure your water is', bn: 'পানি কতটা নিশ্চিত বেছে নিন' } },
      { target: '#in-budget', action: 'change', inDialog: true, text: { en: 'Pick your input budget', bn: 'উপকরণের বাজেট বেছে নিন' } },
      { target: '#profile-form button.button.primary', action: 'click', inDialog: true, text: { en: 'Tap Save field details', bn: 'Save field details চাপুন' } },
    ],
  },
  {
    id: 'field-use',
    title: { en: 'Use this field', bn: 'এই জমি ব্যবহার করুন' },
    why: { en: 'Locks your field for the rotation step', bn: 'পরের ধাপে আপনার জমি পাকা করে' },
    how: { en: 'Tap Use this field →', bn: 'Use this field → চাপুন' },
    target: '.journey-field-inline [data-journey="field"]',
    doneEvent: 'field-used',
    clip: `${HOWTO_ASSET_DIR}/field-use.webp`,
    poster: `${HOWTO_ASSET_DIR}/field-use.jpg`,
    seconds: 3,
    micro: [
      { target: '.journey-field-inline [data-journey="field"]', action: 'click', text: { en: 'Tap Use this field →', bn: 'এই জমি ব্যবহার করুন → চাপুন' } },
    ],
  },
];

export function countWords(s) {
  return String(s ?? '').trim().split(/\s+/).filter(Boolean).length;
}

// Pure done-state reducer: real actions tick steps. Opening the assumptions
// dialog ticks nothing — only saving it does.
export function applyFieldDoneEvent(done, event) {
  const next = { ...done };
  if (event === 'map-interact') next['field-map'] = true;
  if (event === 'area-opened' || event === 'area-saved' || event === 'area-confirmed') next['field-area'] = true;
  if (event === 'constraints-saved') next['field-constraints'] = true;
  if (event === 'field-used') next['field-use'] = true;
  return next;
}

// One open at a time: an explicit id wins, '__closed' collapses all,
// otherwise the current step is the first not done.
export function resolveOpenId(ids, done, openId) {
  if (openId === '__closed') return null;
  if (openId && ids.includes(openId)) return openId;
  return ids.find(id => !done[id]) ?? ids[0] ?? null;
}

// Clip area markup. The animated WebP loads lazily only while playing; the
// poster shows first, and reduced motion never loads the animation.
export function clipMarkup(step, { playing = false, reducedMotion = false } = {}) {
  const alt = `${t(step.title.en, step.title.bn)} — ${t('how it is done', 'যেভাবে করতে হয়')}`;
  if (playing && !reducedMotion) {
    return `<button type="button" class="coach-clip coach-clip--playing" data-coach="watch" data-id="${step.id}" aria-label="${t('Stop the clip', 'ক্লিপ থামান')}">`
      + `<img class="coach-clip-anim" src="${step.clip}" alt="${alt}" width="360">`
      + `<span class="coach-clip-stop" aria-hidden="true">■</span></button>`;
  }
  return `<button type="button" class="coach-clip" data-coach="watch" data-id="${step.id}" aria-label="${t('Watch how', 'দেখুন')}">`
    + `<img class="coach-clip-still" src="${step.poster}" alt="${alt}" width="360" loading="lazy">`
    + `<span class="coach-clip-arrow" aria-hidden="true">▶</span></button>`;
}
