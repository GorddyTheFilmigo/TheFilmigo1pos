// ════════════════════════════════════════════════════════════════
// DUKA POS - MULTI-TENANT DATA ACCESS LAYER
// ════════════════════════════════════════════════════════════════
// Use this module for ALL database operations to ensure shop isolation
// ════════════════════════════════════════════════════════════════

(function () {
    if (window.dataModule && window.dataModule.initialized) {
        console.log('dataModule already initialized – skipping');
        return;
    }

    window.dataModule = window.dataModule || {};
    window.dataModule.initialized = true;

    // Get current shop ID from authModule
    function getCurrentShopId() {
        const shop = window.authModule.getCurrentShop();
        if (!shop || !shop.id) {
            throw new Error('No shop context found. Please login again.');
        }
        return shop.id;
    }

    // ────────────────────────────────────────────────────────────
    // PRODUCTS
    // ────────────────────────────────────────────────────────────

    async function createProduct(productData) {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .insert([{
                    ...productData,
                    shop_id: shopId // ALWAYS add shop_id
                }])
                .select();

            if (error) throw error;
            console.log('✅ Product created for shop:', shopId);
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Create product failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllProducts() {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', shopId) // FILTER by shop
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Get products failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getProductById(productId) {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .select('*')
                .eq('id', productId)
                .eq('shop_id', shopId) // VERIFY shop ownership
                .single();

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Get product failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function updateProduct(productId, updates) {
        try {
            const shopId = getCurrentShopId();
            
            // Verify ownership first
            const { data: existing } = await window.DukaPOS.supabaseClient
                .from('products')
                .select('shop_id')
                .eq('id', productId)
                .single();

            if (!existing || existing.shop_id !== shopId) {
                throw new Error('Cannot update products from other shops');
            }

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .update(updates)
                .eq('id', productId)
                .eq('shop_id', shopId) // Double check
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Update product failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function deleteProduct(productId) {
        try {
            const shopId = getCurrentShopId();
            
            const { error } = await window.DukaPOS.supabaseClient
                .from('products')
                .delete()
                .eq('id', productId)
                .eq('shop_id', shopId); // VERIFY shop ownership

            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('❌ Delete product failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // SALES
    // ────────────────────────────────────────────────────────────

    async function createSale(saleData, saleItems) {
        try {
            const shopId = getCurrentShopId();
            const user = window.authModule.getCurrentUser();

            // Create sale record
            const { data: sale, error: saleError } = await window.DukaPOS.supabaseClient
                .from('sales')
                .insert([{
                    ...saleData,
                    shop_id: shopId,
                    user_id: user.id
                }])
                .select()
                .single();

            if (saleError) throw saleError;

            // Create sale items
            const itemsWithShopId = saleItems.map(item => ({
                ...item,
                sale_id: sale.id,
                shop_id: shopId
            }));

            const { error: itemsError } = await window.DukaPOS.supabaseClient
                .from('sale_items')
                .insert(itemsWithShopId);

            if (itemsError) throw itemsError;

            return { success: true, data: sale };
        } catch (error) {
            console.error('❌ Create sale failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllSales() {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('sales')
                .select(`
                    *,
                    sale_items (*)
                `)
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Get sales failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // CUSTOMERS
    // ────────────────────────────────────────────────────────────

    async function createCustomer(customerData) {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers')
                .insert([{
                    ...customerData,
                    shop_id: shopId
                }])
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Create customer failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllCustomers() {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers')
                .select('*')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Get customers failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // SUPPLIERS
    // ────────────────────────────────────────────────────────────

    async function createSupplier(supplierData) {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers')
                .insert([{
                    ...supplierData,
                    shop_id: shopId
                }])
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Create supplier failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllSuppliers() {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers')
                .select('*')
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Get suppliers failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // CATEGORIES
    // ────────────────────────────────────────────────────────────

    async function createCategory(categoryData) {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('categories')
                .insert([{
                    ...categoryData,
                    shop_id: shopId
                }])
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Create category failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllCategories() {
        try {
            const shopId = getCurrentShopId();
            
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('categories')
                .select('*')
                .eq('shop_id', shopId)
                .order('name');

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('❌ Get categories failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // INVENTORY
    // ────────────────────────────────────────────────────────────

    async function updateInventory(productId, quantity, operation = 'add') {
        try {
            const shopId = getCurrentShopId();
            
            // Verify product belongs to shop
            const { data: product } = await window.DukaPOS.supabaseClient
                .from('products')
                .select('stock_quantity, shop_id')
                .eq('id', productId)
                .single();

            if (!product || product.shop_id !== shopId) {
                throw new Error('Product not found or belongs to another shop');
            }

            const newQuantity = operation === 'add' 
                ? product.stock_quantity + quantity
                : product.stock_quantity - quantity;

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .update({ stock_quantity: newQuantity })
                .eq('id', productId)
                .eq('shop_id', shopId)
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Update inventory failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function updateCustomer(customerId, updates) {
        try {
            const shopId = getCurrentShopId();
            
            // Verify customer belongs to shop
            const { data: existing } = await window.DukaPOS.supabaseClient
                .from('customers')
                .select('shop_id')
                .eq('id', customerId)
                .single();

            if (!existing || existing.shop_id !== shopId) {
                throw new Error('Cannot update customers from other shops');
            }

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('customers')
                .update(updates)
                .eq('id', customerId)
                .eq('shop_id', shopId)
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Update customer failed:', error);
            return { success: false, error: error.message };
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
            return { success: true };
        } catch (error) {
            console.error('❌ Delete customer failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function updateSupplier(supplierId, updates) {
        try {
            const shopId = getCurrentShopId();
            
            const { data: existing } = await window.DukaPOS.supabaseClient
                .from('suppliers')
                .select('shop_id')
                .eq('id', supplierId)
                .single();

            if (!existing || existing.shop_id !== shopId) {
                throw new Error('Cannot update suppliers from other shops');
            }

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('suppliers')
                .update(updates)
                .eq('id', supplierId)
                .eq('shop_id', shopId)
                .select();

            if (error) throw error;
            return { success: true, data: data[0] };
        } catch (error) {
            console.error('❌ Update supplier failed:', error);
            return { success: false, error: error.message };
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
            return { success: true };
        } catch (error) {
            console.error('❌ Delete supplier failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // EXPENSES MANAGEMENT
    // ────────────────────────────────────────────────────────────

    async function createExpense(expenseData) {
        try {
            const shopId = getCurrentShopId();
            const currentUser = window.authModule.getCurrentUser();
            
            if (!currentUser || !currentUser.id) {
                throw new Error('User not authenticated');
            }

            const newExpense = {
                ...expenseData,
                shop_id: shopId,
                user_id: currentUser.id,  // Use the local user ID, not auth_user_id
                created_at: new Date().toISOString()
            };

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .insert([newExpense])
                .select()
                .single();

            if (error) throw error;

            return { success: true, data };
        } catch (error) {
            console.error('❌ createExpense failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function getAllExpenses(startDate = null, endDate = null) {
        try {
            const shopId = getCurrentShopId();

            let query = window.DukaPOS.supabaseClient
                .from('expenses')
                .select(`
                    *,
                    users (
                        id,
                        username,
                        full_name
                    )
                `)
                .eq('shop_id', shopId)
                .order('created_at', { ascending: false });

            // Filter by date range if provided
            if (startDate) {
                query = query.gte('created_at', startDate);
            }
            if (endDate) {
                const endDateTime = new Date(endDate);
                endDateTime.setHours(23, 59, 59, 999);
                query = query.lte('created_at', endDateTime.toISOString());
            }

            const { data, error } = await query;

            if (error) throw error;

            return { success: true, data: data || [] };
        } catch (error) {
            console.error('❌ Get expenses failed:', error);
            return { success: false, error: error.message, data: [] };
        }
    }

    async function updateExpense(expenseId, updates) {
        try {
            const shopId = getCurrentShopId();

            // Verify expense belongs to current shop
            const { data: existing } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .select('shop_id')
                .eq('id', expenseId)
                .single();

            if (!existing || existing.shop_id !== shopId) {
                throw new Error('Cannot update expenses from other shops');
            }

            const { data, error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .update(updates)
                .eq('id', expenseId)
                .eq('shop_id', shopId)
                .select()
                .single();

            if (error) throw error;

            return { success: true, data };
        } catch (error) {
            console.error('❌ Update expense failed:', error);
            return { success: false, error: error.message };
        }
    }

    async function deleteExpense(expenseId) {
        try {
            const shopId = getCurrentShopId();

            const { error } = await window.DukaPOS.supabaseClient
                .from('expenses')
                .delete()
                .eq('id', expenseId)
                .eq('shop_id', shopId);

            if (error) throw error;

            return { success: true };
        } catch (error) {
            console.error('❌ Delete expense failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ────────────────────────────────────────────────────────────
    // EXPOSE MODULE
    // ────────────────────────────────────────────────────────────

    Object.assign(window.dataModule, {
        getCurrentShopId,
        // Products
        createProduct,
        getAllProducts,
        getProductById,
        updateProduct,
        deleteProduct,
        // Sales
        createSale,
        getAllSales,
        // Customers
        createCustomer,
        getAllCustomers,
        updateCustomer,
        deleteCustomer,
        // Suppliers
        createSupplier,
        getAllSuppliers,
        updateSupplier,
        deleteSupplier,
        // Categories
        createCategory,
        getAllCategories,
        // Inventory
        updateInventory,
        // Expenses
        createExpense,
        getAllExpenses,
        updateExpense,
        deleteExpense
    });

    console.log('📦 Multi-tenant dataModule loaded');
})();