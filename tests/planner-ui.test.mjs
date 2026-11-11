import test from 'node:test';
import assert from 'node:assert/strict';
import { PLANTING } from '../src/legacy/engine.js';
import { recommendedSettings, controlLimits, syncPlannerControl, plantyContext } from '../src/legacy/planner-controls.js';
import { askPlanty } from '../src/legacy/planty.js';
import { plannerAction, setPlantCrop } from '../src/legacy/planner.js';
import { state } from '../src/legacy/ui.js';

test('each crop resets to existing recommendations without changing broadcast mustard', () => {
  for (const [crop, data] of Object.entries(PLANTING)) {
    const settings = recommendedSettings(crop);
    assert.equal(settings.crop, crop);
    assert.equal(settings.usable, 88);
    if (data.row) {
      assert.equal(settings.row, data.row * 100);
      assert.equal(settings.spacing, data.spacing * 100);
      for (const name of ['row', 'spacing']) {
        const limits = controlLimits(crop, name);
        assert.ok(settings[name] >= limits.min && settings[name] <= limits.max);
      }
    } else assert.equal(data.seedRate, 7);
  }
  assert.deepEqual(controlLimits('potato', 'row'), { min: 50, max: 75, step: 1 });
  assert.deepEqual(controlLimits('potato', 'spacing'), { min: 20, max: 35, step: 1 });
});

test('slider and number synchronize both ways, clamp, snap, and retain empty drafts', () => {
  const settings = recommendedSettings('rice');
  const pair = [{ value: '20' }, { value: '20' }];
  const controls = { querySelectorAll: () => pair, style: { setProperty() {} }, querySelector: () => null };
  const edit = (value, type = 'number') => syncPlannerControl({ name: 'row', value, type, closest: () => controls }, settings);
  assert.equal(edit('99'), 30);
  assert.deepEqual(pair.map(input => input.value), ['30', '30']);
  assert.equal(settings.row, 30);
  assert.equal(edit('15', 'range'), 15);
  assert.deepEqual(pair.map(input => input.value), ['15', '15']);
  assert.equal(edit('22.6'), 23);
  assert.equal(edit('-4'), 15);
  assert.equal(edit(''), null);
  assert.equal(edit('NaN'), null);
  assert.equal(settings.row, 15);
});

test('Planty receives current planner numbers and handles an unavailable API in both languages', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'not_configured' }, { status: 503 }));
  const counts = { positions: 200000, net: 0.8, seedKg: null };
  const context = plantyContext('field-1', { ...recommendedSettings('rice'), usable: 80 }, counts, 'en');
  assert.equal(context.rowSpacingCm, 20);
  assert.equal(context.withinRowCm, 20);
  assert.equal(context.usableAreaPct, 80);
  assert.match(await askPlanty({ question: 'How much seed?', context }), /planner numbers still work offline/);
  assert.match(await askPlanty({ question: 'বীজ কত লাগবে?', context: { ...context, lang: 'bn' } }), /অফলাইন/);
  assert.equal(context.plantCount, 200000);
});

test('crop handoffs preserve usable area; reset restores recommendations and keyboard focus', () => {
  const original = { window: globalThis.window, document: globalThis.document, localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') };
  const savedPlanner = { ...state.planner };
  let focused = false;
  globalThis.window = { dispatchEvent() {} };
  globalThis.document = { querySelector: selector => selector === '.plan-reset' ? { focus() { focused = true; } } : null };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() {} } });
  try {
    state.planner.usable = 71;
    setPlantCrop('potato');
    assert.equal(state.planner.usable, 71);
    plannerAction('plan-reset');
    assert.equal(focused, true);
    assert.equal(state.planner.usable, 88);
    assert.equal(state.planner.row, 60);
  } finally {
    Object.assign(state.planner, savedPlanner);
    globalThis.window = original.window;
    globalThis.document = original.document;
    if (original.localStorage) Object.defineProperty(globalThis, 'localStorage', original.localStorage);
    else delete globalThis.localStorage;
  }
});
