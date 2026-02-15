// ════════════════════════════════════════════════════════════
// NAVIGATION VISIBILITY CONTROLLER
// Hides/shows navigation links based on user role
// Add this script AFTER page-access-guard.js
// ════════════════════════════════════════════════════════════

(async function() {
    'use strict';
    
    console.log('🧭 Navigation Controller: Filtering links...');
    
    // Wait for auth module to load
    let retries = 0;
    while (!window.authModule && retries < 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        retries++;
    }
    
    if (!window.authModule) {
        console.error('❌ Auth module not loaded');
        return;
    }
    
    // Get current user
    const user = window.authModule.getCurrentUser();
    if (!user) {
        console.log('⚠️ No user found');
        return;
    }
    
    // Define which navigation links each role can see
    const NAV_VISIBILITY = {
        'administrator': {
            visible: ['all'] // Show all links
        },
        'manager': {
            visible: ['dashboard', 'pos', 'products', 'inventory', 'customers', 'suppliers', 'users']
        },
        'cashier': {
            visible: ['pos', 'products', 'customers']
        },
        'supplier': {
            visible: ['suppliers'] // ONLY suppliers link
        },
        'customer': {
            visible: ['customers'] // ONLY customers link
        }
    };
    
    const userNav = NAV_VISIBILITY[user.role];
    
    if (!userNav) {
        console.error('❌ Unknown role:', user.role);
        return;
    }
    
    // Get all navigation links
    const navLinks = document.querySelectorAll('.nav-tab, .nav-tabs a');
    
    if (navLinks.length === 0) {
        console.warn('⚠️ No navigation links found');
        return;
    }
    
    // Map of link href/text to identifier
    const linkMap = {
        'dashboard.html': 'dashboard',
        'dashboard': 'dashboard',
        'pos.html': 'pos',
        'pos': 'pos',
        'point of sale': 'pos',
        'products.html': 'products',
        'products': 'products',
        'inventory.html': 'inventory',
        'inventory': 'inventory',
        'customers.html': 'customers',
        'customers': 'customers',
        'suppliers.html': 'suppliers',
        'suppliers': 'suppliers',
        'admin.html': 'users',
        'users': 'users',
        'user': 'users'
    };
    
    // Filter navigation links
    navLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const text = link.textContent.toLowerCase().trim();
        
        // Identify which page this link goes to
        let pageIdentifier = null;
        
        // Check href first
        for (const [key, value] of Object.entries(linkMap)) {
            if (href.includes(key) || text.includes(key)) {
                pageIdentifier = value;
                break;
            }
        }
        
        // Determine if this link should be visible
        let shouldShow = false;
        
        if (userNav.visible.includes('all')) {
            // Administrator sees everything
            shouldShow = true;
        } else if (pageIdentifier && userNav.visible.includes(pageIdentifier)) {
            // User's role has access to this page
            shouldShow = true;
        }
        
        // Show or hide the link
        if (shouldShow) {
            link.style.display = '';
            link.style.visibility = 'visible';
        } else {
            link.style.display = 'none';
        }
    });
    
    console.log(`✅ Navigation filtered for role: ${user.role}`);
    console.log(`👁️ Visible links: ${userNav.visible.join(', ')}`);
    
})();