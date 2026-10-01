// LifeOS service worker: the app shell loads from the network when it is
// reachable (so updates arrive immediately) and from the cache when offline.
// API calls are never cached; the sync layer in js/store.js handles offline data.

const CACHE_NAME = 'lifeos-shell-v47';
const SHELL = [
    './',
    './index.html',
    './index.css',
    './manifest.json',
    './icon.svg',
    './icon-192.png',
    './fonts/dm-sans.woff2',
    './fonts/fraunces.woff2',
    './vendor/chart.umd.min.js',
    './js/store.js',
    './js/auth.js',
    './js/i18n.js',
    './js/food.js',
    './js/sport.js',
    './js/bodycare.js',
    './js/calendar.js',
    './js/google.js',
    './js/chat.js',
    './js/todo.js',
    './js/mail.js',
    './js/gamification.js',
    './js/dashboard.js',
    './js/settings.js',
    './js/app.js',
];
const NETWORK_TIMEOUT_MS = 2500;

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL))
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
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

    e.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(e.request, { ignoreSearch: true });

        const fromNetwork = fetch(e.request).then(response => {
            if (response.ok) cache.put(e.request, response.clone());
            return response;
        });

        if (!cached) return fromNetwork;
        // Slow or no connection: answer from the cache, keep updating it in the background.
        const timeout = new Promise(resolve => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
        return Promise.race([fromNetwork.catch(() => cached), timeout]);
    })());
});

// ── Notifications sent by the server ─────────────────────

self.addEventListener('push', (e) => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch (err) {}
    e.waitUntil(self.registration.showNotification(data.title || 'LifeOS', {
        body: data.body || '',
        tag: data.tag,
        icon: './icon-192.png',
        badge: './icon-192.png',
        data: { url: data.url || './' },
    }));
});

// Tapping a notification brings the app to the front on the matching screen
self.addEventListener('notificationclick', (e) => {
    e.notification.close();
    const url = new URL((e.notification.data && e.notification.data.url) || './', self.location.origin).href;
    e.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (new URL(client.url).origin === self.location.origin) {
                await client.focus();
                client.postMessage({ type: 'open', url });
                return;
            }
        }
        await self.clients.openWindow(url);
    })());
});
