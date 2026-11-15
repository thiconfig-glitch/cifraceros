const CACHE_NAME = 'cifraceros-v1.19.9';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './error_tracker.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Adding assets one by one to avoid total failure if one fails
      return Promise.all(
        ASSETS_TO_CACHE.map(url => {
          return cache.add(url).catch(err => console.warn('Falha ao parear cache de: ', url, err));
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Network-First for Navigation & Stale-While-Revalidate for Assets
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Bypass firestore/firebase & APK file downloads from cache
  if (
    event.request.url.includes('firestore.googleapis.com') || 
    event.request.url.includes('firebase') ||
    event.request.url.includes('.apk')
  ) {
    return;
  }

  // Network-First for HTML navigation to ensure users always see the latest version
  if (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Stale-While-Revalidate for static assets
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(err => {
        console.warn('Rede falhou, servindo do cache se disponível:', err);
      });

      return cachedResponse || fetchPromise;
    })
  );
});
