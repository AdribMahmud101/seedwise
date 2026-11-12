import { areaHa, capacity, PLANTING, polygonValid, rotationEvidence, STRATEGIES } from './engine.js';
import { clampPlannerValue, recommendedSettings } from './planner-controls.js';
import { cultivableUsablePct, DEFAULT_NET_INPUTS, polygonPerimeterM } from './netarea.js';

const STORAGE_KEY = 'ropon_season_plan_v1';
const SAVED_PLANS_KEY = 'ropon_saved_plans_v1';
const MIGRATION_KEY = 'ropon_saved_plans_migrated_v1';
const READY_PLAN_KEY = 'ropon_ready_plan_id';
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
  if (field.netInputs !== undefined) requireValid(object(field.netInputs) &&
    Object.keys(DEFAULT_NET_INPUTS).every(key => Number.isFinite(field.netInputs[key]) && field.netInputs[key] >= 0) &&
    typeof field.netEdited === 'boolean');
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
  const custom = rotation?.id === 'custom';
  requireValid(object(rotation) && (custom || STRATEGIES.some(strategy => strategy.id === rotation.id)) && text(rotation.name) && object(rotation.priorities) &&
    same(Object.keys(rotation.priorities).sort(), ['cost', 'risk', 'soil', 'water']) &&
    Object.values(rotation.priorities).every(n => Number.isFinite(n) && n >= 0 && n <= 5) &&
    date(rotation.confirmedAt) && Array.isArray(rotation.seasons) && rotation.seasons.length > 0);
  if (custom) {
    const value = rotation.customPlan;
    requireValid(object(value) && text(value.fieldId) && text(value.mode) &&
      ['recommended', 'possible_with_conditions', 'not_suitable'].includes(value.verdict) &&
      Array.isArray(value.planting) && value.planting.length > 0 &&
      Array.isArray(value.calendar) && value.calendar.length === 12 &&
      new Set(value.calendar.map(m => m.month)).size === 12 && value.calendar.every(m =>
        Number.isInteger(m.month) && m.month >= 1 && m.month <= 12 && (m.crop === null || text(m.crop))));
    if (value.savedPlanId !== undefined) requireValid(text(value.savedPlanId));
    if (value.recheck !== undefined) requireValid(object(value.recheck) && date(value.recheck.checkedAt) &&
      ['recommended', 'possible_with_conditions', 'not_suitable'].includes(value.recheck.previousVerdict));
    requireValid(value.planting.every(item => object(item) && text(item.crop) && text(item.model) &&
      positive(item.rowSpacingCm) && item.rowSpacingCm <= 1500 && positive(item.withinRowCm) && item.withinRowCm <= 1500 &&
      Number.isFinite(item.sharePct) && item.sharePct >= 0 && item.sharePct <= 100));
  }
  const keys = new Set();
  for (const season of rotation.seasons) {
    requireValid(object(season) && text(season.key) && !keys.has(season.key) &&
      text(season.crop) && (custom || season.crop === 'fallow' || Object.hasOwn(PLANTING, plannerCrop(season.crop))) && text(season.cropBn) &&
      [season.sowMonth, season.harvestMonth].every(n => Number.isInteger(n) && n >= 1 && n <= 12));
    keys.add(season.key);
  }
}

function countsFor(field, settings) {
  if (settings.source === 'ai') return {
    plants: Math.floor(field.areaHa * 10000 * (settings.usableAreaPct / 100) * (settings.sharePct / 100) /
      ((settings.rowSpacingCm / 100) * (settings.withinRowCm / 100))), seedKg: null,
  };
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
    if (plan.rotation.id === 'custom') requireValid(plan.rotation.customPlan.fieldId === plan.field.id);
  }
  const keys = plan.rotation?.seasons.filter(season => season.crop !== 'fallow').map(season => season.key) ?? [];
  requireValid(same(Object.keys(plan.planting).sort(), [...keys].sort()));
  for (const settings of Object.values(plan.planting)) {
    const custom = plan.rotation?.id === 'custom';
    requireValid(object(settings) && (custom ? text(settings.crop) && settings.source === 'ai' : Object.hasOwn(PLANTING, settings.crop) && settings.source !== 'ai') &&
      positive(settings.rowSpacingCm) && positive(settings.withinRowCm) &&
      positive(settings.usableAreaPct) && settings.usableAreaPct <= 100 &&
      (settings.variety === undefined || text(settings.variety)) &&
      (settings.custom === undefined || typeof settings.custom === 'boolean') && timestamp(settings.confirmedAt) &&
      object(settings.counts));
    if (custom) requireValid(Number.isFinite(settings.sharePct) && settings.sharePct >= 0 && settings.sharePct <= 100 &&
      settings.rowSpacingCm <= 1500 && settings.withinRowCm <= 1500);
    requireValid(settings.usableSource === undefined || ['field', 'override'].includes(settings.usableSource));
    const expected = countsFor(plan.field, settings);
    requireValid(settings.counts.plants === expected.plants && settings.counts.seedKg === expected.seedKg);
    requireValid(clampPlannerValue(custom ? 'rice' : settings.crop, 'usable', settings.usableAreaPct) === settings.usableAreaPct);
    if (!custom && settings.crop !== 'mustard') {
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

export function fieldSnapshot(field, outline, constraints, netInputs) {
  return { id: field.id, name: field.name, areaHa: areaHa(outline),
    outlineHash: JSON.stringify(outline), outline: copy(outline), constraints: copy(constraints),
    netInputs: { ...DEFAULT_NET_INPUTS, ...netInputs }, netEdited: !!netInputs };
}

export function rotationSnapshot(id, priorities, agronomy) {
  if (object(id)) {
    const customPlan = copy(id);
    const seasons = customPlan.planting.map((item, index) => {
      const words = item.crop.toLowerCase().trim().split(/\s+/);
      const matches = [words.join(' '), words[0], words.at(-1)].map(word =>
        Array.from({ length: 12 }, (_, i) => customPlan.calendar.some(m => m.month === i + 1 && m.crop?.toLowerCase().includes(word))))
        .find(months => months.some(Boolean));
      if (!matches) throw new RangeError('Missing crop calendar');
      let start = matches.findIndex((on, i) => on && !matches[(i + 11) % 12]);
      if (start < 0) start = 0;
      let end = start;
      while (matches[(end + 1) % 12] && (end + 1) % 12 !== start) end = (end + 1) % 12;
      return { key: `custom-${index}`, crop: item.crop, cropBn: item.cropBn || item.crop,
        sowMonth: start + 1, harvestMonth: end + 1 };
    });
    const snapshot = { id: 'custom', name: customPlan.title || customPlan.planting.map(item => item.crop).join(' → '),
      priorities: copy(priorities), seasons, customPlan };
    validateRotation({ ...snapshot, confirmedAt: new Date().toISOString() });
    return snapshot;
  }
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

// Season usable default: the field's cultivable share from its bund/drain/path
// widths (farmer-saved when present, scenario defaults otherwise). Falls back
// to the generic recommendation when the field cannot provide one.
export function fieldUsableDefault(field) {
  try {
    if (!field || !(field.areaHa > 0)) return null;
    const inputs = field.netInputs ?? DEFAULT_NET_INPUTS;
    const perimM = Array.isArray(field.outline) && field.outline.length >= 2
      ? polygonPerimeterM(field.outline)
      : 4 * Math.sqrt(field.areaHa * 10000);
    if (!(perimM > 0)) return null;
    return cultivableUsablePct(field.areaHa, perimM, inputs);
  } catch {
    return null;
  }
}

function plantingDefaults(plan) {
  return Object.fromEntries(plan.rotation.seasons.filter(season => season.crop !== 'fallow').map((season, index) => {
    if (plan.rotation.customPlan) {
      const item = plan.rotation.customPlan.planting[index];
      const settings = { ...copy(item), source: 'ai',
        sharePct: plan.rotation.customPlan.mode === 'rotation' ? 100 : item.sharePct,
        usableAreaPct: fieldUsableDefault(plan.field) ?? 88, usableSource: 'field', confirmedAt: null };
      settings.counts = countsFor(plan.field, settings);
      return [season.key, settings];
    }
    const defaults = recommendedSettings(plannerCrop(season.crop));
    const settings = { crop: defaults.crop, rowSpacingCm: defaults.row, withinRowCm: defaults.spacing,
      usableAreaPct: fieldUsableDefault(plan.field) ?? defaults.usable, usableSource: 'field', confirmedAt: null };
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
        Math.abs(old.areaHa - value.areaHa) / old.areaHa > 0.01 + Number.EPSILON || !same(old.constraints, value.constraints) ||
        !same(old.netInputs, value.netInputs));
      plan.field = { ...value, confirmedAt: now };
      plan.steps.field = 'done';
      for (const settings of Object.values(plan.planting)) {
        if (settings.usableSource === 'field') settings.usableAreaPct = fieldUsableDefault(plan.field) ?? settings.usableAreaPct;
        settings.counts = countsFor(plan.field, settings);
      }
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
    for (const key of ['crop', 'rowSpacingCm', 'withinRowCm', 'usableAreaPct', 'usableSource', 'variety', 'custom', ...(plan.rotation.customPlan ? ['sharePct'] : [])]) {
      if (Object.hasOwn(action.value, key)) settings[key] = action.value[key];
    }
    if (Object.hasOwn(action.value, 'usableAreaPct') && !Object.hasOwn(action.value, 'usableSource')) settings.usableSource = 'override';
    requireValid(plan.rotation.id === 'custom' ? text(settings.crop) : Object.hasOwn(PLANTING, settings.crop));
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
  // Older sessions left a Ready snapshot active after finishing.
  if (current && getSavedPlan(current.id)?.status === 'ready') {
    globalThis.sessionStorage?.setItem(READY_PLAN_KEY, current.id);
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    current = null;
  }
  return copy(current);
}

export function getReadyPlan() {
  const entry = getSavedPlan(globalThis.sessionStorage?.getItem(READY_PLAN_KEY));
  return entry?.status === 'ready' ? entry : null;
}

function notify(snapshot = current) {
  for (const listener of listeners) {
    // Observers must not prevent other subscribers or page persistence from running.
    try { listener(copy(snapshot)); } catch (error) { console.error('Season plan subscriber failed', error); }
  }
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('ropon:plan', { detail: copy(snapshot) }));
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
  globalThis.sessionStorage?.removeItem(READY_PLAN_KEY);
  globalThis.sessionStorage?.removeItem('ropon_ready_strip_dismissed');
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
  if (!plan?.field || !plan?.rotation) return `New plan · ${(plan?.createdAt ?? new Date().toISOString()).slice(0, 10)}`;
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
    return true;
  } catch (error) {
    console.warn('Could not persist saved plans list', error);
    return false;
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
    if (plan.mode === 'demo' || !plan.field) return null;
    const previousVersion = entry.previousVersion ? validatePlan(entry.previousVersion) : null;
    return {
      id: entry.id,
      name: entry.name,
      status: entry.status,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      plan,
      ...(previousVersion ? { previousVersion } : {}),
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
    if (active?.field && active.mode !== 'demo') {
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

export function savePlan(planToSave, { status = 'draft', name, keepPrevious = false, checkerApproved = false } = {}) {
  if (!planToSave?.field || planToSave.mode === 'demo') return null;
  const validated = validatePlan(copy(planToSave));
  const custom = validated.rotation?.customPlan;
  if (custom) {
    custom.savedPlanId = validated.id;
    custom.planting = validated.rotation.seasons.map((season, i) => {
      const settings = validated.planting[season.key];
      return { ...custom.planting[i], crop: settings.crop, rowSpacingCm: settings.rowSpacingCm,
        withinRowCm: settings.withinRowCm, sharePct: settings.sharePct };
    });
  }
  const now = new Date().toISOString();
  const list = listPlans();
  const index = list.findIndex(item => item.id === validated.id);
  if (custom && index >= 0 && !checkerApproved && !same(customPlanInputs(validated), customPlanInputs(list[index].plan))) {
    status = 'draft';
    custom.needsRecheck = true;
  }
  if (custom && (custom.needsRecheck || custom.verdict === 'not_suitable')) status = 'draft';
  const entryName = name?.trim() || (index >= 0 ? list[index].name : defaultPlanName(validated));
  const entry = {
    id: validated.id,
    name: entryName,
    status: status === 'ready' ? 'ready' : 'draft',
    createdAt: index >= 0 ? list[index].createdAt : validated.createdAt || now,
    updatedAt: now,
    plan: copy(validated),
    ...(index >= 0 && list[index].previousVersion ? { previousVersion: copy(list[index].previousVersion) } :
      index >= 0 && keepPrevious ? { previousVersion: copy(list[index].plan) } : {}),
  };
  const validEntry = validateSavedEntry(entry);
  if (!validEntry) throw new TypeError('Cannot save invalid plan');
  if (index >= 0) {
    list[index] = validEntry;
  } else {
    list.unshift(validEntry);
  }
  if (!writeSavedListRaw(list)) throw new Error('Could not save plan');
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try { window.dispatchEvent(new CustomEvent('ropon:plan', { detail: copy(validated) })); } catch { /* storage save must not depend on observers */ }
  }
  if (validEntry.status === 'ready') {
    globalThis.sessionStorage?.setItem(READY_PLAN_KEY, validEntry.id);
    globalThis.sessionStorage?.removeItem('ropon_ready_strip_dismissed');
    if (current?.id === validEntry.id) resetPlan();
  }
  return validEntry;
}

export function approveRefinement(id, changes, newPlanting = []) {
  const entry = getSavedPlan(id);
  if (!entry || !Array.isArray(changes)) return null;
  const plan = copy(entry.plan);
  for (const change of changes) {
    const season = plan.rotation.seasons[change.season];
    const settings = season && plan.planting[season.key];
    if (!settings) continue;
    const text = `${change.to || ''}`.toLowerCase();
    const crop = ['boro', 'aman', 'rice', 'mustard', 'potato', 'mungbean'].find(name => text.includes(name));
    const proposal = newPlanting[change.season];
    if (plan.rotation.customPlan && proposal?.crop) {
      const custom = plan.rotation.customPlan, previous = custom.planting[change.season];
      custom.planting[change.season] = { ...previous, ...proposal };
      custom.calendar = custom.calendar.map(month => ({ ...month, crop: typeof month.crop === 'string'
        ? month.crop.replaceAll(previous.crop, proposal.crop) : month.crop }));
      custom.needsRecheck = false;
      season.crop = proposal.crop;
      season.cropBn = proposal.crop;
      settings.crop = proposal.crop;
      settings.source = 'ai';
      settings.sharePct = proposal.sharePct;
      settings.rowSpacingCm = proposal.rowSpacingCm;
      settings.withinRowCm = proposal.withinRowCm;
    } else if (crop) {
      season.crop = crop;
      settings.crop = ['boro', 'aman'].includes(crop) ? 'rice' : crop;
    } else if (!plan.rotation.customPlan && !/\d+\s*[×x]\s*\d+/.test(text)) {
      settings.variety = text.slice(0, 80);
    }
    const spacing = text.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)/i);
    if (spacing) {
      settings.rowSpacingCm = Number(spacing[1]);
      settings.withinRowCm = Number(spacing[2]);
    }
    settings.counts = countsFor(plan.field, settings);
  }
  plan.plan = { version: VERSION, generatedAt: null };
  plan.steps.plan = 'todo';
  plan.updatedAt = new Date().toISOString();
  return savePlan(plan, { status: entry.status, keepPrevious: true, checkerApproved: true });
}

export function restorePreviousPlan(id) {
  const entry = getSavedPlan(id);
  if (!entry?.previousVersion) return null;
  const restored = savePlan(entry.previousVersion, { status: entry.status, name: entry.name });
  const list = listPlans(), index = list.findIndex(item => item.id === id);
  if (index >= 0) { delete list[index].previousVersion; writeSavedListRaw(list); }
  return restored;
}

export function openPlan(id) {
  const entry = getSavedPlan(id);
  if (!entry) return null;
  if (entry.plan.rotation?.customPlan) {
    globalThis.localStorage?.setItem('ropon_custom_plan_v1', JSON.stringify({
      ...entry.plan.rotation.customPlan, savedPlanId: entry.id,
    }));
  } else {
    globalThis.localStorage?.removeItem('ropon_custom_plan_v1');
  }
  if (entry.status === 'ready') {
    globalThis.sessionStorage?.setItem(READY_PLAN_KEY, entry.id);
    resetPlan();
    notify(entry.plan);
    return copy(entry.plan);
  }
  globalThis.sessionStorage?.removeItem(READY_PLAN_KEY);
  return save(copy(entry.plan));
}

export function editReadyPlan() {
  const entry = getReadyPlan();
  if (!entry) return null;
  savePlan(entry.plan, { status: 'draft' });
  return openPlan(entry.id);
}

export function renamePlan(id, newName) {
  if (!text(newName)) return null;
  const list = listPlans();
  const index = list.findIndex(item => item.id === id);
  if (index < 0) return null;
  list[index].name = newName.trim();
  list[index].updatedAt = new Date().toISOString();
  if (!writeSavedListRaw(list)) throw new Error('Could not rename plan');
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
  if (duplicatedPlanSnapshot.rotation?.customPlan) duplicatedPlanSnapshot.rotation.customPlan.savedPlanId = newId;
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
  if (!writeSavedListRaw(list)) throw new Error('Could not duplicate plan');
  return valid;
}

export function deletePlan(id) {
  const list = listPlans();
  const filtered = list.filter(item => item.id !== id);
  if (!writeSavedListRaw(filtered)) throw new Error('Could not delete plan');
  const active = getPlan();
  if (active?.id === id) {
    resetPlan();
  }
  if (globalThis.sessionStorage?.getItem(READY_PLAN_KEY) === id) globalThis.sessionStorage.removeItem(READY_PLAN_KEY);
  try {
    const custom = JSON.parse(globalThis.localStorage?.getItem('ropon_custom_plan_v1') || 'null');
    if (custom?.savedPlanId === id) globalThis.localStorage.removeItem('ropon_custom_plan_v1');
  } catch { /* A corrupt handoff must not block deletion. */ }
  return true;
}

function customPlanInputs(plan) {
  const custom = plan.rotation?.customPlan;
  return { field: plan.field && { id: plan.field.id, outlineHash: plan.field.outlineHash,
    constraints: plan.field.constraints, netInputs: plan.field.netInputs },
  mode: custom?.mode, calendar: custom?.calendar, seasons: plan.rotation?.seasons,
  planting: Object.values(plan.planting).map(s => [s.crop, s.rowSpacingCm, s.withinRowCm, s.sharePct, s.usableAreaPct]) };
}

export async function recheckPlan(id, context, { lang = 'en', category } = {}) {
  const entry = getSavedPlan(id);
  const custom = entry?.plan.rotation?.customPlan;
  if (!custom) return null;
  if (globalThis.navigator?.onLine === false) throw new Error('offline');
  const response = await fetch('/api/rotation-advisor', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(40000),
    body: JSON.stringify({ lang, category, mode: custom.mode,
      crops: Object.values(entry.plan.planting).map(s => s.crop), notes: '', context }),
  });
  const result = await response.json();
  if (!response.ok || result?.error || !['recommended', 'possible_with_conditions', 'not_suitable'].includes(result?.verdict) ||
      !text(result.summary)) throw new Error('Invalid Planty response');
  const latest = getSavedPlan(id);
  if (!latest || !same(customPlanInputs(latest.plan), customPlanInputs(entry.plan)) ||
      !same(latest.plan.rotation.customPlan.recheck, custom.recheck) ||
      (current?.id === id && !same(customPlanInputs(current), customPlanInputs(entry.plan)))) {
    throw new Error('Plan changed during re-check');
  }
  const checkedAt = new Date().toISOString();
  Object.assign(latest.plan.rotation.customPlan, { verdict: result.verdict, summary: result.summary,
    needsRecheck: false, recheck: { checkedAt, previousVerdict: custom.verdict } });
  latest.plan.updatedAt = checkedAt;
  const saved = savePlan(latest.plan, { status: result.verdict === 'not_suitable' ? 'draft' : 'ready' });
  if (current?.id === id) save(copy(saved.plan));
  try {
    const handoff = JSON.parse(globalThis.localStorage?.getItem('ropon_custom_plan_v1') || 'null');
    if (handoff?.savedPlanId === id) globalThis.localStorage.setItem('ropon_custom_plan_v1', JSON.stringify(saved.plan.rotation.customPlan));
  } catch (error) { console.warn('Re-checked planner handoff could not be refreshed', error); }
  return saved;
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
  const snapshot = fieldSnapshot(field, ui.basePolygon(field), constraints, ui.state.netInputs[field.id]);
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
