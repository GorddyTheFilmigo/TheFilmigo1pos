// ════════════════════════════════════════════════════════════
// PWA SERVICE WORKER REGISTRATION
// With protocol check to prevent errors on file:// protocol
// ════════════════════════════════════════════════════════════

(function() {
    'use strict';

    // Check if running on supported protocol
    const protocol = window.location.protocol;
    
    if (protocol === 'file:') {
        console.log('⚠️ PWA: Service Worker not supported on file:// protocol');
        console.log('💡 To enable offline mode, run on a web server (http:// or https://)');
        console.log('📌 Tip: Use VS Code Live Server extension for local development');
        return;
    }

    // Check if service workers are supported
    if (!('serviceWorker' in navigator)) {
        console.log('⚠️ PWA: Service Workers not supported in this browser');
        return;
    }

    // Register service worker
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('/service-worker.js');
            
            console.log('✅ PWA: Service Worker registered successfully');
            console.log('📱 App can now work offline!');
            
            // Handle updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('🔄 New version available! Refresh to update.');
                    }
                });
            });
            
        } catch (error) {
            console.log('⚠️ PWA: Service Worker registration failed:', error.message);
            console.log('💡 This is normal if not running on a web server');
        }
    });

    // Log installation status
    console.log('🔧 PWA: Service Worker registration script loaded');
})();