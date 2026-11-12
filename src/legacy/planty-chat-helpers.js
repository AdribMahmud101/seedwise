const banglishWords = /\b(ki|kemon|koro|korbo|amar|amr|tomar|fasol|dhan|alu|pani|mati|bhalo|hobe|ache|nai|keno|bolen|lagbe|kom|beshi|chash|rog|pata|ki korbo)\b/i;
export function detectChatLanguage(text, appLanguage = 'en') {
  if (/[\u0980-\u09ff]/.test(text)) return 'bn';
  if (/[a-z]/i.test(text) && banglishWords.test(text)) return 'banglish';
  return appLanguage === 'bn' ? 'bn' : 'en';
}
export function summarizePlan(entry) {
  const p = entry?.plan || entry;
  if (!p) return null;
  return {
    id: String(entry.id || p.id || '').slice(0, 120), name: String(p.rotation?.name || 'My plan').slice(0, 100), custom: !!p.rotation?.customPlan,
    field: String(p.field?.name || '').slice(0, 100),
    crops: (p.rotation?.seasons || []).slice(0, 12).map(s => ({ crop: s.crop, sowMonth: s.sowMonth, harvestMonth: s.harvestMonth,
      rowSpacingCm: p.planting?.[s.key]?.rowSpacingCm, withinRowCm: p.planting?.[s.key]?.withinRowCm })),
    checklist: Object.fromEntries(Object.entries(p.steps || {}).slice(0, 6)), verdict: String(p.rotation?.customPlan?.verdict || p.plan?.verdict || '').slice(0, 80),
  };
}
export function validClinicResponse(value, diseaseIds) {
  if (!value || !Array.isArray(value.diagnoses) || value.diagnoses.length > 3 || !Array.isArray(value.segments) || !Number.isFinite(value.lesionAreaPct) || value.lesionAreaPct < 0 || value.lesionAreaPct > 100) return false;
  if (!value.diagnoses.every(d => diseaseIds.has(d.id) && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1 && d.name && typeof d.name.en === 'string' && typeof d.name.bn === 'string' && Array.isArray(d.why) && Array.isArray(d.actions) && Array.isArray(d.sources) && d.sources.every(s => typeof s.title === 'string' && /^https:\/\//.test(s.url)))) return false;
  return value.segments.every(s => ['leaf', 'lesion', 'insect', 'spot'].includes(s.kind) && Number.isFinite(s.areaPct) && s.areaPct >= 0 && s.areaPct <= 100 && Array.isArray(s.box) && s.box.length === 4 && s.box.every(Number.isFinite) && s.mask && Number.isInteger(s.mask.width) && Number.isInteger(s.mask.height) && typeof s.mask.data === 'string' && /^[A-Za-z0-9+/]+=*$/.test(s.mask.data));
}
export function validateDiseaseKnowledgeBase(kb) {
  if (kb?.schemaVersion !== 1 || !Array.isArray(kb.diseases) || !kb.diseases.length) return false;
  const ids = new Set();
  return kb.diseases.every(d => {
    const valid = typeof d.id === 'string' && !ids.has(d.id) && typeof d.crop === 'string' && d.names && typeof d.names.en === 'string' && typeof d.names.bn === 'string' &&
      typeof d.cause === 'string' && ['symptoms','lookAlikes','triggers','management','sources'].every(k => Array.isArray(d[k]) && d[k].length) &&
      d.sources.every(s => typeof s.id === 'string' && typeof s.title === 'string' && /^https:\/\//.test(s.url));
    if (valid) ids.add(d.id);
    return valid;
  });
}
export function validSuggestion(value) {
  return value && Array.isArray(value.changes) && value.changes.length > 0 && value.changes.length <= 12 &&
    value.changes.every(c => Number.isInteger(c.season) && c.season >= 0 && c.season < 12 && typeof c.from === 'string' && typeof c.to === 'string' && typeof c.why === 'string') &&
    Array.isArray(value.newPlanting) && Array.isArray(value.evidence) && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1;
}
