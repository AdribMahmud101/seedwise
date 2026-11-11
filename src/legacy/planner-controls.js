import { PLANTING } from './engine.js';

const spacingLimits = {
  rice: { row: [15, 30], spacing: [15, 30] },
  potato: { row: [50, 75], spacing: [20, 35] },
  mustard: { row: [25, 40], spacing: [5, 15] },
  mungbean: { row: [25, 40], spacing: [5, 15] },
};

export function controlLimits(crop, name) {
  const [min, max] = name === 'usable' ? [1, 100] : spacingLimits[crop][name];
  return { min, max, step: 1 };
}

export function recommendedSettings(crop) {
  const data = PLANTING[crop];
  return { crop, usable: 88, row: (data.row || 0.2) * 100, spacing: (data.spacing || 0.1) * 100 };
}

export function clampPlannerValue(crop, name, value) {
  const { min, max, step } = controlLimits(crop, name);
  return Math.min(max, Math.max(min, min + Math.round((Number(value) - min) / step) * step));
}

export function syncPlannerControl(input, planner) {
  if (input.value === '' || !Number.isFinite(Number(input.value))) return null;
  const value = clampPlannerValue(planner.crop, input.name, input.value);
  planner[input.name] = value;
  const control = input.closest('.plan-control');
  control.querySelectorAll('input').forEach(el => { el.value = String(value); });
  const { min, max } = controlLimits(planner.crop, input.name);
  control.style.setProperty('--progress', `${(value - min) / (max - min) * 100}%`);
  const output = control.querySelector('output');
  if (output) output.textContent = `${value} ${input.name === 'usable' ? '%' : 'cm'}`;
  return value;
}

export function plantyContext(fieldId, planner, counts, lang, details = {}) {
  return {
    fieldId, fieldName: details.fieldName, crop: planner.crop,
    rowSpacingCm: planner.crop === 'mustard' ? null : planner.row,
    withinRowCm: planner.crop === 'mustard' ? null : planner.spacing,
    usableAreaPct: planner.usable, areaHa: counts.net, plantCount: counts.positions, seedKg: counts.seedKg,
    month: details.month, lang,
    ...(details.outlook ? { outlook: details.outlook } : {}),
    ...(details.flood ? { flood: details.flood } : {}),
    truthLabels: {
      rowSpacingCm: 'FARMER_REPORTED', withinRowCm: 'FARMER_REPORTED', usableAreaPct: 'SCENARIO',
      areaHa: 'SCENARIO', plantCount: 'SCENARIO', seedKg: 'SCENARIO',
      ...(details.outlook ? { outlook: 'MODELED' } : {}),
      ...(details.flood ? { flood: 'MODELED' } : {}),
    },
  };
}
