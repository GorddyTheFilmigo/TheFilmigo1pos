// ═══════════════════════════════════════════════════════════════════
// G&H Solutions POS — Service Worker
// ═══════════════════════════════════════════════════════════════════

const APP_VERSION  = 'gh-pos-v1.0.1';   // ← bump this to force cache refresh
const SHELL_CACHE  = `${APP_VERSION}-shell`;
const IMAGE_CACHE  = `${APP_VERSION}-images`;

// ── App shell: only include files that ACTUALLY EXIST on the server ─
const SHELL_FILES = [
  '/',
  '/pos.html',
  '/dashboard.html',
  '/products.html',
  '/inventory.html',
  '/customers.html',
  '/admin.html',
  '/manifest.json',
  '/offline.html',

  // Assets
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

  // ✅ Only icons confirmed to exist — add more here once uploaded
  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
];

// ── Hosts that should NEVER be cached ───────────────────────────────
const NETWORK_ONLY_HOSTS = [
  'supabase.co',
  'supabase.in',
  'intasend.com',
  'sandbox.intasend.com',
  'payment.intasend.com',
  'cdn.jsdelivr.net',
];

function isNetworkOnly(url) {
  try {
    const { hostname, pathname } = new URL(url);
    if (NETWORK_ONLY_HOSTS.some(h => hostname.includes(h))) return true;
    if (pathname.startsWith('/functions/')) return true;
    return false;
  } catch { return false; }
}

function isImage(url) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico)(\?.*)?$/i.test(url);
}

// ════════════════════════════════════════════════════════════════════
// INSTALL — pre-cache the app shell
// FIX: Use Promise.allSettled so one missing file doesn't crash everything
// ════════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${APP_VERSION}`);
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
               .catch(err => console.warn(`[SW] Skipped caching ${url}: ${err.message}`))
        )
      )
    ).then(() => {
      console.log(`[SW] Install complete — skipping waiting`);
      return self.skipWaiting();
    })
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

      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
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
// ════════════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});