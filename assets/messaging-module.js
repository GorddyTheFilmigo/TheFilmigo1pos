/**
 * ═══════════════════════════════════════════════════════════
 * MESSAGING MODULE - Admin to User Communication
 * 72-hour auto-expiring messages
 * ═══════════════════════════════════════════════════════════
 */
(function() {
    'use strict';

    // Get current user's shop_id
    function getCurrentShopId() {
        const currentUser = authModule.getCurrentUser();
        if (!currentUser || !currentUser.shop_id) {
            throw new Error('No shop_id found for current user');
        }
        return currentUser.shop_id;
    }

    // Get current user ID
    function getCurrentUserId() {
        const currentUser = authModule.getCurrentUser();
        if (!currentUser || !currentUser.id) {
            throw new Error('No user ID found');
        }
        return currentUser.id;
    }

    /**
     * Send a message (now allowed for all authenticated users in the same shop)
     * Removed admin-only restriction so staff/cashiers can reply to admin messages
     * Security is still maintained via shop_id and recipient validation
     * @param {number} recipientId - User ID to send message to
     * @param {string} messageText - Message content
     * @returns {Promise<{success: boolean, data?: object, error?: string}>}
     */
    async function sendMessage(recipientId, messageText) {
        try {
            const shopId = getCurrentShopId();
            const senderId = getCurrentUserId();
            const currentUser = authModule.getCurrentUser();

            if (!currentUser || !currentUser.id) {
                throw new Error('You must be logged in to send messages');
            }

            // Optional: prevent self-messaging (good practice)
            if (senderId === recipientId) {
                throw new Error('Cannot send message to yourself');
            }

            if (!messageText || messageText.trim().length === 0) {
                throw new Error('Message cannot be empty');
            }

            // Verify recipient exists and belongs to same shop
            const { data: recipient, error: recipientError } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id, shop_id, username, full_name')
                .eq('id', recipientId)
                .eq('shop_id', shopId)
                .single();

            if (recipientError || !recipient) {
                throw new Error('Recipient not found or does not belong to your shop');
            }

            const messageData = {
                shop_id: shopId,
                sender_id: senderId,
                recipient_id: recipientId,
                message_text: messageText.trim(),
                is_read: false,
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString() // 72 hours from now
            };

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('messages')
                .insert([messageData])
                .select()
                .single();

            if (error) throw error;

            console.log('✅ Message sent to:', recipient.full_name);
            return { success: true, data };
        } catch (err) {
            console.error('❌ Send message failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get unread messages for current user
     * Only returns messages that haven't expired (within 72 hours)
     * @returns {Promise<{success: boolean, data?: array, error?: string}>}
     */
    async function getUnreadMessages() {
        try {
            const userId = getCurrentUserId();
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('messages')
                .select(`
                    *,
                    sender:users!messages_sender_id_fkey (
                        id,
                        username,
                        full_name,
                        role
                    )
                `)
                .eq('recipient_id', userId)
                .eq('shop_id', shopId)
                .eq('is_read', false)
                .gt('expires_at', new Date().toISOString()) // Only non-expired messages
                .order('created_at', { ascending: false });
            if (error) throw error;
            console.log(`📬 Found ${(data || []).length} unread messages`);
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('❌ Get unread messages failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    /**
     * Get all messages for current user (read and unread, non-expired)
     * @param {number} limit - Maximum number of messages to fetch
     * @returns {Promise<{success: boolean, data?: array, error?: string}>}
     */
    async function getAllMessages(limit = 50) {
        try {
            const userId = getCurrentUserId();
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('messages')
                .select(`
                    *,
                    sender:users!messages_sender_id_fkey (
                        id,
                        username,
                        full_name,
                        role
                    )
                `)
                .eq('recipient_id', userId)
                .eq('shop_id', shopId)
                .gt('expires_at', new Date().toISOString()) // Only non-expired
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('❌ Get all messages failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    /**
     * Mark a message as read
     * @param {number} messageId - Message ID
     * @returns {Promise<{success: boolean, data?: object, error?: string}>}
     */
    async function markAsRead(messageId) {
        try {
            const userId = getCurrentUserId();
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('messages')
                .update({
                    is_read: true,
                    read_at: new Date().toISOString()
                })
                .eq('id', messageId)
                .eq('recipient_id', userId) // Ensure user can only mark their own messages
                .eq('shop_id', shopId)
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Message marked as read:', messageId);
            return { success: true, data };
        } catch (err) {
            console.error('❌ Mark as read failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get count of unread messages for current user
     * @returns {Promise<{success: boolean, count?: number, error?: string}>}
     */
    async function getUnreadCount() {
        try {
            const userId = getCurrentUserId();
            const shopId = getCurrentShopId();
            const { data, error, count } = await window.DukaPOS.supabaseClient
                .from('messages')
                .select('id', { count: 'exact', head: true })
                .eq('recipient_id', userId)
                .eq('shop_id', shopId)
                .eq('is_read', false)
                .gt('expires_at', new Date().toISOString());
            if (error) throw error;
            return { success: true, count: count || 0 };
        } catch (err) {
            console.error('❌ Get unread count failed:', err);
            return { success: false, error: err.message, count: 0 };
        }
    }

    /**
     * Get all users in current shop (for admin to select recipient)
     * @returns {Promise<{success: boolean, data?: array, error?: string}>}
     */
    async function getUsersForMessaging() {
        try {
            const shopId = getCurrentShopId();
            const currentUserId = getCurrentUserId();
            const currentUser = authModule.getCurrentUser();
            if (currentUser.role !== 'administrator') {
                throw new Error('Only administrators can view users list');
            }
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id, username, full_name, role, is_active')
                .eq('shop_id', shopId)
                .eq('is_active', true)
                .neq('id', currentUserId) // Don't include self
                .order('full_name', { ascending: true });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('❌ Get users for messaging failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    /**
     * Delete a message (admin only, or recipient after reading)
     * @param {number} messageId - Message ID
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    async function deleteMessage(messageId) {
        try {
            const userId = getCurrentUserId();
            const shopId = getCurrentShopId();
            const currentUser = authModule.getCurrentUser();
            // Admin can delete any message, users can only delete their own
            let query = window.DukaPOS.supabaseClient
                .from('messages')
                .delete()
                .eq('id', messageId)
                .eq('shop_id', shopId);
            if (currentUser.role !== 'administrator') {
                query = query.eq('recipient_id', userId);
            }
            const { error } = await query;
            if (error) throw error;
            console.log('✅ Message deleted:', messageId);
            return { success: true };
        } catch (err) {
            console.error('❌ Delete message failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get sent messages (admin only)
     * @param {number} limit - Maximum number of messages
     * @returns {Promise<{success: boolean, data?: array, error?: string}>}
     */
    async function getSentMessages(limit = 50) {
        try {
            const userId = getCurrentUserId();
            const shopId = getCurrentShopId();
            const currentUser = authModule.getCurrentUser();
            if (currentUser.role !== 'administrator') {
                throw new Error('Only administrators can view sent messages');
            }
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('messages')
                .select(`
                    *,
                    recipient:users!messages_recipient_id_fkey (
                        id,
                        username,
                        full_name,
                        role
                    )
                `)
                .eq('sender_id', userId)
                .eq('shop_id', shopId)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false })
                .limit(limit);
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('❌ Get sent messages failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    // Export to global scope
    window.messagingModule = {
        sendMessage,
        getUnreadMessages,
        getAllMessages,
        markAsRead,
        getUnreadCount,
        getUsersForMessaging,
        deleteMessage,
        getSentMessages
    };

    console.log('✅ Messaging Module loaded (72-hour auto-expiry enabled)');
})();