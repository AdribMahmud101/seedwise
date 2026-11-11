import { t, esc, num } from './ui.js';

export async function askPlanty({ question, context }) {
  // This is the single backend boundary; no request leaves the browser yet.
  void question;
  return context.lang === 'bn'
    ? 'Planty-এর এআই সংযোগ এখনো চালু হয়নি। আপাতত পরিকল্পনার হিসাব দেখতে সেটিংস ব্যবহার করুন।'
    : "Planty's AI connection is not set up yet. Use the planner settings to explore the estimates for now.";
}

export function plantyMascot(pose = 'idle') {
  return `<svg class="planty-mascot planty-${pose}" viewBox="0 0 64 64" fill="none" aria-hidden="true"><g class="planty-leaves"><path d="M32 32C12 33 9 20 11 10c15-1 25 6 21 22Z" fill="#88b85d"/><path d="M32 32C30 16 43 7 55 10c1 13-8 24-23 22Z" fill="#b8d879"/><path d="M32 42V29m0 2L20 20m12 9 12-10" stroke="#315c3d" stroke-width="2.5" stroke-linecap="round"/></g><path d="M15 38h34l-4 17c-6 6-20 6-26 0Z" fill="#e6b984"/><path d="M13 38h38" stroke="#315c3d" stroke-width="3" stroke-linecap="round"/><g class="planty-face" stroke="#315c3d" stroke-width="2.5" stroke-linecap="round"><path d="M25 46v1m14-1v1"/><path class="planty-smile" d="M29 50q3 3 6 0"/></g></svg>`;
}

export function plantySuggestions(planner) {
  const cropNames = {
    rice: t('Aman rice', 'আমন ধান'), potato: t('potatoes', 'আলু'),
    mustard: t('broadcast mustard', 'ছিটিয়ে বোনা সরিষা'), mungbean: t('mungbean', 'মুগ'),
  };
  return [
    planner.crop === 'mustard'
      ? t('How is broadcast mustard seed calculated?', 'ছিটিয়ে বোনা সরিষার বীজের হিসাব কীভাবে হয়?')
      : t(`Is ${num(planner.row)}×${num(planner.spacing)} cm right for ${cropNames[planner.crop]}?`, `${cropNames[planner.crop]}-এর জন্য ${num(planner.row)}×${num(planner.spacing)} সেমি কি ঠিক?`),
    t('How much seed do I need?', 'আমার কতটা বীজ লাগবে?'),
    t('What if I leave 15% for bunds?', 'আইলের জন্য ১৫% রাখলে কী হবে?'),
    t(`What does ${num(planner.usable)}% usable area mean?`, `${num(planner.usable)}% চাষযোগ্য জমি মানে কী?`),
  ];
}

function suggestions(planner) {
  return plantySuggestions(planner).map(question => `<button type="button" class="planty-suggestion" data-question="${esc(question)}">${esc(question)}</button>`).join('');
}

let messages = [];
let open = false;
let draft = '';
let returnFocus = null;
let activeRequest = 0;

export function plantyPanel(planner) {
  return `<div class="planty-shade" hidden></div><aside id="planty-panel" class="planty-panel" aria-labelledby="planty-title" ${open ? '' : 'hidden'}>
    <header class="planty-header">${plantyMascot()}<div><h2 id="planty-title">Planty</h2><span>${t('Your planting companion', 'আপনার বপনের সঙ্গী')}</span></div><button type="button" class="planty-close" aria-label="${t('Close Planty', 'Planty বন্ধ করুন')}">×</button></header>
    <div class="planty-body"><div class="planty-greeting"><strong>${t('A little help to get growing.', 'চাষের শুরুতে একটু সহায়তা।')}</strong><p>${t('Hi, I’m Planty. Your current crop and settings travel with each question.', 'আমি Planty। প্রতিটি প্রশ্নের সঙ্গে আপনার ফসল ও বর্তমান সেটিংস যুক্ত থাকবে।')}</p><span class="planty-status">${t('AI connection not set up', 'এআই সংযোগ চালু হয়নি')}</span></div>
    <div class="planty-suggestions" aria-label="${t('Suggested questions', 'প্রস্তাবিত প্রশ্ন')}">${suggestions(planner)}</div>
    <div class="planty-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="${t('Conversation', 'কথোপকথন')}">${messages.map(message => messageMarkup(message)).join('')}</div></div>
    <form id="planty-form"><label class="sr-only" for="planty-question">${t('Ask Planty', 'Planty-কে প্রশ্ন করুন')}</label><input id="planty-question" placeholder="${t('Ask about this plan…', 'এই পরিকল্পনা নিয়ে প্রশ্ন…')}" autocomplete="off" maxlength="1000" value="${esc(draft)}" required><button type="submit" aria-label="${t('Send question', 'প্রশ্ন পাঠান')}">${t('Send', 'পাঠান')} <span aria-hidden="true">↗</span></button></form>
    <p class="planty-footnote">${t('UI preview · No AI advice yet', 'ইউআই নমুনা · এআই পরামর্শ এখনো নেই')}</p></aside>
    <button type="button" class="planty-launch" aria-controls="planty-panel" aria-expanded="${open}">${plantyMascot('happy')}<span>${t('Ask Planty', 'Planty-কে বলুন')}</span><span class="planty-launch-dot" aria-hidden="true"></span></button>`;
}

function messageMarkup(message) {
  return `<div class="planty-message ${message.role}"><small>${message.role === 'user' ? t('You', 'আপনি') : 'Planty'}</small><p>${esc(message.text)}</p></div>`;
}

export function refreshPlantySuggestions(planner) {
  const host = document.querySelector('.planty-suggestions');
  if (host) host.innerHTML = suggestions(planner);
}

export function mountPlanty(getContext) {
  const panel = document.querySelector('#planty-panel');
  const launch = document.querySelector('.planty-launch');
  const shade = document.querySelector('.planty-shade');
  const input = panel.querySelector('input');
  const form = panel.querySelector('form');
  const mobile = window.matchMedia('(max-width: 700px)');
  const setOpen = (value, focus = true) => {
    if (value && focus) returnFocus = document.activeElement;
    open = value;
    panel.hidden = !open;
    shade.hidden = !open || !mobile.matches;
    launch.setAttribute('aria-expanded', String(open));
    document.querySelector('.planner-workbench').classList.toggle('planty-open', open);
    panel.setAttribute('role', mobile.matches ? 'dialog' : 'complementary');
    if (mobile.matches && open) panel.setAttribute('aria-modal', 'true');
    else panel.removeAttribute('aria-modal');
    document.body.classList.toggle('planty-sheet-open', open && mobile.matches);
    if (focus && open) input.focus({ preventScroll: true });
    if (focus && !open) (returnFocus?.isConnected ? returnFocus : launch).focus({ preventScroll: true });
  };
  launch.onclick = () => setOpen(!open);
  panel.querySelector('.planty-close').onclick = () => setOpen(false);
  shade.onclick = () => setOpen(false);
  panel.onkeydown = event => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
    if (event.key === 'Tab' && mobile.matches) {
      const controls = [...panel.querySelectorAll('button:not(:disabled), input')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  input.oninput = () => { draft = input.value; };
  panel.querySelector('.planty-suggestions').onclick = event => {
    const chip = event.target.closest('[data-question]');
    if (!chip) return;
    input.value = chip.dataset.question;
    form.requestSubmit();
  };
  const append = message => {
    messages.push(message);
    panel.querySelector('.planty-messages').insertAdjacentHTML('beforeend', messageMarkup(message));
    const body = panel.querySelector('.planty-body');
    body.scrollTop = body.scrollHeight;
  };
  form.onsubmit = async event => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question || form.querySelector('button').disabled) return;
    const request = ++activeRequest;
    const context = getContext();
    append({ role: 'user', text: question });
    draft = input.value = '';
    form.querySelector('button').disabled = true;
    panel.querySelector('.planty-mascot').classList.replace('planty-idle', 'planty-thinking');
    try {
      const text = await askPlanty({ question, context });
      if (request === activeRequest) append({ role: 'assistant', text });
    } catch {
      if (request === activeRequest) append({ role: 'assistant', text: context.lang === 'bn' ? 'Planty-এর সঙ্গে সংযোগ হয়নি। আবার চেষ্টা করুন।' : 'Could not connect to Planty. Please try again.' });
    } finally {
      form.querySelector('button').disabled = false;
      panel.querySelector('.planty-mascot').classList.replace('planty-thinking', 'planty-idle');
    }
  };
  const resize = () => setOpen(open, false);
  mobile.addEventListener('change', resize);
  setOpen(open, false);
  return () => {
    ++activeRequest;
    mobile.removeEventListener('change', resize);
    document.body.classList.remove('planty-sheet-open');
  };
}
