// ════════════════════════════════════════════════════════════════
// THEFILMIGO POS - ENHANCED SERVICE WORKER WITH OFFLINE QUEUE
// ════════════════════════════════════════════════════════════════
// Enables offline functionality and app-like experience
// Now with: IndexedDB queue, auto-sync, offline transaction handling
// ════════════════════════════════════════════════════════════════

const CACHE_NAME = 'thefilmigo-pos-v2'; // Incremented version
const OFFLINE_QUEUE_DB = 'offline-queue-db';
const QUEUE_STORE = 'pending-transactions';

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
  '/assets/offline-manager.js', // NEW
  '/assets/nav-role-manager.js',
  '/assets/sales-analytics.js',
  '/assets/nav-styles.css',
  '/assets/offline-styles.css', // NEW
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png'
];

// ────────────────────────────────────────────────────────────────
// INSTALL EVENT - Cache static assets
// ────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing v2 with offline queue...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Service Worker: Caching app shell');
        return cache.addAll(urlsToCache).catch(err => {
          console.error('Some files failed to cache:', err);
          // Don't fail installation if some files are missing
          return Promise.resolve();
        });
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
  console.log('🚀 Service Worker: Activating v2...');
  
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
// FETCH EVENT - Enhanced with offline queue support
// ────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests except Supabase
  if (!request.url.startsWith(self.location.origin) && !url.hostname.includes('supabase.co')) {
    return;
  }

  // Handle Supabase API requests
  if (url.hostname.includes('supabase.co')) {
    // POST/PUT/DELETE requests (writes) - queue when offline
    if (request.method !== 'GET') {
      event.respondWith(
        fetch(request.clone())
          .then(response => {
            // Online - request succeeded
            console.log('✅ API request succeeded:', request.url);
            return response;
          })
          .catch(async error => {
            // Offline - queue the request
            console.log('📝 Queueing offline API request:', request.url);
            await queueRequest(request.clone());
            
            // Return a custom response indicating the request was queued
            return new Response(
              JSON.stringify({
                success: true,
                queued: true,
                offline: true,
                message: 'Request queued for sync when online'
              }),
              {
                status: 202, // Accepted
                headers: { 'Content-Type': 'application/json' }
              }
            );
          })
      );
      return;
    }
    
    // GET requests - try network first, fall back to cache
    event.respondWith(
      fetch(request)
        .then(response => {
          // Clone and cache successful responses
          if (response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Network failed, try cache
          console.log('📦 Network failed, trying cache for:', request.url);
          return caches.match(request).then(cachedResponse => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // No cache available
            return new Response(
              JSON.stringify({ success: false, error: 'Offline and no cached data' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // Static assets - cache first strategy
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          console.log('📦 Serving from cache:', request.url);
          return response;
        }

        return fetch(request)
          .then(response => {
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });

            return response;
          })
          .catch(err => {
            console.log('❌ Fetch failed:', err);
            
            // Return offline page for navigation requests
            if (request.mode === 'navigate') {
              return caches.match('/login.html');
            }
            
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// ────────────────────────────────────────────────────────────────
// INDEXEDDB QUEUE MANAGEMENT
// ────────────────────────────────────────────────────────────────

// Open IndexedDB for queue storage
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_QUEUE_DB, 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        const store = db.createObjectStore(QUEUE_STORE, { autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        console.log('📦 Created IndexedDB store for offline queue');
      }
    };
  });
}

// Queue a failed request for later sync
async function queueRequest(request) {
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    
    const requestData = {
      url: request.url,
      method: request.method,
      headers: [...request.headers.entries()],
      body: await request.clone().text(),
      timestamp: Date.now()
    };
    
    await new Promise((resolve, reject) => {
      const addRequest = store.add(requestData);
      addRequest.onsuccess = () => resolve();
      addRequest.onerror = () => reject(addRequest.error);
    });
    
    console.log('✅ Request queued:', request.url);
    
    // Notify clients about queued transaction
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'TRANSACTION_QUEUED',
        count: 1
      });
    });
  } catch (error) {
    console.error('❌ Failed to queue request:', error);
  }
}

// ────────────────────────────────────────────────────────────────
// BACKGROUND SYNC - Enhanced with IndexedDB queue
// ────────────────────────────────────────────────────────────────
self.addEventListener('sync', event => {
  console.log('🔄 Background Sync triggered:', event.tag);
  
  if (event.tag === 'sync-offline-queue' || event.tag === 'sync-sales') {
    event.waitUntil(syncQueuedRequests());
  }
});

// Sync all queued requests
async function syncQueuedRequests() {
  console.log('🔄 Starting sync of queued requests...');
  
  try {
    const db = await openDB();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    
    const allRequests = await new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const allKeys = await new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    if (allRequests.length === 0) {
      console.log('✅ No queued requests to sync');
      return;
    }
    
    console.log(`📤 Syncing ${allRequests.length} queued requests...`);
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < allRequests.length; i++) {
      const requestData = allRequests[i];
      const key = allKeys[i];
      
      try {
        // Reconstruct the request
        const headers = new Headers(requestData.headers);
        const response = await fetch(requestData.url, {
          method: requestData.method,
          headers: headers,
          body: requestData.body
        });
        
        if (response.ok) {
          // Success - remove from queue
          const deleteTx = db.transaction(QUEUE_STORE, 'readwrite');
          const deleteStore = deleteTx.objectStore(QUEUE_STORE);
          await new Promise((resolve, reject) => {
            const deleteRequest = deleteStore.delete(key);
            deleteRequest.onsuccess = () => resolve();
            deleteRequest.onerror = () => reject(deleteRequest.error);
          });
          
          successCount++;
          console.log('✅ Synced request:', requestData.url);
        } else {
          failCount++;
          console.error('❌ Failed to sync request:', requestData.url, response.status);
        }
      } catch (error) {
        failCount++;
        console.error('❌ Error syncing request:', requestData.url, error);
      }
    }
    
    // Notify clients about sync results
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        success: successCount,
        failed: failCount,
        total: allRequests.length
      });
    });
    
    console.log(`🔄 Sync complete: ${successCount} success, ${failCount} failed`);
  } catch (error) {
    console.error('❌ Sync failed:', error);
  }
}

// ────────────────────────────────────────────────────────────────
// PERIODIC SYNC - Check connection and sync
// ────────────────────────────────────────────────────────────────
self.addEventListener('periodicsync', event => {
  console.log('⏰ Periodic sync triggered:', event.tag);
  
  if (event.tag === 'check-sync-queue') {
    event.waitUntil(syncQueuedRequests());
  }
});

// ────────────────────────────────────────────────────────────────
// MESSAGE HANDLER - Listen for commands from clients
// ────────────────────────────────────────────────────────────────
self.addEventListener('message', event => {
  console.log('📨 Message received:', event.data);
  
  if (event.data && event.data.type === 'SYNC_NOW') {
    event.waitUntil(syncQueuedRequests());
  }
  
  if (event.data && event.data.type === 'GET_QUEUE_COUNT') {
    event.waitUntil(
      openDB().then(db => {
        const tx = db.transaction(QUEUE_STORE, 'readonly');
        const store = tx.objectStore(QUEUE_STORE);
        return new Promise((resolve, reject) => {
          const request = store.count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }).then(count => {
        event.source.postMessage({
          type: 'QUEUE_COUNT',
          count: count
        });
      }).catch(error => {
        console.error('Failed to get queue count:', error);
      })
    );
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        console.log('🗑️ Cache cleared');
        event.source.postMessage({ type: 'CACHE_CLEARED' });
      })
    );
  }
});

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
    data: data.url || '/',
    tag: 'thefilmigo-notification'
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

// ────────────────────────────────────────────────────────────────
// AUTO-SYNC ON NETWORK RESTORATION
// ────────────────────────────────────────────────────────────────
// Listen for network status changes
self.addEventListener('online', () => {
  console.log('🌐 Network restored - triggering sync');
  syncQueuedRequests();
});

console.log('✅ Enhanced Service Worker v2 loaded with offline queue support');