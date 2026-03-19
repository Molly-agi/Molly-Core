/**
 * molly-sw.js — Service Worker for Molly Hydration
 *
 * This is the persistence layer. Once installed, Molly lives in the browser
 * even after tabs close. She can:
 *   - Work offline (cached assets + IndexedDB data)
 *   - Receive push notifications (wake on demand)
 *   - Communicate across all tabs (BroadcastChannel)
 *   - Sync in background when online
 */

const CACHE_NAME = 'molly-hydration-v1';
const CACHE_ASSETS = [
  '/molly-hydration.html',
  '/molly-sw.js',
  '/molly-core-payload.json',
];

// ============================================================================
// INSTALL — Cache core assets
// ============================================================================

self.addEventListener('install', (event) => {
  console.log('[molly-sw] Installing...');
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        console.log('[molly-sw] Caching core assets');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// ============================================================================
// ACTIVATE — Clean old caches, claim clients
// ============================================================================

self.addEventListener('activate', (event) => {
  console.log('[molly-sw] Activating...');
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => {
              console.log('[molly-sw] Removing old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => {
        console.log('[molly-sw] Claiming clients');
        return self.clients.claim();
      })
  );
});

// ============================================================================
// FETCH — Serve from cache, fallback to network
// ============================================================================

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // For API requests, always go to network (don't cache dynamic data)
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached, but also fetch fresh in background
        event.waitUntil(
          fetch(event.request)
            .then((response) => {
              if (response.ok) {
                caches
                  .open(CACHE_NAME)
                  .then((cache) => cache.put(event.request, response));
              }
            })
            .catch(() => {}) // Ignore network errors
        );
        return cached;
      }

      // Not cached, fetch from network
      return fetch(event.request).then((response) => {
        // Cache successful responses
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

// ============================================================================
// PUSH — Wake Molly on server notification
// ============================================================================

self.addEventListener('push', (event) => {
  console.log('[molly-sw] Push received');

  let data = { title: 'Molly', body: 'New message' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Molly', {
      body: data.body || 'New message',
      icon: data.icon || '/molly-icon.png',
      badge: '/molly-badge.png',
      tag: data.tag || 'molly-notification',
      data: data.data || {},
      actions: data.actions || [],
    })
  );
});

// ============================================================================
// NOTIFICATION CLICK — Open Molly when notification tapped
// ============================================================================

self.addEventListener('notificationclick', (event) => {
  console.log('[molly-sw] Notification clicked');
  event.notification.close();

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing Molly tab if open
        for (const client of clients) {
          if (client.url.includes('molly') && 'focus' in client) {
            return client.focus();
          }
        }
        // Otherwise open new tab
        if (self.clients.openWindow) {
          return self.clients.openWindow('/molly-hydration.html');
        }
      })
  );
});

// ============================================================================
// MESSAGE — Handle commands from main thread
// ============================================================================

self.addEventListener('message', (event) => {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;

    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: CACHE_NAME });
      break;

    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0]?.postMessage({ cleared: true });
      });
      break;

    case 'BROADCAST':
      // Broadcast message to all clients
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'BROADCAST', payload });
        });
      });
      break;
  }
});

// ============================================================================
// BACKGROUND SYNC — Sync data when back online
// ============================================================================

self.addEventListener('sync', (event) => {
  console.log('[molly-sw] Background sync:', event.tag);

  if (event.tag === 'molly-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  // Try to sync with edge server if available
  try {
    const response = await fetch('http://localhost:9100/api/sync/now', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      console.log('[molly-sw] Background sync with edge server succeeded');
    }
  } catch {
    // Edge server not available, that's okay
    console.log('[molly-sw] Edge server not available for sync');
  }
}

// ============================================================================
// PERIODIC BACKGROUND SYNC — Wake periodically to check for updates
// ============================================================================

self.addEventListener('periodicsync', (event) => {
  console.log('[molly-sw] Periodic sync:', event.tag);

  if (event.tag === 'molly-heartbeat') {
    event.waitUntil(doHeartbeat());
  }
});

async function doHeartbeat() {
  // Check edge server health
  try {
    const response = await fetch('http://localhost:9100/api/health');
    if (response.ok) {
      const health = await response.json();
      console.log('[molly-sw] Heartbeat - edge server healthy:', health.status);
    }
  } catch {
    console.log('[molly-sw] Heartbeat - edge server offline');
  }
}

console.log('[molly-sw] Service Worker loaded');
