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
skip = {'sw.js', '404.html', 'version.json'}  # version.json must always come from the network
# Precache shell assets and data json, excluding tiles directory and the lazy
# HOWTO clips (public/assets/howto loads on tap only, never precached).
files = sorted(p for p in root.rglob('*')
               if p.is_file() and p.name not in skip and '_next' not in p.parts and 'tiles' not in p.parts and 'howto' not in p.parts and p.suffix != '.txt')
digest = hashlib.sha256()
for p in files:
    digest.update(p.relative_to(root).as_posix().encode())
    digest.update(p.read_bytes())
version = 'ropon-field-' + digest.hexdigest()[:12]
assets = ['/' + p.relative_to(root).as_posix() for p in files if p.name != 'index.html'] + ['/']
pilot_tiles = sorted('/' + p.relative_to(root).as_posix() for p in (root / 'tiles').rglob('*.png')) if (root / 'tiles').exists() else []
worker = """const NAME = __NAME__;
const FILES = __FILES__;
const PILOT_TILES = __PILOT_TILES__;
self.addEventListener('install', event => {
  // Cache files one by one: with addAll a single failed request aborted the install, so phones never left the old version.
  event.waitUntil(caches.open(NAME).then(cache => Promise.allSettled(FILES.map(f => cache.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => Promise.all(names.filter(n => n.startsWith('ropon-field-') && n !== NAME).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
      .then(() => {
        // Warm pilot-site tiles in the background after activate
        if (PILOT_TILES.length > 0) {
          caches.open(NAME).then(async cache => {
            for (const tileUrl of PILOT_TILES) {
              const matched = await cache.match(tileUrl);
              if (!matched) {
                try {
                  const res = await fetch(tileUrl);
                  if (res.ok) await cache.put(tileUrl, res);
                } catch (_) {}
              }
            }
          });
        }
      })
  );
});
self.addEventListener('fetch', event => {
  const r = event.request;
  const url = new URL(r.url);
  if (url.hostname.includes('arcgisonline.com') || url.hostname.endsWith('arcgis.com')) return; // Esri terms: never cache
  if (r.method !== 'GET' || url.origin !== self.location.origin) return;
  if (r.mode === 'navigate') {
    event.respondWith(fetch(r).catch(() => caches.open(NAME).then(c => c.match('/'))));
  } else if (url.pathname.startsWith('/tiles/')) {
    event.respondWith(
      caches.open(NAME).then(async c => {
        const cached = await c.match(r);
        if (cached) return cached;
        try {
          const res = await fetch(r);
          if (res.ok) c.put(r, res.clone());
          return res;
        } catch (err) {
          return cached;
        }
      })
    );
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(caches.open(NAME).then(async c => (await c.match(r)) || fetch(r).then(res => { if (res.ok) c.put(r, res.clone()); return res; })));
  } else if (FILES.includes(url.pathname)) {
    event.respondWith(caches.open(NAME).then(async c => (await c.match(r)) || fetch(r)));
  }
});
"""
(root / 'sw.js').write_text(
    worker.replace('__NAME__', json.dumps(version))
          .replace('__FILES__', json.dumps(assets, indent=2))
          .replace('__PILOT_TILES__', json.dumps(pilot_tiles))
)
(root / 'version.json').write_text(json.dumps({'build': version}))
print(version, len(assets), 'static assets precached,', len(pilot_tiles), 'pilot tiles to warm')
