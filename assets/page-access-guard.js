// ════════════════════════════════════════════════════════════
// UNIVERSAL PAGE ACCESS GUARD
// Add this script to EVERY page (except login.html)
// Place it RIGHT AFTER auth.js script tag
// ════════════════════════════════════════════════════════════

(async function() {
    'use strict';
    
    console.log('🔒 Page Access Guard: Checking permissions...');
    
    // Wait for auth module to load
    let retries = 0;
    while (!window.authModule && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!window.authModule) {
        console.error('❌ Auth module not loaded - redirecting to login');
        window.location.href = 'login.html';
        return;
    }
    
    // Check if user is authenticated
    const isAuthenticated = await window.authModule.checkSession();
    if (!isAuthenticated) {
        console.log('⚠️ Not authenticated - redirecting to login');
        window.location.href = 'login.html';
        return;
    }
    
    // Get current user
    const user = window.authModule.getCurrentUser();
    if (!user) {
        console.log('⚠️ No user found - redirecting to login');
        window.location.href = 'login.html';
        return;
    }
    
    // Get current page
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Get access rules for user's role
    const PAGE_ACCESS_RULES = {
        'administrator': {
            allowed: ['*'], // All pages
            homepage: 'dashboard.html'
        },
        'manager': {
            allowed: ['dashboard.html', 'pos.html', 'products.html', 'inventory.html', 'customers.html', 'suppliers.html', 'admin.html'],
            homepage: 'dashboard.html'
        },
        'cashier': {
            allowed: ['pos.html', 'products.html', 'customers.html'],
            homepage: 'pos.html'
        },
        'supplier': {
            allowed: ['suppliers.html'], // ONLY suppliers page
            homepage: 'suppliers.html'
        },
        'customer': {
            allowed: ['customers.html'], // ONLY customers page
            homepage: 'customers.html'
        }
    };
    
    const userRules = PAGE_ACCESS_RULES[user.role];
    
    if (!userRules) {
        console.error('❌ Unknown role:', user.role);
        alert('Invalid user role. Please contact administrator.');
        window.location.href = 'login.html';
        return;
    }
    
    // Check if user has access to this page
    const hasAccess = userRules.allowed.includes('*') || userRules.allowed.includes(currentPage);
    
    if (!hasAccess) {
        console.warn(`⛔ Access Denied: ${user.role} cannot access ${currentPage}`);
        console.log(`🔄 Redirecting to ${userRules.homepage}`);
        
        // Show alert to user
        alert(`Access Denied!\n\nYou don't have permission to access this page.\nRedirecting to your homepage...`);
        
        // Redirect to their allowed homepage
        window.location.href = userRules.homepage;
        return;
    }
    
    console.log(`✅ Access Granted: ${user.role} can access ${currentPage}`);
})();