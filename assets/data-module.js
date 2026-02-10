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

        // Utility
        getCurrentShopId
    };

    console.log('✅ Data Module loaded (multi-tenant filtering enabled)');
})();