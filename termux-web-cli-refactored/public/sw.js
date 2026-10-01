const CACHE_NAME = 'termux-cli-v2-cache-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/theme.css',
  './js/main.js',
  './js/state.js',
  './js/ansi.js',
  './js/ws.js',
  './js/xterm-manager.js',
  './js/options-panel.js',
  './js/dir-tree.js',
  './js/modals.js',
  './js/tabs.js',
  './js/quick-bar.js',
  './js/terminal-renderer.js',
  './xterm.css',
  './xterm.js',
  './xterm-addon-fit.js',
  './folder_1250635.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.startsWith('ws:') || event.request.url.startsWith('wss:')) {
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
