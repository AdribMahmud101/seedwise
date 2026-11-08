const NAME = "ropon-field-48f7a5c7b8cf";
const FILES = [
  "./app.js",
  "./assets/leaflet.css",
  "./assets/leaflet.js",
  "./assets/mark.svg",
  "./assets/satellite-gangachara.jpg",
  "./assets/satellite-mithapukur.jpg",
  "./assets/satellite-pirganj.jpg",
  "./assets/sentinel-gangachara.jpg",
  "./assets/sentinel-mithapukur.jpg",
  "./assets/sentinel-pirganj.jpg",
  "./boundary.js",
  "./clinic.js",
  "./data/agronomy.json",
  "./data/earth-data.json",
  "./data/history.json",
  "./data/rangpur_district.geojson",
  "./data/rangpur_upazilas.geojson",
  "./engine.js",
  "./fields.js",
  "./fonts/fraunces-latin-400-italic.woff2",
  "./fonts/fraunces-latin-400-normal.woff2",
  "./fonts/fraunces-latin-600-normal.woff2",
  "./fonts/ibm-plex-mono-latin-400-normal.woff2",
  "./fonts/ibm-plex-mono-latin-500-normal.woff2",
  "./fonts/ibm-plex-sans-latin-400-normal.woff2",
  "./fonts/ibm-plex-sans-latin-500-normal.woff2",
  "./fonts/ibm-plex-sans-latin-600-normal.woff2",
  "./fonts/noto-sans-bengali-bengali-400-normal.woff2",
  "./fonts/noto-sans-bengali-bengali-600-normal.woff2",
  "./index.html",
  "./planner.js",
  "./recovery-data.js",
  "./recovery-engine.js",
  "./recovery.css",
  "./recovery.js",
  "./report.js",
  "./research.js",
  "./rotations.js",
  "./style.css",
  "./ui.js",
  "./water.js"
];
const allowed = new Set(FILES.map(p => new URL(p,self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('ropon-field-') && n !== NAME).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const r = event.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    event.respondWith(fetch(r).catch(() => caches.open(NAME).then(c => c.match(new URL('./index.html',self.registration.scope).href))));
  } else if (allowed.has(r.url)) {
    event.respondWith(caches.open(NAME).then(async c => (await c.match(r)) || fetch(r)));
  }
});
