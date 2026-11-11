import { t } from './ui.js';
import { plantyMascot } from './planty.js';
import { placeBubble, guideState, advanceGuide, guideMotion } from './planty-guide-helpers.js';

let active = null;
const localText = text => typeof text === 'string' ? text : t(text?.en ?? '', text?.bn);
const motion = () => guideMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const resolveTarget = target => typeof target === 'string' ? document.querySelector(target) : target;
const visible = target => target?.isConnected && target.getClientRects().length > 0;

function waitForTarget(target, signal, timeout = 4000) {
  return new Promise(resolve => {
    let observer, timer;
    const finish = value => {
      observer?.disconnect();
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      resolve(value);
    };
    const cancel = () => finish(null);
    const check = () => {
      const element = resolveTarget(target);
      if (visible(element)) finish(element);
    };
    if (signal.aborted) return finish(null);
    observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
    signal.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(cancel, timeout);
    check();
  });
}

function makeRoot(kind) {
  const root = document.createElement('div');
  root.className = `planty-guide planty-guide--${kind}`;
  root.innerHTML = `<div class="planty-guide__spotlight" aria-hidden="true"></div>
    <div class="planty-guide__ripple" aria-hidden="true"><i></i><i></i><i></i></div>
    <section class="planty-guide__bubble" role="region" aria-label="${t('Planty guide', 'Planty নির্দেশিকা')}" tabindex="-1">
      <div class="planty-guide__message"><span class="planty-guide__mascot"></span><p aria-live="polite" aria-atomic="true"></p></div>
      <p class="planty-guide__instruction"></p><nav aria-label="${t('Guide controls', 'নির্দেশিকার বোতাম')}">
      <button type="button" data-guide="back">${t('Back', 'আগের ধাপ')}</button>
      <button type="button" data-guide="next">${t('Next', 'পরের ধাপ')}</button>
      <button type="button" data-guide="skip">${t('Skip guide', 'নির্দেশিকা বন্ধ করুন')}</button></nav></section>`;
  document.body.append(root);
  return root;
}

function stop() {
  if (!active) return;
  const session = active;
  active = null;
  session.step?.abort();
  session.life.abort();
  clearTimeout(session.timer);
  const restore = session.root.contains(document.activeElement) || document.activeElement === document.body;
  session.root.remove();
  if (restore && session.focus?.isConnected) session.focus.focus({ preventScroll: true });
}

function move(session, event) {
  if (session !== active) return;
  const previous = session.state;
  const next = advanceGuide(previous, event, session.steps.map(step => step.action ?? 'none'));
  if (next === previous) return;
  session.state = next;
  if (next.done) stop();
  else void showStep(session);
  // Action handlers and application renders finish before callbacks start another guide.
  if (event === 'next' || event === 'action') session.steps[previous.index].onDone?.();
  else if (event === 'skip') session.steps[previous.index].onSkip?.();
}

function viewport() {
  const visual = window.visualViewport;
  return { width: visual?.width ?? window.innerWidth, height: visual?.height ?? window.innerHeight,
    x: visual?.offsetLeft ?? 0, y: visual?.offsetTop ?? 0 };
}

function position(session, target) {
  let box = target?.getBoundingClientRect();
  if (target && session.steps[session.state.index].targetAll) {
    const boxes = [...document.querySelectorAll(session.steps[session.state.index].target)]
      .filter(visible).map(element => element.getBoundingClientRect());
    if (boxes.length) {
      const left = Math.min(...boxes.map(rect => rect.left)), right = Math.max(...boxes.map(rect => rect.right));
      const top = Math.min(...boxes.map(rect => rect.top)), bottom = Math.max(...boxes.map(rect => rect.bottom));
      box = { left, right, top, bottom, width: right - left, height: bottom - top };
    }
  }
  const view = viewport();
  const bubble = session.root.querySelector('.planty-guide__bubble');
  const rect = box ?? { left: view.width / 2, right: view.width / 2, top: view.height / 2,
    bottom: view.height / 2, width: 0, height: 0 };
  const local = { ...rect, left: rect.left - view.x, right: rect.right - view.x,
    top: rect.top - view.y, bottom: rect.bottom - view.y, width: rect.width, height: rect.height };
  bubble.style.maxWidth = `${Math.max(0, view.width - 24)}px`;
  bubble.style.maxHeight = `${Math.max(0, view.height - 24)}px`;
  const placed = placeBubble(local, bubble.getBoundingClientRect(), view);
  Object.assign(bubble.style, { left: `${placed.left + view.x}px`, top: `${placed.top + view.y}px` });
  bubble.dataset.side = placed.side;
  for (const node of session.root.querySelectorAll('.planty-guide__spotlight, .planty-guide__ripple')) {
    Object.assign(node.style, { left: `${rect.left - 8}px`, top: `${rect.top - 8}px`,
      width: `${rect.width + 16}px`, height: `${rect.height + 16}px` });
  }
}

async function showStep(session) {
  session.step?.abort();
  const controller = session.step = new AbortController();
  const { signal } = controller;
  const step = session.steps[session.state.index];
  session.root.hidden = true;
  const target = await waitForTarget(step.target, signal, step.timeout);
  if (signal.aborted || session !== active) return;
  if (!target) { move(session, 'missing'); return; }
  if (session.kind === 'tour') target.scrollIntoView({ behavior: step.scrollBehavior ?? motion().behavior, block: 'center', inline: 'nearest' });
  const bubble = session.root.querySelector('.planty-guide__bubble');
  bubble.querySelector('.planty-guide__mascot').innerHTML = plantyMascot(step.pose ?? 'pointing');
  bubble.querySelector('[data-guide="back"]').disabled = session.state.index === 0;
  bubble.querySelector('[data-guide="next"]').disabled = session.state.waiting;
  bubble.querySelector('.planty-guide__instruction').textContent = session.state.waiting
    ? step.action === 'input' ? t('Change the highlighted control to continue.', 'এগোতে চিহ্নিত মাপটি বদলান।')
      : t('Select the highlighted item to continue.', 'এগোতে চিহ্নিত জায়গায় চাপুন।') : '';
  session.root.hidden = false;
  bubble.querySelector('[aria-live]').textContent = localText(step.text);
  const focusTarget = step.action === 'input' ? target : target.matches('button, input, select, textarea, a[href]')
    ? target : target.querySelector('button, input, select, textarea, a[href]');
  if (session.kind === 'tour') (session.state.waiting && focusTarget ? focusTarget : bubble).focus({ preventScroll: true });
  let frame, actionPending = false;
  const update = () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (actionPending) return;
      if (!visible(target) || resolveTarget(step.target) !== target) { void showStep(session); return; }
      position(session, target);
    });
  };
  const observer = new MutationObserver(records => {
    if (records.some(record => !session.root.contains(record.target))) update();
  });
  observer.observe(document.querySelector('#app') ?? document.body, { subtree: true, childList: true, attributes: true });
  const resize = new ResizeObserver(update);
  resize.observe(target);
  resize.observe(bubble);
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  media.addEventListener('change', update, { signal });
  window.addEventListener('scroll', update, { capture: true, passive: true, signal });
  window.addEventListener('resize', update, { signal });
  window.visualViewport?.addEventListener('resize', update, { signal });
  window.visualViewport?.addEventListener('scroll', update, { signal });
  if (session.state.waiting) {
    document.addEventListener(step.action, event => {
      if (actionPending || !event.isTrusted || !target.contains(event.target)) return;
      actionPending = true;
      // Let click/change handlers finish, including synchronous application rerenders.
      const timer = setTimeout(() => { if (!signal.aborted) move(session, 'action'); }, 0);
      signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
    }, { capture: true, signal });
  }
  signal.addEventListener('abort', () => {
    observer.disconnect();
    resize.disconnect();
    cancelAnimationFrame(frame);
  }, { once: true });
  position(session, target);
}

function sequence(steps, kind = 'tour') {
  stop();
  if (!steps.length) return;
  const session = active = { steps: [...steps], kind, state: guideState(steps.length, steps[0].action ?? 'none'),
    root: makeRoot(kind), life: new AbortController(), focus: document.activeElement };
  session.root.addEventListener('click', event => {
    const button = event.target.closest('[data-guide]');
    if (button) move(session, button.dataset.guide);
  }, { signal: session.life.signal });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') stop();
  }, { capture: true, signal: session.life.signal });
  void showStep(session);
}

function hint(target, text) {
  sequence([{ target, text, pose: 'idle' }], 'hint');
  if (!active) return;
  active.root.querySelector('[data-guide="skip"]').textContent = t('Close', 'বন্ধ করুন');
  active.timer = setTimeout(stop, 6000);
}

function celebrate(text) {
  stop();
  const session = active = { root: makeRoot('celebrate'), life: new AbortController(), focus: document.activeElement };
  const bubble = session.root.querySelector('.planty-guide__bubble');
  bubble.querySelector('.planty-guide__mascot').innerHTML = plantyMascot('happy');
  bubble.querySelector('[aria-live]').textContent = localText(text);
  bubble.querySelector('nav').innerHTML = `<button type="button" data-guide="skip">${t('Close', 'বন্ধ করুন')}</button>`;
  const burst = document.createElement('div');
  burst.className = 'planty-guide__burst';
  burst.setAttribute('aria-hidden', 'true');
  burst.innerHTML = Array.from({ length: 12 }, (_, i) => `<i style="--angle:${i * 30}deg;--travel:${60 + i % 3 * 20}px;--color:${['#78a653', '#d5b55b', '#84c9ab'][i % 3]}"></i>`).join('');
  bubble.append(burst);
  const update = () => position(session);
  update();
  window.addEventListener('resize', update, { signal: session.life.signal });
  session.root.addEventListener('click', stop, { signal: session.life.signal });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') stop(); }, { capture: true, signal: session.life.signal });
  session.timer = setTimeout(stop, 3000);
}

/** Data-agnostic singleton. Missing targets skip after 4s; a step may set timeout in milliseconds.
 * onDone runs once per successful visit (Next or the requested real action), never for missing targets or Skip.
 * onSkip runs only when the user selects Skip guide.
 * Back revisits a step and requires its action again. stop() cancels observers, waits and effects.
 */
export const guide = { show: step => sequence([step]), sequence, celebrate, hint, stop };
export default guide;
