const VERSION = 'pwa-v1.4.0';
const PRECACHE = `precache-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/?source=pwa',
  '/css/tokens.css',
  '/css/base.css',
  '/css/components.css',
  '/js/app.js',
  '/js/vendor/jquery-3.6.0.min.js',
  '/manifest.json',
  '/icons/app-icon-72.png',
  '/icons/app-icon-96.png',
  '/icons/app-icon-128.png',
  '/icons/app-icon-144.png',
  '/icons/app-icon-152.png',
  '/icons/app-icon-192.png',
  '/icons/app-icon-256.png',
  '/icons/app-icon-384.png',
  '/icons/app-icon-512.png',
  '/icons/app-icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function stashRuntimeResponse(request, response) {
  if (!response || response.status !== 200 || response.type !== 'basic') {
    return response;
  }
  const responseClone = response.clone();
  caches.open(RUNTIME).then((cache) => cache.put(request, responseClone));
  return response;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request);
    return stashRuntimeResponse(request, response);
  } catch (error) {
    const cache = await caches.match(request);
    if (cache) {
      return cache;
    }
    if (fallbackUrl) {
      const fallbackResponse = await caches.match(fallbackUrl);
      if (fallbackResponse) {
        return fallbackResponse;
      }
    }
    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached || networkFetch;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/'));
    return;
  }

  if (url.pathname === '/select') {
    event.respondWith(networkFirst(request));
    return;
  }

  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/icons/')
  ) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  if (PRECACHE_URLS.includes(url.pathname) || PRECACHE_URLS.includes(url.pathname + url.search)) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => stashRuntimeResponse(request, response))
      .catch(() => caches.match(request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const vpsId = event.notification.data?.vpsId;
  const urlToOpen = vpsId ? `/?vps=${vpsId}` : '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then(() => {
              if ('navigate' in client) {
                return client.navigate(urlToOpen);
              }
            });
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

self.addEventListener('notificationclose', (event) => {
  console.log('[service-worker] Notification closed:', event.notification.tag);
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    if (title && self.registration && self.registration.showNotification) {
      event.waitUntil(
        self.registration.showNotification(title, options)
      );
    }
  }
});
