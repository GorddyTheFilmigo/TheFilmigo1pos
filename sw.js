// ═══════════════════════════════════════════════════════════════════
// G&H Solutions POS — Service Worker
// v1.0.2 — Network-first for HTML/JS so Vercel deploys take effect immediately
// ═══════════════════════════════════════════════════════════════════

const APP_VERSION = 'gh-pos-v1.0.2';  // ← bumped to bust old stale cache
const SHELL_CACHE = `${APP_VERSION}-shell`;
const IMAGE_CACHE = `${APP_VERSION}-images`;

// ── App shell files to pre-cache ────────────────────────────────────
const SHELL_FILES = [
  '/',
  '/pos.html',
  '/dashboard.html',
  '/products.html',
  '/inventory.html',
  '/customers.html',
  '/admin.html',
  '/suppliers.html',
  '/supply-requests.html',
  '/manifest.json',
  '/offline.html',

  '/assets/script.js',
  '/assets/auth.js',
  '/assets/nav-styles.css',
  '/assets/offline-styles.css',
  '/assets/data-module.js',
  '/assets/messaging-module.js',
  '/assets/subscription-module.js',
  '/assets/page-access-guard.js',
  '/assets/nav-visibility-controller.js',
  '/assets/sales-analytics.js',
  '/assets/supplier-orders-module.js',


  '/assets/icons/icon-192x192.png',
  '/assets/icons/icon-512x512.png',
];

// ── Never cache these hosts ──────────────────────────────────────────
const NETWORK_ONLY_HOSTS = [
  'supabase.co',
  'supabase.in',
  'intasend.com',
  'sandbox.intasend.com',
  'payment.intasend.com',
  'cdn.jsdelivr.net',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

// ── Network-first files — always fetch fresh from server ─────────────
// HTML and JS must be network-first so Vercel deployments take effect
// immediately. The old cache-first strategy was serving stale auth.js
// after deploys — that was the root cause of the reload loop on Vercel.
function isNetworkFirst(url) {
  try {
    const { pathname } = new URL(url);
    return (
      pathname.endsWith('.html') ||
      pathname.endsWith('.js')   ||
      pathname === '/'
    );
  } catch { return false; }
}

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
// INSTALL — pre-cache app shell
// ════════════════════════════════════════════════════════════════════
self.addEventListener('install', event => {
  console.log(`[SW] Installing ${APP_VERSION}`);
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      Promise.allSettled(
        SHELL_FILES.map(url =>
          cache.add(new Request(url, { cache: 'reload' }))
               .catch(err => console.warn(`[SW] Skipped: ${url} — ${err.message}`))
        )
      )
    ).then(() => {
      console.log(`[SW] Install complete`);
      return self.skipWaiting();
    })
  );
});

// ════════════════════════════════════════════════════════════════════
// ACTIVATE — delete ALL old caches
// ════════════════════════════════════════════════════════════════════
self.addEventListener('activate', event => {
  console.log(`[SW] Activating ${APP_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== IMAGE_CACHE)
          .map(k => {
            console.log('[SW] Deleting old cache:', k);
            return caches.delete(k);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ════════════════════════════════════════════════════════════════════
// FETCH — smart routing by file type
// ════════════════════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;
  if (request.url.startsWith('chrome-extension://')) return;

  // ── 1. Network only (Supabase, payments, CDNs, fonts) ────────────
  if (isNetworkOnly(request.url)) {
    event.respondWith(fetch(request));
    return;
  }

  // ── 2. HTML + JS = Network-first ─────────────────────────────────
  // Always try the network first so fresh Vercel deployments are used.
  // If offline, fall back to cache.
  if (isNetworkFirst(request.url)) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(SHELL_CACHE).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          if (request.url.endsWith('.html') || new URL(request.url).pathname === '/') {
            return caches.match('/offline.html') || offlineFallback();
          }
          return new Response('', { status: 503 });
        })
    );
    return;
  }

  // ── 3. Images = Cache-first ───────────────────────────────────────
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

  // ── 4. Everything else (CSS etc) = Cache-first, network fallback ──
  event.respondWith(
    caches.match(request).then(async cached => {
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      } catch {
        return offlineFallback();
      }
    })
  );
});

function offlineFallback() {
  return new Response(
    '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Offline</title></head>' +
    '<body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;">' +
    '<div><div style="font-size:4rem;">📵</div><h2>You\'re offline</h2>' +
    '<p style="color:#8b949e;">G&H Solutions POS needs a connection to load.<br>Please check your internet and try again.</p>' +
    '<button onclick="location.reload()" style="margin-top:20px;padding:12px 28px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-size:1rem;font-weight:700;cursor:pointer;">Retry</button>' +
    '</div></body></html>',
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  );
}

// ════════════════════════════════════════════════════════════════════
// MESSAGE — manual cache control from pages
// ════════════════════════════════════════════════════════════════════
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});