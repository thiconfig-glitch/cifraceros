const CACHE_NAME = 'cifraceros-v1.19.21';
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

// Network-First para garantir que novidades e correções de layout cheguem de imediato
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) {
    return;
  }

  // Ignora chamadas ao Firestore, Firebase e downloads de arquivos .apk
  if (
    event.request.url.includes('firestore.googleapis.com') || 
    event.request.url.includes('firebase') ||
    event.request.url.includes('.apk')
  ) {
    return;
  }

  // Network-First para HTML, CSS e JS (com fallback para cache offline)
  const isCodeAsset = event.request.mode === 'navigate' || 
                      event.request.headers.get('accept')?.includes('text/html') ||
                      event.request.url.includes('.css') || 
                      event.request.url.includes('.js');

  if (isCodeAsset) {
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

  // Stale-While-Revalidate para demais recursos estáticos (ícones, fontes, etc.)
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
