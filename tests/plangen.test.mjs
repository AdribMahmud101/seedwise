import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// localStorage/sessionStorage before legacy imports read them.
const storage = new Map();
globalThis.localStorage = { getItem: k => storage.get(k) ?? null,
  setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) };
const session = new Map();
globalThis.sessionStorage = { getItem: k => session.get(k) ?? null,
  setItem: (k, v) => session.set(k, String(v)), removeItem: k => session.delete(k) };

const tolerant = JSON.parse(readFileSync(new URL('../public/data/tolerant-varieties.json', import.meta.url)));
const rag = readFileSync(new URL('../helper/prompts/design/disaster-tolerant-crops-rag.md', import.meta.url), 'utf8');
const earth = JSON.parse(readFileSync(new URL('../public/data/earth-data.json', import.meta.url)));
const agronomy = JSON.parse(readFileSync(new URL('../public/data/agronomy.json', import.meta.url)));
const outlook = JSON.parse(readFileSync(new URL('../public/data/outlook.json', import.meta.url)));
const flood = JSON.parse(readFileSync(new URL('../public/data/flood-fields.json', import.meta.url)));
const smap = JSON.parse(readFileSync(new URL('../public/data/smap.json', import.meta.url)));
const grace = JSON.parse(readFileSync(new URL('../public/data/grace-groundwater.json', import.meta.url)));
const waterTable = JSON.parse(readFileSync(new URL('../public/data/water-table.json', import.meta.url)));
const soil = JSON.parse(readFileSync(new URL('../public/data/soil-nutrients.json', import.meta.url)));

const KNOWN_LABELS = new Set(['official_trait', 'research_candidate', 'requires_local_validation', 'stock_unverified']);

test('tolerant-varieties.json is built only from the RAG report', () => {
  assert.ok(tolerant.varieties.length >= 20);
  for (const v of tolerant.varieties) {
    assert.ok(v.variety && v.tolerance && v.season, v.id);
    assert.ok(Array.isArray(v.crops) && v.crops.length, v.id);
    assert.ok(Array.isArray(v.hazards) && v.hazards.length, v.id);
    assert.ok(Array.isArray(v.evidence) && v.evidence.length, v.id);
    for (const label of v.evidence) assert.ok(KNOWN_LABELS.has(label), `${v.id}: ${label}`);
    assert.ok(Array.isArray(v.sources) && v.sources.every(u => u.startsWith('https://')), v.id);
    // Every variety name must appear in the source report (pairs like
    // "BRRI dhan42, dhan43" are split into one entry each, so the short
    // name counts too).
    assert.ok(rag.includes(v.variety) || rag.includes(v.variety.replace(/^(BRRI|BARI|BWMRI) /, '')), `${v.variety} not in report`);
  }
  // Report gaps are honored: no mustard/lentil/mungbean entries.
  assert.ok(!tolerant.varieties.some(v => v.crops.some(c => ['mustard', 'lentil', 'mungbean'].includes(c))));
});

test('pipeline pure helpers: thinking line, hazards, variety matching', async () => {
  const pl = await import('../src/legacy/plan-pipeline.js');
  const plan = { field: { id: 'mithapukur', name: 'Test field', areaHa: 0.09 },
    rotation: { seasons: [
      { key: 'aman', crop: 'aman', cropBn: 'আমন', sowMonth: 7, harvestMonth: 11 },
      { key: 'potato', crop: 'potato', cropBn: 'আলু', sowMonth: 11, harvestMonth: 2 },
    ] }, planting: {} };
  assert.match(pl.thinkingLine(plan, 'en'), /Reading your plan: Aman rice, Potato/);
  assert.match(pl.thinkingLine(plan, 'en'), /Test field/);
  assert.match(pl.thinkingLine(plan, 'bn'), /আপনার পরিকল্পনা পড়া হচ্ছে/);

  const hazards = pl.hazardsFor(plan, flood, outlook);
  assert.ok(hazards.includes('cold')); // Nov-sown winter crop
  const riceHazards = ['flood', 'submergence'];
  const matches = pl.pickTolerantVarieties(['aman', 'potato'], riceHazards, tolerant);
  assert.ok(matches.length > 0 && matches.length <= 4);
  assert.equal(matches[0].variety, 'BRRI dhan51'); // official submergence trait first
  assert.ok(matches.every(v => v.crops.includes('rice')));
  // Mustard has no evidence in the report → no match, never invented.
  assert.deepEqual(pl.pickTolerantVarieties(['mustard'], riceHazards, tolerant), []);
  assert.deepEqual(pl.pickTolerantVarieties(['aman'], riceHazards, null), []);
});

test('pipeline pure helpers: resilience, soil, water, weather, NASA list', async () => {
  const pl = await import('../src/legacy/plan-pipeline.js');
  const plan = { field: { id: 'mithapukur', name: 'F', areaHa: 0.09 },
    rotation: { seasons: [{ key: 'aman', crop: 'aman', sowMonth: 7, harvestMonth: 11 }] } };
  const monthly = earth.fields.find(f => f.id === 'mithapukur').monthly;
  const parts = pl.resilienceParts(plan, monthly, waterTable, grace);
  assert.ok(parts.needMm > 0 && parts.rainMm > 0);
  assert.ok(parts.wtdM > 0 && parts.graceCm && Number.isFinite(parts.graceCm.value));
  assert.match(pl.resilienceLine(parts, 'en'), /Need \d+ mm vs rain \d+ mm/);
  assert.match(pl.resilienceLine(parts, 'en'), /Water table/);
  assert.equal(pl.resilienceLine({ needMm: null, rainMm: null, wtdM: null, graceCm: null }, 'en'), null);

  assert.match(pl.soilLine(soil.sites.mithapukur, 'en'), /pH 6\.1/);
  assert.match(pl.soilLine(soil.sites.mithapukur, 'en'), /Estimated/);
  assert.equal(pl.soilLine(null, 'en'), null);
  assert.match(pl.smapLine(smap.sites.mithapukur, 'en'), /Root zone \d+\.\d+ m³\/m³/);
  assert.equal(pl.smapLine(null, 'en'), null);
  assert.ok(pl.weatherLine('mithapukur', outlook, 'en')?.length > 0);
  assert.equal(pl.weatherLine('mithapukur', null, 'en'), null);

  const nasa = pl.nasaList('mithapukur', { earth, smap, grace, flood });
  assert.ok(nasa.every(n => n.ok)); // all six datasets cover mithapukur
  assert.deepEqual(pl.nasaList('mithapukur', {}).filter(n => n.ok), []);
});

test('pipeline pure helpers: live-response extractors and fetch wrapper', async () => {
  const pl = await import('../src/legacy/plan-pipeline.js');
  assert.deepEqual(pl.extractFloodLive({ scenes: [{ water_fraction_buffer300m: 0.02, date: '2024-08-01' }] }),
    { value: 0.02, date: '2024-08-01' });
  assert.equal(pl.extractFloodLive({ nope: 1 }), null);
  assert.equal(pl.extractFloodLive(null), null);
  assert.equal(pl.extractOutlookLive({ months: [{ p50: 0.01, climatology: 0.1 }] }), 'below');
  assert.equal(pl.extractOutlookLive({}), null);

  const ok = await pl.liveFetch('https://x.test', 1000, async () => ({ ok: true, json: async () => ({ a: 1 }) }));
  assert.equal(ok.ok, true);
  assert.ok(ok.ms >= 0);
  const bad = await pl.liveFetch('https://x.test', 1000, async () => ({ ok: false, status: 500 }));
  assert.equal(bad.ok, false);
  const slow = await pl.liveFetch('https://x.test', 30, () => new Promise(() => {}));
  assert.equal(slow.ok, false);
  assert.equal(slow.error, 'timeout');
});

test('pipeline shell: ten steps, skip button, sized SVGs', async () => {
  const pl = await import('../src/legacy/plan-pipeline.js');
  const html = pl.pipelineShell({}, 'en');
  assert.match(html, /id="plan-pipeline"/);
  assert.match(html, /data-action="plan-pipeline-skip"/);
  assert.equal((html.match(/data-step="/g) ?? []).length, 10);
  for (const id of ['thinking', 'loading', 'water-check', 'models', 'varieties', 'nasa', 'soil', 'water', 'weather', 'report']) {
    assert.ok(html.includes(`data-step="${id}"`), id);
  }
  const stripped = html.replaceAll(/<svg width="\d+" height="\d+"[^>]*>/g, '');
  assert.ok(!/<svg[^>]*>/.test(stripped));
  assert.match(pl.pipelineShell({}, 'bn'), /এড়িয়ে যান/);
});

test('pipeline plays once per plan; regenerate replays', async () => {
  const pl = await import('../src/legacy/plan-pipeline.js');
  assert.equal(pl.shouldPlayPipeline({ id: 'p1', field: {}, rotation: {} }), true);
  pl.markPipelineSeen('p1');
  assert.equal(pl.shouldPlayPipeline({ id: 'p1', field: {}, rotation: {} }), false);
  assert.equal(pl.shouldPlayPipeline({ id: 'p2', field: {}, rotation: {} }), true);
  pl.requestReplay();
  assert.equal(pl.shouldPlayPipeline({ id: 'p1', field: {}, rotation: {} }), true); // replay consumed
  assert.equal(pl.shouldPlayPipeline({ id: 'p1', field: {}, rotation: {} }), false);
  assert.equal(pl.shouldPlayPipeline(null), false);
});

test('plan page: first open shows pipeline, later opens show report directly', async () => {
  storage.clear(); session.clear();
  const journey = await import('../src/legacy/journey.js');
  const ui = await import('../src/legacy/ui.js');
  const planPage = await import('../src/legacy/plan.js');
  const site = earth.fields.find(f => f.id === 'mithapukur');
  journey.startPlan({ mode: 'own' });
  journey.confirmField(journey.fieldSnapshot(site, ui.basePolygon(site), ui.defaultProfile()));
  journey.confirmRotation(journey.rotationSnapshot('legume', ui.defaultPriorities(), agronomy));
  journey.confirmPlanting();
  journey.markPlanGenerated({});
  ui.state.lang = 'en';
  const first = planPage.plan();
  assert.match(first, /id="plan-pipeline"/);
  assert.match(first, /plg-report plg-hidden/);
  assert.match(first, /data-action="plan-regenerate"/);
  const second = planPage.plan(); // seen flag was NOT set by render alone
  assert.match(second, /id="plan-pipeline"/);
  const pl = await import('../src/legacy/plan-pipeline.js');
  pl.markPipelineSeen(journey.getPlan().id);
  const third = planPage.plan();
  assert.ok(!third.includes('id="plan-pipeline"'));
  assert.match(third, /id="plan-summary-body"/);
});

test('worker passes the tolerant excerpt to plan-summary context', async t => {
  const worker = (await import('../worker/index.js')).default;
  const { tolerantShortlist } = await import('../worker/index.js');
  const note = tolerantShortlist(['aman'], ['flood', 'submergence'], tolerant);
  assert.match(note, /BRRI dhan51/);
  assert.match(note, /official_trait/);
  assert.equal(tolerantShortlist(['mustard'], ['flood'], tolerant), '');
  assert.equal(tolerantShortlist([], [], tolerant), '');

  let system = '';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (String(url).includes('api.meta.ai')) {
      system = JSON.parse(options.body).messages[0].content;
      return Response.json({ choices: [{ message: { content: 'Fine plan. Sow on time.' } }] });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  const env = { MUSE_API_KEY: crypto.randomUUID(),
    ASSETS: { fetch: async req => Response.json(tolerant) } };
  const res = await worker.fetch(new Request('https://planty.example/api/plan-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://planty.example', 'CF-Connecting-IP': 'plangen-1' },
    body: JSON.stringify({ lang: 'en', plan: { mode: 'own',
      field: { id: 'mithapukur', name: 'F', areaHa: 0.09 },
      flood: 'Water up to 1.5% near the field on 6 clear days (experimental AI).',
      rotation: { id: 'legume', name: 'L', seasons: [{ key: 'aman', crop: 'aman', sowMonth: 7, harvestMonth: 11 }] },
      planting: {} } }),
  }), env);
  assert.equal(res.status, 200);
  assert.match(system, /BRRI dhan51/);
  assert.match(system, /at most 2/);
});
