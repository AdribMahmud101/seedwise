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

test('sources without NASA or partner provenance never produce a badge', () => {
  for (const key of ['sentinel1', 'soilgrids', 'esri', 'fan2017', 'ffwc', 'barc', 'brri']) {
    assert.equal(nasaBadge(key), '');
  }
  assert.match(nasaBadge(['soilgrids', 'sentinel2']), /partner-chip/);
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

test('studio terrain has NASA badges; Sentinel has partner badges; SoilGrids has none', async () => {
  const { readFile } = await import('node:fs/promises');
  const { studio3dHtml, setSurfaceMode } = await import('../src/legacy/studio3d.js');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/studio-data.json', import.meta.url)));
  try {
    for (const mode of ['elevation', 'hypso', 'water', 'ponding', 'ndvi', 'moisture', 'productivity', 'fertility', 'photo', 'crops']) {
      setSurfaceMode(mode);
      const html = studio3dHtml(fixture);
      const surfaceSource = html.match(/<span data-surface-nasa>([\s\S]*?)<\/span>\s*<\/div>/)[1];
      const nasa = ['elevation', 'hypso', 'water', 'ponding'].includes(mode);
      const partner = ['ndvi', 'moisture', 'productivity'].includes(mode);
      assert.equal((surfaceSource.match(/class="nasa-chip"/g) || []).length, nasa ? 1 : 0, mode);
      if (nasa) assert.match(surfaceSource, /NASADEM elevation/);
      if (partner) assert.match(surfaceSource, /partner-chip/);
      if (partner) assert.doesNotMatch(surfaceSource, /NASA HLS/);
      const ids = [...html.matchAll(/id="(nasa-source-\d+)"/g)].map(match => match[1]);
      assert.equal(new Set(ids).size, ids.length);
    }
  } finally { setSurfaceMode('crops'); }
});

test('HLS checks render real seasonal field averages separately from Sentinel detail', async () => {
  const { readFile } = await import('node:fs/promises');
  const { loadData } = await import('../src/legacy/ui.js');
  const { studio3dHtml, setSurfaceMode } = await import('../src/legacy/studio3d.js');
  const fixture = JSON.parse(await readFile(new URL('./fixtures/studio-data.json', import.meta.url)));
  const originalFetch = globalThis.fetch;
  globalThis.document = { baseURI: new URL('../public/', import.meta.url).href };
  globalThis.fetch = async url => ({ ok: true, json: async () => JSON.parse(await readFile(url, 'utf8')) });
  await loadData();
  try {
    for (const [month, ndvi, ndmi, date] of [[2, '0.72', '0.36', '2024-03-09'], [10, '0.79', '0.36', '2024-11-09']]) {
      for (const mode of ['ndvi', 'moisture', 'productivity']) {
        setSurfaceMode(mode);
        const html = studio3dHtml(fixture, month);
        const row = html.split(`<div data-hls-mode="${mode}">`)[1].split('</div>')[0];
        assert.ok(row.includes(mode === 'moisture' ? `NDMI ${ndmi}` : `NDVI ${ndvi}`));
        assert.ok(row.includes(date));
        assert.match(row, />NASA HLS<\/button>/);
        const legend = html.split('<div class="studio-surface-provenance">')[1].split('</div>')[0];
        assert.match(legend, /Field average/);
        assert.ok(legend.includes(date));
        assert.match(legend, /partner-chip/);
        const layer = html.split(`value="${mode}"`)[1].split('data-hls-mode')[0];
        assert.match(layer, /partner-chip/);
        assert.doesNotMatch(layer, />NASA[^<]*<\/button>/);
      }
    }
    const edited = structuredClone(fixture);
    edited.field.boundary = 'farmer';
    const html = studio3dHtml(edited, 10);
    assert.match(html, /HLS average unavailable for edited boundary/);
    assert.doesNotMatch(html, /Field average NDVI/);
    // Missing November never silently substitutes March or a zero value.
    const pack = (await import('../src/legacy/ui.js')).hlsField;
    const observation = pack.sites.mithapukur.observations[1];
    const saved = structuredClone(observation);
    try {
      Object.assign(observation, { ndvi: null, ndmi: null, cellCount: 0, date: null, reason: 'No clear field cells' });
      const missing = studio3dHtml(fixture, 10);
      assert.match(missing, /NASA HLS unavailable · 2024-11-09 · No clear field cells/);
      assert.doesNotMatch(missing, /Field average NDVI|>NASA HLS<\/button>/);
    } finally { Object.assign(observation, saved); }
    state.lang = 'bn';
    assert.match(studio3dHtml(fixture, 10), /মাঠের গড় NDVI/);
  } finally {
    state.lang = 'en';
    setSurfaceMode('crops');
    globalThis.fetch = originalFetch;
    delete globalThis.document;
  }
});
