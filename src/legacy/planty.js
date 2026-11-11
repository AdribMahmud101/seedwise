import { t, esc, num } from './ui.js';

let configured = false;

function offlineAnswer(lang) {
  return lang === 'bn'
    ? 'Planty এখন ইন্টারনেটে সংযোগ করতে পারছে না — আপনার পরিকল্পনার হিসাব অফলাইনেও কাজ করে।'
    : "Planty can't reach the internet right now — your planner numbers still work offline.";
}

export async function askPlanty({ question, context }) {
  // This is the single backend boundary; only the Worker contacts the model.
  const { lang, ...fieldContext } = context;
  if (globalThis.navigator?.onLine === false) return offlineAnswer(lang);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch('/api/planty', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, lang, context: fieldContext }), signal: controller.signal,
    });
    const data = await response.json();
    if (response.status === 503 && data?.error === 'not_configured') configured = false;
    if (!response.ok || typeof data?.answer !== 'string' || !data.answer.trim()) return offlineAnswer(lang);
    configured = true;
    return data.answer;
  } catch {
    return offlineAnswer(lang);
  } finally {
    clearTimeout(timeout);
  }
}

export function plantyMascot(pose = 'idle') {
  return `<img class="planty-mascot planty-${pose}" src="/assets/planty/planty-96.webp" srcset="/assets/planty/planty-96.webp 1x, /assets/planty/planty-192.webp 2x, /assets/planty/planty-512.webp 4x" width="50" height="50" alt="" aria-hidden="true" decoding="async">`;
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
    <div class="planty-body"><div class="planty-greeting"><strong>${t('A little help to get growing.', 'চাষের শুরুতে একটু সহায়তা।')}</strong><p>${t('Hi, I’m Planty. Your current crop and settings travel with each question.', 'আমি Planty। প্রতিটি প্রশ্নের সঙ্গে আপনার ফসল ও বর্তমান সেটিংস যুক্ত থাকবে।')}</p><span class="planty-status" ${configured ? 'hidden' : ''}>${t('AI connection not set up', 'এআই সংযোগ চালু হয়নি')}</span></div>
    <div class="planty-suggestions" aria-label="${t('Suggested questions', 'প্রস্তাবিত প্রশ্ন')}">${suggestions(planner)}</div>
    <div class="planty-messages" role="log" aria-live="polite" aria-relevant="additions" aria-label="${t('Conversation', 'কথোপকথন')}">${messages.map(message => messageMarkup(message)).join('')}</div></div>
    <form id="planty-form"><label class="sr-only" for="planty-question">${t('Ask Planty', 'Planty-কে প্রশ্ন করুন')}</label><input id="planty-question" placeholder="${t('Ask about this plan…', 'এই পরিকল্পনা নিয়ে প্রশ্ন…')}" autocomplete="off" maxlength="600" value="${esc(draft)}" required><button type="submit" aria-label="${t('Send question', 'প্রশ্ন পাঠান')}">${t('Send', 'পাঠান')} <span aria-hidden="true">↗</span></button></form>
    <p class="planty-footnote">${t('AI answers can be wrong — check with your local extension officer.', 'এআইয়ের উত্তর ভুল হতে পারে — স্থানীয় কৃষি কর্মকর্তার পরামর্শ নিন।')}</p></aside>
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
    if (!question || question.length > 600 || form.querySelector('button').disabled) return;
    const request = ++activeRequest;
    const context = getContext();
    append({ role: 'user', text: question });
    draft = input.value = '';
    form.querySelector('button').disabled = true;
    panel.querySelector('.planty-header .planty-mascot').outerHTML = plantyMascot('thinking');
    panel.querySelector('.planty-messages').setAttribute('aria-busy', 'true');
    try {
      const text = await askPlanty({ question, context });
      if (request === activeRequest) {
        append({ role: 'assistant', text });
        panel.querySelector('.planty-status').hidden = configured;
      }
    } catch {
      if (request === activeRequest) append({ role: 'assistant', text: offlineAnswer(context.lang) });
    } finally {
      form.querySelector('button').disabled = false;
      panel.querySelector('.planty-header .planty-mascot').outerHTML = plantyMascot('happy');
      panel.querySelector('.planty-messages').setAttribute('aria-busy', 'false');
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
