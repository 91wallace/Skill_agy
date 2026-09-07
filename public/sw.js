// public/sw.js
const CACHE_NAME = 'termux-web-cli-v24';
const ASSETS = [
    './',
    './index.html',
    './styles.css',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network-first para carregar sempre a versão mais recente dos scripts/estilos
    if (event.request.url.startsWith('http')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
    }
});

