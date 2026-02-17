// ═══════════════════════════════════════════════════════════
// SUPPLY REQUEST WORKFLOW MODULE
// Complete request-to-delivery workflow with documentation
// ═══════════════════════════════════════════════════════════

(function() {
    'use strict';

    const supplyRequestModule = {
        
        // ═══════════════════════════════════════════════════════════
        // ADMIN: CREATE & SEND SUPPLY REQUESTS
        // ═══════════════════════════════════════════════════════════

        /**
         * Create new supply request (Admin → Supplier)
         */
        async createSupplyRequest(requestData, items) {
            try {
                const currentUser = authModule.getCurrentUser();
                const currentShop = window.DukaPOS?.currentShop;
                
                if (!currentShop) throw new Error('No shop context');

                // Generate request number
                const requestNumber = await this.generateRequestNumber(currentShop.id);

                // Insert request
                const { data: request, error: requestError } = await window.supabase
                    .from('supply_requests')
                    .insert({
                        shop_id: currentShop.id,
                        supplier_id: requestData.supplier_id,
                        request_number: requestNumber,
                        title: requestData.title,
                        description: requestData.description,
                        urgency: requestData.urgency || 'normal',
                        required_by_date: requestData.required_by_date,
                        status: 'pending',
                        requested_by: currentUser.id,
                        admin_notes: requestData.admin_notes
                    })
                    .select()
                    .single();

                if (requestError) throw requestError;

                // Insert items
                const requestItems = items.map(item => ({
                    request_id: request.id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    sku: item.sku,
                    description: item.description,
                    requested_quantity: item.quantity,
                    unit_price: item.unit_price,
                    estimated_subtotal: item.quantity * (item.unit_price || 0)
                }));

                const { error: itemsError } = await window.supabase
                    .from('supply_request_items')
                    .insert(requestItems);

                if (itemsError) throw itemsError;

                // Calculate totals
                await this.calculateRequestTotals(request.id);

                // Create notification for supplier
                await this.createSupplyRequestNotification(
                    request.supplier_id,
                    'new_supply_request',
                    'New Supply Request',
                    `You have a new supply request: ${request.title}`,
                    request.id
                );

                // Log activity
                await this.logActivity(request.id, 'Supply request created', 'status_change', currentUser.id, 'admin');

                return { success: true, data: request };
            } catch (err) {
                console.error('Create supply request error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Generate unique request number
         */
        async generateRequestNumber(shopId) {
            const { data } = await window.supabase
                .rpc('generate_supply_request_number', { shop_id_param: shopId });
            
            if (data) return data;
            
            // Fallback if function doesn't exist
            const timestamp = Date.now();
            return `SR-${shopId}-${timestamp}`;
        },

        // ═══════════════════════════════════════════════════════════
        // SUPPLIER: VIEW & RESPOND TO REQUESTS
        // ═══════════════════════════════════════════════════════════

        /**
         * Get all supply requests for supplier
         */
        async getSupplierRequests(supplierId, filters = {}) {
            try {
                let query = window.supabase
                    .from('supply_requests')
                    .select(`
                        *,
                        supply_request_items (*),
                        supply_request_documents (
                            id, document_type, file_name, file_url, created_at
                        ),
                        supply_request_messages (
                            id, message, sender_type, is_read, created_at
                        )
                    `)
                    .eq('supplier_id', supplierId)
                    .order('created_at', { ascending: false });

                if (filters.status) {
                    if (Array.isArray(filters.status)) {
                        query = query.in('status', filters.status);
                    } else {
                        query = query.eq('status', filters.status);
                    }
                }

                const { data, error } = await query;

                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get supplier requests error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Supplier accepts supply request
         */
        async acceptSupplyRequest(requestId, acceptanceData = {}) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { error } = await window.supabase
                    .from('supply_requests')
                    .update({
                        status: 'accepted',
                        accepted_at: new Date().toISOString(),
                        supplier_notes: acceptanceData.notes
                    })
                    .eq('id', requestId);

                if (error) throw error;

                // Update item quantities if supplier confirms different amounts
                if (acceptanceData.items && Array.isArray(acceptanceData.items)) {
                    for (const item of acceptanceData.items) {
                        await window.supabase
                            .from('supply_request_items')
                            .update({
                                approved_quantity: item.approved_quantity,
                                unit_price: item.unit_price,
                                actual_subtotal: item.approved_quantity * item.unit_price,
                                status: 'approved'
                            })
                            .eq('id', item.id);
                    }
                    
                    await this.calculateRequestTotals(requestId);
                }

                // Log activity
                await this.logActivity(requestId, 'Supply request accepted', 'status_change', currentUser.id, 'supplier');

                return { success: true };
            } catch (err) {
                console.error('Accept supply request error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Supplier rejects supply request
         */
        async rejectSupplyRequest(requestId, reason) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { error } = await window.supabase
                    .from('supply_requests')
                    .update({
                        status: 'rejected',
                        rejected_at: new Date().toISOString(),
                        rejection_reason: reason
                    })
                    .eq('id', requestId);

                if (error) throw error;

                await this.logActivity(requestId, `Supply request rejected: ${reason}`, 'status_change', currentUser.id, 'supplier');

                return { success: true };
            } catch (err) {
                console.error('Reject supply request error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Update request status (supplier progress)
         */
        async updateRequestStatus(requestId, status, notes = null) {
            try {
                const currentUser = authModule.getCurrentUser();
                const updateData = { status };

                if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
                if (status === 'delivered') updateData.delivered_at = new Date().toISOString();
                if (notes) updateData.supplier_notes = notes;

                const { error } = await window.supabase
                    .from('supply_requests')
                    .update(updateData)
                    .eq('id', requestId);

                if (error) throw error;

                await this.logActivity(requestId, `Status updated to ${status}`, 'status_change', currentUser.id, 'supplier');

                return { success: true };
            } catch (err) {
                console.error('Update request status error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // DOCUMENTATION & FILE UPLOAD
        // ═══════════════════════════════════════════════════════════

        /**
         * Upload document (invoice, delivery note, photo, etc.)
         */
        async uploadDocument(requestId, file, documentType, description, uploaderType) {
            try {
                const currentUser = authModule.getCurrentUser();
                
                // Upload to Supabase Storage
                const fileName = `supply-requests/${requestId}/${Date.now()}-${file.name}`;
                const { data: uploadData, error: uploadError } = await window.supabase.storage
                    .from('supply-documents')
                    .upload(fileName, file);

                if (uploadError) throw uploadError;

                // Get public URL
                const { data: { publicUrl } } = window.supabase.storage
                    .from('supply-documents')
                    .getPublicUrl(fileName);

                // Save document record
                const { data, error } = await window.supabase
                    .from('supply_request_documents')
                    .insert({
                        request_id: requestId,
                        document_type: documentType,
                        file_name: file.name,
                        file_type: file.type,
                        file_size: file.size,
                        file_url: publicUrl,
                        uploaded_by: currentUser.id,
                        uploaded_by_type: uploaderType,
                        description: description
                    })
                    .select()
                    .single();

                if (error) throw error;

                // Log activity
                await this.logActivity(
                    requestId, 
                    `Document uploaded: ${documentType}`, 
                    'document_upload', 
                    currentUser.id, 
                    uploaderType
                );

                return { success: true, data };
            } catch (err) {
                console.error('Upload document error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get all documents for a request
         */
        async getRequestDocuments(requestId) {
            try {
                const { data, error } = await window.supabase
                    .from('supply_request_documents')
                    .select('*')
                    .eq('request_id', requestId)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get request documents error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // DELIVERY & CONFIRMATION
        // ═══════════════════════════════════════════════════════════

        /**
         * Supplier marks as delivered
         */
        async markAsDelivered(requestId, deliveryData) {
            try {
                const currentUser = authModule.getCurrentUser();

                // Create delivery record
                const { data: delivery, error: deliveryError } = await window.supabase
                    .from('supply_deliveries')
                    .insert({
                        request_id: requestId,
                        delivery_number: deliveryData.delivery_number,
                        delivery_date: deliveryData.delivery_date,
                        delivery_time: deliveryData.delivery_time,
                        courier_name: deliveryData.courier_name,
                        driver_name: deliveryData.driver_name,
                        driver_phone: deliveryData.driver_phone,
                        vehicle_number: deliveryData.vehicle_number,
                        delivery_address: deliveryData.delivery_address,
                        delivered_by: currentUser.id,
                        delivered_at: new Date().toISOString(),
                        delivery_notes: deliveryData.notes,
                        delivery_photo_url: deliveryData.photo_url
                    })
                    .select()
                    .single();

                if (deliveryError) throw deliveryError;

                // Update request status
                await this.updateRequestStatus(requestId, 'delivered', deliveryData.notes);

                // Update item delivered quantities
                if (deliveryData.items && Array.isArray(deliveryData.items)) {
                    for (const item of deliveryData.items) {
                        await window.supabase
                            .from('supply_request_items')
                            .update({
                                delivered_quantity: item.delivered_quantity
                            })
                            .eq('id', item.id);
                    }
                }

                // Log activity
                await this.logActivity(requestId, 'Items delivered to shop', 'status_change', currentUser.id, 'supplier');

                return { success: true, data: delivery };
            } catch (err) {
                console.error('Mark as delivered error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Admin confirms receipt of items
         */
        async confirmReceipt(requestId, receiptData) {
            try {
                const currentUser = authModule.getCurrentUser();

                // Update delivery record
                const { error: deliveryError } = await window.supabase
                    .from('supply_deliveries')
                    .update({
                        received_by: currentUser.id,
                        received_at: new Date().toISOString(),
                        reception_notes: receiptData.notes,
                        condition_rating: receiptData.condition_rating,
                        condition_notes: receiptData.condition_notes
                    })
                    .eq('request_id', requestId);

                if (deliveryError) throw deliveryError;

                // Update request status
                const { error: requestError } = await window.supabase
                    .from('supply_requests')
                    .update({
                        status: 'received',
                        received_at: new Date().toISOString()
                    })
                    .eq('id', requestId);

                if (requestError) throw requestError;

                // Update received quantities
                if (receiptData.items && Array.isArray(receiptData.items)) {
                    for (const item of receiptData.items) {
                        await window.supabase
                            .from('supply_request_items')
                            .update({
                                received_quantity: item.received_quantity,
                                admin_notes: item.notes
                            })
                            .eq('id', item.id);
                    }
                }

                // Log activity
                await this.logActivity(requestId, 'Items received and confirmed by admin', 'status_change', currentUser.id, 'admin');

                return { success: true };
            } catch (err) {
                console.error('Confirm receipt error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Create quality inspection record
         */
        async createQualityInspection(requestId, inspectionData) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { data, error } = await window.supabase
                    .from('supply_quality_inspections')
                    .insert({
                        request_id: requestId,
                        item_id: inspectionData.item_id,
                        inspected_by: currentUser.id,
                        status: inspectionData.status,
                        quality_rating: inspectionData.quality_rating,
                        quantity_correct: inspectionData.quantity_correct,
                        quality_acceptable: inspectionData.quality_acceptable,
                        packaging_intact: inspectionData.packaging_intact,
                        expiry_dates_valid: inspectionData.expiry_dates_valid,
                        documents_complete: inspectionData.documents_complete,
                        issues_found: inspectionData.issues_found,
                        defects_count: inspectionData.defects_count,
                        action_taken: inspectionData.action_taken,
                        notes: inspectionData.notes
                    })
                    .select()
                    .single();

                if (error) throw error;

                await this.logActivity(requestId, 'Quality inspection completed', 'other', currentUser.id, 'admin');

                return { success: true, data };
            } catch (err) {
                console.error('Create quality inspection error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Complete request (final status)
         */
        async completeRequest(requestId, completionNotes) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { error } = await window.supabase
                    .from('supply_requests')
                    .update({
                        status: 'completed',
                        completed_at: new Date().toISOString(),
                        admin_notes: completionNotes
                    })
                    .eq('id', requestId);

                if (error) throw error;

                await this.logActivity(requestId, 'Supply request completed', 'status_change', currentUser.id, 'admin');

                return { success: true };
            } catch (err) {
                console.error('Complete request error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // MESSAGING & COMMUNICATION
        // ═══════════════════════════════════════════════════════════

        /**
         * Send message on supply request
         */
        async sendMessage(requestId, message, senderType) {
            try {
                const currentUser = authModule.getCurrentUser();

                const { data, error } = await window.supabase
                    .from('supply_request_messages')
                    .insert({
                        request_id: requestId,
                        sender_id: currentUser.id,
                        sender_type: senderType,
                        message: message
                    })
                    .select()
                    .single();

                if (error) throw error;

                await this.logActivity(requestId, 'Message sent', 'message', currentUser.id, senderType);

                return { success: true, data };
            } catch (err) {
                console.error('Send message error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get messages for request
         */
        async getMessages(requestId) {
            try {
                const { data, error } = await window.supabase
                    .from('supply_request_messages')
                    .select('*')
                    .eq('request_id', requestId)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get messages error:', err);
                return { success: false, error: err.message };
            }
        },

        // ═══════════════════════════════════════════════════════════
        // ACTIVITY LOG & NOTIFICATIONS
        // ═══════════════════════════════════════════════════════════

        /**
         * Log activity
         */
        async logActivity(requestId, action, actionType, userId, userType) {
            try {
                await window.supabase
                    .from('supply_request_activity')
                    .insert({
                        request_id: requestId,
                        action: action,
                        action_type: actionType,
                        user_id: userId,
                        user_type: userType
                    });

                return { success: true };
            } catch (err) {
                console.error('Log activity error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get activity log
         */
        async getActivityLog(requestId) {
            try {
                const { data, error } = await window.supabase
                    .from('supply_request_activity')
                    .select('*')
                    .eq('request_id', requestId)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                return { success: true, data: data || [] };
            } catch (err) {
                console.error('Get activity log error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Create notification
         */
        async createSupplyRequestNotification(supplierId, type, title, message, requestId) {
            try {
                // Get supplier user accounts
                const { data: supplierUsers } = await window.supabase
                    .from('users')
                    .select('id')
                    .eq('role', 'supplier');
                    // Add filter for specific supplier if needed

                if (supplierUsers && supplierUsers.length > 0) {
                    const notifications = supplierUsers.map(user => ({
                        user_id: user.id,
                        notification_type: type,
                        title: title,
                        message: message,
                        related_order_id: requestId
                    }));

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
         * Calculate request totals
         */
        async calculateRequestTotals(requestId) {
            try {
                const { data } = await window.supabase
                    .rpc('calculate_supply_request_totals', { request_id_param: requestId });

                return { success: true };
            } catch (err) {
                console.error('Calculate totals error:', err);
                return { success: false, error: err.message };
            }
        },

        /**
         * Get request by ID
         */
        async getRequestById(requestId) {
            try {
                const { data, error } = await window.supabase
                    .from('supply_requests')
                    .select(`
                        *,
                        supply_request_items (*),
                        supply_request_documents (*),
                        supply_deliveries (*),
                        supply_quality_inspections (*)
                    `)
                    .eq('id', requestId)
                    .single();

                if (error) throw error;

                return { success: true, data };
            } catch (err) {
                console.error('Get request by ID error:', err);
                return { success: false, error: err.message };
            }
        }
    };

    // Expose to global scope
    window.supplyRequestModule = supplyRequestModule;

    console.log('✅ Supply Request Workflow Module loaded');
})();