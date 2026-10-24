/* Codex DCG — service worker : fonctionnement hors connexion. */
const VERSION = 'codex-dcg-2.0.1';
const SHELL = ['./', 'index.html', 'assets/style.css?v=2.0.0', 'assets/app.js?v=2.0.0', 'manifest.webmanifest',
  'assets/icon.svg', 'assets/icon-192.png', 'assets/apple-touch-icon.png', 'data/base.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

// Réseau d'abord pour le contenu qui change (programme de la semaine, base, page), cache d'abord pour le reste.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const fresh = sameOrigin && (/\/semaines\/|\/data\//.test(url.pathname) || req.mode === 'navigate');
  if (fresh) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
    return;
  }
  const cacheable = sameOrigin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!cacheable) return;
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  })));
});
