// molly-sw.js — Service Worker for Molly Hydration
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Optionally intercept requests for offline support or hydration logic
  // For now, just pass through
});
