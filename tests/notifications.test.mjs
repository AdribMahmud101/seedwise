import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute } from '../src/legacy/routes.js';
import { notificationId, mergeNotifications, unreadCount, readNotificationState, writeNotificationState, visibleNotifications } from '../src/legacy/notifications.js';
import worker, { normaliseRefinement } from '../worker/index.js';

test('route parser keeps page and saved plan id separate', () => {
  assert.deepEqual(parseRoute('#plan/abc123'), { page: 'plan', param: 'abc123' });
  assert.deepEqual(parseRoute('#recovery/flood'), { page: 'recovery', param: 'flood' });
  assert.deepEqual(parseRoute('#plan/a%2Fb?section=plan-checklist'), { page: 'plan', param: 'a/b' });
  assert.deepEqual(parseRoute('#unknown'), { page: 'unknown', param: null });
});

test('notification ids, merge and unread state stay stable', () => {
  const id = notificationId('task', '2026-11-12', 'plan-a');
  assert.equal(id, 'task:2026-11-12:plan-a');
  const first = { id, createdAt: '2026-11-12T00:00:00Z', title: 'Task' };
  assert.deepEqual(mergeNotifications([first], [{ ...first, title: 'Updated' }]), [{ ...first, title: 'Updated' }]);
  assert.equal(unreadCount([first], { read: {}, dismissed: {} }), 1);
  assert.equal(unreadCount([first], { read: { [id]: true }, dismissed: {} }), 0);
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  writeNotificationState({ read: { [id]: true }, dismissed: {}, cache: { today: null } }, storage);
  assert.deepEqual(readNotificationState(storage), { read: { [id]: true }, dismissed: {}, cache: { today: null } });
  assert.equal(visibleNotifications([first], { dismissed: { [id]: new Date(Date.now() + 1000).toISOString() } }).length, 0);
});

test('refine validator rejects empty proposals and keeps only known evidence', () => {
  const sources = [{ id: 'brri', title: 'BRRI', url: 'https://example.test' }];
  assert.equal(normaliseRefinement({ verdict: 'refine', changes: [] }, sources), null);
  assert.deepEqual(normaliseRefinement({ verdict: 'refine', changes: [
    { season: 0, from: 'Aman', to: 'Boro', why: 'Field conditions' },
    { season: 18, from: 'bad', to: 'bad', why: 'bad' },
  ], evidence: ['brri', 'made-up'], confidence: 'high' }, sources), {
    verdict: 'refine', changes: [{ season: 0, from: 'Aman', to: 'Boro', why: 'Field conditions' }],
    newPlanting: [], evidence: [{ id: 'brri', title: 'BRRI', url: 'https://example.test' }], confidence: 'high',
  });
});

test('daily brief fetches model outputs once and stores the field-day response', async t => {
  const values = new Map();
  let calls = 0;
  const env = { DAILY_BRIEF: { get: async key => values.get(key) || null, put: async (key, value) => values.set(key, JSON.parse(value)) } };
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    return Response.json(String(url).includes('flood') ? { headline: 'Flood summary' } : { headline: 'Rain summary' });
  });
  const request = () => new Request('https://field.test/api/daily-brief?field=mithapukur');
  const first = await worker.fetch(request(), env);
  const result = await first.json();
  assert.equal(first.status, 200);
  assert.equal(result.headline, 'Flood summary · Rain summary');
  assert.equal(result.field, 'mithapukur');
  assert.equal(calls, 2);
  await worker.fetch(request(), env);
  assert.equal(calls, 2);
  assert.equal(values.size, 1);
});
