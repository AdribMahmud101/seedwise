import test from 'node:test';
import assert from 'node:assert/strict';
import { askPlanty, mountPlanty, plantyPanel } from '../src/legacy/planty.js';
import { plantyContext, recommendedSettings } from '../src/legacy/planner-controls.js';
import { state } from '../src/legacy/ui.js';

function setGlobal(t, name, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  });
}

test('planner context uses API fields and retains scenario provenance without yield estimates', () => {
  const counts = { net: 0.8, positions: 200000, seedKg: null, low: 4, high: 6 };
  assert.deepEqual(plantyContext('field-1', { ...recommendedSettings('rice'), usable: 80 }, counts, 'bn', { fieldName: 'My field', month: 11 }), {
    fieldId: 'field-1', fieldName: 'My field', crop: 'rice', rowSpacingCm: 20, withinRowCm: 20,
    usableAreaPct: 80, areaHa: 0.8, plantCount: 200000, seedKg: null, month: 11, lang: 'bn',
    truthLabels: { rowSpacingCm: 'FARMER_REPORTED', withinRowCm: 'FARMER_REPORTED', usableAreaPct: 'SCENARIO', areaHa: 'SCENARIO', plantCount: 'SCENARIO', seedKg: 'SCENARIO' },
  });
  const broadcast = plantyContext('field-1', recommendedSettings('mustard'), { net: 1, positions: null, seedKg: 7 }, 'en');
  assert.equal(broadcast.rowSpacingCm, null);
  assert.equal(broadcast.withinRowCm, null);
  assert.equal(broadcast.plantCount, null);
  assert.equal(broadcast.seedKg, 7);
});

test('askPlanty posts language and context to the same-origin API and returns plain text', async t => {
  setGlobal(t, 'navigator', { onLine: true });
  const context = { fieldId: 'field-1', areaHa: 0.8, lang: 'bn' };
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/planty');
    assert.equal(options.method, 'POST');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(new Headers(options.headers).get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(options.body), { question: 'বীজ কত লাগবে?', lang: 'bn', context: { fieldId: 'field-1', areaHa: 0.8 } });
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ answer: '<b>Use your planner</b>\nCheck locally.', source: 'muse-ember-1.0' });
  });
  assert.equal(await askPlanty({ question: 'বীজ কত লাগবে?', context }), '<b>Use your planner</b>\nCheck locally.');
});

test('offline and API errors return friendly fallback in the requested language', async t => {
  setGlobal(t, 'navigator', { onLine: false });
  const mocked = t.mock.method(globalThis, 'fetch', () => assert.fail('offline must not fetch'));
  assert.match(await askPlanty({ question: 'Seed?', context: { lang: 'en' } }), /Planty can't reach the internet right now — your planner numbers still work offline\./);
  assert.match(await askPlanty({ question: 'বীজ?', context: { lang: 'bn' } }), /অফলাইন/);
  navigator.onLine = true;
  for (const respond of [
    () => Response.json({ error: 'unavailable' }, { status: 503 }),
    () => Response.json({ error: 'rate_limited' }, { status: 429 }),
    () => new Response('invalid JSON'), () => Response.json({ answer: '' }),
    () => Response.json({ answer: {} }), () => { throw new Error('network'); },
  ]) {
    mocked.mock.mockImplementation(respond);
    assert.match(await askPlanty({ question: 'Seed?', context: { lang: 'en' } }), /planner numbers still work offline/);
  }
});

test('browser request aborts after 25 seconds and restores fallback', async t => {
  setGlobal(t, 'navigator', { onLine: true });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  t.mock.method(globalThis, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    signal = options.signal;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const pending = askPlanty({ question: 'Seed?', context: { lang: 'en' } });
  t.mock.timers.tick(24999);
  assert.equal(signal.aborted, false);
  t.mock.timers.tick(1);
  assert.match(await pending, /planner numbers still work offline/);
  assert.equal(signal.aborted, true);
});

function mount(t) {
  let dispose;
  t.after(() => dispose?.());
  const input = { value: 'Seed?', focus() {} };
  const button = { disabled: false };
  const form = { querySelector: () => button };
  const mascot = { outerHTML: '' };
  const status = { hidden: false };
  const log = { html: '', insertAdjacentHTML(_where, html) { this.html += html; }, setAttribute() {} };
  const classes = { toggle() {}, remove() {} };
  const elements = {
    input, form, '.planty-close': {}, '.planty-suggestions': {}, '.planty-messages': log,
    '.planty-body': { scrollTop: 0, scrollHeight: 10 }, '.planty-status': status,
    '.planty-header .planty-mascot': mascot,
  };
  const panel = { querySelector: selector => elements[selector], setAttribute() {}, removeAttribute() {} };
  const document = {
    querySelector: selector => ({ '#planty-panel': panel, '.planty-launch': { setAttribute() {} }, '.planty-shade': {}, '.planner-workbench': { classList: classes } })[selector],
    body: { classList: classes },
  };
  setGlobal(t, 'document', document);
  setGlobal(t, 'window', { matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  dispose = mountPlanty(() => ({ lang: 'en', areaHa: 0.8 }));
  return { input, form, button, mascot, log, status };
}

test('chat shows thinking then happy, escapes markup, and updates the setup pill', async t => {
  setGlobal(t, 'navigator', { onLine: true });
  let complete;
  const mocked = t.mock.method(globalThis, 'fetch', () => new Promise(resolve => { complete = resolve; }));
  const ui = mount(t);
  const pending = ui.form.onsubmit({ preventDefault() {} });
  assert.equal(ui.button.disabled, true);
  assert.match(ui.mascot.outerHTML, /planty-thinking/);
  complete(Response.json({ answer: '<script>alert(1)</script>\nSecond line.', source: 'muse-ember-1.0' }));
  await pending;
  assert.equal(ui.button.disabled, false);
  assert.match(ui.mascot.outerHTML, /planty-happy/);
  assert.match(ui.log.html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;\nSecond line\./);
  assert.doesNotMatch(ui.log.html, /<script>/);
  assert.equal(ui.status.hidden, true);
  assert.match(plantyPanel(recommendedSettings('rice')), /class="planty-status" hidden/);

  mocked.mock.mockImplementation(() => Response.json({ error: 'not_configured' }, { status: 503 }));
  ui.input.value = 'Try again';
  await ui.form.onsubmit({ preventDefault() {} });
  assert.equal(ui.status.hidden, false);
  assert.match(ui.log.html, /planner numbers still work offline/);
});

test('panel includes localized disclaimer and enforces the question length', () => {
  const lang = state.lang;
  try {
    state.lang = 'en';
    const english = plantyPanel(recommendedSettings('rice'));
    assert.match(english, /AI answers can be wrong — check with your local extension officer\./);
    assert.match(english, /maxlength="600"/);
    assert.doesNotMatch(english, /UI preview/);
    state.lang = 'bn';
    assert.match(plantyPanel(recommendedSettings('rice')), /স্থানীয় কৃষি কর্মকর্তার/);
  } finally { state.lang = lang; }
});
