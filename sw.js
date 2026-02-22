// ═══════════════════════════════════════════════════════════════════
// G&H Solutions POS — Service Worker
// File: sw.js  (place in your project ROOT, next to pos.html)
//
// Strategy:
//   • App shell (HTML, CSS, JS assets) → Cache-first, network-fallback
//   • Supabase / API calls           → Network-first, no cache
//   • Images / icons                 → Cache-first, long TTL
//   • Offline fallback page          → Always cached
// ═══════════════════════════════════════════════════════════════════

const APP_VERSION  = 'gh-pos-v1.0.0';   // ← bump this to force cache refresh
const SHELL_CACHE  = `${APP_VERSION}-shell`;
const IMAGE_CACHE  = `${APP_VERSION}-images`;

// ── App shell: everything that makes the app work offline ───────────
const SHELL_FILES = [
  '/',
  '/pos.html',
  '/dashboard.html',
  '/products.html',
  '/inventory.html',
  '/customers.html',
  '/admin.html',
  '/manifest.json',

  // Your local assets (adjust paths if different)
  '/assets/script.js',
  '/assets/auth.js',
  '/assets/nav-styles.css',
  '/assets/offline-styles.css',
  '/assets/data-module.js',
  '/assets/messaging-module.js',
  '/assets/subscription-module.js',
  '/assets/page-access-guard.js',
  '/assets/nav-visibility-controller.js',
  '/assets/nav-role-manager.js',
  '/assets/sales-analytics.js',
  '/assets/supplier-orders-module.js',

  // Icons
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',

  // Offline fallback
  '/offline.html',
];

// ── Hosts that should NEVER be cached (always go to network) ────────
const NETWORK_ONLY_HOSTS = [
  'supabase.co',
  'supabase.in',
  'intasend.com',
  'sandbox.intasend.com',
  'payment.intasend.com',
  'cdn.jsdelivr.net',       // supabase-js CDN — always latest
];

function isNetworkOnly(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (NETWORK_ONLY_HOSTS.some(h => hostname.includes(h))) return true;
    if (pathname.startsWith('/functions/')) return true; // Edge functions
    return false;
  } catch { return false; }
}

function isImage(url) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/i.test(url);
}

// ════════════════════════════════════════════════════════════════════
// INSTALL — pre-cache the app shell
// ════════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${APP_VERSION}`);
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      // Use {cache: 'reload'} so we always fetch fresh on install
      Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
               .catch(err => console.warn(`[SW] Could not cache ${url}:`, err.message))
        )
      )
    ).then(() => self.skipWaiting()) // activate immediately
  );
});

// ════════════════════════════════════════════════════════════════════
// ACTIVATE — delete old caches
// ════════════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log(`[SW] Activating ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== IMAGE_CACHE)
          .map(k  => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// ════════════════════════════════════════════════════════════════════
// FETCH — route requests by strategy
// ════════════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET and chrome-extension requests
  if (request.method !== 'GET') return;
  if (request.url.startsWith('chrome-extension://')) return;

  // ── Network only (Supabase, IntaSend, CDNs) ──────────────────────
  if (isNetworkOnly(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  // ── Images: cache-first, store in image cache ─────────────────────
  if (isImage(request.url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async cache => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) cache.put(request, response.clone());
          return response;
        } catch {
          return new Response('', { status: 404 });
        }
      })
    );
    return;
  }

  // ── App shell: cache-first, network-fallback, offline page ────────
  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) {
        // Revalidate in background (stale-while-revalidate)
        fetch(request).then(response => {
          if (response.ok) {
            caches.open(SHELL_CACHE).then(c => c.put(request, response));
          }
        }).catch(() => {});
        return cached;
      }

      // Not in cache — try network
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        // Offline and not cached
        const offlinePage = await caches.match('/offline.html');
        if (offlinePage) return offlinePage;
        return new Response(
          '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline</title></head>' +
          '<body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">' +
          '<div><div style="font-size:4rem;">📵</div><h2>You\'re offline</h2>' +
          '<p style="color:#8b949e;">G&H Solutions POS needs a connection to load this page.<br>Please check your internet and try again.</p>' +
          '<button onclick="location.reload()" style="margin-top:20px;padding:12px 28px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;">Retry</button>' +
          '</div></body></html>',
          { status: 200, headers: { 'Content-Type': 'text/html' } }
        );
      }
    })
  );
});

// ════════════════════════════════════════════════════════════════════
// MESSAGE — allow pages to trigger cache refresh
// Send: { type: 'SKIP_WAITING' }  to activate a waiting SW immediately
// Send: { type: 'CLEAR_CACHE' }   to wipe all caches (useful for dev)
// ════════════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});