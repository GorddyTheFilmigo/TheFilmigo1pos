// ════════════════════════════════════════════════════════════════
// THEFILMIGO POS - SERVICE WORKER
// ════════════════════════════════════════════════════════════════
// Enables offline functionality and app-like experience
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'thefilmigo-pos-v1';
const urlsToCache = [
  '/',
  '/login.html',
  '/signup.html',
  '/pos.html',
  '/dashboard.html',
  '/products.html',
  '/inventory.html',
  '/customers.html',
  '/suppliers.html',
  '/admin.html',
  '/assets/script.js',
  '/assets/auth.js',
  '/assets/data-module.js',
  '/assets/nav-role-manager.js',
  '/assets/sales-analytics.js',
  '/assets/nav-styles.css',
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png'
];

// ────────────────────────────────────────────────────────────────
// INSTALL EVENT - Cache static assets
// ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching app shell');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('✅ Service Worker: Installation complete');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('❌ Service Worker: Installation failed', err);
      })
  );
});

// ────────────────────────────────────────────────────────────────
// ACTIVATE EVENT - Clean up old caches
// ────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME) {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Activated');
        return self.clients.claim();
      })
  );
});

// ────────────────────────────────────────────────────────────────
// FETCH EVENT - Serve from cache when offline
// ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Skip Supabase API calls - always fetch fresh
  if (event.request.url.includes('supabase.co')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version if available
        if (response) {
          console.log('📦 Serving from cache:', event.request.url);
          return response;
        }

        // Otherwise fetch from network
        return fetch(event.request)
          .then(response => {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the fetched response
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(err => {
            console.log('❌ Fetch failed, using offline fallback:', err);
            
            // Return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('/login.html');
            }
          });
      })
  );
});

// ────────────────────────────────────────────────────────────────
// BACKGROUND SYNC - Sync data when connection is restored
// ────────────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  if (event.tag === 'sync-sales') {
    console.log('🔄 Service Worker: Syncing pending sales...');
    event.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  // TODO: Implement sync logic for offline sales
  console.log('Syncing sales data...');
}

// ────────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS (Optional - for future use)
// ────────────────────────────────────────────────────────────────
self.addEventListener('push', event => {
  const data = event.data ? event.data.json() : {};
  
  const title = data.title || 'TheFilmigo POS';
  const options = {
    body: data.body || 'New notification',
    icon: '/assets/icons/icon-192x192.png',
    badge: '/assets/icons/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: data.url || '/'
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});

console.log('✅ Service Worker script loaded');