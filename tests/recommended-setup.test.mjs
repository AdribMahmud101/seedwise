import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendedSetupChanges } from '../src/legacy/recommended-setup.js';

test('recommended setup diff uses research spacing, saved AI values, and hybrid original share only', () => {
  const agronomy = {
    crops: [
      { id: 'potato', label: 'Potato', spacingCm: [60, 25], sourceIds: ['study'] },
      { id: 'mungbean', label: 'Mungbean', sourceIds: ['study'] },
    ],
    sources: [{ id: 'study', title: 'Field study' }],
  };
  const plan = {
    mode: 'mixed', originalSharePct: 50,
    planting: [
      { crop: 'Potato', rowSpacingCm: 45, withinRowCm: 20, sharePct: 70 },
      { crop: 'Mungbean', rowSpacingCm: 25, withinRowCm: 10, originalSpacingCm: [30, 10], sharePct: 30 },
    ],
  };
  assert.deepEqual(recommendedSetupChanges(plan, agronomy), [
    { type: 'spacing', idx: 0, crop: 'Potato', row: { from: 45, to: 60 }, within: { from: 20, to: 25 }, source: { kind: 'Research', title: 'Field study' } },
    { type: 'spacing', idx: 1, crop: 'Mungbean', row: { from: 25, to: 30 }, within: null, source: { kind: 'AI' } },
    { type: 'split', from: 70, to: 50, source: { kind: 'AI' } },
  ]);
  assert.deepEqual(recommendedSetupChanges({ ...plan, mode: 'rotation' }, agronomy).filter((x) => x.type === 'split'), []);
});
