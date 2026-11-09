"""Write a versioned service worker into out/ after `next build`.

Precaches the public static assets; Next's hashed /_next/static files are
cached at runtime on first load (they are immutable), and the home page is
used as the offline navigation fallback.
"""
from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[1] / 'out'
if not root.exists():
    raise SystemExit('out/ not found. Run `next build` first.')
skip = {'sw.js', '404.html'}
files = sorted(p for p in root.rglob('*')
               if p.is_file() and p.name not in skip and '_next' not in p.parts and p.suffix != '.txt')
digest = hashlib.sha256()
for p in files:
    digest.update(p.relative_to(root).as_posix().encode())
    digest.update(p.read_bytes())
version = 'ropon-field-' + digest.hexdigest()[:12]
assets = ['/' + p.relative_to(root).as_posix() for p in files if p.name != 'index.html'] + ['/']
worker = """const NAME = __NAME__;
const FILES = __FILES__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(NAME).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('ropon-field-') && n !== NAME).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const r = event.request;
  const url = new URL(r.url);
  if (url.hostname.includes('arcgisonline.com') || url.hostname.endsWith('arcgis.com')) return; // Esri terms: never cache
  if (r.method !== 'GET' || url.origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    event.respondWith(fetch(r).catch(() => caches.open(NAME).then(c => c.match('/'))));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(NAME).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.open(NAME).then(async c => (await c.match(r)) || fetch(r)));
  }
});
"""
(root / 'sw.js').write_text(worker.replace('__NAME__', json.dumps(version)).replace('__FILES__', json.dumps(assets, indent=2)))
print(version, len(assets), 'static assets')
