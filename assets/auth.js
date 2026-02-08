// ════════════════════════════════════════════════════════════════
// DUKA POS - AUTHENTICATION MODULE (multi-page safe version)
// ════════════════════════════════════════════════════════════════

(function () {
    // Prevent re-loading / redeclaration issues
    if (window.authModule && window.authModule.initialized) {
        console.log('authModule already initialized – skipping');
        return;
    }

    // Create / extend namespace
    window.authModule = window.authModule || {};
    window.authModule.initialized = true;

    // ── Session storage keys ─────────────────────────────────────
    const SESSION_KEY = 'duka_session';
    const USER_KEY    = 'duka_user';

    // ── PASSWORD HASHING (SHA-256) ───────────────────────────────
    async function hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        return hashHex;
    }

    // ── SESSION TOKEN GENERATION ─────────────────────────────────
    function generateSessionToken() {
        const array = new Uint8Array(32);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    // ── LOGIN FUNCTION ───────────────────────────────────────────
    async function login(username, password) {
        try {
            console.log('🔐 Attempting login for:', username);

            const passwordHash = await hashPassword(password);

            const { data: users, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('*')
                .eq('username', username)
                .eq('password_hash', passwordHash)
                .eq('is_active', true)
                .limit(1);

            if (error) throw error;
            if (!users || users.length === 0) {
                throw new Error('Invalid username or password');
            }

            const user = users[0];

            const sessionToken = generateSessionToken();
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + 8);
            const loginTime = new Date().toISOString();

            const { data: sessionData, error: sessionError } = await window.DukaPOS.supabaseClient
                .from('user_sessions')
                .insert([{
                    user_id: user.id,
                    session_token: sessionToken,
                    login_time: loginTime,
                    is_active: true,
                    expires_at: expiresAt.toISOString()
                }])
                .select();

            if (sessionError) throw sessionError;
            const sessionId = sessionData[0].id;

            await window.DukaPOS.supabaseClient
                .from('users')
                .update({ last_login: loginTime })
                .eq('id', user.id);

            await window.DukaPOS.supabaseClient
                .from('activity_logs')
                .insert([{
                    user_id: user.id,
                    session_id: sessionId,
                    action_type: 'login',
                    action_details: {
                        username: user.username,
                        full_name: user.full_name,
                        role: user.role
                    }
                }]);

            localStorage.setItem(SESSION_KEY, sessionToken);
            localStorage.setItem(USER_KEY, JSON.stringify({
                id: user.id,
                username: user.username,
                full_name: user.full_name,
                role: user.role,
                email: user.email,
                created_by: user.created_by // Store who created this user
            }));

            console.log('✅ Login successful:', user.full_name);
            return { success: true, user };
        } catch (error) {
            console.error('❌ Login failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ── LOGOUT FUNCTION ──────────────────────────────────────────
    async function logout() {
        try {
            const sessionToken = localStorage.getItem(SESSION_KEY);
            const userJson = localStorage.getItem(USER_KEY);

            if (sessionToken && userJson) {
                const user = JSON.parse(userJson);
                const logoutTime = new Date().toISOString();

                const { data: sessions } = await window.DukaPOS.supabaseClient
                    .from('user_sessions')
                    .select('*')
                    .eq('session_token', sessionToken)
                    .limit(1);

                if (sessions && sessions.length > 0) {
                    const session = sessions[0];

                    await window.DukaPOS.supabaseClient
                        .from('user_sessions')
                        .update({
                            logout_time: logoutTime,
                            is_active: false
                        })
                        .eq('session_token', sessionToken);

                    await window.DukaPOS.supabaseClient
                        .from('users')
                        .update({ last_logout: logoutTime })
                        .eq('id', user.id);

                    await window.DukaPOS.supabaseClient
                        .from('activity_logs')
                        .insert([{
                            user_id: user.id,
                            session_id: session.id,
                            action_type: 'logout',
                            action_details: {
                                username: user.username,
                                full_name: user.full_name,
                                session_duration: calculateDuration(session.login_time, logoutTime)
                            }
                        }]);
                }
            }

            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(USER_KEY);
            console.log('✅ Logged out successfully');

            window.location.href = 'login.html';
        } catch (error) {
            console.error('❌ Logout error:', error);
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem(USER_KEY);
            window.location.href = 'login.html';
        }
    }

    function calculateDuration(startTime, endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        const diffMs = end - start;
        const diffMins = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMins / 60);
        const minutes = diffMins % 60;
        return `${hours}h ${minutes}m`;
    }

    function getCurrentUser() {
        const userJson = localStorage.getItem(USER_KEY);
        return userJson ? JSON.parse(userJson) : null;
    }

    async function checkSession() {
        try {
            const sessionToken = localStorage.getItem(SESSION_KEY);
            if (!sessionToken) return false;

            const { data: sessions, error } = await window.DukaPOS.supabaseClient
                .from('user_sessions')
                .select('*, users(*)')
                .eq('session_token', sessionToken)
                .gte('expires_at', new Date().toISOString())
                .limit(1);

            if (error) throw error;
            if (!sessions || sessions.length === 0) {
                localStorage.removeItem(SESSION_KEY);
                localStorage.removeItem(USER_KEY);
                return false;
            }

            return true;
        } catch (error) {
            console.error('❌ Session check failed:', error);
            return false;
        }
    }

    async function requireAuth(requiredRole = null, requireNonDefaultAdmin = false) {
        const isValid = await checkSession();
        if (!isValid) {
            console.log('⚠️ No valid session, redirecting to login...');
            window.location.href = 'login.html';
            return false;
        }

        const user = getCurrentUser();
        
        // Check if this is a default admin (created_by is null) trying to access admin panel
        if (requireNonDefaultAdmin && user.role === 'administrator' && !user.created_by) {
            console.log('⚠️ Default admin blocked from admin panel');
            alert('Access Denied: The initial admin account cannot access the admin panel.\n\nPlease use the admin panel to create a new administrator account, then login with that account to manage users.');
            // Force redirect
            setTimeout(() => {
                window.location.replace('dashboard.html');
            }, 100);
            return false;
        }

        if (requiredRole) {
            const roleHierarchy = {
                'administrator': 3,
                'manager': 2,
                'cashier': 1
            };
            const userLevel = roleHierarchy[user.role] || 0;
            const requiredLevel = roleHierarchy[requiredRole] || 0;

            if (userLevel < requiredLevel) {
                alert('You do not have permission to access this page.');
                window.location.href = 'dashboard.html';
                return false;
            }
        }

        return true;
    }

    async function createUser(userData) {
        try {
            const currentUser = getCurrentUser();
            if (currentUser.role !== 'administrator') {
                throw new Error('Only administrators can create users');
            }

            // Check if username already exists
            const { data: existingUser } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id')
                .eq('username', userData.username)
                .single();

            if (existingUser) {
                throw new Error('Username already exists. Please choose a different username.');
            }

            const passwordHash = await hashPassword(userData.password);

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .insert([{
                    username: userData.username,
                    password_hash: passwordHash,
                    full_name: userData.full_name,
                    role: userData.role,
                    email: userData.email,
                    phone: userData.phone,
                    created_by: currentUser.id
                }])
                .select();

            if (error) throw error;

            console.log('✅ User created:', userData.username);
            return { success: true, user: data[0] };
        } catch (error) {
            console.error('❌ Create user failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function updateUser(userId, updates) {
        try {
            const currentUser = getCurrentUser();
            if (currentUser.role !== 'administrator') {
                throw new Error('Only administrators can update users');
            }

            if (updates.password) {
                updates.password_hash = await hashPassword(updates.password);
                delete updates.password;
            }

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .update(updates)
                .eq('id', userId)
                .select();

            if (error) throw error;

            console.log('✅ User updated:', userId);
            return { success: true, user: data[0] };
        } catch (error) {
            console.error('❌ Update user failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function deactivateUser(userId) {
        try {
            const currentUser = getCurrentUser();
            if (currentUser.role !== 'administrator') {
                throw new Error('Only administrators can deactivate users');
            }
            if (userId === currentUser.id) {
                throw new Error('You cannot deactivate your own account');
            }

            const { error } = await window.DukaPOS.supabaseClient
                .from('users')
                .update({ is_active: false })
                .eq('id', userId);

            if (error) throw error;

            console.log('✅ User deactivated:', userId);
            return { success: true };
        } catch (error) {
            console.error('❌ Deactivate user failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllUsers() {
        try {
            const currentUser = getCurrentUser();
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id, username, full_name, role, email, phone, is_active, created_at, last_login, created_by')
                .order('created_at', { ascending: false });

            if (error) throw error;

            return { success: true, users: data };
        } catch (error) {
            console.error('❌ Get users failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function setupFirstAdmin(adminData) {
        try {
            // Check if this is truly the first user
            const { data: existingUsers, error: checkError } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id, created_by')
                .limit(10);

            if (checkError) throw checkError;
            
            // Only allow signup if there are NO users, OR if there's only one user with created_by = null
            if (existingUsers && existingUsers.length > 0) {
                const nonDefaultAdmins = existingUsers.filter(u => u.created_by !== null);
                if (nonDefaultAdmins.length > 0) {
                    throw new Error('System already has users. Please login.');
                }
            }

            const passwordHash = await hashPassword(adminData.password);

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .insert([{
                    username: adminData.username,
                    password_hash: passwordHash,
                    full_name: adminData.full_name,
                    role: 'administrator',
                    email: adminData.email,
                    phone: adminData.phone,
                    created_by: null // First admin has no creator
                }])
                .select();

            if (error) throw error;

            console.log('✅ First admin created:', adminData.username);
            return { success: true, user: data[0] };
        } catch (error) {
            console.error('❌ Setup first admin failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function hasUsers() {
        try {
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id')
                .limit(1);

            if (error) throw error;
            return data && data.length > 0;
        } catch (error) {
            console.error('❌ Check users failed:', error);
            return false;
        }
    }

    async function getUserSessions(userId = null, limit = 50) {
        try {
            const currentUser = getCurrentUser();
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }

            let query = window.DukaPOS.supabaseClient
                .from('user_sessions')
                .select('*, users(id, username, full_name, role)')
                .order('login_time', { ascending: false })
                .limit(limit);

            if (userId) query = query.eq('user_id', userId);

            const { data, error } = await query;
            if (error) throw error;

            return { success: true, sessions: data };
        } catch (error) {
            console.error('❌ Get sessions failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getActivityLogs(userId = null, actionType = null, limit = 100) {
        try {
            const currentUser = getCurrentUser();
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }

            let query = window.DukaPOS.supabaseClient
                .from('activity_logs')
                .select('*, users(id, username, full_name, role)')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (userId) query = query.eq('user_id', userId);
            if (actionType) query = query.eq('action_type', actionType);

            const { data, error } = await query;
            if (error) throw error;

            return { success: true, logs: data };
        } catch (error) {
            console.error('❌ Get activity logs failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getUserStatistics() {
        try {
            const currentUser = getCurrentUser();
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }

            const { data: allUsers, error: usersError } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id, is_active');

            if (usersError) throw usersError;

            const totalUsers = allUsers ? allUsers.length : 0;
            const activeUsers = allUsers ? allUsers.filter(u => u.is_active).length : 0;

            const { data: activeSessions, error: sessionsError } = await window.DukaPOS.supabaseClient
                .from('user_sessions')
                .select('id, user_id')
                .eq('is_active', true)
                .gte('expires_at', new Date().toISOString());

            if (sessionsError) throw sessionsError;

            const activeSessionCount = activeSessions ? activeSessions.length : 0;
            const onlineUserIds = activeSessions ? [...new Set(activeSessions.map(s => s.user_id))] : [];
            const onlineNow = onlineUserIds.length;

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data: todayLogins, error: todayError } = await window.DukaPOS.supabaseClient
                .from('activity_logs')
                .select('id')
                .eq('action_type', 'login')
                .gte('created_at', today.toISOString());

            if (todayError) throw todayError;

            const totalLoginsToday = todayLogins ? todayLogins.length : 0;

            return {
                success: true,
                statistics: {
                    totalUsers,
                    activeUsers,
                    activeSessionCount,
                    onlineNow,
                    totalLoginsToday
                }
            };
        } catch (error) {
            console.error('❌ Get user statistics failed:', error);
            return {
                success: false,
                error: error.message,
                statistics: {
                    totalUsers: 0,
                    activeUsers: 0,
                    activeSessionCount: 0,
                    onlineNow: 0,
                    totalLoginsToday: 0
                }
            };
        }
    }

    async function getUserStatisticsById(userId) {
        try {
            const currentUser = getCurrentUser();
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }

            const { data: sessions, error: sessionsError } = await window.DukaPOS.supabaseClient
                .from('user_sessions')
                .select('*')
                .eq('user_id', userId)
                .order('login_time', { ascending: false });

            if (sessionsError) throw sessionsError;

            const activeSessions = sessions ? sessions.filter(s =>
                s.is_active && new Date(s.expires_at) > new Date()
            ).length : 0;

            const lastLogin = sessions && sessions.length > 0 ? sessions[0].login_time : null;
            const lastLogout = sessions && sessions.length > 0 ? sessions[0].logout_time : null;

            let totalMinutes = 0;
            if (sessions) {
                sessions.forEach(session => {
                    if (session.logout_time) {
                        const start = new Date(session.login_time);
                        const end = new Date(session.logout_time);
                        const diffMins = Math.floor((end - start) / 60000);
                        totalMinutes += diffMins;
                    }
                });
            }

            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            const totalLoginTime = `${hours}h ${minutes}m`;

            return {
                success: true,
                statistics: {
                    totalSessions: sessions ? sessions.length : 0,
                    activeSessions,
                    lastLogin,
                    lastLogout,
                    totalLoginTime
                }
            };
        } catch (error) {
            console.error('❌ Get user statistics by ID failed:', error);
            return {
                success: false,
                error: error.message,
                statistics: {
                    totalSessions: 0,
                    activeSessions: 0,
                    lastLogin: null,
                    lastLogout: null,
                    totalLoginTime: '0h 0m'
                }
            };
        }
    }

    // ── Expose module ─────────────────────────────────────────────
    Object.assign(window.authModule, {
        login,
        logout,
        getCurrentUser,
        checkSession,
        requireAuth,
        createUser,
        updateUser,
        deactivateUser,
        getAllUsers,
        setupFirstAdmin,
        hasUsers,
        getUserSessions,
        getActivityLogs,
        getUserStatistics,
        getUserStatisticsById
    });

    console.log('🔐 authModule loaded');
})();