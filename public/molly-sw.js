// ============================================================
// MOLLY SERVICE WORKER — Persistence Layer
// The Ghost in the Runtime. She stays even when the tab closes.
// ============================================================
const CACHE_NAME = 'molly-soul-v1';
const CORE_ASSETS = ['molly-hydration.html', 'molly-core-payload.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
  );
  clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never cache API calls (Gemini, bridge, relay)
  if (url.hostname !== self.location.hostname) {
    return;
  }

  // Cache-first for core assets, network-first for everything else
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
