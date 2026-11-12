import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarTasks, shiftSowDate, toggleCalendarTask } from '../src/legacy/calendar.js';
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
  const shifted = shiftSowDate(original, 'winter', '2028-01-15');
  assert.equal(shifted.rotation.seasons[0].sowMonth, 1);
  assert.equal(shifted.rotation.seasons[0].harvestMonth, 4);
  assert.equal(shifted.rotation.seasons[0].sowDate, '2028-01-15');
  assert.equal(calendarTasks(shifted, 2029)[0].date, '2029-01-15');
});

test('sow shifts reject invalid dates and dates outside published agronomy window', () => {
  const source = [{ id: 'mustard', sowingWindow: { start: '10-15', end: '11-15' } }];
  assert.throws(() => shiftSowDate(plan(), 'winter', '2027-12-01', source), /outside the agronomy window/);
  assert.throws(() => shiftSowDate(plan(), 'winter', '2027-02-31', source), /Invalid sow date/);
  assert.equal(shiftSowDate(plan(), 'winter', '2027-10-15', source).rotation.seasons[0].sowMonth, 10);
});

test('custom plan calendar moves the full season while retaining twelve unique months', () => {
  const custom = plan();
  custom.rotation.customPlan = { calendar: Array.from({ length: 12 }, (_, i) => ({ month: i + 1,
    crop: [11, 12, 1, 2].includes(i + 1) ? 'mustard' : 'fallow' })) };
  const shifted = shiftSowDate(custom, 'winter', '2028-01-15');
  assert.deepEqual(shifted.rotation.customPlan.calendar.map(row => row.month), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.equal(shifted.rotation.customPlan.calendar.find(row => row.month === 11).crop, 'Fallow');
  assert.equal(shifted.rotation.customPlan.calendar.find(row => row.month === 4).crop, 'fallow + mustard');
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
