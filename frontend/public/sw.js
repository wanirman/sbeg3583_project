const CACHE_NAME = 'biodiversity-pwa-v21';
const TILE_CACHE = 'map-tiles-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/css/app.css',
  '/js/app.js',
  '/js/db.js',
  '/js/api.js',
  '/js/map.js',
  '/js/report.js',
  '/js/chat.js',
  '/js/gamification.js',
  '/manifest.json',
  '/img/doodles.svg',
  '/img/doodles-light.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  // Leaflet (vendored locally so the map works fully offline)
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/images/layers.png',
  '/vendor/leaflet/images/layers-2x.png',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== TILE_CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // App-shell for page navigations so a logged-in user boots straight into the
  // app offline. The admin page is a SEPARATE document — never replace it with
  // the app shell.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const exact = await caches.match(request);     // e.g. a cached /admin.html
      if (exact) return exact;
      if (url.pathname.startsWith('/admin')) {        // admin is its own document
        try { return await fetch(request); } catch { return caches.match(OFFLINE_URL); }
      }
      const shell = await caches.match('/index.html');
      return shell || fetch(request).catch(() => caches.match(OFFLINE_URL));
    })());
    return;
  }

  if (url.href.includes('tile.openstreetmap.org') || url.href.includes('/geoserver/') ||
      url.href.includes('server.arcgisonline.com') || url.href.includes('tile.opentopomap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return cached || new Response('', { status: 503 });
        }
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).catch(() =>
        request.mode === 'navigate' ? caches.match(OFFLINE_URL) : new Response('', { status: 503 })
      );
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sightings') {
    event.waitUntil(syncPendingSightings());
  }
  if (event.tag === 'sync-chat') {
    event.waitUntil(syncPendingChat());
  }
});

async function syncPendingSightings() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_SIGHTINGS' }));
}

async function syncPendingChat() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_CHAT' }));
}
