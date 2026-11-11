import { areaHa, capacity, PLANTING, polygonValid, rotationEvidence, STRATEGIES } from './engine.js';
import { clampPlannerValue, recommendedSettings } from './planner-controls.js';

const STORAGE_KEY = 'ropon_season_plan_v1';
const SAVED_PLANS_KEY = 'ropon_saved_plans_v1';
const MIGRATION_KEY = 'ropon_saved_plans_migrated_v1';
const VERSION = 1;
const STEPS = ['field', 'rotation', 'planting', 'plan'];
const listeners = new Set();
let current = null;
let loaded = false;
const copy = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const date = value => text(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const timestamp = value => value === null || date(value);
const positive = value => Number.isFinite(value) && value > 0;
function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && same(a[key], b[key]));
}

function requireValid(condition) {
  if (!condition) throw new TypeError('Invalid season plan schema or version');
}

function safeJSON(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') return requireValid(Number.isFinite(value));
  requireValid(object(value) || Array.isArray(value));
  for (const [key, child] of Object.entries(value)) {
    requireValid(!['__proto__', 'prototype', 'constructor'].includes(key));
    safeJSON(child);
  }
}

function validateField(field) {
  requireValid(object(field) && text(field.id) && text(field.name) && positive(field.areaHa) &&
    text(field.outlineHash) && object(field.constraints) && date(field.confirmedAt));
  requireValid(!Object.hasOwn(Object.prototype, field.id) && field.id !== 'prototype');
  if (field.outline !== undefined) {
    requireValid(Array.isArray(field.outline) && field.outline.every(point => Array.isArray(point) &&
      Math.abs(point[0]) < 90 && Math.abs(point[1]) <= 180) && polygonValid(field.outline));
    requireValid(field.outlineHash === JSON.stringify(field.outline) &&
      Math.abs(field.areaHa - areaHa(field.outline)) <= 1e-10 * field.areaHa);
  }
  const constraints = field.constraints;
  if (constraints.crop !== undefined) requireValid(['aman', 'boro', 'rice', 'mustard', 'potato', 'mungbean'].includes(constraints.crop));
  if (constraints.harvest !== undefined) requireValid(typeof constraints.harvest === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(constraints.harvest) && Number.isFinite(Date.parse(constraints.harvest)));
  if (constraints.irrigation !== undefined) requireValid(['reliable', 'limited', 'none'].includes(constraints.irrigation));
  if (constraints.budget !== undefined) requireValid(['low', 'medium', 'high'].includes(constraints.budget));
  if (constraints.floodDays !== undefined) requireValid(Number.isFinite(constraints.floodDays) && constraints.floodDays >= 0);
}

function validateRotation(rotation) {
  requireValid(object(rotation) && STRATEGIES.some(strategy => strategy.id === rotation.id) && text(rotation.name) && object(rotation.priorities) &&
    same(Object.keys(rotation.priorities).sort(), ['cost', 'risk', 'soil', 'water']) &&
    Object.values(rotation.priorities).every(n => Number.isFinite(n) && n >= 0 && n <= 5) &&
    date(rotation.confirmedAt) && Array.isArray(rotation.seasons) && rotation.seasons.length > 0);
  const keys = new Set();
  for (const season of rotation.seasons) {
    requireValid(object(season) && text(season.key) && !keys.has(season.key) &&
      text(season.crop) && (season.crop === 'fallow' || Object.hasOwn(PLANTING, plannerCrop(season.crop))) && text(season.cropBn) &&
      [season.sowMonth, season.harvestMonth].every(n => Number.isInteger(n) && n >= 1 && n <= 12));
    keys.add(season.key);
  }
}

function countsFor(field, settings) {
  const broadcast = settings.crop === 'mustard';
  const result = capacity(field.areaHa, settings.usableAreaPct, settings.crop,
    broadcast ? 0 : settings.rowSpacingCm / 100, broadcast ? 0 : settings.withinRowCm / 100);
  return { plants: result.positions, seedKg: result.seedKg };
}

function validatePlan(plan) {
  safeJSON(plan);
  requireValid(object(plan) && plan.version === VERSION && text(plan.id) &&
    ['own', 'demo'].includes(plan.mode) && date(plan.createdAt) && date(plan.updatedAt) &&
    object(plan.steps) && STEPS.every(step => ['todo', 'done', 'review'].includes(plan.steps[step])) &&
    object(plan.planting) && object(plan.reviews) && object(plan.plan) &&
    plan.plan.version === VERSION && timestamp(plan.plan.generatedAt));
  if (plan.field !== null) validateField(plan.field);
  if (plan.rotation !== null) {
    requireValid(plan.field !== null);
    validateRotation(plan.rotation);
  }
  const keys = plan.rotation?.seasons.filter(season => season.crop !== 'fallow').map(season => season.key) ?? [];
  requireValid(same(Object.keys(plan.planting).sort(), [...keys].sort()));
  for (const settings of Object.values(plan.planting)) {
    requireValid(object(settings) && Object.hasOwn(PLANTING, settings.crop) &&
      positive(settings.rowSpacingCm) && positive(settings.withinRowCm) &&
      positive(settings.usableAreaPct) && settings.usableAreaPct <= 100 &&
      (settings.variety === undefined || text(settings.variety)) &&
      (settings.custom === undefined || typeof settings.custom === 'boolean') && timestamp(settings.confirmedAt) &&
      object(settings.counts));
    const expected = countsFor(plan.field, settings);
    requireValid(settings.counts.plants === expected.plants && settings.counts.seedKg === expected.seedKg);
    requireValid(clampPlannerValue(settings.crop, 'usable', settings.usableAreaPct) === settings.usableAreaPct);
    if (settings.crop !== 'mustard') {
      requireValid(clampPlannerValue(settings.crop, 'row', settings.rowSpacingCm) === settings.rowSpacingCm &&
        clampPlannerValue(settings.crop, 'spacing', settings.withinRowCm) === settings.withinRowCm);
    }
  }
  for (const [step, reason] of Object.entries(plan.reviews)) {
    requireValid(STEPS.includes(step) && plan.steps[step] === 'review' && object(reason) && text(reason.en) && text(reason.bn));
  }
  requireValid(STEPS.every(step => plan.steps[step] !== 'review' || Object.hasOwn(plan.reviews, step)));
  requireValid((plan.steps.field === 'todo' || plan.field !== null) &&
    (plan.steps.rotation === 'todo' || plan.rotation !== null) &&
    (plan.steps.planting !== 'done' || (keys.length > 0 && Object.values(plan.planting).every(s => date(s.confirmedAt)))) &&
    (plan.steps.planting !== 'done' || plan.steps.rotation === 'done') &&
    (plan.steps.plan !== 'done' || (date(plan.plan.generatedAt) && STEPS.slice(0, 3).every(step => plan.steps[step] === 'done'))));
  return plan;
}

const plannerCrop = crop => ['aman', 'boro'].includes(crop) ? 'rice' : crop;

export function fieldSnapshot(field, outline, constraints) {
  return { id: field.id, name: field.name, areaHa: areaHa(outline),
    outlineHash: JSON.stringify(outline), outline: copy(outline), constraints: copy(constraints) };
}

export function rotationSnapshot(id, priorities, agronomy) {
  const strategy = STRATEGIES.find(item => item.id === id);
  if (!strategy) throw new RangeError('Unknown rotation');
  const start = strategy.months.indexOf('aman');
  const seasons = [];
  for (let offset = 0; offset < 12; offset++) {
    const index = (start + offset) % 12;
    const calendarCrop = strategy.months[index];
    if (strategy.months[(index + 11) % 12] === calendarCrop) continue;
    const crop = calendarCrop === 'pulse' ? 'mungbean' : calendarCrop;
    const record = agronomy.crops.find(item => item.id === crop);
    if (!record && crop !== 'fallow') throw new RangeError(`Missing crop data: ${crop}`);
    let end = index;
    while (end < index + 11 && strategy.months[(end + 1) % 12] === calendarCrop) end++;
    seasons.push({ key: crop === 'fallow' ? `fallow-${index + 1}` : crop, crop,
      cropBn: record?.bn ?? 'পতিত', sowMonth: index + 1, harvestMonth: end % 12 + 1 });
  }
  return { id, name: strategy.crops.filter(crop => crop !== 'Fallow').join(' → '),
    priorities: copy(priorities), seasons };
}

function plantingDefaults(plan) {
  return Object.fromEntries(plan.rotation.seasons.filter(season => season.crop !== 'fallow').map(season => {
    const defaults = recommendedSettings(plannerCrop(season.crop));
    const settings = { crop: defaults.crop, rowSpacingCm: defaults.row, withinRowCm: defaults.spacing,
      usableAreaPct: defaults.usable, confirmedAt: null };
    settings.counts = countsFor(plan.field, settings);
    return [season.key, settings];
  }));
}

function review(plan, step, reason) {
  if (plan.steps[step] === 'todo') return;
  plan.steps[step] = 'review';
  plan.reviews[step] = reason;
}

// Pure transition: callers supply the previous plan and can fix time in tests.
export function transitionPlan(previous, action, now = new Date().toISOString()) {
  const plan = copy(previous);
  if (action.type === 'field') {
    const old = plan.field;
    const value = { ...copy(action.value), confirmedAt: old?.confirmedAt ?? now };
    validateField(value);
    if (!same(old, value)) {
      const changed = old && (old.id !== value.id || old.outlineHash !== value.outlineHash ||
        Math.abs(old.areaHa - value.areaHa) / old.areaHa > 0.01 + Number.EPSILON || !same(old.constraints, value.constraints));
      plan.field = { ...value, confirmedAt: now };
      plan.steps.field = 'done';
      for (const settings of Object.values(plan.planting)) settings.counts = countsFor(plan.field, settings);
      if (changed) {
        for (const settings of Object.values(plan.planting)) settings.confirmedAt = null;
        const reason = { en: 'field changed', bn: 'জমি পরিবর্তিত হয়েছে' };
        if (plan.rotation) { plan.steps.rotation = 'review'; plan.reviews.rotation = reason; }
        if (plan.rotation) { plan.steps.planting = 'review'; plan.reviews.planting = reason; }
        review(plan, 'plan', reason);
      }
    }
  } else if (action.type === 'rotation') {
    if (!plan.field) throw new Error('Confirm a field first');
    const old = plan.rotation;
    const value = { ...copy(action.value), confirmedAt: old?.confirmedAt ?? now };
    validateRotation(value);
    // Adding fallow chips to older snapshots must preserve reviewed crop settings.
    const plantedSeasons = rotation => rotation.seasons.filter(season => season.crop !== 'fallow');
    const changed = old && (old.id !== value.id || old.name !== value.name || !same(plantedSeasons(old), plantedSeasons(value)));
    const calendarChanged = old && !same(old.seasons, value.seasons);
    const prioritiesChanged = old && !same(old.priorities, value.priorities);
    if (!old || changed || calendarChanged || prioritiesChanged || plan.steps.rotation !== 'done') {
      plan.rotation = { ...value, confirmedAt: now };
      plan.steps.rotation = 'done';
      delete plan.reviews.rotation;
      if (!old || changed) plan.planting = plantingDefaults(plan);
      if (changed) {
        const reason = { en: `rotation changed: ${value.name}`,
          bn: `ফসলচক্র পরিবর্তিত: ${value.seasons.map(s => s.cropBn).join(' → ')}` };
        plan.steps.planting = 'review';
        plan.reviews.planting = reason;
        review(plan, 'plan', reason);
      } else if (prioritiesChanged) {
        review(plan, 'plan', { en: 'rotation priorities changed', bn: 'ফসলচক্রের অগ্রাধিকার পরিবর্তিত হয়েছে' });
      }
    }
  } else if (action.type === 'planting') {
    requireValid(plan.rotation && Object.hasOwn(plan.planting, action.key));
    const old = plan.planting[action.key];
    const settings = { ...old };
    for (const key of ['crop', 'rowSpacingCm', 'withinRowCm', 'usableAreaPct', 'variety', 'custom']) {
      if (Object.hasOwn(action.value, key)) settings[key] = action.value[key];
    }
    requireValid(Object.hasOwn(PLANTING, settings.crop));
    settings.counts = countsFor(plan.field, settings);
    if (!same(old, settings)) {
      settings.confirmedAt = null;
      plan.planting[action.key] = settings;
      const reason = { en: `planting settings changed: ${action.key}`, bn: `বপনের মাপ পরিবর্তিত: ${action.key}` };
      review(plan, 'planting', reason);
      review(plan, 'plan', reason);
    }
    if (Object.hasOwn(action.value, 'confirmedAt')) {
      requireValid(timestamp(action.value.confirmedAt));
      if (action.value.confirmedAt !== null && plan.steps.rotation !== 'done') throw new Error('Confirm the rotation first');
      settings.confirmedAt = action.value.confirmedAt;
      plan.planting[action.key] = settings;
      if (Object.values(plan.planting).every(item => date(item.confirmedAt))) {
        plan.steps.planting = 'done';
        delete plan.reviews.planting;
      } else if (plan.steps.planting === 'done') {
        const reason = { en: `planting needs review: ${action.key}`, bn: `বপনের মাপ যাচাই করুন: ${action.key}` };
        review(plan, 'planting', reason);
        review(plan, 'plan', reason);
      }
    }
  } else if (action.type === 'confirmPlanting') {
    if (plan.steps.rotation !== 'done') throw new Error('Confirm the rotation first');
    for (const settings of Object.values(plan.planting)) settings.confirmedAt ??= now;
    plan.steps.planting = 'done';
    delete plan.reviews.planting;
  } else if (action.type === 'generated') {
    if (STEPS.slice(0, 3).some(step => plan.steps[step] !== 'done')) throw new Error('Confirm field, rotation and planting first');
    plan.plan = { ...copy(action.value), generatedAt: now, version: VERSION };
    plan.steps.plan = 'done';
    delete plan.reviews.plan;
  } else throw new RangeError('Unknown season plan action');
  if (!same(plan, previous)) plan.updatedAt = now;
  return validatePlan(plan);
}

export function getPlan() {
  if (!loaded) {
    try {
      const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
      current = saved ? validatePlan(JSON.parse(saved)) : null;
    } catch { current = null; }
    loaded = true;
  }
  return copy(current);
}

function notify() {
  for (const listener of listeners) {
    // Observers must not prevent other subscribers or page persistence from running.
    try { listener(copy(current)); } catch (error) { console.error('Season plan subscriber failed', error); }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('ropon:plan', { detail: copy(current) }));
  }
}

function save(plan) {
  validatePlan(plan);
  if (same(getPlan(), plan)) return getPlan();
  globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(plan));
  current = copy(plan);
  loaded = true;
  notify();
  return getPlan();
}

export function startPlan({ mode = 'own' } = {}) {
  const now = new Date().toISOString();
  return save({ version: VERSION, id: globalThis.crypto.randomUUID(), mode, createdAt: now, updatedAt: now,
    field: null, rotation: null, planting: {}, plan: { generatedAt: null, version: VERSION },
    steps: Object.fromEntries(STEPS.map(step => [step, 'todo'])), reviews: {} });
}

function change(action) {
  const plan = getPlan() ?? startPlan();
  return save(transitionPlan(plan, action));
}

export const confirmField = value => change({ type: 'field', value });
export const confirmRotation = value => change({ type: 'rotation', value });
export const setPlanting = (key, value) => change({ type: 'planting', key, value });
export const confirmPlanting = () => change({ type: 'confirmPlanting' });
export const markPlanGenerated = value => change({ type: 'generated', value });
export const stepStatus = () => getPlan()?.steps ?? Object.fromEntries(STEPS.map(step => [step, 'todo']));
export const nextStep = () => STEPS.find(step => stepStatus()[step] !== 'done') ?? null;
export function reviewReasons(t = en => en) {
  const reasons = Object.values(getPlan()?.reviews ?? {}).map(reason => t(reason.en, reason.bn));
  return [...new Set(reasons)];
}
export function subscribe(listener) {
  if (typeof listener !== 'function') throw new TypeError('Subscriber must be a function');
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const exportPlanJSON = () => JSON.stringify(getPlan(), null, 2);
export const importPlanJSON = json => save(validatePlan(JSON.parse(json)));
export function resetPlan() {
  globalThis.localStorage?.removeItem(STORAGE_KEY);
  current = null;
  loaded = true;
  notify();
}

// Check if all non-fallow seasons in the rotation have been confirmed (confirmedAt set)
export function defaultPlanName(plan) {
  const fieldName = plan?.field?.name || 'My field';
  const rotationShort = plan?.rotation?.name || 'Rotation';
  return `${fieldName} · ${rotationShort}`;
}

function readSavedListRaw() {
  try {
    const raw = globalThis.localStorage?.getItem(SAVED_PLANS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeSavedListRaw(list) {
  try {
    globalThis.localStorage?.setItem(SAVED_PLANS_KEY, JSON.stringify(list));
  } catch (error) {
    console.warn('Could not persist saved plans list', error);
  }
}

function validateSavedEntry(entry) {
  if (!object(entry)) return null;
  if (!text(entry.id)) return null;
  if (!text(entry.name)) return null;
  if (entry.status !== 'draft' && entry.status !== 'ready') return null;
  if (!date(entry.createdAt) || !date(entry.updatedAt)) return null;
  if (!entry.plan) return null;
  try {
    const plan = validatePlan(entry.plan);
    if (plan.mode === 'demo') return null;
    return {
      id: entry.id,
      name: entry.name,
      status: entry.status,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      plan,
    };
  } catch {
    return null;
  }
}

export function migrateActivePlanOnce() {
  if (typeof globalThis.localStorage === 'undefined') return;
  try {
    if (globalThis.localStorage.getItem(MIGRATION_KEY)) return;
    const active = getPlan();
    if (active && active.mode !== 'demo') {
      const list = listPlans();
      if (!list.some(item => item.id === active.id)) {
        const isReady = active.steps?.plan === 'done' && !!active.plan?.generatedAt;
        const entry = {
          id: active.id,
          name: defaultPlanName(active),
          status: isReady ? 'ready' : 'draft',
          createdAt: active.createdAt || new Date().toISOString(),
          updatedAt: active.updatedAt || new Date().toISOString(),
          plan: copy(active),
        };
        const valid = validateSavedEntry(entry);
        if (valid) {
          writeSavedListRaw([valid, ...list]);
        }
      }
    }
    globalThis.localStorage.setItem(MIGRATION_KEY, 'done');
  } catch (error) {
    console.warn('Migration of active plan failed', error);
  }
}

export function listPlans() {
  const rawList = readSavedListRaw();
  if (!Array.isArray(rawList)) return [];
  const validList = [];
  let corruptedFound = false;
  for (const item of rawList) {
    const validated = validateSavedEntry(item);
    if (validated) validList.push(validated);
    else corruptedFound = true;
  }
  if (corruptedFound) {
    writeSavedListRaw(validList);
  }
  return validList.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

export function getSavedPlan(id) {
  if (!id) return null;
  const list = listPlans();
  return list.find(item => item.id === id) || null;
}

export function savePlan(planToSave, { status = 'draft', name } = {}) {
  if (!planToSave || planToSave.mode === 'demo') return null;
  const validated = validatePlan(planToSave);
  const now = new Date().toISOString();
  const list = listPlans();
  const index = list.findIndex(item => item.id === validated.id);
  const entryName = name?.trim() || (index >= 0 ? list[index].name : defaultPlanName(validated));
  const entry = {
    id: validated.id,
    name: entryName,
    status: status === 'ready' ? 'ready' : 'draft',
    createdAt: index >= 0 ? list[index].createdAt : validated.createdAt || now,
    updatedAt: now,
    plan: copy(validated),
  };
  const validEntry = validateSavedEntry(entry);
  if (!validEntry) throw new TypeError('Cannot save invalid plan');
  if (index >= 0) {
    list[index] = validEntry;
  } else {
    list.unshift(validEntry);
  }
  writeSavedListRaw(list);
  return validEntry;
}

export function openPlan(id) {
  const entry = getSavedPlan(id);
  if (!entry) return null;
  return save(copy(entry.plan));
}

export function renamePlan(id, newName) {
  if (!text(newName)) return null;
  const list = listPlans();
  const index = list.findIndex(item => item.id === id);
  if (index < 0) return null;
  list[index].name = newName.trim();
  list[index].updatedAt = new Date().toISOString();
  writeSavedListRaw(list);
  return list[index];
}

export function duplicatePlan(id) {
  const entry = getSavedPlan(id);
  if (!entry) return null;
  const now = new Date().toISOString();
  const newId = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `plan-${Date.now()}`;
  const duplicatedPlanSnapshot = copy(entry.plan);
  duplicatedPlanSnapshot.id = newId;
  duplicatedPlanSnapshot.createdAt = now;
  duplicatedPlanSnapshot.updatedAt = now;
  const dupEntry = {
    id: newId,
    name: `${entry.name} (Copy)`,
    status: entry.status,
    createdAt: now,
    updatedAt: now,
    plan: duplicatedPlanSnapshot,
  };
  const valid = validateSavedEntry(dupEntry);
  if (!valid) return null;
  const list = listPlans();
  list.unshift(valid);
  writeSavedListRaw(list);
  return valid;
}

export function deletePlan(id) {
  const list = listPlans();
  const filtered = list.filter(item => item.id !== id);
  writeSavedListRaw(filtered);
  const active = getPlan();
  if (active?.id === id) {
    resetPlan();
  }
  return true;
}

export function allSeasonsReviewed(plan) {
  if (!plan?.rotation) return false;
  const nonFallowSeasons = plan.rotation.seasons.filter(season => season.crop !== 'fallow');
  return nonFallowSeasons.length > 0 && nonFallowSeasons.every(season => {
    const settings = plan.planting[season.key];
    return settings && settings.confirmedAt !== null;
  });
}

export async function demoPlan() {
  const ui = await import('./ui.js');
  const [earth, agronomy] = await Promise.all([
    ui.earth ?? fetchDemoData('earth-data'), ui.agronomy ?? fetchDemoData('agronomy'),
  ]);
  const field = earth.fields.find(item => item.id === 'mithapukur');
  const constraints = ui.defaultProfile();
  const priorities = ui.defaultPriorities();
  const best = rotationEvidence(field.monthly, priorities, constraints)[0];
  const snapshot = fieldSnapshot(field, ui.basePolygon(field), constraints);
  startPlan({ mode: 'demo' });
  confirmField({ ...snapshot, name: "Rahim's field" });
  confirmRotation(rotationSnapshot(best.id, priorities, agronomy));
  confirmPlanting();
  return markPlanGenerated({});
}

async function fetchDemoData(name) {
  const url = `data/${name}.json`;
  const response = await fetch(typeof document === 'undefined' ? url : new URL(url, document.baseURI));
  if (!response.ok) throw new Error(`Could not load demo data: ${name}`);
  return response.json();
}
