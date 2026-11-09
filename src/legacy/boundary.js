import {
  state,
  earth,
  persist,
  t,
  esc,
  num,
  polygon,
  button,
  modal,
  close,
  repaint,
  toast,
  download,
} from './ui.js';
import { polygonValid, areaHa } from './engine.js';

function units(ha) {
  const shotok = ha * 247.105381;
  const bigha = shotok / 33;
  const katha = shotok / 1.65;
  const acre = ha * 2.47105381;
  return `${num(shotok, 1)} ${t('shotok', 'শতক')} · ${num(bigha, 2)} ${t('bigha', 'বিঘা')} · ${num(katha, 1)} ${t('katha', 'কাঠা')} · ${num(acre, 2)} ${t('acres', 'একর')} · ${num(ha, 2)} ha`;
}
function editBoundary(initial = null) {
  const points = initial || polygon();
  modal(
    t('Measure a boundary', 'জমির সীমানা মাপুন'),
    `<p class="note">${t('Enter one latitude, longitude pair per line, going around the plot. Three different corners are needed. A new plot outside the prepared imagery can be measured and exported.', 'জমির চারপাশ ধরে প্রতি লাইনে একটি অক্ষাংশ, দ্রাঘিমাংশ লিখুন। অন্তত তিনটি ভিন্ন কোণ দরকার। প্রস্তুত ছবির বাইরের জমিও মেপে রপ্তানি করা যাবে।')}</p><form id="boundary-form" class="section-space"><div class="form-field"><label for="corner-list">${t('Plot corners', 'জমির কোণ')}</label><textarea id="corner-list" name="corners" rows="6" required>${points.map((p) => p.map((v) => Number(v).toFixed(6)).join(', ')).join('\n')}</textarea></div><div class="spacer"></div><button class="button primary">${t('Measure outline', 'সীমানা মাপুন')}</button></form><div id="measured-output"></div>`
  );
}
let measured = null;
function boundarySubmit(form) {
  if (form.id !== 'boundary-form') return false;
  const raw = String(new FormData(form).get('corners')).trim();
  const pts = raw
    .split(/\n+/)
    .map((row) => row.trim().split(/[ ,]+/).map(Number));
  const valid =
    pts.length <= 500 &&
    pts.every(
      (p) =>
        p.length === 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) < 90 &&
        Math.abs(p[1]) <= 180
    ) &&
    polygonValid(pts);
  const target = document.querySelector('#measured-output');
  if (!valid) {
    measured = null;
    target.innerHTML = `<p class="notice amber section-space">${t('Use at least three distinct corners, valid coordinates, and a boundary that does not cross itself.', 'অন্তত তিনটি ভিন্ন কোণ ও সঠিক স্থানাঙ্ক দিন। সীমানা যেন নিজেকে ছেদ না করে।')}</p>`;
    return true;
  }
  measured = pts;
  const match = earth.fields.find((f) =>
    [f.contextImage, ...f.imagery].filter(Boolean).some((image) => {
      const [w, s, e, n] = image.bounds;
      return pts.every(([y, x]) => x >= w && x <= e && y >= s && y <= n);
    })
  );
  target.innerHTML = `<div class="fertilizer-output"><b>${units(areaHa(pts))}</b><p class="note">${match ? t('Within the prepared imagery for', 'প্রস্তুত ছবির ভেতরে') + ' ' + esc(match.name) : t('Outside prepared coverage. Climate, optical and rotation data are unavailable for this new plot.', 'প্রস্তুত এলাকার বাইরে। এখানে আবহাওয়া, স্যাটেলাইট ও ফসলচক্রের তথ্য নেই।')}</p><div class="toolbar-inline">${match ? button(t('Use for this site', 'এই স্থানে ব্যবহার করুন'), 'apply-geometry', 'small', 'save', match.id) : ''}${button(t('Export GeoJSON', 'GeoJSON রপ্তানি'), 'export-geometry', 'small', 'download')}</div></div>`;
  return true;
}
function boundaryAction(action, value) {
  if (action === 'coordinates') editBoundary();
  if (action === 'measure-new') {
    const initial = value.split(',').map(Number);
    editBoundary(
      initial.every(Number.isFinite) && initial.length === 2 ? [initial] : []
    );
  }
  if (action === 'apply-geometry' && measured) {
    state.boundaries[value] = measured.map((p) => [...p]);
    state.fieldId = value;
    persist();
    close();
    repaint();
    toast(t('Measured boundary saved', 'মাপা সীমানা সংরক্ষিত'));
  }
  if (action === 'reset-demo') {
    delete state.boundaries[state.fieldId];
    persist();
    repaint();
    toast(t('Outline reset', 'সীমানা আগের মতো করা হয়েছে'));
  }
  if (action === 'export-geometry' && measured) {
    const ring = measured.map(([lat, lon]) => [lon, lat]);
    ring.push(ring[0]);
    download(
      'ropon-measured-boundary.geojson',
      JSON.stringify(
        {
          type: 'Feature',
          properties: {
            areaHa: areaHa(measured),
            source: 'user-entered coordinates',
          },
          geometry: { type: 'Polygon', coordinates: [ring] },
        },
        null,
        2
      ),
      'application/geo+json'
    );
  }
}

export { units, boundaryAction, boundarySubmit };
