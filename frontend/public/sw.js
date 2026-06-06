const CACHE_NAME = 'biodiversity-pwa-v10';
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
  '/icons/icon-192.png',
  '/icons/icon-512.png',
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

  if (url.href.includes('tile.openstreetmap.org') || url.href.includes('/geoserver/')) {
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
