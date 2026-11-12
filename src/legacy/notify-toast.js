// Sonner-style toasts for real notification items (daily model brief, Planty review/suggestion, next task).
// Only the timing is staged; content always comes from the notification store.
const KEY = 'ropon_toast_sequence';
const WELCOME_KEY = 'ropon_toast_welcome';
const ICON = { disaster: '🌧', task: '✓', refine: '✦', review: '✦' };
const LABEL = { disaster: ['Live disaster model', 'লাইভ দুর্যোগ মডেল'], task: ['Next task', 'পরের কাজ'],
  refine: ['Planty suggestion', 'প্ল্যান্টির প্রস্তাব'], review: ['Planty review', 'প্ল্যান্টির যাচাই'] };
const ORDER = { disaster: 0, refine: 1, review: 1, task: 2 };
const GAP = 12, PEEK = 14, MAX_VISIBLE = 3;

export function queueToastSequence(storage = globalThis.sessionStorage) {
  try { storage?.setItem(KEY, String(Date.now())); } catch { /* private mode */ }
}
// True once per queued sequence (and only within 10 minutes of the save).
export function consumeToastSequence(storage = globalThis.sessionStorage, now = Date.now()) {
  try {
    const at = Number(storage?.getItem(KEY));
    storage?.removeItem(KEY);
    return Number.isFinite(at) && at > 0 && now - at < 600000;
  } catch { return false; }
}
// True the first time per browser session (welcome toasts on first load).
export function consumeWelcome(storage = globalThis.sessionStorage) {
  try { if (storage?.getItem(WELCOME_KEY)) return false; storage?.setItem(WELCOME_KEY, '1'); return true; } catch { return false; }
}
// Pure: order and timing (first after 1.2 s, then every 4.5 s; max 4 toasts).
export function toastSchedule(items, { first = 1200, gap = 4500, max = 4 } = {}) {
  return [...items].sort((a, b) => (ORDER[a.type] ?? 3) - (ORDER[b.type] ?? 3)).slice(0, max)
    .map((item, i) => ({ item, at: first + i * gap }));
}
// Pure: Sonner stack geometry. index 0 = newest (front). Collapsed: peeking cards; expanded: full list.
export function stackLayout(heights, expanded) {
  let offset = 0;
  return heights.map((h, i) => {
    const y = expanded ? offset : i * PEEK;
    offset += h + GAP;
    return { y, scale: expanded ? 1 : Math.max(0.85, 1 - i * 0.05), opacity: i < MAX_VISIBLE || expanded ? 1 : 0, h };
  });
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lang = () => (document.documentElement.lang === 'bn' ? 1 : 0);

function stackEl() {
  let stack = document.querySelector('.sw-toast-stack');
  if (stack) return stack;
  stack = document.createElement('section');
  stack.className = 'sw-toast-stack';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-label', lang() ? 'বিজ্ঞপ্তি' : 'Notifications');
  const expand = (on) => { stack.classList.toggle('expanded', on); layout(stack); };
  stack.addEventListener('mouseenter', () => expand(true));
  stack.addEventListener('mouseleave', () => expand(false));
  stack.addEventListener('focusin', () => expand(true));
  stack.addEventListener('focusout', (e) => { if (!stack.contains(e.relatedTarget)) expand(false); });
  document.body.append(stack);
  return stack;
}
function layout(stack) {
  const toasts = [...stack.querySelectorAll('.sw-toast:not(.out)')].reverse(); // newest first
  const top = window.matchMedia?.('(max-width: 640px)').matches;
  const expanded = stack.classList.contains('expanded');
  toasts.forEach((t) => { t.style.height = ''; });
  const heights = toasts.map((t) => t.offsetHeight); // natural heights
  const geo = stackLayout(heights, expanded);
  toasts.forEach((t, i) => {
    const g = geo[i];
    t.style.setProperty('--y', `${top ? g.y : -g.y}px`);
    t.style.setProperty('--s', g.scale);
    t.style.opacity = g.opacity;
    t.style.zIndex = String(100 - i);
    // Collapsed like Sonner: cards behind take the front card's height so only a thin edge peeks out.
    if (!expanded && i > 0) t.style.height = `${heights[0]}px`;
    t.setAttribute('aria-hidden', String(!stack.classList.contains('expanded') && i >= MAX_VISIBLE));
  });
  const frontH = geo[0]?.h || 0;
  stack.style.height = `${stack.classList.contains('expanded') ? geo.reduce((n, g) => n + g.h + GAP, 0) : frontH + Math.min(toasts.length - 1, MAX_VISIBLE - 1) * PEEK}px`;
}

export function playToastSequence(items, { onShow, onDismiss, persist = false } = {}) {
  if (typeof document === 'undefined' || !items.length) return;
  const stack = stackEl();
  for (const { item, at } of toastSchedule(items)) setTimeout(() => {
    if (stack.querySelector(`[data-toast-id="${CSS.escape(item.id)}"]`)) return;
    const el = document.createElement('div');
    el.className = `sw-toast sw-toast-${item.type}`;
    el.dataset.toastId = item.id;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="sw-toast-icon" aria-hidden="true">${ICON[item.type] || '•'}</span>
      <div class="sw-toast-copy"><small>${esc((LABEL[item.type] || ['SeedWise', 'SeedWise'])[lang()])}</small><strong>${esc(item.title)}</strong>${item.body ? `<p>${esc(item.body)}</p>` : ''}
      ${item.href ? `<a href="#${esc(item.href)}">${esc(item.cta || 'Open')} →</a>` : ''}</div>
      <button type="button" class="sw-toast-close" aria-label="${lang() ? 'বন্ধ করুন' : 'Dismiss'}">×</button>${persist ? '' : '<i class="sw-toast-timer" aria-hidden="true"></i>'}`;
    const close = () => {
      if (el.classList.contains('out')) return;
      el.classList.add('out'); onDismiss?.(item); layout(stack);
      setTimeout(() => { el.remove(); layout(stack); }, 320);
    };
    el.querySelector('.sw-toast-close').onclick = close;
    el.querySelector('a')?.addEventListener('click', close);
    stack.append(el);
    layout(stack);
    onShow?.(item);
    if (!persist) setTimeout(close, 8000);
  }, at);
}
