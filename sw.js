// Bumped version number to force browsers to update the cache
const CACHE_NAME = 'suppa-budgetor-v2'; 
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

// Install Event: Cache files
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event: Clean up old caches
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
});

// Fetch Event: Serve from cache, fallback to network, fallback to offline.html
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(response => {
            // 1. If the requested file is in the cache, return it immediately
            if (response) {
                return response;
            }
            
            // 2. If it's not in the cache, try fetching it from the internet
            return fetch(event.request).catch(() => {
                
                // 3. If the internet fetch fails AND the user was trying to load a page, show offline.html
                if (event.request.mode === 'navigate') {
                    return caches.match('/offline.html');
                }
            });
        })
    );
});
