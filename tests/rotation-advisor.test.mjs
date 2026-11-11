import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseAdvice, sanitizeAdvisorRequest } from '../worker/index.js';

const sources = [{ id: 'barc-frg2024', title: 'Fertilizer Recommendation Guide 2024', url: 'https://apps.barc.gov.bd/x.pdf' }];

test('advisor request: whitelists context, caps crops, rejects bad mode', () => {
  const r = sanitizeAdvisorRequest({ lang: 'en', mode: 'mixed', crops: ['Hybrid Aman', 'Strawberry', 'Strawberry', '', 'a', 'b', 'c', 'd'], notes: 'x', context: { fieldId: 'mithapukur', secret: 'no', areaHa: 0.09 } });
  assert.deepEqual(r.crops, ['Hybrid Aman', 'Strawberry', 'a', 'b', 'c']);
  assert.equal(r.context.secret, undefined);
  assert.equal(r.context.areaHa, 0.09);
  assert.equal(sanitizeAdvisorRequest({ lang: 'en', mode: 'magic', crops: ['x'] }), null);
  assert.equal(sanitizeAdvisorRequest({ lang: 'en', mode: 'single', crops: [] }), null);
});

test('advisor output: honest decline survives; invented evidence ids dropped; calendar always 12 months', () => {
  const out = normaliseAdvice({ verdict: 'not_suitable', title: 'Mango only', summary: 'Waterlogging risk.', calendar: [{ month: 7, crop: 'Mango', stage: 'orchard' }, { month: 13, crop: 'x' }],
    reasons: ['r'], risks: ['k'], requirements: [], alternatives: ['Aman → Potato → Mungbean'], confidence: 'high', evidence: ['barc-frg2024', 'made-up-paper'] }, sources);
  assert.equal(out.verdict, 'not_suitable');
  assert.equal(out.calendar.length, 12);
  assert.equal(out.calendar[6].crop, 'Mango');
  assert.deepEqual(out.evidence.map(e => e.id), ['barc-frg2024']);
  assert.equal(normaliseAdvice({ verdict: 'maybe' }, sources), null);
});
