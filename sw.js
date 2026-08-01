const CACHE_NAME = 'storyweaver-shell-v5';
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
  './js/proofreaderRules.js',
  './js/proofreader.js',
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
  './js/views/research.js',
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

// Network-first, cache as offline fallback. The previous strategy (serve cache
// immediately, refresh cache in the background) meant that once a file was
// cached, every subsequent load kept serving that exact version forever — a
// code change only reached an already-visited browser after two full reloads
// (one to refetch-and-recache, a second to finally read the new cache entry),
// and in between, cross-file version skew (e.g. an old cached index.html next
// to a newer cached js/foo.js, or vice versa) could produce all sorts of
// broken states that don't reproduce from a clean checkout. Network-first
// means an online user always gets current code; the cache only kicks in once
// the network request actually fails (offline).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
