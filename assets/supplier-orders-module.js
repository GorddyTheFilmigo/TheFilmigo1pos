// ═══════════════════════════════════════════════════════════
// SUPPLIER ORDERS MODULE — Fixed
// Changes:
//   1. getDB() helper used everywhere instead of window.supabase
//   2. getAllOrders() waits for shop context with retry instead of hard throw
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';

    // ── Supabase client helper (matches how dashboard.html accesses it) ──
    function getDB() {
        return window.DukaPOS?.supabaseClient || window.supabase || null;
    }

    // ── Wait for shop context to be available (max ~5 seconds) ─────────
    function waitForShopContext(maxWaitMs = 5000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                const shop = window.DukaPOS?.currentShop;
                if (shop) return resolve(shop);
                if (Date.now() - start > maxWaitMs) return reject(new Error('Shop context not available'));
                setTimeout(check, 200);
            };
            check();
        });
    }

    const supplierOrdersModule = {

        // ═══════════════════════════════════════════════════════════
        // ORDER MANAGEMENT
        // ═══════════════════════════════════════════════════════════

        /**
         * Get all supplier orders for current shop.
         * FIX: waits for shop context rather than throwing immediately.
         */
        async getAllOrders(filters = {}) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                // ✅ Wait for shop context instead of hard-failing
                const currentShop = await waitForShopContext();

                let query = db
                    .from('supplier_orders')
                    .select(`
                        *,
                        suppliers (
                            id, name, contact_person, phone, email
                        ),
                        supplier_order_items (
                            id, product_name, quantity, unit_price, subtotal
                        ),
                        users:created_by (
                            id, full_name
                        )
                    `)
                    .eq('shop_id', currentShop.id)
                    .order('created_at', { ascending: false });

                if (filters.status)      query = query.eq('status', filters.status);
                if (filters.supplier_id) query = query.eq('supplier_id', filters.supplier_id);
                if (filters.start_date)  query = query.gte('created_at', filters.start_date);
                if (filters.end_date)    query = query.lte('created_at', filters.end_date);

                const { data, error } = await query;
                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get all orders error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get single order by ID with full details
         */
        async getOrderById(orderId) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { data, error } = await db
                    .from('supplier_orders')
                    .select(`
                        *,
                        suppliers (*),
                        supplier_order_items (*),
                        users:created_by (full_name)
                    `)
                    .eq('id', orderId)
                    .single();

                if (error) throw error;
                return { success: true, data };
            } catch (err) {
                console.error('Get order by ID error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Create new supplier order
         */
        async createOrder(orderData, items) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const currentShop = await waitForShopContext();

                const orderNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
                const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
                const finalAmount = totalAmount + (orderData.tax_amount || 0) +
                                   (orderData.shipping_cost || 0) - (orderData.discount_amount || 0);

                const { data: order, error: orderError } = await db
                    .from('supplier_orders')
                    .insert({
                        shop_id: currentShop.id,
                        supplier_id: orderData.supplier_id,
                        order_number: orderNumber,
                        status: 'pending',
                        total_amount: totalAmount,
                        tax_amount: orderData.tax_amount || 0,
                        discount_amount: orderData.discount_amount || 0,
                        shipping_cost: orderData.shipping_cost || 0,
                        final_amount: finalAmount,
                        payment_status: 'pending',
                        expected_delivery: orderData.expected_delivery,
                        notes: orderData.notes,
                        created_by: currentUser.id
                    })
                    .select()
                    .single();

                if (orderError) throw orderError;

                const orderItems = items.map(item => ({
                    order_id: order.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    sku: item.sku,
                    quantity: item.quantity,
                    unit_price: item.unit_price,
                    subtotal: item.subtotal,
                    tax_rate: item.tax_rate || 0,
                    discount_rate: item.discount_rate || 0
                }));

                const { error: itemsError } = await db
                    .from('supplier_order_items')
                    .insert(orderItems);

                if (itemsError) throw itemsError;

                await this.createNotification({
                    type: 'new_order',
                    title: 'New Purchase Order',
                    message: `New order ${orderNumber} created`,
                    order_id: order.id,
                    supplier_id: orderData.supplier_id
                });

                return { success: true, data: order };
            } catch (err) {
                console.error('Create order error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Update order status
         */
        async updateOrderStatus(orderId, status, notes = null) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const updateData = { status, updated_at: new Date().toISOString() };
                if (notes) updateData.notes = notes;
                if (status === 'delivered') updateData.actual_delivery = new Date().toISOString();

                const { data, error } = await db
                    .from('supplier_orders')
                    .update(updateData)
                    .eq('id', orderId)
                    .select()
                    .single();

                if (error) throw error;

                await this.createNotification({
                    type: 'order_updated',
                    title: 'Order Status Updated',
                    message: `Order status changed to ${status}`,
                    order_id: orderId
                });

                return { success: true, data };
            } catch (err) {
                console.error('Update order status error:', err);
                return { success: false, error: err.message };
            }
        },

        async acceptOrder(orderId, confirmedItems = null) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { error } = await db
                    .from('supplier_orders')
                    .update({ status: 'accepted', updated_at: new Date().toISOString() })
                    .eq('id', orderId);

                if (error) throw error;

                if (confirmedItems && Array.isArray(confirmedItems)) {
                    for (const item of confirmedItems) {
                        await db
                            .from('supplier_order_items')
                            .update({ confirmed_quantity: item.confirmed_quantity })
                            .eq('id', item.id);
                    }
                }

                return { success: true };
            } catch (err) {
                console.error('Accept order error:', err);
                return { success: false, error: err.message };
            }
        },

        async rejectOrder(orderId, reason) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { error } = await db
                    .from('supplier_orders')
                    .update({ status: 'rejected', notes: reason, updated_at: new Date().toISOString() })
                    .eq('id', orderId);

                if (error) throw error;
                return { success: true };
            } catch (err) {
                console.error('Reject order error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ORDER MESSAGING
        // ═══════════════════════════════════════════════════════════

        async sendOrderMessage(orderId, message, senderType) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const { data, error } = await db
                    .from('order_messages')
                    .insert({
                        order_id: orderId,
                        sender_id: currentUser.id,
                        sender_type: senderType,
                        message: message,
                        is_read: false
                    })
                    .select()
                    .single();

                if (error) throw error;

                await this.createNotification({
                    type: 'message_received',
                    title: 'New Message',
                    message: `New message on order`,
                    order_id: orderId
                });

                return { success: true, data };
            } catch (err) {
                console.error('Send order message error:', err);
                return { success: false, error: err.message };
            }
        },

        async getOrderMessages(orderId) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { data, error } = await db
                    .from('order_messages')
                    .select(`*, sender:users (id, full_name, role)`)
                    .eq('order_id', orderId)
                    .order('created_at', { ascending: true });

                if (error) throw error;
                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get order messages error:', err);
                return { success: false, error: err.message };
            }
        },

        async markMessageAsRead(messageId) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { error } = await db
                    .from('order_messages')
                    .update({ is_read: true, read_at: new Date().toISOString() })
                    .eq('id', messageId);

                if (error) throw error;
                return { success: true };
            } catch (err) {
                console.error('Mark message as read error:', err);
                return { success: false, error: err.message };
            }
        },

        async getUnreadMessagesCount(userType = 'admin') {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentShop = await waitForShopContext();
                const senderTypeFilter = userType === 'admin' ? 'supplier' : 'admin';

                const { count, error } = await db
                    .from('order_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('sender_type', senderTypeFilter)
                    .eq('is_read', false);

                if (error) throw error;
                return { success: true, count: count || 0 };
            } catch (err) {
                console.error('Get unread count error:', err);
                return { success: false, error: err.message, count: 0 };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ISSUES & DISPUTES
        // ═══════════════════════════════════════════════════════════

        async reportIssue(issueData) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const { data, error } = await db
                    .from('order_issues')
                    .insert({
                        order_id: issueData.order_id,
                        reported_by: currentUser.id,
                        reporter_type: issueData.reporter_type,
                        issue_type: issueData.issue_type,
                        priority: issueData.priority || 'medium',
                        status: 'open',
                        title: issueData.title,
                        description: issueData.description
                    })
                    .select()
                    .single();

                if (error) throw error;

                await this.createNotification({
                    type: 'issue_reported',
                    title: 'New Issue Reported',
                    message: issueData.title,
                    order_id: issueData.order_id,
                    issue_id: data.id
                });

                return { success: true, data };
            } catch (err) {
                console.error('Report issue error:', err);
                return { success: false, error: err.message };
            }
        },

        async getOrderIssues(orderId) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { data, error } = await db
                    .from('order_issues')
                    .select(`
                        *,
                        reported_by_user:users!reported_by (full_name),
                        resolved_by_user:users!resolved_by (full_name)
                    `)
                    .eq('order_id', orderId)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get order issues error:', err);
                return { success: false, error: err.message };
            }
        },

        async updateIssueStatus(issueId, status, resolution = null) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const updateData = { status, updated_at: new Date().toISOString() };

                if (status === 'resolved' || status === 'closed') {
                    updateData.resolved_by = currentUser.id;
                    updateData.resolved_at = new Date().toISOString();
                    if (resolution) updateData.resolution = resolution;
                }

                const { data, error } = await db
                    .from('order_issues')
                    .update(updateData)
                    .eq('id', issueId)
                    .select()
                    .single();

                if (error) throw error;
                return { success: true, data };
            } catch (err) {
                console.error('Update issue status error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // PRODUCT UPDATES
        // ═══════════════════════════════════════════════════════════

        async submitProductUpdate(updateData) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const currentShop = await waitForShopContext();

                const { data, error } = await db
                    .from('supplier_product_updates')
                    .insert({
                        supplier_id: updateData.supplier_id,
                        shop_id: currentShop.id,
                        submitted_by: currentUser.id,
                        update_type: updateData.update_type,
                        product_id: updateData.product_id,
                        product_name: updateData.product_name,
                        sku: updateData.sku,
                        details: updateData.details,
                        old_value: updateData.old_value,
                        new_value: updateData.new_value,
                        effective_date: updateData.effective_date,
                        status: 'pending'
                    })
                    .select()
                    .single();

                if (error) throw error;
                return { success: true, data };
            } catch (err) {
                console.error('Submit product update error:', err);
                return { success: false, error: err.message };
            }
        },

        async getProductUpdates(supplierId, status = null) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                let query = db
                    .from('supplier_product_updates')
                    .select('*')
                    .eq('supplier_id', supplierId)
                    .order('created_at', { ascending: false });

                if (status) query = query.eq('status', status);

                const { data, error } = await query;
                if (error) throw error;
                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get product updates error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // PAYMENTS
        // ═══════════════════════════════════════════════════════════

        async recordPayment(paymentData) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const currentShop = await waitForShopContext();

                const { data, error } = await db
                    .from('supplier_payments')
                    .insert({
                        shop_id: currentShop.id,
                        supplier_id: paymentData.supplier_id,
                        order_id: paymentData.order_id,
                        invoice_number: paymentData.invoice_number,
                        payment_date: paymentData.payment_date,
                        amount: paymentData.amount,
                        payment_method: paymentData.payment_method,
                        reference_number: paymentData.reference_number,
                        notes: paymentData.notes,
                        recorded_by: currentUser.id
                    })
                    .select()
                    .single();

                if (error) throw error;

                if (paymentData.order_id) {
                    await this.updateOrderPaymentStatus(paymentData.order_id);
                }

                return { success: true, data };
            } catch (err) {
                console.error('Record payment error:', err);
                return { success: false, error: err.message };
            }
        },

        async getPaymentHistory(supplierId, orderId = null) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                let query = db
                    .from('supplier_payments')
                    .select('*')
                    .eq('supplier_id', supplierId)
                    .order('payment_date', { ascending: false });

                if (orderId) query = query.eq('order_id', orderId);

                const { data, error } = await query;
                if (error) throw error;
                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get payment history error:', err);
                return { success: false, error: err.message };
            }
        },

        async updateOrderPaymentStatus(orderId) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { data: order } = await db
                    .from('supplier_orders')
                    .select('final_amount')
                    .eq('id', orderId)
                    .single();

                if (!order) return;

                const { data: payments } = await db
                    .from('supplier_payments')
                    .select('amount')
                    .eq('order_id', orderId);

                const totalPaid   = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
                const orderTotal  = parseFloat(order.final_amount);
                let paymentStatus = 'pending';
                if (totalPaid >= orderTotal) paymentStatus = 'paid';
                else if (totalPaid > 0)      paymentStatus = 'partial';

                await db
                    .from('supplier_orders')
                    .update({ payment_status: paymentStatus })
                    .eq('id', orderId);

                return { success: true };
            } catch (err) {
                console.error('Update payment status error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // NOTIFICATIONS
        // ═══════════════════════════════════════════════════════════

        async createNotification(notificationData) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                let userIds = [];

                if (notificationData.supplier_id) {
                    const { data: supplierUsers } = await db
                        .from('users')
                        .select('id')
                        .eq('role', 'supplier')
                        .eq('supplier_id', notificationData.supplier_id);
                    userIds = supplierUsers?.map(u => u.id) || [];
                } else {
                    const currentShop = window.DukaPOS?.currentShop;
                    if (currentShop) {
                        const { data: adminUsers } = await db
                            .from('users')
                            .select('id')
                            .eq('shop_id', currentShop.id)
                            .in('role', ['admin', 'administrator', 'manager']);
                        userIds = adminUsers?.map(u => u.id) || [];
                    }
                }

                const notifications = userIds.map(userId => ({
                    user_id: userId,
                    notification_type: notificationData.type,
                    title: notificationData.title,
                    message: notificationData.message,
                    related_order_id: notificationData.order_id,
                    related_issue_id: notificationData.issue_id,
                    is_read: false
                }));

                if (notifications.length > 0) {
                    await db.from('supplier_notifications').insert(notifications);
                }

                return { success: true };
            } catch (err) {
                console.error('Create notification error:', err);
                return { success: false, error: err.message };
            }
        },

        async getNotifications(limit = 20) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const currentUser = authModule.getCurrentUser();
                const { data, error } = await db
                    .from('supplier_notifications')
                    .select('*')
                    .eq('user_id', currentUser.id)
                    .order('created_at', { ascending: false })
                    .limit(limit);

                if (error) throw error;
                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get notifications error:', err);
                return { success: false, error: err.message };
            }
        },

        async markNotificationAsRead(notificationId) {
            try {
                const db = getDB();
                if (!db) throw new Error('Supabase client not ready');

                const { error } = await db
                    .from('supplier_notifications')
                    .update({ is_read: true, read_at: new Date().toISOString() })
                    .eq('id', notificationId);

                if (error) throw error;
                return { success: true };
            } catch (err) {
                console.error('Mark notification as read error:', err);
                return { success: false, error: err.message };
            }
        }
    };

    window.supplierOrdersModule = supplierOrdersModule;
    console.log('✅ Supplier Orders Module loaded');
})();