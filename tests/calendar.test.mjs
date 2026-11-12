import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTasks, deriveSeasonBands, shiftSowDate, toggleCalendarTask, undatedChecklistTasks, validateSowDate } from '../src/legacy/calendar.js';
import { taskReminderId } from '../src/legacy/notifications.js';

const plan = () => ({
  checklist: {},
  rotation: { seasons: [{ key: 'winter', crop: 'mustard', cropBn: 'সরিষা', sowMonth: 11, harvestMonth: 2 }] },
  planting: { winter: { crop: 'mustard', rowSpacingCm: 20, withinRowCm: 10 } },
});

test('calendar task dates and shifted seasons stay correct across New Year', () => {
  const original = plan();
  const task = calendarTasks(original, 2027)[0];
  assert.equal(task.date, null);
  assert.equal(task.month, 11);
  const shifted = shiftSowDate(original, 'winter', '2028-12-15');
  assert.equal(shifted.rotation.seasons[0].sowMonth, 12);
  assert.equal(shifted.rotation.seasons[0].harvestMonth, 3);
  assert.equal(shifted.rotation.seasons[0].sowDate, '2028-12-15');
  assert.equal(calendarTasks(shifted, 2029)[0].date, '2029-12-15');
});

test('sow shifts validate the one-month plan limit and reject invalid dates', () => {
  const source = [{ id: 'mustard', sowingWindow: { start: '10-15', end: '11-15' } }];
  assert.throws(() => shiftSowDate(plan(), 'winter', '2028-01-01', source), /more than one month outside/);
  assert.throws(() => shiftSowDate(plan(), 'winter', '2027-02-31', source), /Invalid sow date/);
  assert.equal(shiftSowDate(plan(), 'winter', '2027-12-15', source).rotation.seasons[0].sowMonth, 12);
});

test('custom plan calendar moves the full season while retaining twelve unique months', () => {
  const custom = plan();
  custom.rotation.customPlan = { calendar: Array.from({ length: 12 }, (_, i) => ({ month: i + 1,
    crop: [11, 12, 1, 2].includes(i + 1) ? 'mustard' : 'fallow' })) };
  const shifted = shiftSowDate(custom, 'winter', '2028-12-15');
  assert.deepEqual(shifted.rotation.customPlan.calendar.map(row => row.month), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(shifted.rotation.customPlan.calendar.find(row => row.month === 11).crop, 'Fallow');
  assert.equal(shifted.rotation.customPlan.calendar.find(row => row.month === 2).crop, 'mustard');
});

test('season bands wrap across New Year and use published duration harvest ranges', () => {
  const cropPlan = plan();
  const aman = { ...cropPlan, rotation: { seasons: [{ key:'aman', crop:'aman', sowMonth:11, harvestMonth:3 }] }, planting:{ aman:{crop:'aman'} } };
  const bands = deriveSeasonBands(aman, 2027, [{ id:'aman', label:'Aman rice', durationDays:[135,135] }]);
  assert.ok(bands.some(band => band.date === '2027-01-15' && band.stage === 'grow'));
  assert.ok(bands.some(band => band.date === '2027-03-16' && band.stage === 'harvest'));
  const boro = { ...aman, rotation:{seasons:[{key:'boro',crop:'boro',sowMonth:7,harvestMonth:12,sowDate:'2027-07-15'}]}, planting:{boro:{crop:'boro'}} };
  const durationBands = deriveSeasonBands(boro, 2027, [{id:'boro',label:'Boro rice',durationDays:[150,160]}]);
  assert.equal(durationBands.find(band => band.stage === 'harvest').date, '2027-12-12');
  assert.equal(durationBands.at(-1).date, '2027-12-22');
});

test('sowing validation blocks overlap with next season harvest and puts undated prep on this week', () => {
  const rotation = { rotation:{seasons:[{key:'aman',crop:'aman',sowMonth:11,harvestMonth:3},{key:'boro',crop:'boro',sowMonth:3,harvestMonth:8}]}, planting:{aman:{crop:'aman'},boro:{crop:'boro'}} };
  assert.throws(() => validateSowDate(rotation,'aman','2027-11-01',[{id:'aman',durationDays:[135,135]}]), /overlaps boro sowing/);
  assert.deepEqual(undatedChecklistTasks(plan()).map(item=>item.id), ['well-reading']);
  assert.equal(calendarTasks(plan(),2027)[0].date, null);
});

test('calendar checklist ticks preserve the shared plan checklist', () => {
  const current = { ...plan(), checklist: { 'well-reading': false } };
  const updated = toggleCalendarTask(current, 'sow-winter', true);
  assert.equal(updated.checklist['sow-winter'], true);
  assert.equal(updated.checklist['well-reading'], false);
  assert.throws(() => toggleCalendarTask(current, 'unknown', true), /Unknown checklist task/);
});

test('task reminder ids stay deterministic per plan task and day', () => {
  assert.equal(taskReminderId('2026-11-12', 'plan-a', 'sow-winter'), 'task:2026-11-12:plan-a:sow-winter');
  assert.notEqual(taskReminderId('2026-11-12', 'plan-a', 'sow-winter'), taskReminderId('2026-11-12', 'plan-a', 'soil-potato'));
});

import { matchCrop } from '../src/legacy/calendar.js';
test('calendar matches plan crop names to agronomy ids', () => {
  const list = [{ id: 'aman' }, { id: 'boro' }, { id: 'potato' }];
  assert.equal(matchCrop(list, 'Aman rice')?.id, 'aman');
  assert.equal(matchCrop(list, 'Boro rice')?.id, 'boro');
  assert.equal(matchCrop(list, 'potato')?.id, 'potato');
  assert.equal(matchCrop(list, 'Mango'), null);
});

test('calendar click handler checks valueless data attributes by presence', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/legacy/calendar.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /hasAttribute\([^)]*\)\s*!==\s*undefined/);
  assert.doesNotMatch(src, /el\.dataset\.cal(Ask|Close|Undo)\b/);
});
