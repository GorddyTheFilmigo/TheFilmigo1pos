// ─────────────────────────────────────────────────────────────
// SUBSCRIPTION MODULE  (assets/subscription-module.js)
// MULTI-TENANT: all queries are scoped to the current shop_id
// ─────────────────────────────────────────────────────────────
window.subscriptionModule = (function () {

    let _status = null;

    function getDb() {
        return window.DukaPOS?.supabaseClient
            || window._supabaseClient
            || window.supabaseClient
            || window.DukaPOS?.client
            || window.DukaPOS?.supabase
            || null;
    }

    function getShopId() {
        // Uses the same getCurrentShop() from authModule that the rest of the app uses
        const shop = window.authModule?.getCurrentShop();
        return shop?.id || null;
    }

    async function checkSubscription() {
        try {
            const db = getDb();
            if (!db) {
                console.warn('subscriptionModule: Supabase client not ready yet');
                _status = { active: true, grace: false, expired: false, missing: true, daysLeft: 999 };
                return _status;
            }

            const shopId = getShopId();
            if (!shopId) {
                console.warn('subscriptionModule: No shop context — cannot check subscription');
                // Fail open so login still works before shop is loaded
                _status = { active: true, grace: false, expired: false, missing: true, daysLeft: 999 };
                return _status;
            }

            // ── MULTI-TENANT: filter by shop_id ──────────────────────────
            const { data, error } = await db
                .from('subscriptions')
                .select('*')
                .eq('shop_id', shopId)          // ← Only this shop's subscription
                .order('expires_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) {
                console.warn('Subscription DB error:', error.message);
                _status = { active: true, grace: false, expired: false, missing: true, daysLeft: 999 };
                return _status;
            }

            if (!data) {
                console.warn(`subscriptionModule: No subscription found for shop ${shopId}`);
                _status = { active: false, grace: false, expired: false, missing: true, daysLeft: 0, shopId };
                return _status;
            }

            const now = new Date();
            const expiresAt = new Date(data.expires_at);
            const isActive = data.status === 'active' && expiresAt > now;
            const GRACE_DAYS = 3;
            const graceEnd = new Date(expiresAt.getTime() + GRACE_DAYS * 86_400_000);
            const inGrace = !isActive && now <= graceEnd;
            const isExpired = !isActive && !inGrace;
            const daysLeft = isActive ? Math.ceil((expiresAt - now) / 86_400_000) : 0;

            _status = {
                active: isActive,
                grace: inGrace,
                expired: isExpired,
                missing: false,
                expiresAt,
                plan: data.plan || 'Basic',
                daysLeft,
                shopId,
                data
            };

            console.log(`📋 Subscription [Shop ${shopId}]: ${isActive ? '✅ Active' : isExpired ? '🔒 Expired' : '⚠️ Grace'} | ${daysLeft}d left | Expires ${expiresAt.toLocaleDateString()}`);
            return _status;

        } catch (e) {
            console.error('subscriptionModule error:', e);
            _status = { active: true, grace: false, expired: false, missing: true, daysLeft: 999 };
            return _status;
        }
    }

    function getStatus() { return _status; }

    function isAccessAllowed() {
        if (!_status) return false;
        return _status.active || _status.grace || _status.missing;
    }

    return {
        checkSubscription,
        getStatus,
        isAccessAllowed,
        get _status() { return _status; },
        set _status(v) { _status = v; }
    };
})();