// ═══════════════════════════════════════════════════════════
// G&H Solutions — PWA Registration & Install Prompt Handler
// ═══════════════════════════════════════════════════════════

// Store the install prompt event globally so we can trigger it later
window._pwaInstallPrompt = null;
window._pwaInstalled = false;

// ── Capture the browser's beforeinstallprompt event ──
window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the default mini-infobar on mobile
    e.preventDefault();
    window._pwaInstallPrompt = e;
    console.log('✅ PWA install prompt ready');

    // Show any install buttons we've placed in the UI
    showInstallButtons();
});

// ── Hide install button once app is installed ──
window.addEventListener('appinstalled', () => {
    window._pwaInstalled = true;
    window._pwaInstallPrompt = null;
    console.log('✅ PWA installed successfully');
    hideInstallButtons();
});

// ── Called when user clicks the install button ──
window.triggerPWAInstall = async function () {
    if (!window._pwaInstallPrompt) {
        // Already installed or browser doesn't support
        alert('App is already installed or your browser will show the install option in the address bar menu (⋮).');
        return;
    }
    // Show the native install dialog
    window._pwaInstallPrompt.prompt();
    const { outcome } = await window._pwaInstallPrompt.userChoice;
    console.log('Install outcome:', outcome);

    if (outcome === 'accepted') {
        window._pwaInstallPrompt = null;
        hideInstallButtons();
    }
};

function showInstallButtons() {
    document.querySelectorAll('.pwa-install-btn').forEach(btn => {
        btn.style.display = 'flex';
    });
}

function hideInstallButtons() {
    document.querySelectorAll('.pwa-install-btn').forEach(btn => {
        btn.style.display = 'none';
    });
}

// ── Register the Service Worker ──
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('✅ Service Worker registered:', reg.scope))
            .catch(err => console.warn('⚠️ Service Worker registration failed:', err));
    });
}