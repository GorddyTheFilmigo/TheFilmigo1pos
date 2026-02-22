// ═══════════════════════════════════════════════════════════════════
// G&H Solutions POS — PWA Registration (Combined & Fixed Version)
// File: assets/pwa-register.js
//
// This single file now includes:
// • Protocol check for local development (file://)
// • Service worker registration
// • Install prompt banner (Android/Chrome/Edge)
// • iOS manual install instructions
// • Update detection + toast + skipWaiting
// • Prevents infinite reload loop with { once: true }
// • Standalone mode detection
// ═══════════════════════════════════════════════════════════════════
(function () {
    'use strict';

    // ── Skip on local file:// protocol (prevents errors during dev)
    if (window.location.protocol === 'file:') {
        console.log('⚠️ PWA: Service Worker not supported on file:// protocol');
        console.log('💡 To enable offline mode, run on a web server (http:// or https://)');
        console.log('📌 Tip: Use VS Code Live Server extension for local development');
        return;
    }

    // ── Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.log('[PWA] Service workers not supported in this browser');
        return;
    }

    let _swRegistration = null;
    let _installPrompt = null; // saved beforeinstallprompt event

    // ── 1. REGISTER SERVICE WORKER ──────────────────────────────────
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(reg => {
            _swRegistration = reg;
            console.log('[PWA] Service worker registered, scope:', reg.scope);

            // ── Update detection ──
            reg.addEventListener('updatefound', () => {
                const newWorker = reg.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // A new version is waiting — show non-intrusive toast
                        showUpdateToast();
                    }
                });
            });
        })
        .catch(err => {
            console.warn('[PWA] Service worker registration failed:', err);
            console.log('💡 This is normal if not running on a web server (https://)');
        });

    // When the SW controller changes (after skipWaiting), reload — but only once
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
    }, { once: true });  // ← Prevents infinite reload loop

    // ── 2. CAPTURE INSTALL PROMPT (Android/Chrome/Edge) ──────────────
    window.addEventListener('beforeinstallprompt', e => {
        e.preventDefault(); // stop the default mini-infobar
        _installPrompt = e;
        console.log('[PWA] Install prompt captured');
        showInstallBanner();
    });

    // ── 3. DETECT WHEN APP IS INSTALLED ─────────────────────────────
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed!');
        _installPrompt = null;
        removeInstallBanner();
        removeIosBanner();
    });

    // If already running as standalone PWA, skip banners
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
        console.log('[PWA] Running in standalone mode');
        return;
    }

    // ── 4. iOS SAFARI: manual instructions banner ───────────────────
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari && !localStorage.getItem('gh_ios_banner_dismissed')) {
        setTimeout(showIosBanner, 2500);
    }

    // ════════════════════════════════════════════════════════════════
    // INSTALL BANNER (Android / Chrome / Edge)
    // ════════════════════════════════════════════════════════════════
    function showInstallBanner() {
        if (document.getElementById('gh-install-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'gh-install-banner';
        Object.assign(banner.style, {
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '99999',
            background: '#161b22',
            border: '1px solid #f59e0b',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            maxWidth: '420px',
            width: 'calc(100% - 40px)',
            fontFamily: 'Archivo, sans-serif',
            animation: 'ghSlideUp 0.4s ease',
        });

        banner.innerHTML = `
            <style>
                @keyframes ghSlideUp { from { opacity:0; transform:translateX(-50%) translateY(20px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
                #gh-install-banner button { font-family: inherit; cursor: pointer; border: none; font-weight: 700; font-size: 0.88rem; padding: 9px 16px; border-radius: 8px; transition: all 0.15s; }
                #gh-install-banner .gh-ib-install { background: #f59e0b; color: #000; }
                #gh-install-banner .gh-ib-install:hover { background: #d97706; }
                #gh-install-banner .gh-ib-dismiss { background: transparent; color: #8b949e; border: 1px solid #21262d !important; }
                #gh-install-banner .gh-ib-dismiss:hover { color: #e6edf3; }
            </style>
            <div style="font-size:2rem;flex-shrink:0;">📲</div>
            <div style="flex:1;">
                <div style="font-weight:700;color:#e6edf3;margin-bottom:3px;font-size:0.95rem;">Install G&H Solutions POS</div>
                <div style="color:#8b949e;font-size:0.8rem;">Add to home screen for faster access — works offline too</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
                <button class="gh-ib-install" id="gh-ib-install-btn">Install</button>
                <button class="gh-ib-dismiss" id="gh-ib-dismiss-btn">Not now</button>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('gh-ib-install-btn').addEventListener('click', async () => {
            if (!_installPrompt) return;
            const result = await _installPrompt.prompt();
            console.log('[PWA] Install prompt result:', result?.outcome);
            _installPrompt = null;
            removeInstallBanner();
        });

        document.getElementById('gh-ib-dismiss-btn').addEventListener('click', () => {
            removeInstallBanner();
            localStorage.setItem('gh_install_dismissed_until', Date.now() + 7 * 86400000);
        });
    }

    function removeInstallBanner() {
        document.getElementById('gh-install-banner')?.remove();
    }

    // ════════════════════════════════════════════════════════════════
    // iOS BANNER
    // ════════════════════════════════════════════════════════════════
    function showIosBanner() {
        if (document.getElementById('gh-ios-banner')) return;

        const banner = document.createElement('div');
        banner.id = 'gh-ios-banner';
        Object.assign(banner.style, {
            position: 'fixed',
            bottom: '0',
            left: '0',
            right: '0',
            zIndex: '99999',
            background: '#161b22',
            borderTop: '1px solid #f59e0b',
            padding: '16px 20px 20px',
            fontFamily: 'Archivo, sans-serif',
            textAlign: 'center',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
        });

        banner.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div style="font-weight:700;color:#e6edf3;font-size:0.95rem;">📲 Install G&H Solutions</div>
                <button id="gh-ios-close" style="background:none;border:none;color:#8b949e;font-size:1.4rem;cursor:pointer;padding:0 4px;">×</button>
            </div>
            <div style="color:#8b949e;font-size:0.85rem;line-height:1.7;">
                To install: tap the <strong style="color:#58a6ff;">Share button</strong>
                <span style="font-size:1.1em;">⬆</span> at the bottom of Safari,<br>
                then tap <strong style="color:#f59e0b;">"Add to Home Screen"</strong>
                <span style="font-size:1.1em;">➕</span>
            </div>
            <div style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:1.6rem;">
                <span>⬆</span>
                <span style="font-size:0.7rem;color:#8b949e;">→</span>
                <span>➕</span>
            </div>
        `;

        document.body.appendChild(banner);

        document.getElementById('gh-ios-close').addEventListener('click', () => {
            removeIosBanner();
            localStorage.setItem('gh_ios_banner_dismissed', '1');
        });
    }

    function removeIosBanner() {
        document.getElementById('gh-ios-banner')?.remove();
    }

    // ════════════════════════════════════════════════════════════════
    // UPDATE TOAST
    // ════════════════════════════════════════════════════════════════
    function showUpdateToast() {
        if (document.getElementById('gh-update-toast')) return;

        const toast = document.createElement('div');
        toast.id = 'gh-update-toast';
        Object.assign(toast.style, {
            position: 'fixed',
            top: '76px',
            right: '20px',
            zIndex: '99999',
            background: '#161b22',
            border: '1px solid #3fb950',
            borderRadius: '10px',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
            fontFamily: 'Archivo, sans-serif',
            maxWidth: '320px',
            animation: 'ghSlideDown 0.3s ease',
        });

        toast.innerHTML = `
            <style>
                @keyframes ghSlideDown { from { opacity:0; transform: translateY(-10px); } to { opacity:1; transform: translateY(0); } }
            </style>
            <div style="font-size:1.5rem;">🔄</div>
            <div style="flex:1;">
                <div style="font-weight:700;color:#e6edf3;font-size:0.88rem;">Update available</div>
                <div style="color:#8b949e;font-size:0.78rem;">A new version of the app is ready</div>
            </div>
            <button id="gh-update-btn" style="background:#3fb950;color:white;border:none;border-radius:6px;padding:7px 13px;font-size:0.8rem;font-weight:700;cursor:pointer;font-family:inherit;">Refresh</button>
        `;

        document.body.appendChild(toast);

        document.getElementById('gh-update-btn').addEventListener('click', () => {
            if (_swRegistration?.waiting) {
                _swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            toast.remove();
        });

        setTimeout(() => toast.remove(), 30000);
    }

    // ── Expose global helpers (useful for debugging) ────────────────
    window.GH_PWA = {
        clearCache: () => navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_CACHE' }),
        checkUpdate: () => _swRegistration?.update(),
    };

    console.log('🔧 PWA: Registration script loaded');
})();