import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadData, state } from '../src/legacy/ui.js';
import { STRATEGIES } from '../src/legacy/engine.js';
import { rotationAction, rotationInput, rotations } from '../src/legacy/rotations.js';

test('rotation candidates collapse, expand accessibly, tie, and rerank', async () => {
  globalThis.document = { baseURI: new URL('../public/', import.meta.url).href };
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => JSON.parse(await readFile(url, 'utf8')),
  });
  await loadData();

  const originalWeights = { ...state.weights };
  const originalBenefits = STRATEGIES.map((item) => ({ ...item.benefits }));
  try {
    state.lang = 'en';
    state.fieldId = 'mithapukur';
    state.weights = { water: 4, soil: 3, cost: 2, risk: 3 };
    let html = rotations();
    assert.equal((html.match(/<article class="panel rotation-card/g) || []).length, 1);
    assert.match(html, /Best fit for your priorities · 49\/100/);
    assert.equal((html.match(/class="rotation-candidate-row"/g) || []).length, 3);
    assert.match(html, /data-rotation-id="legume"/);
    assert.match(html, /−3 points/);
    assert.match(html, /aria-expanded="false"[^>]*>Show details/);

    let expanded = false;
    const toggle = { getAttribute: () => 'false', focus: () => { expanded = true; } };
    const list = {
      innerHTML: '',
      querySelector: () => toggle,
    };
    globalThis.document.querySelector = (selector) => selector === '#rotation-list' ? list : null;
    rotationAction('rotation-details', 'baseline');
    html = rotations();
    assert.ok(expanded, 'toggle keeps keyboard focus after rerender');
    assert.match(html, /data-rotation-id="baseline"/);

    state.weights = { water: 5, soil: 0, cost: 0, risk: 0 };
    const pickerItems = ['baseline', 'mustard', 'potato', 'legume'].map((id) => ({
      dataset: { studioRotId: id },
      rank: { textContent: '' },
      score: { textContent: '' },
      querySelector(selector) { return selector === '.studio-rot-rank' ? this.rank : this.score; },
    }));
    const picker = {
      querySelectorAll: () => pickerItems,
      appendChild(item) { pickerItems.splice(pickerItems.indexOf(item), 1); pickerItems.push(item); },
    };
    globalThis.localStorage = { setItem() {} };
    globalThis.document.querySelector = (selector) => selector === '#rotation-list' ? list
      : selector === '.studio-rotations-picker' ? picker
      : { textContent: '' };
    rotationInput({ dataset: { weight: 'water' }, value: '5' });
    assert.deepEqual(pickerItems.map((item) => item.dataset.studioRotId), ['legume', 'mustard', 'baseline', 'potato']);
    html = rotations();
    assert.match(html, /data-rotation-id="legume"/);
    assert.match(html, /data-rotation-id="baseline"/);
    assert.match(html, /aria-expanded="true"[^>]*>Hide details/);

    rotationAction('rotation-details', 'all');
    html = rotations();
    assert.equal((html.match(/<article class="panel rotation-card/g) || []).length, 4);

    STRATEGIES.forEach((item) => {
      Object.keys(item.benefits).forEach((key) => { item.benefits[key] = 0.5; });
    });
    state.weights = { water: 0, soil: 1, cost: 1, risk: 1 };
    html = rotations();
    assert.equal((html.match(/<article class="panel rotation-card/g) || []).length, 4);
    assert.doesNotMatch(html, /Compare other rotations/);
  } finally {
    state.weights = originalWeights;
    STRATEGIES.forEach((item, index) => { item.benefits = originalBenefits[index]; });
    delete globalThis.document.querySelector;
  }
});
