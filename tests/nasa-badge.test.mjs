import test from 'node:test';
import assert from 'node:assert/strict';
import { nasaBadge, nasaSources, state } from '../src/legacy/ui.js';

test('NASA registry has bilingual facts and HTTPS sources', () => {
  for (const entry of Object.values(nasaSources)) {
    assert.match(entry.url, /^https:\/\//);
    for (const key of ['label', 'name', 'line', 'res']) {
      assert.equal(entry[key].length, 2);
      assert.ok(entry[key].every(text => typeof text === 'string' && text.length));
    }
  }
});

test('NASA badge has unique accessible popup controls and source links', () => {
  for (const lang of ['en', 'bn']) {
    state.lang = lang;
    const html = nasaBadge(['power', 'imerg'], '2021–2025');
    assert.equal((html.match(/class="nasa-chip"/g) || []).length, 1);
    assert.match(html, /<button type="button"/);
    assert.match(html, /aria-expanded="false"/);
    const id = html.match(/aria-controls="([^"]+)"/)[1];
    assert.ok(html.includes(`id="${id}"`));
    assert.ok(!nasaBadge('power').includes(`id="${id}"`));
    assert.match(html, /role="dialog"/);
    assert.match(html, /target="_blank" rel="noopener"/);
    assert.ok(html.includes(nasaSources.power.line[lang === 'bn' ? 1 : 0]));
    assert.match(html, /2021–2025/);
  }
  state.lang = 'en';
});

test('non-NASA sources never produce a badge', () => {
  for (const key of ['sentinel2', 'sentinel1', 'soilgrids', 'esri', 'fan2017', 'ffwc', 'barc', 'brri']) {
    assert.equal(nasaBadge(key), '');
  }
  assert.equal(nasaBadge(['soilgrids', 'sentinel2']), '');
});

test('registry URLs are recorded in shipped data or the source register', async () => {
  const { readFile } = await import('node:fs/promises');
  const data = JSON.parse(await readFile(new URL('../public/data/earth-data.json', import.meta.url)));
  const register = (await Promise.all(['13-source-register', '18-field-map-stack'].map(name => readFile(new URL(`../spec/${name}.md`, import.meta.url), 'utf8')))).join('\n');
  for (const [key, entry] of Object.entries(nasaSources)) {
    assert.ok(data.sources.some(source => source.url === entry.url) || register.includes(entry.url), key);
  }
});

test('rendered source badges distinguish Landsat from Sentinel and retain the SMAP data year', async () => {
  const { readFile } = await import('node:fs/promises');
  const { loadData } = await import('../src/legacy/ui.js');
  const { seasonView } = await import('../src/legacy/fields.js');
  const { water } = await import('../src/legacy/water.js');
  const originalFetch = globalThis.fetch;
  globalThis.document = { baseURI: new URL('../public/', import.meta.url).href };
  globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) });
  try {
    await loadData();
    state.fieldId = 'mithapukur';
    for (const lang of ['en', 'bn']) {
      state.lang = lang;
      state.historyYear = 2024;
      state.month = 0;
      const optical = html => html.split(lang === 'en' ? '<h2>Dated optical observation</h2>' : '<h2>স্যাটেলাইট পর্যবেক্ষণ</h2>')[1].split('</section>')[0];
      assert.match(optical(seasonView()), /nasa-chip/);
      state.month = 10;
      assert.doesNotMatch(optical(seasonView()), /nasa-chip/);
      state.historyYear = 2021;
      const html = seasonView();
      const smapTile = html.match(/<article class="data-stat">(?:(?!<\/article>)[\s\S])*NASA SMAP L4 soil moisture(?:(?!<\/article>)[\s\S])*<\/article>/)?.[0]
        || html.match(/<article class="data-stat">(?:(?!<\/article>)[\s\S])*নাসা SMAP L4 মাটির আর্দ্রতা(?:(?!<\/article>)[\s\S])*<\/article>/)?.[0];
      assert.ok(smapTile);
      assert.match(smapTile, / · 2024<\/small>/);
      assert.doesNotMatch(smapTile, / · 2021<\/small>/);
      state.tabs.water = 'soil';
      const soil = water().split(lang === 'en' ? '<h2>Local soil evidence</h2>' : '<h2>এলাকার মাটির প্রমাণ</h2>')[1].split('</section>')[0];
      assert.doesNotMatch(soil, /nasa-chip/);
    }
  } finally {
    state.lang = 'en';
    state.month = 10;
    state.historyYear = 2024;
    state.tabs.water = 'budget';
    globalThis.fetch = originalFetch;
    delete globalThis.document;
  }
});

test('studio terrain layers have one source badge; Sentinel and SoilGrids layers have none', async () => {
  const { readFile } = await import('node:fs/promises');
  const { studio3dHtml, setSurfaceMode } = await import('../src/legacy/studio3d.js');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/studio-data.json', import.meta.url)));
  try {
    for (const mode of ['elevation', 'hypso', 'water', 'ponding', 'ndvi', 'moisture', 'fertility', 'photo', 'crops']) {
      setSurfaceMode(mode);
      const html = studio3dHtml(fixture);
      const surfaceSource = html.match(/<span data-surface-nasa>([\s\S]*?)<\/span>\s*<\/div>/)[1];
      const nasa = ['elevation', 'hypso', 'water', 'ponding'].includes(mode);
      assert.equal((surfaceSource.match(/class="nasa-chip"/g) || []).length, nasa ? 1 : 0, mode);
      if (nasa) assert.match(surfaceSource, /NASADEM elevation/);
      const ids = [...html.matchAll(/id="(nasa-source-\d+)"/g)].map(match => match[1]);
      assert.equal(new Set(ids).size, ids.length);
    }
  } finally { setSurfaceMode('crops'); }
});
