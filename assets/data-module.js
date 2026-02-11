/**
 * Data Module - Multi-tenant data access layer
 * Automatically filters all queries by shop_id
 * Requires: window.DukaPOS.supabaseClient and authModule
 */
(function() {
    'use strict';

    // Get current user's shop_id
    function getCurrentShopId() {
        const currentUser = authModule.getCurrentUser();
        if (!currentUser || !currentUser.shop_id) {
            throw new Error('No shop_id found for current user. Please log in again.');
        }
        return currentUser.shop_id;
    }

    // Get current authenticated user's UUID from Supabase (modernized)
    async function getCurrentAuthUserId() {
        try {
            const supabase = window.DukaPOS.supabaseClient;

            // Primary/recommended method: getSession() - Supabase JS v2+
            const { data: { session }, error } = await supabase.auth.getSession();
            
            if (error) {
                console.error('getSession() error:', error);
                throw error;
            }

            if (session?.user?.id) {
                console.log('Retrieved auth user ID via getSession:', session.user.id);
                return session.user.id;
            }

            // Detailed debug if no user found
            console.warn('No authenticated user in session. Session contents:', session);
            throw new Error('No authenticated user found in active session');

        } catch (err) {
            console.error('Failed to retrieve authenticated user ID:', err);
            throw new Error('Could not get authenticated user ID: ' + (err.message || 'unknown error'));
        }
    }

    // ============================================================================
    // CUSTOMERS
    // ============================================================================
    async function getAllCustomers() {
        try {
            const shopId = getCurrentShopId();
           
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers')
                .select('*')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            console.log(`✅ Loaded ${data.length} customers for shop ${shopId}`);
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllCustomers failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }
    async function createCustomer(customerData) {
        try {
            const shopId = getCurrentShopId();
           
            const dataToInsert = {
                ...customerData,
                shop_id: shopId
            };
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers')
                .insert([dataToInsert])
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Customer created:', data);
            return { success: true, data };
        } catch (err) {
            console.error('createCustomer failed:', err);
            return { success: false, error: err.message };
        }
    }
    async function updateCustomer(customerId, updates) {
        try {
            const shopId = getCurrentShopId();
            const { data: existing } = await window.DukaPOS.supabaseClient
                .from('customers')
                .select('id')
                .eq('id', customerId)
                .eq('shop_id', shopId)
                .single();
            if (!existing) {
                throw new Error('Customer not found or does not belong to your shop');
            }
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers')
                .update(updates)
                .eq('id', customerId)
                .eq('shop_id', shopId)
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Customer updated:', data);
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
                .from('customers')
                .delete()
                .eq('id', customerId)
                .eq('shop_id', shopId);
            if (error) throw error;
            console.log('✅ Customer deleted:', customerId);
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
                .from('products')
                .select('*')
                .eq('shop_id', shopId)
                .order('name', { ascending: true });
            if (error) throw error;
            console.log(`✅ Loaded ${data.length} products for shop ${shopId}`);
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllProducts failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }
    async function createProduct(productData) {
        try {
            const shopId = getCurrentShopId();
           
            const dataToInsert = {
                ...productData,
                shop_id: shopId
            };
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .insert([dataToInsert])
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Product created:', data);
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
                .from('products')
                .update(updates)
                .eq('id', productId)
                .eq('shop_id', shopId)
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Product updated:', data);
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
                .from('products')
                .delete()
                .eq('id', productId)
                .eq('shop_id', shopId);
            if (error) throw error;
            console.log('✅ Product deleted:', productId);
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
                .from('suppliers')
                .select('*')
                .eq('shop_id', shopId)
                .order('name', { ascending: true });
            if (error) throw error;
            console.log(`✅ Loaded ${data.length} suppliers for shop ${shopId}`);
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllSuppliers failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }
    async function createSupplier(supplierData) {
        try {
            const shopId = getCurrentShopId();
           
            const dataToInsert = {
                ...supplierData,
                shop_id: shopId
            };
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers')
                .insert([dataToInsert])
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Supplier created:', data);
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
                .from('suppliers')
                .update(updates)
                .eq('id', supplierId)
                .eq('shop_id', shopId)
                .select()
                .single();
            if (error) throw error;
            console.log('✅ Supplier updated:', data);
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
                .from('suppliers')
                .delete()
                .eq('id', supplierId)
                .eq('shop_id', shopId);
            if (error) throw error;
            console.log('✅ Supplier deleted:', supplierId);
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
                .from('sales')
                .select('*, sale_items(*)')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });
            if (error) throw error;
            console.log(`✅ Loaded ${data.length} sales for shop ${shopId}`);
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
            // Insert sale
            const saleDataToInsert = {
                ...saleData,
                shop_id: shopId,
                user_id: currentUser.id
            };
            console.log('Inserting sale with data:', saleDataToInsert);
            const { data: sale, error: saleError } = await window.DukaPOS.supabaseClient
                .from('sales')
                .insert([saleDataToInsert])
                .select()
                .single();
            if (saleError) throw saleError;
            // Insert sale items
            const itemsToInsert = items.map(item => ({
                ...item,
                sale_id: sale.id,
                shop_id: shopId
            }));
            console.log('Inserting sale items:', itemsToInsert);
            const { error: itemsError } = await window.DukaPOS.supabaseClient
                .from('sale_items')
                .insert(itemsToInsert);
            if (itemsError) throw itemsError;
            console.log('✅ Sale created:', sale);
            return { success: true, data: sale };
        } catch (err) {
            console.error('createSale failed:', err);
            return { success: false, error: err.message };
        }
    }
    async function updateInventory(productId, quantity, operation = 'subtract') {
        try {
            const shopId = getCurrentShopId();
            // Get current stock
            const { data: product, error: fetchError } = await window.DukaPOS.supabaseClient
                .from('products')
                .select('stock')
                .eq('id', productId)
                .eq('shop_id', shopId)
                .single();
            if (fetchError) throw fetchError;
            const newStock = operation === 'subtract'
                ? product.stock - quantity
                : product.stock + quantity;
            const { error: updateError } = await window.DukaPOS.supabaseClient
                .from('products')
                .update({ stock: newStock })
                .eq('id', productId)
                .eq('shop_id', shopId);
            if (updateError) throw updateError;
            console.log(`✅ Inventory updated: Product ${productId}, new stock: ${newStock}`);
            return { success: true, newStock };
        } catch (err) {
            console.error('updateInventory failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // EXPENSES TRACKING
    // ============================================================================
    /**
     * Get all expenses for the current shop
     */
    async function getAllExpenses() {
        try {
            const shopId = getCurrentShopId();
           
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .select('*')
                .eq('shop_id', shopId)
                .order('date', { ascending: false });
            if (error) throw error;
            console.log(`✅ Loaded ${data.length} expenses for shop ${shopId}`);
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getAllExpenses failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    /**
     * Create a new expense record - UPDATED VERSION
     */
    async function createExpense(expenseData) {
        try {
            const shopId = getCurrentShopId();
           
            // Use the modernized auth retrieval function
            const authUserId = await getCurrentAuthUserId();

            const dataToInsert = {
                category: expenseData.category,
                amount: expenseData.amount,
                description: expenseData.description,
                date: expenseData.date,
                shop_id: shopId,
                user_id: authUserId,
                created_at: new Date().toISOString()
            };

            console.log('Creating expense with data:', dataToInsert);

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .insert([dataToInsert])
                .select()
                .single();

            if (error) throw error;
           
            console.log('✅ Expense created:', data);
            return { success: true, data };
        } catch (err) {
            console.error('createExpense failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get expenses by date range for the current shop
     */
    async function getExpensesByDateRange(startDate, endDate) {
        try {
            const shopId = getCurrentShopId();
           
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .select('*')
                .eq('shop_id', shopId)
                .gte('date', startDate)
                .lte('date', endDate)
                .order('date', { ascending: false });
            if (error) throw error;
           
            console.log(`✅ Loaded ${data.length} expenses for date range ${startDate} to ${endDate}`);
            return { success: true, data: data || [] };
        } catch (err) {
            console.error('getExpensesByDateRange failed:', err);
            return { success: false, error: err.message, data: [] };
        }
    }

    /**
     * Update an expense
     */
    async function updateExpense(expenseId, updates) {
        try {
            const shopId = getCurrentShopId();
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .update(updates)
                .eq('id', expenseId)
                .eq('shop_id', shopId)
                .select()
                .single();
            if (error) throw error;
           
            console.log('✅ Expense updated:', data);
            return { success: true, data };
        } catch (err) {
            console.error('updateExpense failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Delete an expense
     */
    async function deleteExpense(expenseId) {
        try {
            const shopId = getCurrentShopId();
            const { error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .delete()
                .eq('id', expenseId)
                .eq('shop_id', shopId);
            if (error) throw error;
           
            console.log('✅ Expense deleted:', expenseId);
            return { success: true };
        } catch (err) {
            console.error('deleteExpense failed:', err);
            return { success: false, error: err.message };
        }
    }

    /**
     * Get expense statistics (today, week, month, year)
     */
    async function getExpenseStats() {
        try {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const weekStart = new Date(today);
            weekStart.setDate(today.getDate() - today.getDay());
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const yearStart = new Date(now.getFullYear(), 0, 1);
            const formatDate = (date) => date.toISOString().split('T')[0];

            // Get today's expenses
            const todayResult = await getExpensesByDateRange(
                formatDate(today),
                formatDate(now)
            );
           
            // Get week's expenses
            const weekResult = await getExpensesByDateRange(
                formatDate(weekStart),
                formatDate(now)
            );
           
            // Get month's expenses
            const monthResult = await getExpensesByDateRange(
                formatDate(monthStart),
                formatDate(now)
            );
           
            // Get year's expenses
            const yearResult = await getExpensesByDateRange(
                formatDate(yearStart),
                formatDate(now)
            );

            const calculateTotal = (expenses) =>
                expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);

            return {
                success: true,
                data: {
                    today: calculateTotal(todayResult.data || []),
                    week: calculateTotal(weekResult.data || []),
                    month: calculateTotal(monthResult.data || []),
                    year: calculateTotal(yearResult.data || [])
                }
            };
        } catch (err) {
            console.error('getExpenseStats failed:', err);
            return { success: false, error: err.message };
        }
    }

    // ============================================================================
    // Export to global scope
    // ============================================================================
    window.dataModule = {
        // Customers
        getAllCustomers,
        createCustomer,
        updateCustomer,
        deleteCustomer,
        // Products
        getAllProducts,
        createProduct,
        updateProduct,
        deleteProduct,
        // Suppliers
        getAllSuppliers,
        createSupplier,
        updateSupplier,
        deleteSupplier,
        // Sales
        getAllSales,
        createSale,
        updateInventory,
        // Expenses
        getAllExpenses,
        createExpense,
        getExpensesByDateRange,
        updateExpense,
        deleteExpense,
        getExpenseStats,
        // Utility
        getCurrentShopId
    };

    console.log('✅ Data Module loaded (multi-tenant filtering enabled with expenses tracking - updated auth handling)');
})();