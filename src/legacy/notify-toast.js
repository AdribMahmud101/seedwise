// Timed toast sequence shown once after a plan is completed. It only replays REAL notification items
// (daily model brief, next plan task, Planty's review/suggestion) — the timing is staged, the content is not.
const KEY = 'ropon_toast_sequence';
const ICON = { disaster: '🌧', task: '✓', refine: '✦', review: '✦' };
const LABEL = { disaster: ['Live disaster model', 'লাইভ দুর্যোগ মডেল'], task: ['Next task', 'পরের কাজ'],
  refine: ['Planty suggestion', 'প্ল্যান্টির প্রস্তাব'], review: ['Planty review', 'প্ল্যান্টির যাচাই'] };
const ORDER = { disaster: 0, refine: 1, review: 1, task: 2 };

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
// Pure: order and timing of the sequence (first after 1.2 s, then every 4.5 s; max 4 toasts).
export function toastSchedule(items, { first = 1200, gap = 4500, max = 4 } = {}) {
  return [...items].sort((a, b) => (ORDER[a.type] ?? 3) - (ORDER[b.type] ?? 3)).slice(0, max)
    .map((item, i) => ({ item, at: first + i * gap }));
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const lang = () => (document.documentElement.lang === 'bn' ? 1 : 0);

export function playToastSequence(items, { onShow } = {}) {
  if (typeof document === 'undefined' || !items.length) return;
  let stack = document.querySelector('.sw-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'sw-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.append(stack);
  }
  for (const { item, at } of toastSchedule(items)) setTimeout(() => {
    const el = document.createElement('div');
    el.className = `sw-toast sw-toast-${item.type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="sw-toast-icon" aria-hidden="true">${ICON[item.type] || '•'}</span>
      <div class="sw-toast-copy"><small>${esc((LABEL[item.type] || ['SeedWise', 'SeedWise'])[lang()])}</small><strong>${esc(item.title)}</strong>${item.body ? `<p>${esc(item.body)}</p>` : ''}
      ${item.href ? `<a href="#${esc(item.href)}">${esc(item.cta || 'Open')} →</a>` : ''}</div>
      <button type="button" class="sw-toast-close" aria-label="${lang() ? 'বন্ধ করুন' : 'Dismiss'}">×</button><i class="sw-toast-timer" aria-hidden="true"></i>`;
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 350); };
    el.querySelector('.sw-toast-close').onclick = close;
    el.querySelector('a')?.addEventListener('click', close);
    stack.append(el);
    onShow?.(item);
    setTimeout(close, 8000);
  }, at);
}
