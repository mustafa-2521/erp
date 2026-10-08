// Service worker: app shell + static assets work offline. Business data lives in IndexedDB (see src/lib/offline).
// Bump VERSION when this file's caching behaviour changes.
const VERSION = 'v1';
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const PRECACHE = ['/offline.html', '/pwa-icon/icon-192.png', '/pwa-icon/icon-512.png'];
const MAX_STATIC_ENTRIES = 200;
const NAV_TIMEOUT_MS = 3500;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(STATIC).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== STATIC && key !== PAGES) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'CLEAR_PAGES') event.waitUntil(caches.delete(PAGES));
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) { cache.put(request, res.clone()); trim(STATIC, MAX_STATIC_ENTRIES); }
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const update = fetch(request).then(res => { if (res.ok) cache.put(request, res.clone()); return res; });
  return hit || update;
}

async function navigate(request) {
  const cache = await caches.open(PAGES);
  const url = new URL(request.url);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NAV_TIMEOUT_MS)),
    ]);
    // Never store redirects (e.g. logged-out -> /login) under the page's own URL.
    if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
    return res;
  } catch {
    return (await cache.match(url.pathname)) || (await cache.match('/')) || (await caches.match('/offline.html'));
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || request.headers.has('RSC') || url.pathname.startsWith('/_next/data')) return;

  if (request.mode === 'navigate') event.respondWith(navigate(request));
  else if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/pwa-icon/')) event.respondWith(cacheFirst(request));
  else event.respondWith(staleWhileRevalidate(request));
});
