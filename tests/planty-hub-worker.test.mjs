import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import diseases from '../public/data/crop-diseases.json' with { type: 'json' };

const env = { MUSE_API_KEY: 'test-only', ASSETS: { fetch: async () => Response.json(diseases) } };
let ip = 0;
function req(path, body, options = {}) {
  return new Request(`https://planty.example${path}`, { method: options.method || 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://planty.example', 'CF-Connecting-IP': `hub-${++ip}`, ...(options.headers || {}) }, body: options.method === 'GET' ? undefined : JSON.stringify(body) });
}

test('planty-chat sanitizes context and sends bounded, grounded prompt', async t => {
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.match(payload.messages[0].content, /Never invent numbers/);
    const data = JSON.parse(payload.messages[1].content);
    assert.equal(data.context.private, undefined);
    assert.equal(data.context.plan.crops[0].rowSpacingCm, 20);
    assert.equal(data.question, 'Plan?');
    return Response.json({ choices: [{ message: { content: JSON.stringify({ answer: 'Check the field.', suggestion: { changes: [{ season: 0, from: 'rice', to: 'potato', why: 'rotation' }], newPlanting: [], evidence: [], confidence: .6 } }) } }] });
  });
  const response = await worker.fetch(req('/api/planty-chat', { question: 'Plan?', lang: 'en', appLang: 'en', context: { plan: { id: 'p', crops: [{ crop: 'rice', rowSpacingCm: 20 }] }, private: 'strip' }, history: [] }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).suggestion.changes[0], { season: 0, from: 'rice', to: 'potato', why: 'rotation' });
});

test('chat sanitizer rejects malformed requests and cross-origin callers', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('invalid request reached Meta'));
  for (const body of [{ question: '', lang: 'en', appLang: 'en', context: {} }, { question: 'x', lang: 'fr', appLang: 'en', context: {} }, { question: 'x', lang: 'en', appLang: 'en', context: [] }]) assert.equal((await worker.fetch(req('/api/planty-chat', body), env)).status, 400);
  assert.equal((await worker.fetch(req('/api/planty-chat', { question: 'x', lang: 'en', appLang: 'en', context: {} }, { headers: { Origin: 'https://bad.example' } }), env)).status, 403);
});

test('clinic segments with SAM then validates Muse diagnoses against disease ids', async t => {
  const prompts=[];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const payload=JSON.parse(options.body);
    if(String(url).endsWith('/responses')) { prompts.push(payload.input[0].content[0].text); return Response.json({ output_text: '<0f>1<|box;x1=100;y1=120;x2=250;y2=300;w=1024;h=1024|><|mask;x=0;y=0;data=5,5,!!!!!(QO(0lu8?|>' }); }
    assert.equal(payload.model, 'muse-spark-1.3');
    const summary=JSON.parse(payload.messages[1].content[0].text).segmentation;assert.equal(summary.lesionCount,1);assert.deepEqual(summary.meanRgb,[90,130,70]);
    assert.ok(payload.messages[1].content.some(part => part.type === 'image_url'));
    return Response.json({ choices: [{ message: { content: JSON.stringify({ diagnoses: [{ id: 'rice_blast', confidence: .6, why: ['Visible lesions'], actions: ['Ask DAE'] }] }) } }] });
  });
  const response=await worker.fetch(req('/api/clinic-analyze',{image:'data:image/jpeg;base64,AA==',width:1024,height:1024,colorMean:[90,130,70],crop:'rice',note:'',lang:'en'}),env);
  assert.equal(response.status,200);const data=await response.json();assert.deepEqual(prompts,['leaf','lesion','insect']);assert.equal(data.diagnoses[0].id,'rice_blast');assert.equal(data.segments.length,3);assert.equal(data.segments[0].mask.width,5);assert.match(data.segments[0].mask.data,/^[A-Za-z0-9+/]+=*$/);
});

test('clinic rejects non-JPEG, unknown crop, and oversized input', async t => {
  t.mock.method(globalThis, 'fetch', () => assert.fail('invalid image reached Meta'));
  for(const body of [{image:'data:image/png;base64,AA==',width:10,height:10,crop:'rice',lang:'en'},{image:'data:image/jpeg;base64,AA==',width:10,height:10,crop:'unknown',lang:'en'},{image:`data:image/jpeg;base64,${'A'.repeat(2700001)}`,width:10,height:10,crop:'rice',lang:'en'}]) assert.notEqual((await worker.fetch(req('/api/clinic-analyze',body),env)).status,200);
});
