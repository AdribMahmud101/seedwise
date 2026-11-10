import {
  state,
  agronomy,
  persist,
  t,
  num,
  field,
  polygon,
  area,
  button,
  header,
  panel,
  tag,
  truth,
  chips,
  input,
  select,
  sources,
  repaint,
} from './ui.js';
import { PLANTING, capacity } from './engine.js';

const cropIds = {
  rice: 'aman',
  mustard: 'mustard',
  potato: 'potato',
  mungbean: 'mungbean',
};
function setPlantCrop(id) {
  state.planner.crop = id;
  state.planner.row = (PLANTING[id].row || 0.2) * 100;
  state.planner.spacing = (PLANTING[id].spacing || 0.1) * 100;
  persist();
}
function estimate() {
  const p = state.planner;
  return capacity(
    area(),
    p.usable,
    p.crop,
    p.crop === 'mustard' ? 0 : p.row / 100,
    p.crop === 'mustard' ? 0 : p.spacing / 100
  );
}
function plannerResult() {
  const p = state.planner,
    c = PLANTING[p.crop],
    q = estimate(),
    record = agronomy.crops.find((x) => x.id === cropIds[p.crop]);
  const isSeed = p.crop === 'mustard';
  return `<div class="plan-result"><div class="eyebrow">${isSeed ? t('Seed you need', 'কতটা বীজ লাগবে') : t('Plants to sow', 'কতগুলো গাছ লাগাবেন')}</div><strong>${num(isSeed ? q.seedKg : q.positions, isSeed ? 1 : 0)}</strong>${isSeed ? `<span>${t('kg', 'কেজি')}</span>` : ''}</div><dl class="field-meta"><div><dt>${t('Usable area', 'চাষযোগ্য জমি')}</dt><dd>${num(q.net, 2)} ha ${truth('SCENARIO')}</dd></div><div><dt>${isSeed ? t('Reference seed rate', 'বীজের হার') : t('Spacing', 'দূরত্ব')}</dt><dd>${isSeed ? `${num(c.seedRate)} kg/ha ${truth('MODELED', { source: 'Trial reference' })}` : `${num(p.row, 1)} × ${num(p.spacing, 1)} cm ${truth('FARMER_REPORTED')}`}</dd></div></dl>
 <p class="note"><b>${t('Trial-based harvest illustration', 'গবেষণার ফলন ধরে উদাহরণ')}</b><br>${num(q.low, 1)}–${num(q.high, 1)} t ${t('on this usable area if the published trial yield were achieved.', 'এই চাষযোগ্য জমিতে, যদি গবেষণার ফলনের সমান ফল পাওয়া যায়।')} (${record.referenceYieldTHa.join('–')} t/ha ${truth('MODELED', { source: 'Trial evidence' })}). ${sources(record.sourceIds)}</p>`;
}
function planner() {
  const p = state.planner;
  return (
    header(
      t('Planting desk  /  04', 'বপনের নকশা  /  ০৪'),
      t('Planting planner', 'বপনের পরিকল্পনা'),
      t(
        'Turn the field boundary into a row layout and an approximate planting count.',
        'জমির সীমানা থেকে সারি ও আনুমানিক গাছের সংখ্যা দেখুন।'
      ),
      button(t('Print field plan', 'পরিকল্পনা ছাপুন'), 'print', '', 'print')
    ) +
    chips() +
    `<div class="grid-two planner3d-layout"><section class="panel planner3d-panel"><div class="panel-header"><h2>${t('Field preview', 'জমির পূর্বদৃশ্য')}</h2>${tag(t('Planting model', 'বপনের নকশা'), 'green')}</div>
 <div class="planner3d-stage-wrap">
 <div class="planner3d-toolbar"><div class="planner3d-view-toggle" role="group" aria-label="${t('Field view', 'জমির দৃশ্য')}">
 <button type="button" class="planner3d-view-btn ${p.view !== 'top' ? 'active' : ''}" data-action="plan-view" data-value="3d" aria-pressed="${p.view !== 'top'}">${t('3D', '৩ডি')}</button>
 <button type="button" class="planner3d-view-btn ${p.view === 'top' ? 'active' : ''}" data-action="plan-view" data-value="top" aria-pressed="${p.view === 'top'}">${t('Top', 'উপর থেকে')}</button></div>
 <div class="planner3d-zoom-controls"><button type="button" class="planner3d-ctrl-btn" data-action="plan-zoom" data-value="1" aria-label="${t('Zoom in', 'কাছে আনুন')}">+</button><button type="button" class="planner3d-ctrl-btn" data-action="plan-zoom" data-value="-1" aria-label="${t('Zoom out', 'দূরে নিন')}">−</button></div></div>
 <div class="planner3d-stage-canvas-host" tabindex="0" role="region" aria-label="${t('Field model. Drag or use arrow keys to rotate; scroll, pinch or use zoom buttons to zoom.', 'জমির মডেল। ঘোরাতে টানুন বা তীরচিহ্নের কী ব্যবহার করুন; জুম করতে স্ক্রল, দুই আঙুল বা জুম বোতাম ব্যবহার করুন।')}"><canvas id="plant-model" class="planner-canvas" aria-label="${t('Schematic of planting rows within the field boundary', 'জমির সীমানায় সারির নমুনা নকশা')}"></canvas></div>
 <div class="planner3d-footer"><span class="planner3d-crop-chip">${t('Illustrative · rows drawn at readable scale', 'কাল্পনিক · বোঝার সুবিধায় সারি বড় করে দেখানো')}</span><span class="note planner3d-fallback-note">${t('2D fallback · flat ground · drag to rotate', '২ডি বিকল্প · সমতল জমি · ঘোরাতে টানুন')}</span></div></div></section>
 ${panel(
   t('Planting settings', 'বপনের মাপ'),
   `<form id="plant-controls" class="form-grid">${select(
     t('Crop', 'ফসল'),
     'plantCrop',
     Object.entries(PLANTING).map(([key, c]) => [key, t(c.label, c.bn)]),
     p.crop
   )}${input(t('Usable area (%)', 'চাষযোগ্য জমি (%)'), 'usable', p.usable, 'min="1" max="100" step="1" required')}${p.crop !== 'mustard' ? input(t('Row spacing (cm)', 'সারির দূরত্ব (সেমি)'), 'row', Number(p.row.toFixed(1)), 'min="2" max="250" step="0.1" required') + input(t('Within row (cm)', 'গাছের দূরত্ব (সেমি)'), 'spacing', Number(p.spacing.toFixed(1)), 'min="2" max="250" step="0.1" required') : ''}</form><div id="plan-estimate">${plannerResult()}</div>`,
   ''
 )}</div>
 <div class="section-space">${panel(t('Read the estimate', 'হিসাব বুঝুন'), `<p class="note">${t('Usable area reserves room for paths, drains or a tree border. Row crops use usable square metres divided by row × plant spacing. Broadcast mustard uses BARI Shorisha-14’s reference seed rate. The model draws representative plants. Rice is counted in hills.', 'আইল, নালা ও গাছের জন্য জমি বাদ দিয়ে চাষযোগ্য অংশ ঠিক করুন। সারির ফসলে চাষযোগ্য বর্গমিটারকে দুই দূরত্বের গুণফল দিয়ে ভাগ করা হয়। ছিটানো সরিষায় বারি সরিষা-১৪ এর বীজের হার ধরা হয়। ধানের হিসাব গোছায়।')}</p>`)}</div>`
  );
}
function drawPlanner() {
  const canvas = document.querySelector('#plant-model');
  if (!canvas || canvas.closest('.planner3d-ready')) return;
  const bounds = canvas.getBoundingClientRect(),
    width = bounds.width,
    height = bounds.height,
    dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx || !width || !height) return;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#e9eee3';
  ctx.fillRect(0, 0, width, height);
  const poly = polygon(),
    center = poly.reduce(
      (a, [lat, lon]) => [a[0] + lat / poly.length, a[1] + lon / poly.length],
      [0, 0]
    );
  const raw = poly.map(([lat, lon]) => [
    (lon - center[1]) * 111195 * Math.cos((center[0] * Math.PI) / 180),
    (lat - center[0]) * 111195,
  ]);
  const radius = Math.max(...raw.map(([x, y]) => Math.hypot(x, y)));
  const overhead = state.planner.view === 'top';
  const s = Math.min(width * 0.39, height * (overhead ? 0.42 : 0.61)) / radius,
    a = state.planner.angle,
    c = Math.cos(a),
    sn = Math.sin(a);
  function project(x, y, z = 0) {
    return [
      width * 0.5 + (x * c - y * sn) * s,
      height * 0.48 +
        (x * sn + y * c) * s * (overhead ? 1 : 0.53) -
        (overhead ? 0 : z * s),
    ];
  }
  function path(points, fill, stroke) {
    ctx.beginPath();
    points.forEach((v, i) => (i ? ctx.lineTo(...v) : ctx.moveTo(...v)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }
  }
  for (let z = -radius * 2; z <= radius * 2; z += radius / 8) {
    ctx.beginPath();
    ctx.moveTo(...project(-radius * 2, z, -7));
    ctx.lineTo(...project(radius * 2, z, -7));
    ctx.moveTo(...project(z, -radius * 2, -7));
    ctx.lineTo(...project(z, radius * 2, -7));
    ctx.strokeStyle = '#d7dfd1';
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }
  const surface = raw.map((p) => project(...p)),
    under = raw.map(([x, y]) => project(x, y, -7));
  path(under, '#8e7962');
  raw
    .map((p, i) => [i, (surface[i][1] + surface[(i + 1) % raw.length][1]) / 2])
    .sort((u, v) => u[1] - v[1])
    .forEach(([i]) => {
      const j = (i + 1) % raw.length;
      path([surface[i], surface[j], under[j], under[i]], '#a18968', '#897559');
    });
  path(surface, '#af9e6f', '#7f8060');
  const usable = Math.sqrt(state.planner.usable / 100);
  const inner = raw.map(([x, y]) => [x * usable, y * usable]);
  path(
    inner.map((p) => project(...p)),
    '#8c9761'
  );
  function inside(x, y) {
    let found = false;
    for (let i = 0, j = inner.length - 1; i < inner.length; j = i++) {
      const [u, v] = inner[i],
        [w, z] = inner[j];
      if (v > y !== z > y && x < ((w - u) * (y - v)) / (z - v) + u)
        found = !found;
    }
    return found;
  }
  const sx = Math.max(3.7, radius * (0.075 + state.planner.spacing / 550)),
    sy = Math.max(4, radius * (0.07 + state.planner.row / 400));
  const pts = [];
  ctx.save();
  ctx.beginPath();
  inner
    .map((p) => project(...p))
    .forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
  ctx.closePath();
  ctx.clip();
  for (let y = -radius; y <= radius; y += sy) {
    ctx.beginPath();
    ctx.moveTo(...project(-radius, y));
    ctx.lineTo(...project(radius, y));
    ctx.strokeStyle = '#526348';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    for (let x = -radius; x <= radius; x += sx)
      if (inside(x, y)) pts.push(project(x, y));
  }
  ctx.restore();
  pts.sort((u, v) => u[1] - v[1]);
  const crop = state.planner.crop;
  for (const [x, y] of pts) {
    const size = Math.min(width, height) / 500;
    ctx.beginPath();
    ctx.strokeStyle = crop === 'potato' ? '#456f3e' : '#506e40';
    ctx.lineWidth = 1.4;
    ctx.moveTo(x, y);
    ctx.lineTo(x - 3 * size, y - 6 * size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2 * size, y - 8 * size);
    ctx.moveTo(x, y);
    ctx.lineTo(x + 5 * size, y - 4 * size);
    ctx.stroke();
    if (crop === 'potato' || crop === 'mungbean') {
      ctx.fillStyle = crop === 'potato' ? '#47723e' : '#658747';
      for (const offset of [-2, 2]) {
        ctx.beginPath();
        ctx.ellipse(
          x + offset * size,
          y - 5 * size,
          3 * size,
          1.8 * size,
          offset * 0.3,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }
    if (crop === 'mustard') {
      ctx.fillStyle = '#d5ae49';
      ctx.fillRect(x - 3 * size, y - 7 * size, 3 * size, 3 * size);
    }
  }
  ctx.fillStyle = '#536348';
  ctx.font = '11px monospace';
  ctx.fillText(
    `${field().name.toUpperCase()}  /  ${num(area(), 2)} ha`,
    18,
    26
  );
  ctx.fillText('N', width - 40, 26);
  const north = project(0, radius * 0.25);
  ctx.beginPath();
  ctx.moveTo(width - 34, 43);
  ctx.lineTo(
    width - 34 + (north[0] - width * 0.5) / 15,
    43 + (north[1] - height * 0.48) / 15
  );
  ctx.strokeStyle = '#445a42';
  ctx.stroke();
}
let planner3dModule = null;
let planner3dPromise = null;
let soilProfilePromise = null;
let plannerTimer = null;
let plannerHost = null;
let plannerVersion = 0;

function hasPlannerWebGL() {
  try {
    const probe = document.createElement('canvas');
    const context = window.WebGLRenderingContext && (probe.getContext('webgl2') || probe.getContext('webgl'));
    context?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(context);
  } catch {
    return false;
  }
}

function schedulePlanner3d() {
  clearTimeout(plannerTimer);
  const version = ++plannerVersion;
  const host = plannerHost;
  if (!host || (!planner3dModule && !hasPlannerWebGL())) return;
  plannerTimer = setTimeout(async () => {
    try {
      planner3dPromise ||= import('./planner3d.js').catch((error) => {
        planner3dPromise = null;
        throw error;
      });
      soilProfilePromise ||= fetch('data/soil-profile.json')
        .then((response) => response.ok ? response.json() : null).catch(() => null);
      const [mod, soilProfile] = await Promise.all([planner3dPromise, soilProfilePromise]);
      planner3dModule = mod;
      if (version !== plannerVersion || !host.isConnected || host !== plannerHost) return;
      await mod.mountPlanner3d(host, {
        field: field(), polygon: polygon(), agronomy, soilProfile,
        planner: { ...state.planner },
      });
    } catch (error) {
      if (version !== plannerVersion) return;
      planner3dModule?.disposePlanner3d();
      drawPlanner();
      console.warn('Planner 3D unavailable; using schematic:', error);
    }
  }, 120);
}

function disposePlanner() {
  ++plannerVersion;
  clearTimeout(plannerTimer);
  plannerTimer = null;
  plannerHost = null;
  planner3dModule?.disposePlanner3d();
}

function mountPlanner() {
  const cv = document.querySelector('#plant-model');
  if (!cv) return;
  plannerHost = cv.parentElement;
  drawPlanner();
  schedulePlanner3d();
  plannerHost.addEventListener('keydown', (event) => {
    if (cv.closest('.planner3d-ready') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    state.planner.angle += (event.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 6;
    persist();
    drawPlanner();
  });
  let drag = null;
  cv.onpointerdown = (e) => {
    drag = e.clientX;
    cv.setPointerCapture(e.pointerId);
  };
  cv.onpointermove = (e) => {
    if (drag === null) return;
    state.planner.angle += (e.clientX - drag) / 110;
    drag = e.clientX;
    drawPlanner();
  };
  cv.onpointerup = cv.onpointercancel = () => {
    drag = null;
    persist();
  };
}
function plannerAction(action, value) {
  if (action === 'plan-view') {
    state.planner.view = value === 'top' ? 'top' : '3d';
    persist();
    document.querySelectorAll('[data-action="plan-view"]').forEach((control) => {
      const active = control.dataset.value === state.planner.view;
      control.classList.toggle('active', active);
      control.setAttribute('aria-pressed', String(active));
    });
    planner3dModule?.setPlanner3dView(state.planner.view);
    drawPlanner();
    schedulePlanner3d();
  }
  if (action === 'plan-zoom') planner3dModule?.zoomPlanner3d(Number(value));
}
function plannerInput(el) {
  if (
    el.closest('#plant-controls') &&
    el.name !== 'plantCrop' &&
    el.value !== '' &&
    el.validity.valid
  ) {
    state.planner[el.name] = +el.value;
    persist();
    document.querySelector('#plan-estimate').innerHTML = plannerResult();
    drawPlanner();
    schedulePlanner3d();
  }
}
function plannerChange(el) {
  if (el.name === 'plantCrop') {
    setPlantCrop(el.value);
    repaint();
  }
}

export {
  setPlantCrop,
  planner,
  drawPlanner,
  mountPlanner,
  disposePlanner,
  plannerAction,
  plannerInput,
  plannerChange,
};
