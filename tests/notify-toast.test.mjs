import test from 'node:test';
import assert from 'node:assert/strict';
import { toastSchedule, queueToastSequence, consumeToastSequence } from '../src/legacy/notify-toast.js';

test('toast schedule orders disaster → planty → task, staggers timing, caps at 4', () => {
  const items = [{ type: 'task', id: 't' }, { type: 'review', id: 'r' }, { type: 'disaster', id: 'd' }, { type: 'task', id: 't2' }, { type: 'task', id: 't3' }];
  const s = toastSchedule(items);
  assert.deepEqual(s.map(x => x.item.id), ['d', 'r', 't', 't2']);
  assert.deepEqual(s.map(x => x.at), [1200, 5700, 10200, 14700]);
});

test('toast sequence plays once per completed plan and expires after 10 minutes', () => {
  const store = new Map(); const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  assert.equal(consumeToastSequence(storage), false);
  queueToastSequence(storage);
  assert.equal(consumeToastSequence(storage), true);
  assert.equal(consumeToastSequence(storage), false);
  storage.setItem('ropon_toast_sequence', String(Date.now() - 700000));
  assert.equal(consumeToastSequence(storage), false);
});
