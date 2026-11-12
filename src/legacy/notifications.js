export const NOTIFICATIONS_KEY = 'ropon_notifications_v1';

export function notificationId(type, date, planId = '') {
  return `${type}:${date}:${planId || 'all'}`;
}

export function taskReminderId(date, planId, taskId) {
  return notificationId('task', date, `${planId}:${taskId}`);
}

export function mergeNotifications(existing = [], incoming = []) {
  const byId = new Map(existing.map(item => [item.id, item]));
  for (const item of incoming) byId.set(item.id, { ...byId.get(item.id), ...item });
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function unreadCount(items, state) {
  return items.filter(item => !state.read[item.id] &&
    (!state.dismissed[item.id] || Date.parse(state.dismissed[item.id]) <= Date.now())).length;
}

export function readNotificationState(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(NOTIFICATIONS_KEY) || '{}');
    return { read: value.read || {}, dismissed: value.dismissed || {}, cache: value.cache || {} };
  } catch { return { read: {}, dismissed: {}, cache: {} }; }
}

export function writeNotificationState(state, storage = globalThis.localStorage) {
  try { storage?.setItem(NOTIFICATIONS_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

export function visibleNotifications(items, state) {
  const now = Date.now();
  return items.filter(item => !state.dismissed[item.id] || Date.parse(state.dismissed[item.id]) <= now);
}
