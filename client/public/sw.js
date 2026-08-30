// Service Worker for offline support and caching
//
// v2: the previous version cached every GET response — including the HTML
// shell — under a fixed cache name that never changed across deploys. Vite
// content-hashes JS/CSS filenames on every build, so once a new version
// deployed, a stale cached index.html could still reference a chunk file
// that no longer existed on the server. On a flaky mobile connection (the
// "network first" fetch failing over to that stale cache), the app would
// try to load a 404'd chunk and fail to boot — surfacing as a blank page /
// "not available" error, especially after a refresh. Fixed by never
// caching the navigation request at all, and only cache-first'ing
// content-hashed static assets, which are safe to cache indefinitely
// because their filename changes whenever their content does.
const CACHE_NAME = 'snapvault-v2';
const STATIC_ASSET_PATTERN = /\/assets\//;

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Activate event - clean up every previous cache version
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only ever handle GET requests.
  if (req.method !== 'GET') return;

  // Never intercept API calls — always fresh, and correctness there matters
  // far more than caching.
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests (loading/refreshing a page) and any non-asset
  // request: always go to the network, never serve a cached fallback. A
  // stale HTML shell pointing at deleted chunk files is exactly what broke
  // refreshes after a deploy — better to let a genuine network failure show
  // the browser's own offline error than silently serve something broken.
  const isStaticAsset = STATIC_ASSET_PATTERN.test(url.pathname);
  if (!isStaticAsset) {
    event.respondWith(fetch(req));
    return;
  }

  // Content-hashed static assets (JS/CSS/images under /assets/): safe to
  // cache aggressively since a given filename's content never changes.
  // Cache-first for speed, populate the cache in the background on a miss.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((response) => {
        if (response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache));
        }
        return response;
      });
    })
  );
});
