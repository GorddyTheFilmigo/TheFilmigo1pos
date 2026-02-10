// ════════════════════════════════════════════════════════════════
// NAVIGATION ROLE MANAGER
// ════════════════════════════════════════════════════════════════
// Add this script to ALL HTML files to automatically show/hide navigation
// based on user role
// ════════════════════════════════════════════════════════════════

(function() {
    /**
     * Setup navigation based on user role
     * Call this after authentication is complete
     */
    window.setupNavigationForRole = function() {
        const currentUser = window.authModule.getCurrentUser();
        
        if (!currentUser) {
            console.warn('No user found - cannot setup navigation');
            return;
        }

        const isAdmin = currentUser.role === 'administrator';

        // ════════════════════════════════════════════════════════════
        // ADMIN-ONLY LINKS
        // ════════════════════════════════════════════════════════════
        const dashboardLink = document.getElementById('dashboardLink');
        const inventoryLink = document.getElementById('inventoryLink');
        const adminLink = document.getElementById('adminTab');

        // Show/hide based on role
        if (dashboardLink) {
            dashboardLink.style.display = isAdmin ? 'flex' : 'none';
        }

        if (inventoryLink) {
            inventoryLink.style.display = isAdmin ? 'flex' : 'none';
        }

        if (adminLink) {
            adminLink.style.display = isAdmin ? 'flex' : 'none';
        }

        console.log(`✅ Navigation configured for ${isAdmin ? 'Administrator' : 'Cashier'}`);
    };

    /**
     * Enforce admin-only access for specific pages
     * Call this on dashboard.html and inventory.html
     */
    window.requireAdminAccess = function(pageName = 'this page', redirectTo = 'pos.html') {
        const currentUser = window.authModule.getCurrentUser();
        
        if (!currentUser) {
            console.error('No user found');
            window.location.href = 'login.html';
            return false;
        }

        if (currentUser.role !== 'administrator') {
            alert(`⚠️ Access Denied\n\n${pageName} is only available to administrators.`);
            window.location.href = redirectTo;
            return false;
        }

        return true;
    };

    console.log('📊 Navigation Role Manager loaded');
})();