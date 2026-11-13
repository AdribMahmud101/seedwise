// Weather page: live 7-day forecast (Open-Meteo), last observed days (NASA POWER)
// and the 3-month outlook from our fine-tuned model. Real fetches only; when
// offline we show the last saved copy with its time, never invented numbers.
import { state, t, esc, num, field, chips, nasaBadge, outlook } from './ui.js';
import { outlookCard } from './outlook-flood.js';

const CACHE = 'seedwise.weather.';
const FRESH_MS = 30 * 60 * 1000;

const KINDS = {
  clear: ['Clear', 'পরিষ্কার'], partly: ['Partly cloudy', 'আংশিক মেঘলা'], cloudy: ['Cloudy', 'মেঘলা'],
  fog: ['Fog', 'কুয়াশা'], drizzle: ['Drizzle', 'গুঁড়ি বৃষ্টি'], rain: ['Rain', 'বৃষ্টি'],
  showers: ['Showers', 'ঝরো বৃষ্টি'], storm: ['Thunderstorm', 'বজ্রঝড়'], snow: ['Snow', 'তুষার'],
};
// WMO weather interpretation codes, as returned by Open-Meteo.
export function wmoKind(code) {
  if (code === 0) return 'clear';
  if (code <= 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if ((code >= 61 && code <= 67)) return 'rain';
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 95) return 'storm';
  return 'cloudy';
}

const SUN = '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>';
const CLOUD = '<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 18.5z"/>';
const RAIN_CLOUD = '<path d="M7 15.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 15.5z"/>';
const GLYPH = {
  clear: SUN,
  partly: '<circle cx="8.5" cy="8.5" r="3.2"/><path d="M8.5 2.5v1.4M2.5 8.5h1.4M4.3 4.3l1 1M12.7 4.3l-1 1"/><path d="M9 19.5h8.5a3.5 3.5 0 0 0 .3-7 4.8 4.8 0 0 0-9.2 1.2A2.9 2.9 0 0 0 9 19.5z"/>',
  cloudy: CLOUD,
  fog: '<path d="M4 9h16M3 13h18M5 17h14"/>',
  drizzle: RAIN_CLOUD + '<path d="M9 19v.5M13 19v.5M17 19v.5"/>',
  rain: RAIN_CLOUD + '<path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3"/>',
  showers: RAIN_CLOUD + '<path d="M10 18l-1 3M15 18l-1 3"/>',
  storm: '<path d="M7 14.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 14.5z"/><path d="M12.5 14.5l-2 3.5h3l-2 3.5"/>',
  snow: CLOUD + '<path d="M9 21h.01M13 21h.01M17 21h.01"/>',
};
function glyph(kind, size = 28) {
  return `<svg class="wx-glyph wx-${kind}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[kind] || CLOUD}</svg>`;
}

export function forecastUrl(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), timezone: 'Asia/Dhaka', forecast_days: '7', wind_speed_unit: 'ms',
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m',
    hourly: 'temperature_2m,precipitation_probability,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration,wind_speed_10m_max,uv_index_max,sunrise,sunset',
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}
const ymd = (d) => d.toISOString().slice(0, 10).replaceAll('-', '');
export function powerUrl(lat, lon, now = new Date()) {
  const start = new Date(now.getTime() - 16 * 86400000);
  const q = new URLSearchParams({
    parameters: 'T2M_MAX,T2M_MIN,PRECTOTCORR,RH2M', community: 'AG', format: 'JSON', 'time-standard': 'UTC',
    latitude: lat.toFixed(4), longitude: lon.toFixed(4), start: ymd(start), end: ymd(now),
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q}`;
}
// POWER marks days not yet processed as -999; keep only complete days, newest 10.
export function powerDays(json) {
  const p = json?.properties?.parameter;
  if (!p?.T2M_MAX) return [];
  const ok = (v) => Number.isFinite(v) && v !== -999;
  return Object.keys(p.T2M_MAX).sort()
    .map((k) => ({ date: `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6)}`, tmax: p.T2M_MAX[k], tmin: p.T2M_MIN?.[k], rain: p.PRECTOTCORR?.[k], rh: p.RH2M?.[k] }))
    .filter((d) => ok(d.tmax) && ok(d.tmin) && ok(d.rain))
    .slice(-10);
}

// Rules of thumb read straight from the forecast numbers (no model): spray, water, heat, heavy rain.
export function farmAdvice(daily) {
  const days = daily.time.map((date, i) => ({
    date, rain: daily.precipitation_sum[i] ?? 0, prob: daily.precipitation_probability_max[i] ?? 0,
    wind: daily.wind_speed_10m_max[i] ?? 0, tmax: daily.temperature_2m_max[i], eto: daily.et0_fao_evapotranspiration[i] ?? 0,
  }));
  const spray = days.find((d) => d.prob < 30 && d.rain < 1 && d.wind < 5);
  const rain7 = days.reduce((s, d) => s + d.rain, 0);
  const eto7 = days.reduce((s, d) => s + d.eto, 0);
  const heat = days.filter((d) => d.tmax >= 35);
  const heavy = days.filter((d) => d.rain >= 50);
  return { spray: spray?.date || null, rain7, eto7, deficit: Math.max(0, eto7 - rain7), heat: heat.map((d) => d.date), heavy: heavy.map((d) => d.date) };
}

function readCache(key) {
  try { return JSON.parse(localStorage.getItem(CACHE + key)); } catch { return null; }
}
function writeCache(key, data) {
  try { localStorage.setItem(CACHE + key, JSON.stringify({ at: Date.now(), data })); } catch { /* storage full: live view still works */ }
}
async function load(key, url, fetchFn) {
  const cached = readCache(key);
  if (cached && Date.now() - cached.at < FRESH_MS) return cached;
  try {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    writeCache(key, data);
    return { at: Date.now(), data };
  } catch (error) {
    if (cached) return { ...cached, stale: true };
    throw error;
  }
}

const locale = () => (state.lang === 'bn' ? 'bn-BD' : 'en-GB');
const dayName = (iso, opts = { weekday: 'short' }) => new Intl.DateTimeFormat(locale(), { ...opts, timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));
const clock = (iso) => new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(`${iso}:00Z`));
const savedAt = (at) => new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(at));
const compass = (deg) => t(...[['N', 'উত্তর'], ['NE', 'উত্তর-পূর্ব'], ['E', 'পূর্ব'], ['SE', 'দক্ষিণ-পূর্ব'], ['S', 'দক্ষিণ'], ['SW', 'দক্ষিণ-পশ্চিম'], ['W', 'পশ্চিম'], ['NW', 'উত্তর-পশ্চিম']][Math.round(deg / 45) % 8]);

function heroHtml(fc, meta) {
  const c = fc.current, d = fc.daily, kind = wmoKind(c.weather_code);
  const stat = (label, value) => `<div><small>${esc(label)}</small><b>${value}</b></div>`;
  return `<section class="wx-hero wx-bg-${kind}">
    <div class="wx-now">${glyph(kind, 64)}<div><div class="wx-temp">${num(c.temperature_2m)}<span>°C</span></div>
    <p>${esc(t(...KINDS[kind]))} · ${t('feels', 'অনুভূত')} ${num(c.apparent_temperature)}° · ${t('today', 'আজ')} ${num(d.temperature_2m_min[0])}°–${num(d.temperature_2m_max[0])}°</p></div></div>
    <div class="wx-stats">${stat(t('Humidity', 'আর্দ্রতা'), `${num(c.relative_humidity_2m)}%`)}${stat(t('Wind', 'বাতাস'), `${num(c.wind_speed_10m, 1)} m/s ${compass(c.wind_direction_10m)}`)}
    ${stat(t('Rain today', 'আজ বৃষ্টি'), `${num(d.precipitation_sum[0], 1)} mm`)}${stat(t('Rain chance', 'বৃষ্টির সম্ভাবনা'), `${num(d.precipitation_probability_max[0])}%`)}
    ${stat(t('UV max', 'সর্বোচ্চ UV'), num(d.uv_index_max[0], 1))}${stat(t('Sun', 'সূর্য'), `${clock(d.sunrise[0])} – ${clock(d.sunset[0])}`)}</div>
    <p class="wx-meta">${meta}</p></section>`;
}
function hourlyHtml(fc) {
  const now = fc.current.time.slice(0, 13);
  const start = Math.max(0, fc.hourly.time.findIndex((h) => h.slice(0, 13) === now));
  const hours = fc.hourly.time.slice(start, start + 24).map((h, j) => {
    const i = start + j;
    return `<li><small>${j ? clock(h) : t('Now', 'এখন')}</small>${glyph(wmoKind(fc.hourly.weather_code[i]), 24)}<b>${num(fc.hourly.temperature_2m[i])}°</b><span class="wx-pop">${num(fc.hourly.precipitation_probability[i])}%</span></li>`;
  }).join('');
  return `<section class="panel wx-card"><div class="panel-header"><h2>${t('Next 24 hours', 'পরের ২৪ ঘণ্টা')}</h2></div><ol class="wx-hours">${hours}</ol></section>`;
}
function dailyHtml(fc) {
  const d = fc.daily;
  const lo = Math.min(...d.temperature_2m_min), hi = Math.max(...d.temperature_2m_max), span = Math.max(1, hi - lo);
  const rows = d.time.map((date, i) => {
    const left = ((d.temperature_2m_min[i] - lo) / span) * 100, width = ((d.temperature_2m_max[i] - d.temperature_2m_min[i]) / span) * 100;
    return `<li><b class="wx-day">${i ? esc(dayName(date)) : t('Today', 'আজ')}</b>${glyph(wmoKind(d.weather_code[i]), 26)}
      <span class="wx-rain"><i style="width:${Math.min(100, d.precipitation_probability_max[i] ?? 0)}%"></i><small>${num(d.precipitation_probability_max[i])}% · ${num(d.precipitation_sum[i], 1)} mm</small></span>
      <span class="wx-range"><small>${num(d.temperature_2m_min[i])}°</small><span class="wx-track"><i style="left:${left}%;width:${Math.max(4, width)}%"></i></span><small>${num(d.temperature_2m_max[i])}°</small></span></li>`;
  }).join('');
  return `<section class="panel wx-card"><div class="panel-header"><h2>${t('7-day forecast', '৭ দিনের পূর্বাভাস')}</h2></div><ul class="wx-days">${rows}</ul></section>`;
}
function adviceHtml(fc) {
  const a = farmAdvice(fc.daily);
  const tile = (tone, title, body) => `<div class="wx-tip wx-${tone}"><strong>${esc(title)}</strong><p>${body}</p></div>`;
  const days = (list) => list.map((x) => esc(dayName(x))).join(', ');
  return `<section class="panel wx-card"><div class="panel-header"><h2>${t('What it means for your field', 'আপনার জমির জন্য এর মানে')}</h2></div><div class="wx-tips">
    ${a.spray ? tile('good', t('Spray window', 'স্প্রে করার সময়'), `${esc(dayName(a.spray, { weekday: 'long' }))}: ${t('low rain chance and light wind.', 'বৃষ্টির সম্ভাবনা কম, বাতাস হালকা।')}`)
      : tile('warn', t('No clear spray day', 'স্প্রের ভালো দিন নেই'), t('Rain or wind on every day this week. Hold sprays if you can.', 'এই সপ্তাহে প্রতিদিন বৃষ্টি বা বাতাস। পারলে স্প্রে পিছিয়ে দিন।'))}
    ${tile(a.deficit > 15 ? 'warn' : 'good', t('Water balance, 7 days', 'পানির হিসাব, ৭ দিন'), `${t('Crops use', 'ফসল ব্যবহার করবে')} ~${num(a.eto7)} mm, ${t('rain gives', 'বৃষ্টি দেবে')} ~${num(a.rain7)} mm. ${a.deficit > 15 ? t(`Plan irrigation for about ${num(a.deficit)} mm.`, `প্রায় ${num(a.deficit)} মিমি সেচের পরিকল্পনা করুন।`) : t('Little or no irrigation needed.', 'সেচ প্রায় লাগবে না।')}`)}
    ${a.heat.length ? tile('bad', t('Heat stress', 'তাপের চাপ'), `${days(a.heat)}: 35°C+. ${t('Water early morning, avoid midday field work.', 'ভোরে সেচ দিন, দুপুরে মাঠের কাজ এড়িয়ে চলুন।')}`) : ''}
    ${a.heavy.length ? tile('bad', t('Heavy rain', 'ভারী বৃষ্টি'), `${days(a.heavy)}: 50 mm+. ${t('Clear drains. Check FFWC flood warnings.', 'নালা পরিষ্কার রাখুন। FFWC বন্যা সতর্কতা দেখুন।')} <a href="https://ffwc.gov.bd/" target="_blank" rel="noopener">FFWC ↗</a>`) : ''}
    </div><p class="wx-meta">${t('Rules of thumb from the forecast numbers above; not an official warning.', 'উপরের পূর্বাভাসের সংখ্যা থেকে সাধারণ নিয়ম; সরকারি সতর্কবার্তা নয়।')}</p></section>`;
}
function observedHtml(days, meta) {
  if (!days.length) return '';
  const max = Math.max(5, ...days.map((d) => d.rain));
  const bars = days.map((d) => `<li title="${esc(d.date)}"><span class="wx-bar"><i style="height:${(d.rain / max) * 100}%"></i></span><b>${num(d.rain, 1)}</b><small>${esc(dayName(d.date, { day: 'numeric', month: 'short' }))}</small><em>${num(d.tmin)}–${num(d.tmax)}°</em></li>`).join('');
  return `<section class="panel wx-card"><div class="panel-header"><h2>${t('Last 10 observed days', 'গত ১০ দিনের পর্যবেক্ষণ')}</h2>${nasaBadge('power', `${days[0].date} – ${days.at(-1).date}`)}</div>
    <p class="note">${t('Rain (mm) and min–max temperature for this field from NASA POWER. NASA publishes each day after a short delay.', 'নাসা POWER থেকে এই জমির বৃষ্টি (মিমি) ও সর্বনিম্ন–সর্বোচ্চ তাপমাত্রা। নাসা কিছুদিন পরে প্রতিটি দিনের তথ্য প্রকাশ করে।')}</p>
    <ol class="wx-observed">${bars}</ol><p class="wx-meta">${meta}</p></section>`;
}

const metaLine = (r, source) => `${source} · ${r.stale ? t('offline, saved', 'অফলাইন, সংরক্ষিত') : t('updated', 'হালনাগাদ')} ${esc(savedAt(r.at))}`;
const offline = (what) => `<div class="notice wx-empty">${esc(what)}</div>`;

let seq = 0;
export async function mountWeather(fetchFn = fetch) {
  const f = field(), run = ++seq;
  const live = document.querySelector('#wx-live'), obs = document.querySelector('#wx-observed');
  if (!f || !live) return;
  const still = () => run === seq && document.contains(live);
  const [fc, pw] = await Promise.allSettled([
    load(`fc.${f.id}`, forecastUrl(f.lat, f.lon), fetchFn),
    load(`power.${f.id}`, powerUrl(f.lat, f.lon), fetchFn),
  ]);
  if (!still()) return;
  live.innerHTML = fc.status === 'fulfilled'
    ? heroHtml(fc.value.data, metaLine(fc.value, `${t('Forecast', 'পূর্বাভাস')}: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo</a> (CC BY 4.0)`)) + `<div class="wx-grid">${hourlyHtml(fc.value.data)}${adviceHtml(fc.value.data)}</div>` + dailyHtml(fc.value.data)
    : offline(t('Connect to the internet once to load the live forecast. It is then saved for offline use.', 'লাইভ পূর্বাভাস পেতে একবার ইন্টারনেটে যুক্ত হন। এরপর অফলাইনেও দেখা যাবে।'));
  if (obs) obs.innerHTML = pw.status === 'fulfilled' ? observedHtml(powerDays(pw.value.data), metaLine(pw.value, 'NASA POWER')) : '';
}

export function weather() {
  const f = field();
  return `<header class="page-head"><div><div class="eyebrow">${t('WEATHER · LIVE', 'আবহাওয়া · লাইভ')}</div><h1>${t('Weather', 'আবহাওয়া')}</h1>
    <p>${t('Forecast for the next 7 days, what NASA observed in the last days, and our 3-month outlook, all for this field.', 'এই জমির জন্য পরের ৭ দিনের পূর্বাভাস, গত কয়েক দিনে নাসার পর্যবেক্ষণ এবং আমাদের ৩ মাসের আউটলুক।')}</p></div></header>
    ${chips()}
    <div id="wx-live" aria-live="polite"><div class="wx-hero wx-loading"><p>${t('Loading the forecast…', 'পূর্বাভাস আসছে…')}</p></div></div>
    <div id="wx-observed"></div>
    ${f ? `<div class="section-space">${outlookCard(f.id, outlook)}</div>` : ''}`;
}
