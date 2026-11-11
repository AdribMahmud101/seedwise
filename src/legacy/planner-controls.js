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

export function plantyContext(fieldId, planner, counts, lang) {
  return {
    fieldId, crop: planner.crop,
    spacing: planner.crop === 'mustard' ? null : { rowCm: planner.row, withinRowCm: planner.spacing },
    usablePercent: planner.usable, counts: { ...counts }, lang,
  };
}
