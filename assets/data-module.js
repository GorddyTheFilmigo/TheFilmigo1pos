/**
 * Data Module - Multi-tenant data access layer
 * Automatically filters all queries by shop_id
 * Requires: window.DukaPOS.supabaseClient and authModule
 */
(function() {
    'use strict';

    function getCurrentShopId() {
        const currentUser = authModule.getCurrentUser();
        if (!currentUser || !currentUser.shop_id) {
            throw new Error('No shop_id found for current user. Please log in again.');
        }
        return currentUser.shop_id;
    }

    // ⚠️ REMOVED: getCurrentAuthUserId() — was returning a UUID from auth.uid()
    // but expenses.user_id is a bigint (your custom users table ID).
    // We now use authModule.getCurrentUser().id directly everywhere.

    // ============================================================================
    // CUSTOMERS
    // ============================================================================
    async function getAllCustomers() {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers').select('*').eq('shop_id', shopId).order('created_at', { ascending: false });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllCustomers failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    async function createCustomer(customerData) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers').insert([{ ...customerData, shop_id: shopId }]).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('createCustomer failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function updateCustomer(customerId, updates) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers').update(updates).eq('id', customerId).eq('shop_id', shopId).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('updateCustomer failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function deleteCustomer(customerId) {
        try {
            const shopId = getCurrentShopId();
            const { error } = await window.DukaPOS.supabaseClient
                .from('customers').delete().eq('id', customerId).eq('shop_id', shopId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('deleteCustomer failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // PRODUCTS
    // ============================================================================
    async function getAllProducts() {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products').select('*').eq('shop_id', shopId).order('name', { ascending: true });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllProducts failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    async function createProduct(productData) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products').insert([{ ...productData, shop_id: shopId }]).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('createProduct failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function updateProduct(productId, updates) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products').update(updates).eq('id', productId).eq('shop_id', shopId).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('updateProduct failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function deleteProduct(productId) {
        try {
            const shopId = getCurrentShopId();
            const { error } = await window.DukaPOS.supabaseClient
                .from('products').delete().eq('id', productId).eq('shop_id', shopId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('deleteProduct failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // SUPPLIERS
    // ============================================================================
    async function getAllSuppliers() {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers').select('*').eq('shop_id', shopId).order('name', { ascending: true });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllSuppliers failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    async function createSupplier(supplierData) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers').insert([{ ...supplierData, shop_id: shopId }]).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('createSupplier failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function updateSupplier(supplierId, updates) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers').update(updates).eq('id', supplierId).eq('shop_id', shopId).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('updateSupplier failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function deleteSupplier(supplierId) {
        try {
            const shopId = getCurrentShopId();
            const { error } = await window.DukaPOS.supabaseClient
                .from('suppliers').delete().eq('id', supplierId).eq('shop_id', shopId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('deleteSupplier failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // SALES / TRANSACTIONS
    // ============================================================================
    async function getAllSales() {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('sales').select('*, sale_items(*)').eq('shop_id', shopId).order('created_at', { ascending: false });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllSales failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    async function createSale(saleData, items) {
        try {
            const shopId = getCurrentShopId();
            const currentUser = authModule.getCurrentUser();
            const saleDataToInsert = { ...saleData, shop_id: shopId, user_id: currentUser?.id || null };
            const { data: sale, error: saleError } = await window.DukaPOS.supabaseClient
                .from('sales').insert([saleDataToInsert]).select().single();
            if (saleError) throw saleError;
            const itemsToInsert = items.map(item => ({ ...item, sale_id: sale.id, shop_id: shopId }));
            const { error: itemsError } = await window.DukaPOS.supabaseClient.from('sale_items').insert(itemsToInsert);
            if (itemsError) throw itemsError;
            return { success: true, data: sale };
        } catch (err) {
            console.error('createSale failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function updateInventory(productId, quantityChange, operation = 'subtract') {
        try {
            const shopId = getCurrentShopId();
            const { data: product, error: fetchError } = await window.DukaPOS.supabaseClient
                .from('products').select('stock').eq('id', productId).eq('shop_id', shopId).single();
            if (fetchError) throw new Error(`Fetch error: ${fetchError.message}`);
            if (!product) throw new Error('Product not found');
            const currentStock = Number(product.stock) || 0;
            const newStock = operation === 'subtract'
                ? Math.max(0, currentStock - quantityChange)
                : currentStock + quantityChange;
            const { error: updateError } = await window.DukaPOS.supabaseClient
                .from('products').update({ stock: newStock }).eq('id', productId).eq('shop_id', shopId);
            if (updateError) throw new Error(`Update error: ${updateError.message}`);
            return { success: true, newStock };
        } catch (err) {
            console.error('updateInventory failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // EXPENSES
    // ============================================================================
    async function getAllExpenses() {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses').select('*').eq('shop_id', shopId).order('date', { ascending: false });
            if (error) throw error;
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllExpenses failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    async function createExpense(expenseData) {
        try {
            const shopId = getCurrentShopId();

            // ✅ FIX: Use authModule.getCurrentUser().id (bigint) NOT auth.getUser() (UUID)
            // expenses.user_id is bigint — it stores your custom users table ID,
            // NOT the Supabase auth UUID. Mixing them caused RLS policy violation.
            const currentUser = authModule.getCurrentUser();
            const userId = currentUser?.id || null;

            if (!userId) {
                throw new Error('Could not determine current user. Please log in again.');
            }

            const dataToInsert = {
                category:    expenseData.category,
                amount:      expenseData.amount,
                description: expenseData.description,
                date:        expenseData.date,
                shop_id:     shopId,
                user_id:     userId,          // bigint ✅ matches expenses.user_id column
                created_at:  new Date().toISOString()
            };

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses').insert([dataToInsert]).select().single();

            if (error) throw error;
            return { success: true, data };

        } catch (err) {
            console.error('createExpense failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ════════════════════════════════════════════════════════════════
    // getExpensesByDateRange
    // FIX: No longer joins `users` table directly — that was failing
    // with "permission denied for table users" due to Supabase RLS.
    // Instead: fetch expenses flat, then resolve user names separately
    // using the shop's user list (which the current user can access).
    // ════════════════════════════════════════════════════════════════
    async function getExpensesByDateRange(startDate, endDate) {
        try {
            const shopId = getCurrentShopId();

            // Step 1 — flat expenses query, NO join on users
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .select('id, category, amount, description, date, created_at, shop_id, user_id')
                .eq('shop_id', shopId)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false });

            if (error) throw error;

            const rows = data || [];
            if (!rows.length) {
                return { success: true, data: [] };
            }

            // Step 2 — collect unique user_ids and resolve names
            const userIds = [...new Set(rows.map(r => r.user_id).filter(Boolean))];
            const userMap = {};

            if (userIds.length > 0) {
                try {
                    const { data: usersData, error: usersError } = await window.DukaPOS.supabaseClient
                        .from('users')
                        .select('id, full_name')
                        .in('id', userIds)
                        .eq('shop_id', shopId);

                    if (!usersError && usersData) {
                        usersData.forEach(u => { userMap[u.id] = u.full_name; });
                    } else {
                        console.warn('Could not resolve user names for expenses:', usersError?.message);
                    }
                } catch (userLookupErr) {
                    console.warn('User lookup for expenses failed gracefully:', userLookupErr.message);
                }
            }

            // Step 3 — attach cashier name to each expense row
            const enriched = rows.map(r => ({
                ...r,
                cashier: r.user_id
                    ? { id: r.user_id, full_name: userMap[r.user_id] || 'Unknown Cashier' }
                    : null
            }));

            console.log(`✅ Loaded ${enriched.length} expenses (${startDate} → ${endDate})`);
            return { success: true, data: enriched };

        } catch (err) {
            console.error('getExpensesByDateRange failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    async function updateExpense(expenseId, updates) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses').update(updates).eq('id', expenseId).eq('shop_id', shopId).select().single();
            if (error) throw error;
            return { success: true, data };
        } catch (err) {
            console.error('updateExpense failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function deleteExpense(expenseId) {
        try {
            const shopId = getCurrentShopId();
            const { error } = await window.DukaPOS.supabaseClient
                .from('expenses').delete().eq('id', expenseId).eq('shop_id', shopId);
            if (error) throw error;
            return { success: true };
        } catch (err) {
            console.error('deleteExpense failed:', err);
            return { success: false, error: err.message };
        }
    }

    async function getExpenseStats() {
        try {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(today); weekStart.setDate(today.getDate() - today.getDay());
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const yearStart  = new Date(now.getFullYear(), 0, 1);
            const fmt = d => d.toISOString().split('T')[0];
            const [t, w, m, y] = await Promise.all([
                getExpensesByDateRange(fmt(today),      fmt(now)),
                getExpensesByDateRange(fmt(weekStart),  fmt(now)),
                getExpensesByDateRange(fmt(monthStart), fmt(now)),
                getExpensesByDateRange(fmt(yearStart),  fmt(now)),
            ]);
            const sum = arr => (arr || []).reduce((s, e) => s + parseFloat(e.amount), 0);
            return { success: true, data: { today: sum(t.data), week: sum(w.data), month: sum(m.data), year: sum(y.data) } };
        } catch (err) {
            console.error('getExpenseStats failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // Export
    // ============================================================================
    window.dataModule = {
        getAllCustomers, createCustomer, updateCustomer, deleteCustomer,
        getAllProducts,  createProduct,  updateProduct,  deleteProduct,
        getAllSuppliers, createSupplier, updateSupplier, deleteSupplier,
        getAllSales, createSale, updateInventory,
        getAllExpenses, createExpense, getExpensesByDateRange,
        updateExpense, deleteExpense, getExpenseStats,
        getCurrentShopId
    };

    console.log('✅ Data Module loaded (multi-tenant, expenses RLS-safe)');
})();