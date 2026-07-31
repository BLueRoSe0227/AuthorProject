const CACHE_NAME = 'storyweaver-shell-v4';
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-512-maskable.png',
  './assets/fonts/nanum-pen-script-400.woff2',
  './assets/fonts/gaegu-400.woff2',
  './assets/fonts/dongle-400.woff2',
  './assets/fonts/nanum-brush-script-400.woff2',
  './js/utils.js',
  './js/prefs.js',
  './js/theme.js',
  './js/db.js',
  './js/models.js',
  './js/ui.js',
  './js/search.js',
  './js/graph.js',
  './js/richEditor.js',
  './js/memoCanvas.js',
  './js/timer.js',
  './js/onboarding.js',
  './js/zipWriter.js',
  './js/docxWriter.js',
  './js/manuscriptExport.js',
  './js/views/home.js',
  './js/views/dashboard.js',
  './js/views/manuscript.js',
  './js/views/characters.js',
  './js/views/settingNotes.js',
  './js/views/inbox.js',
  './js/views/goals.js',
  './js/views/searchView.js',
  './js/views/settingsPanel.js',
  './js/router.js',
  './js/app.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
