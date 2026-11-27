// Minimal Service Worker for PWA installation and offline caching shell
const CACHE_NAME = 'kkk-lodge-v2';
const PRECACHE_URLS = ['/', '/index.html', '/favicon.svg', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. Never intercept cross-origin requests (e.g. backend API on port 8080 or external domains)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 2. Ignore browser extensions, auth endpoints, and all backend API routes
  if (
    url.protocol.startsWith('chrome-extension') ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/auth') ||
    url.pathname.startsWith('/guests') ||
    url.pathname.startsWith('/stays') ||
    url.pathname.startsWith('/reports') ||
    url.pathname.startsWith('/reservations') ||
    url.pathname.startsWith('/rooms') ||
    url.pathname.startsWith('/users') ||
    url.pathname.startsWith('/settings') ||
    url.pathname.startsWith('/invoices') ||
    url.pathname.startsWith('/healthz')
  ) {
    return;
  }

  // 3. Ignore Vite dev server requests and source modules
  if (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src') ||
    url.pathname.startsWith('/node_modules') ||
    url.searchParams.has('t') ||
    url.searchParams.has('import') ||
    url.pathname.endsWith('.jsx') ||
    url.pathname.endsWith('.ts') ||
    url.pathname.endsWith('.tsx') ||
    url.pathname.endsWith('.map')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for navigation and static assets
        if (response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails (offline support)
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
          return new Response('Network error', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});
