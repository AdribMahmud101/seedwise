const same = (a, b) => Number(a) === Number(b);
const cropKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export function recommendedSetupChanges(plan, agronomy) {
  if (!plan?.planting?.length) return [];
  const changes = [];
  plan.planting.forEach((crop, idx) => {
    const name = cropKey(crop.crop);
    const research = agronomy?.crops?.find((item) => [item.id, item.label].some((label) => {
      const key = cropKey(label);
      return key && (name === key || name.includes(key) || key.includes(name));
    }));
    const source = research?.spacingCm?.length === 2
      ? agronomy.sources?.find((item) => item.id === research.sourceIds?.[0]) : null;
    const target = source && research.spacingCm.every((value) => Number.isFinite(Number(value)))
      ? { row: research.spacingCm[0], within: research.spacingCm[1], source: { kind: 'Research', title: source.title } }
      : Array.isArray(crop.originalSpacingCm) && crop.originalSpacingCm.length === 2 && crop.originalSpacingCm.every((value) => Number.isFinite(Number(value)))
        ? { row: crop.originalSpacingCm[0], within: crop.originalSpacingCm[1], source: { kind: 'AI' } }
        : null;
    if (!target) return;
    const row = !same(crop.rowSpacingCm, target.row) ? { from: crop.rowSpacingCm, to: target.row } : null;
    const within = !same(crop.withinRowCm, target.within) ? { from: crop.withinRowCm, to: target.within } : null;
    if (row || within) changes.push({ type: 'spacing', idx, crop: crop.crop, row, within, source: target.source });
  });
  if (plan.mode !== 'rotation' && plan.planting.length === 2 && typeof plan.originalSharePct === 'number' && Number.isFinite(plan.originalSharePct)) {
    const from = Number(plan.planting[0].sharePct);
    const to = Number(plan.originalSharePct);
    if (from !== to) changes.push({ type: 'split', from, to, source: { kind: 'AI' } });
  }
  return changes;
}
