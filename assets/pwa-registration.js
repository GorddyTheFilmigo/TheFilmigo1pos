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
        // Show a helpful guide for manual installation
        const isChrome = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent);
        const isEdge   = /Edg/.test(navigator.userAgent);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
        const isMobile = /Android|iPhone|iPad/.test(navigator.userAgent);

        let instructions = '';
        if (isMobile && isSafari) {
            instructions = 'Tap the Share button (□↑) at the bottom, then tap "Add to Home Screen".';
        } else if (isMobile) {
            instructions = 'Tap the browser menu (⋮) at the top right, then tap "Add to Home screen" or "Install app".';
        } else if (isEdge) {
            instructions = 'Click the (⋮) menu in the top right → "Apps" → "Install this site as an app".';
        } else if (isChrome) {
            instructions = 'Click the install icon (⬇) in the address bar on the right, or go to (⋮) menu → "Install G&H Solutions".';
        } else {
            instructions = 'Use your browser menu to find "Install" or "Add to Home Screen".';
        }
        alert('📲 Install G&H Solutions

' + instructions);
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