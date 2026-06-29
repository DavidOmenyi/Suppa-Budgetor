// Bumped version number to force browsers to update the cache
const CACHE_NAME = 'suppa-budgetor-v3'; 
const ASSETS_TO_CACHE = [
    '/',
    '/index.html',
    '/app.source.js',
    '/manifest.json',
    '/offline.html', /* ADDED OFFLINE PAGE HERE */
    '/app-icon.png',
    '/desktop-screenshot-1.png',
    '/desktop-screenshot-2.png',
    '/mobile-screenshot-1.jpg',
    '/mobile-screenshot-2.jpg'
];

// Install: Cache files and force immediate takeover
self.addEventListener('install', event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
    );
});

// Activate: Delete old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.map(key => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        ))
    );
    self.clients.claim();
});

// Fetch: NETWORK-FIRST, fallback to cache, fallback to offline.html
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        fetch(event.request).catch(async () => {
            // 1. If internet fails, check if the exact file is in the cache
            const cachedResponse = await caches.match(event.request);
            if (cachedResponse) {
                return cachedResponse;
            }
            
            // 2. If it is NOT in the cache, and the user is trying to navigate to a webpage, show the offline page
            if (event.request.mode === 'navigate') {
                return caches.match('/offline.html');
            }
        })
    );
});
