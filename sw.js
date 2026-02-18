// ═══════════════════════════════════════════════════════════
// G&H Solutions — Service Worker
// ═══════════════════════════════════════════════════════════

const CACHE_NAME = 'gh-solutions-v1';
const STATIC_ASSETS = [
    '/',
    '/dashboard.html',
    '/pos.html',
    '/suppliers.html',
    '/supply-requests.html',
    '/products.html',
    '/inventory.html',
    '/customers.html',
    '/admin.html',
    '/assets/script.js',
    '/assets/auth.js',
    '/assets/nav-styles.css',
    '/assets/offline-styles.css',
    '/manifest.json'
];

// ── Install: cache static assets ──
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[SW] Caching static assets');
            // Use individual adds so one failure doesn't break everything
            return Promise.allSettled(
                STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
            );
        }).then(() => self.skipWaiting())
    );
});

// ── Activate: clean old caches ──
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── Fetch: network-first, fallback to cache ──
self.addEventListener('fetch', (event) => {
    // Skip non-GET and Supabase API requests (always need live data)
    if (event.request.method !== 'GET') return;
    if (event.request.url.includes('supabase.co')) return;
    if (event.request.url.includes('googleapis.com')) return;

    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Cache successful responses
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => {
                // Network failed — try cache
                return caches.match(event.request).then(cached => {
                    if (cached) return cached;
                    // Return offline page for navigation requests
                    if (event.request.mode === 'navigate') {
                        return caches.match('/dashboard.html');
                    }
                });
            })
    );
});