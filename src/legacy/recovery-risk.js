// Today's risk box for Disaster recovery: built only from /api/daily-brief (Prithvi flood model + Chronos outlook).
const RANK = { ok: 0, watch: 1, warn: 2 };
const worst = (levels) => levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'ok');
const pct = (x) => Math.round(x * 100);
const skillWord = (s) => (s >= 0.5 ? 'high' : s >= 0.2 ? 'medium' : 'low');

// Pure: turn the daily brief into status signals. Thresholds are stated in the UI text, not hidden.
export function riskStatus(brief) {
  const signals = [];
  const flood = brief?.flood;
  if (flood?.summary) {
    const years = Object.entries(flood.summary);
    const near = Math.max(...years.map(([, y]) => y.water_fraction_buffer300m_max ?? 0));
    const area = Math.max(...years.map(([, y]) => y.water_fraction_box_max ?? 0));
    const usable = years.reduce((n, [, y]) => n + (y.usable ?? 0), 0);
    const found = years.reduce((n, [, y]) => n + (y.scenes_found ?? 0), 0);
    const level = near >= 0.05 ? 'warn' : near > 0 ? 'watch' : 'ok';
    signals.push({ id: 'flood', level, value: pct(near), area: Math.round(area * 1000) / 10, usable, found,
      years: years.map(([y]) => y).join('–'),
      confidence: usable >= 10 && usable / Math.max(1, found) >= 0.3 ? 'medium' : 'low', iou: flood.testMetrics?.IoU_water });
  }
  const o = brief?.outlook?.outlook;
  const skill = brief?.outlook?.backtest?.skill_vs_climatology || {};
  const m = (k) => o?.[k]?.months?.[0];
  if (m('gwetroot')) {
    const x = m('gwetroot'), ratio = x.p50 / x.climatology;
    signals.push({ id: 'dry', level: ratio < 0.65 ? 'warn' : ratio < 0.85 ? 'watch' : 'ok', month: x.month,
      value: Math.round((ratio - 1) * 100), confidence: skillWord(skill.gwetroot?.h1 ?? 0), skill: skill.gwetroot?.h1 });
  }
  if (m('rain_mm_day')) {
    const x = m('rain_mm_day');
    signals.push({ id: 'rain', level: x.p90 * 30 > 300 ? 'warn' : 'ok', month: x.month, mm: Math.round(x.p50 * 30),
      normal: Math.round(x.climatology * 30), high: Math.round(x.p90 * 30), confidence: skillWord(skill.rain_mm_day?.h1 ?? 0), skill: skill.rain_mm_day?.h1 });
  }
  if (m('t2m_c')) {
    const x = m('t2m_c'), diff = x.p50 - x.climatology;
    signals.push({ id: 'heat', level: diff > 2.5 ? 'warn' : diff > 1.5 ? 'watch' : 'ok', month: x.month,
      value: Math.round(diff * 10) / 10, c: Math.round(x.p50 * 10) / 10, confidence: skillWord(skill.t2m_c?.h1 ?? 0), skill: skill.t2m_c?.h1 });
  }
  return { level: worst(signals.map((s) => s.level)), signals, date: brief?.date, fallback: !!brief?.fallback };
}
