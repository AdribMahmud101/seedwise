import { HOWTO_ASSET_DIR, FIELD_HOWTO_STEPS, ROTATION_HOWTO_STEPS } from './howto-field.js';

const step = (id, title, why, how, target, micro, seconds = 4) => ({
  id, title, why, how, target,
  clip: `${HOWTO_ASSET_DIR}/${id}.webp`,
  poster: `${HOWTO_ASSET_DIR}/${id}.jpg`,
  seconds,
  micro,
});
const copy = (en, bn) => ({ en, bn });

export const PLANTING_HOWTO_STEPS = [
  step('planting-open-season', copy('Open a season', 'একটি মৌসুম খুলুন'), copy('Each season has its own planting settings', 'প্রতিটি মৌসুমের বপনের মাপ আলাদা'), copy('Choose a season and check its crop and dates', 'মৌসুম বেছে ফসল ও তারিখ দেখুন'), '#plan-seasons', [
    { target: '#plan-seasons [role="tab"]', action: 'click', text: copy('Choose a season tab', 'একটি মৌসুমের ট্যাব বেছে নিন') },
    { target: '.plan-settings .panel-header', action: 'none', text: copy('Check the season number, crop, and dates', 'মৌসুমের নম্বর, ফসল ও তারিখ দেখুন') },
  ]),
  step('planting-adjust-spacing', copy('Adjust spacing', 'দূরত্ব ঠিক করুন'), copy('Spacing sets how many plants fit', 'দূরত্ব ঠিক করে কত গাছ বসবে'), copy('Change any setting, then tap Next', 'যেকোনো মাপ বদলে Next চাপুন'), '.plan-settings', [
    { target: '.plan-settings .plan-locked-crop, .plan-settings .plan-crops', action: 'none', text: copy('Check the crop; change it if needed, then tap Next', 'ফসল দেখুন; দরকারে বদলে Next চাপুন') },
    { target: '#plan-usable-range', action: 'none', text: copy('Usable area leaves room for paths and drains; adjust, then tap Next', 'চাষযোগ্য জমি পথ ও নালার জায়গা রাখে; বদলে Next চাপুন') },
    { target: '#plan-row-range', action: 'none', text: copy('Row spacing is distance between rows; adjust, then tap Next', 'সারির দূরত্ব হলো দুই সারির ফাঁক; বদলে Next চাপুন') },
    { target: '#plan-spacing-range', action: 'none', text: copy('Within-row spacing is distance between plants; adjust, then tap Next', 'গাছের দূরত্ব হলো সারির গাছগুলোর ফাঁক; বদলে Next চাপুন') },
    { target: '[data-action="plan-reset"]', action: 'click', optional: true, text: copy('Reset all settings to the recommendation', 'সব মাপ প্রস্তাবিত মানে ফেরান') },
  ]),
  step('planting-save-next', copy('Save & next', 'সংরক্ষণ করে এগোন'), copy('Save this season before opening the next', 'পরের মৌসুম খোলার আগে এটি সংরক্ষণ করুন'), copy('Save this season and continue', 'মৌসুমটি সংরক্ষণ করে এগিয়ে যান'), '[data-action="plan-confirm"]', [
    { target: '[data-action="plan-confirm"]', action: 'click', text: copy('Save & next: save this season and continue', 'সংরক্ষণ করে পরের মৌসুমে যান') },
  ]),
  step('planting-finish', copy('Finish', 'শেষ করুন'), copy('Finish to see your complete plan', 'পুরো পরিকল্পনা দেখতে শেষ করুন'), copy('Save & see my plan → or Finish my plan →', 'Save & see my plan → বা Finish my plan → চাপুন'), '[data-action="plan-confirm"], [data-journey="finish"]', [
    { target: '[data-action="plan-confirm"], [data-journey="finish"]', action: 'click', text: copy('Save & see my plan → or Finish my plan →', 'Save & see my plan → বা Finish my plan → চাপুন') },
  ]),
];

export const MY_PLANS_HOWTO_STEPS = [
  step('plan-open', copy('Open your plan', 'আপনার পরিকল্পনা খুলুন'), copy('Open the newest saved plan', 'সর্বশেষ সংরক্ষিত পরিকল্পনা খুলুন'), copy('Tap Open plan → on the newest card', 'সর্বশেষ কার্ডে Open plan → চাপুন'), '.plan-card:first-child [data-plans-action="open"]', [
    { target: '.plan-card:first-child [data-plans-action="open"]', action: 'click', text: copy('Open plan →', 'Open plan → চাপুন') },
  ]),
  step('plan-calendar', copy('Read the calendar', 'ক্যালেন্ডার দেখুন'), copy('See when each crop grows', 'কোন ফসল কখন হবে দেখুন'), copy('Read the season calendar', 'মৌসুমের ক্যালেন্ডার দেখুন'), '#plan-calendar', [
    { target: '#plan-calendar', action: 'none', text: copy('This calendar shows each crop season', 'এই ক্যালেন্ডারে প্রতিটি ফসলের মৌসুম দেখা যায়') },
  ]),
  step('plan-task', copy('Tick your first task', 'প্রথম কাজটি টিক দিন'), copy('Track work as you complete it', 'কাজ শেষ হলে চিহ্ন দিয়ে রাখুন'), copy('Tick the first checklist task', 'তালিকার প্রথম কাজটি টিক দিন'), '#plan-checklist input[type="checkbox"]', [
    { target: '#plan-checklist input[type="checkbox"]', action: 'click', text: copy('Tick your first task', 'প্রথম কাজটি টিক দিন') },
  ]),
  step('plan-download', copy('Download', 'ডাউনলোড করুন'), copy('Keep an offline copy of your plan', 'পরিকল্পনার অফলাইন কপি রাখুন'), copy('Download plan (.html)', 'Download plan (.html) চাপুন'), '#plan-download', [
    { target: '#plan-download', action: 'click', text: copy('Download plan (.html)', 'Download plan (.html) চাপুন') },
  ]),
];

export const HOWTO_STEPS = {
  field: FIELD_HOWTO_STEPS,
  rotations: ROTATION_HOWTO_STEPS,
  planner: PLANTING_HOWTO_STEPS,
  plans: MY_PLANS_HOWTO_STEPS,
  plan: MY_PLANS_HOWTO_STEPS,
};
