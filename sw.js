/**
 * Keeps the app's files on the device so it opens instantly, even on a weak
 * connection. Data never goes through here (API calls are POSTs).
 *
 * Bump VERSION on every release (together with ?v= in index.html); the old
 * cache is then dropped and open tabs are told a new version is ready.
 */
const VERSION = '7';
const CACHE = 'mfw-app-v' + VERSION;
const CDN_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(self.registration.scope)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    const old = names.filter(n => n.startsWith('mfw-app-') && n !== CACHE);
    await Promise.all(old.map(n => caches.delete(n)));
    await self.clients.claim();
    if (old.length) notify();
  })());
});

async function notify() {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.postMessage({ type: 'app-updated' }));
}

/** The page itself: answer from cache at once, refresh the cache in the background. */
async function page(event) {
  const cache = await caches.open(CACHE);
  const key = self.registration.scope;
  const cached = await cache.match(key);
  const network = fetch(event.request).then(async res => {
    if (res.ok) {
      const before = cached ? await cached.clone().text() : null;
      const after = await res.clone().text();
      await cache.put(key, res.clone());
      if (before !== null && before !== after) notify();
    }
    return res;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(network);
    return cached;
  }
  return (await network) || new Response('Offline — open the app again when connected.', { status: 503 });
}

/** Versioned files and CDN libraries never change at the same URL: cache first. */
async function asset(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) {
    event.respondWith(page(event));
    return;
  }
  const sameOrigin = url.origin === location.origin;
  if ((sameOrigin && !url.pathname.endsWith('/sw.js') && !url.pathname.startsWith('/__')) || CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(asset(req));
  }
});
