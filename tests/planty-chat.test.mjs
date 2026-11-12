import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectChatLanguage, summarizePlan, validClinicResponse, validSuggestion, validateDiseaseKnowledgeBase } from '../src/legacy/planty-chat-helpers.js';
import { plantyPanel } from '../src/legacy/planty.js';

test('chat follows app language and detects Bengali and Banglish', () => {
  assert.equal(detectChatLanguage('How do I plant?', 'bn'), 'bn');
  assert.equal(detectChatLanguage('আমার ধানে দাগ', 'en'), 'bn');
  assert.equal(detectChatLanguage('Amar dhane dag keno?', 'en'), 'banglish');
});

test('plan attachment keeps only compact fields, crops, spacing, checklist and verdict', () => {
  const summary = summarizePlan({ id: 'saved-1', plan: { id: 'p', field: { name: 'North plot', private: 'drop' }, rotation: { name: 'Rice cycle', seasons: [{ key: 's1', crop: 'aman', sowMonth: 7, harvestMonth: 12 }] }, planting: { s1: { rowSpacingCm: 20, withinRowCm: 15, secret: 'drop' } }, steps: { field: 'done', rotation: 'done' }, plan: { verdict: 'review' } } });
  assert.deepEqual(summary, { id: 'saved-1', name: 'Rice cycle', custom: false, field: 'North plot', crops: [{ crop: 'aman', sowMonth: 7, harvestMonth: 12, rowSpacingCm: 20, withinRowCm: 15 }], checklist: { field: 'done', rotation: 'done' }, verdict: 'review' });
});

test('clinic response rejects unknown disease ids and invalid confidence, accepts bounded results', () => {
  const base = { lesionAreaPct: 8, knownDiseaseIds: ['rice_blast'], segments: [{ kind: 'lesion', areaPct: 8, box: [0.1, 0.2, 0.2, 0.1], mask: { width: 1, height: 1, data: 'AA==' } }], diagnoses: [{ id: 'rice_blast', name: { en: 'Rice blast', bn: 'ধানের ব্লাস্ট' }, confidence: .7, why: ['Spots visible'], actions: ['Ask officer'], sources: [{ id: 'brri', title: 'BRRI', url: 'https://brri.gov.bd' }] }] };
  assert.equal(validClinicResponse(base, new Set(['rice_blast'])), true);
  assert.equal(validClinicResponse({ ...base, diagnoses: [{ ...base.diagnoses[0], id: 'invented' }] }, new Set(['rice_blast'])), false);
  assert.equal(validClinicResponse({ ...base, diagnoses: [{ ...base.diagnoses[0], confidence: 2 }] }, new Set(['rice_blast'])), false);
});

test('suggestion validation and disease knowledge base schema reject unsafe shapes', () => {
  const suggestion = { changes: [{ season: 0, from: 'aman', to: 'boro', why: 'water' }], newPlanting: [], evidence: ['brri'], confidence: .55 };
  assert.equal(validSuggestion(suggestion), true);
  assert.equal(validSuggestion({ ...suggestion, confidence: 4 }), false);
  assert.equal(validateDiseaseKnowledgeBase(JSON.parse(readFileSync(new URL('../public/data/crop-diseases.json', import.meta.url)))), true);
  assert.equal(validateDiseaseKnowledgeBase({ schemaVersion: 1, diseases: [{ id: 'x' }] }), false);
});

test('hub renders global Chat and Clinic tabs', () => {
  const html = plantyPanel();
  assert.match(html, /aria-label="Planty"/);
  assert.match(html, /data-tab="chat"/);
  assert.match(html, /data-tab="clinic"/);
  assert.match(html, /capture="environment"/);
});
