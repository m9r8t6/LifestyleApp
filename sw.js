const CACHE_NAME = 'lifeos-v29';
const ASSETS = [
    './',
    './index.html',
    './index.css',
    './js/app.js',
    './js/food.js',
    './js/sport.js',
    './js/bodycare.js',
    './js/gamification.js',
    './js/i18n.js',
    './js/settings.js',
    './manifest.json',
    './icon.svg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(cached => cached || fetch(e.request))
    );
});
