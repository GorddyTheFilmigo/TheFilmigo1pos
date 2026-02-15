// ═══════════════════════════════════════════════════════════
// SUPPLIER ORDERS MODULE
// Handles all supplier order operations, communications, and tracking
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';

    const supplierOrdersModule = {
        // ═══════════════════════════════════════════════════════════
        // ORDER MANAGEMENT
        // ═══════════════════════════════════════════════════════════

        /**
         * Get all supplier orders for current shop
         * @param {Object} filters - Optional filters (status, supplier_id, date_range)
         * @returns {Promise<Object>} Result with orders data
         */
        async getAllOrders(filters = {}) {
            try {
                const currentShop = window.DukaPOS?.currentShop;
                if (!currentShop) throw new Error('No shop context');

                let query = window.supabase
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

                // Apply filters
                if (filters.status) {
                    query = query.eq('status', filters.status);
                }
                if (filters.supplier_id) {
                    query = query.eq('supplier_id', filters.supplier_id);
                }
                if (filters.start_date) {
                    query = query.gte('created_at', filters.start_date);
                }
                if (filters.end_date) {
                    query = query.lte('created_at', filters.end_date);
                }

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
                const { data, error } = await window.supabase
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
                const currentUser = authModule.getCurrentUser();
                const currentShop = window.DukaPOS?.currentShop;
                
                if (!currentShop) throw new Error('No shop context');

                // Generate order number
                const orderNumber = `PO-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                // Calculate totals
                const totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
                const finalAmount = totalAmount + (orderData.tax_amount || 0) + 
                                   (orderData.shipping_cost || 0) - (orderData.discount_amount || 0);

                // Insert order
                const { data: order, error: orderError } = await window.supabase
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

                // Insert order items
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

                const { error: itemsError } = await window.supabase
                    .from('supplier_order_items')
                    .insert(orderItems);

                if (itemsError) throw itemsError;

                // Create notification for supplier
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
                const updateData = {
                    status,
                    updated_at: new Date().toISOString()
                };

                if (notes) updateData.notes = notes;
                if (status === 'delivered') updateData.actual_delivery = new Date().toISOString();

                const { data, error } = await window.supabase
                    .from('supplier_orders')
                    .update(updateData)
                    .eq('id', orderId)
                    .select()
                    .single();

                if (error) throw error;

                // Create notification
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

        /**
         * Accept order (supplier action)
         */
        async acceptOrder(orderId, confirmedItems = null) {
            try {
                const { error } = await window.supabase
                    .from('supplier_orders')
                    .update({
                        status: 'accepted',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', orderId);

                if (error) throw error;

                // Update confirmed quantities if provided
                if (confirmedItems && Array.isArray(confirmedItems)) {
                    for (const item of confirmedItems) {
                        await window.supabase
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

        /**
         * Reject order (supplier action)
         */
        async rejectOrder(orderId, reason) {
            try {
                const { error } = await window.supabase
                    .from('supplier_orders')
                    .update({
                        status: 'rejected',
                        notes: reason,
                        updated_at: new Date().toISOString()
                    })
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

        /**
         * Send message on an order
         */
        async sendOrderMessage(orderId, message, senderType) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { data, error } = await window.supabase
                    .from('order_messages')
                    .insert({
                        order_id: orderId,
                        sender_id: currentUser.id,
                        sender_type: senderType, // 'admin' or 'supplier'
                        message: message,
                        is_read: false
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Create notification for recipient
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

        /**
         * Get all messages for an order
         */
        async getOrderMessages(orderId) {
            try {
                const { data, error } = await window.supabase
                    .from('order_messages')
                    .select(`
                        *,
                        sender:users (id, full_name, role)
                    `)
                    .eq('order_id', orderId)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get order messages error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Mark message as read
         */
        async markMessageAsRead(messageId) {
            try {
                const { error } = await window.supabase
                    .from('order_messages')
                    .update({
                        is_read: true,
                        read_at: new Date().toISOString()
                    })
                    .eq('id', messageId);

                if (error) throw error;

                return { success: true };
            } catch (err) {
                console.error('Mark message as read error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get unread messages count
         */
        async getUnreadMessagesCount(userType = 'admin') {
            try {
                const currentShop = window.DukaPOS?.currentShop;
                if (!currentShop) throw new Error('No shop context');

                const senderTypeFilter = userType === 'admin' ? 'supplier' : 'admin';

                const { data, error } = await window.supabase
                    .from('order_messages')
                    .select('id', { count: 'exact', head: true })
                    .eq('sender_type', senderTypeFilter)
                    .eq('is_read', false);

                if (error) throw error;

                return { success: true, count: data || 0 };
            } catch (err) {
                console.error('Get unread count error:', err);
                return { success: false, error: err.message, count: 0 };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ISSUES & DISPUTES
        // ═══════════════════════════════════════════════════════════

        /**
         * Report an issue on an order
         */
        async reportIssue(issueData) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { data, error } = await window.supabase
                    .from('order_issues')
                    .insert({
                        order_id: issueData.order_id,
                        reported_by: currentUser.id,
                        reporter_type: issueData.reporter_type, // 'admin' or 'supplier'
                        issue_type: issueData.issue_type,
                        priority: issueData.priority || 'medium',
                        status: 'open',
                        title: issueData.title,
                        description: issueData.description
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Create notification
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

        /**
         * Get all issues for an order
         */
        async getOrderIssues(orderId) {
            try {
                const { data, error } = await window.supabase
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

        /**
         * Update issue status
         */
        async updateIssueStatus(issueId, status, resolution = null) {
            try {
                const currentUser = authModule.getCurrentUser();
                const updateData = {
                    status,
                    updated_at: new Date().toISOString()
                };

                if (status === 'resolved' || status === 'closed') {
                    updateData.resolved_by = currentUser.id;
                    updateData.resolved_at = new Date().toISOString();
                    if (resolution) updateData.resolution = resolution;
                }

                const { data, error } = await window.supabase
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

        /**
         * Submit product update (supplier action)
         */
        async submitProductUpdate(updateData) {
            try {
                const currentUser = authModule.getCurrentUser();
                const currentShop = window.DukaPOS?.currentShop;

                const { data, error } = await window.supabase
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

        /**
         * Get product updates for a supplier
         */
        async getProductUpdates(supplierId, status = null) {
            try {
                let query = window.supabase
                    .from('supplier_product_updates')
                    .select('*')
                    .eq('supplier_id', supplierId)
                    .order('created_at', { ascending: false });

                if (status) {
                    query = query.eq('status', status);
                }

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

        /**
         * Record supplier payment
         */
        async recordPayment(paymentData) {
            try {
                const currentUser = authModule.getCurrentUser();
                const currentShop = window.DukaPOS?.currentShop;

                const { data, error } = await window.supabase
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

                // Update order payment status if applicable
                if (paymentData.order_id) {
                    await this.updateOrderPaymentStatus(paymentData.order_id);
                }

                return { success: true, data };
            } catch (err) {
                console.error('Record payment error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get payment history for supplier
         */
        async getPaymentHistory(supplierId, orderId = null) {
            try {
                let query = window.supabase
                    .from('supplier_payments')
                    .select('*')
                    .eq('supplier_id', supplierId)
                    .order('payment_date', { ascending: false });

                if (orderId) {
                    query = query.eq('order_id', orderId);
                }

                const { data, error } = await query;

                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get payment history error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Update order payment status based on payments
         */
        async updateOrderPaymentStatus(orderId) {
            try {
                // Get order total
                const { data: order } = await window.supabase
                    .from('supplier_orders')
                    .select('final_amount')
                    .eq('id', orderId)
                    .single();

                if (!order) return;

                // Get total paid
                const { data: payments } = await window.supabase
                    .from('supplier_payments')
                    .select('amount')
                    .eq('order_id', orderId);

                const totalPaid = payments?.reduce((sum, p) => sum + parseFloat(p.amount), 0) || 0;
                const orderTotal = parseFloat(order.final_amount);

                let paymentStatus = 'pending';
                if (totalPaid >= orderTotal) {
                    paymentStatus = 'paid';
                } else if (totalPaid > 0) {
                    paymentStatus = 'partial';
                }

                await window.supabase
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

        /**
         * Create notification
         */
        async createNotification(notificationData) {
            try {
                // Get relevant users to notify
                let userIds = [];

                if (notificationData.supplier_id) {
                    // Notify supplier users
                    const { data: supplierUsers } = await window.supabase
                        .from('users')
                        .select('id')
                        .eq('role', 'supplier')
                        .eq('supplier_id', notificationData.supplier_id);

                    userIds = supplierUsers?.map(u => u.id) || [];
                } else {
                    // Notify admin users
                    const currentShop = window.DukaPOS?.currentShop;
                    const { data: adminUsers } = await window.supabase
                        .from('users')
                        .select('id')
                        .eq('shop_id', currentShop.id)
                        .in('role', ['admin', 'administrator', 'manager']);

                    userIds = adminUsers?.map(u => u.id) || [];
                }

                // Insert notifications for each user
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
                    await window.supabase
                        .from('supplier_notifications')
                        .insert(notifications);
                }

                return { success: true };
            } catch (err) {
                console.error('Create notification error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get notifications for current user
         */
        async getNotifications(limit = 20) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { data, error } = await window.supabase
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

        /**
         * Mark notification as read
         */
        async markNotificationAsRead(notificationId) {
            try {
                const { error } = await window.supabase
                    .from('supplier_notifications')
                    .update({
                        is_read: true,
                        read_at: new Date().toISOString()
                    })
                    .eq('id', notificationId);

                if (error) throw error;

                return { success: true };
            } catch (err) {
                console.error('Mark notification as read error:', err);
                return { success: false, error: err.message };
            }
        }
    };

    // Expose to global scope
    window.supplierOrdersModule = supplierOrdersModule;

    console.log('✅ Supplier Orders Module loaded');
})();