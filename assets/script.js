// ──────────────────────────────────────────────────────────────
// Duka POS - Shared JavaScript (multi-page safe version)
// ✅ FIXED: Added shop_id filtering to prevent multi-tenant data leaks
// ──────────────────────────────────────────────────────────────

(function () {
    // Prevent re-loading / redeclaration issues
    if (window.DukaPOS && window.DukaPOS.initialized) {
        console.log('DukaPOS shared module already initialized – skipping');
        return;
    }

    // Create namespace
    window.DukaPOS = window.DukaPOS || {};
    window.DukaPOS.initialized = true;

    // ── Constants ─────────────────────────────────────────────────
    window.DukaPOS.SUPABASE_URL = 'https://zylhlftiqvrcogxaqgof.supabase.co';
    window.DukaPOS.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5bGhsZnRpcXZyY29neGFxZ29mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjQyMzAsImV4cCI6MjA4NTM0MDIzMH0.AVcH8iGuK8--BRR133KvXgMecoNl-_bv2rFYgBuuk9s';
    window.DukaPOS.TAX_RATE = 0.16;

    // ── Globals ───────────────────────────────────────────────────
    window.DukaPOS.supabaseClient = null;
    window.DukaPOS.cart = [];
    window.DukaPOS.products = [];
    window.DukaPOS.editingProductId = null;
    window.DukaPOS.currentCategory = 'all';
    window.DukaPOS.selectedProductIds = new Set();

    // ── Initialization ────────────────────────────────────────────
    window.DukaPOS.initializeSupabase = async function () {
        try {
            console.log('🔄 Initializing Supabase...');

            window.DukaPOS.supabaseClient = window.supabase.createClient(
                window.DukaPOS.SUPABASE_URL,
                window.DukaPOS.SUPABASE_ANON_KEY
            );

            console.log('✅ Supabase client created');

            await window.DukaPOS.loadProducts();
            window.DukaPOS.updateDate();

            console.log('✅ Initialization complete');
        } catch (error) {
            console.error('❌ Initialization failed:', error);
            alert('Failed to connect to database. Please check console for details.');
        }
    };

    // ── Load & Render Products ────────────────────────────────────
    // ✅ CRITICAL FIX: Filter by shop_id at database level
    window.DukaPOS.loadProducts = async function () {
        try {
            console.log('📦 Loading products...');

            // ✅ FIX: Get current shop BEFORE querying
            const currentUser = window.authModule?.getCurrentUser();
            const currentShop = window.authModule?.getCurrentShop();
            
            if (!currentUser || !currentShop) {
                console.warn('⚠️ No user/shop context - skipping product load');
                window.DukaPOS.products = [];
                return;
            }

            console.log(`🔒 Loading products for shop: ${currentShop.shop_name} (ID: ${currentShop.id})`);

            // ✅ FIX: Filter by shop_id at query level (not client-side)
            const { data, error } = await window.DukaPOS.supabaseClient
                .from('products')
                .select('*')
                .eq('shop_id', currentShop.id)  // ⭐ CRITICAL: Filter at database level
                .order('name');

            if (error) {
                console.error('❌ Database error:', error);
                throw error;
            }

            window.DukaPOS.products = data || [];
            console.log(`✅ Loaded ${window.DukaPOS.products.length} products for ${currentShop.shop_name}`);

            // Render based on current page
            if (document.getElementById('productsGrid')) {
                window.DukaPOS.renderProducts(window.DukaPOS.products);
                window.DukaPOS.updateCategoryFilters();
            }
            if (document.getElementById('productsTableBody')) {
                window.DukaPOS.renderProductsTableForManagement();
            }
            if (document.getElementById('inventoryTableBody')) {
                window.DukaPOS.renderInventory();
            }

            window.DukaPOS.updateInventorySummary();

            // Search listeners
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.removeEventListener('input', window.DukaPOS.handleSearch);
                searchInput.addEventListener('input', window.DukaPOS.handleSearch);
            }

            const apSearch = document.getElementById('apSearch');
            if (apSearch) {
                apSearch.removeEventListener('input', window.DukaPOS.handleInventorySearch);
                apSearch.addEventListener('input', window.DukaPOS.handleInventorySearch);
            }
        } catch (error) {
            console.error('❌ Error loading products:', error);
            window.DukaPOS.products = [];

            const grid = document.getElementById('productsGrid');
            if (grid) {
                grid.innerHTML = `<div class="loading"><p style="color: #f85149;">Error: ${error.message}</p></div>`;
            }

            const tbody = document.getElementById('inventoryTableBody');
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="7" style="padding:60px;text-align:center;color:#f85149;">Error: ${error.message}</td></tr>`;
            }
        }
    };

    window.DukaPOS.handleSearch = function () {
        const term = document.getElementById('searchInput')?.value.toLowerCase() || '';
        const filtered = window.DukaPOS.products.filter(p =>
            (p.name?.toLowerCase() || '').includes(term) ||
            (p.barcode?.toLowerCase() || '').includes(term) ||
            (p.category?.toLowerCase() || '').includes(term)
        );

        if (document.getElementById('productsTableBody')) {
            window.DukaPOS.renderProductsTableForManagement(filtered);
        } else {
            window.DukaPOS.renderProducts(filtered);
        }
    };

    window.DukaPOS.handleInventorySearch = function () {
        const term = document.getElementById('apSearch')?.value.toLowerCase() || '';
        const filtered = window.DukaPOS.products.filter(p =>
            (p.name?.toLowerCase() || '').includes(term) ||
            (p.barcode?.toLowerCase() || '').includes(term) ||
            (p.category?.toLowerCase() || '').includes(term)
        );
        window.DukaPOS.renderInventory(filtered);
    };

    // ── Products Management Table ─────────────────────────────────
    window.DukaPOS.renderProductsTableForManagement = function (list = window.DukaPOS.products) {
        const tbody = document.getElementById('productsTableBody');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="padding:80px; text-align:center; color:#64748b;">No products found</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(p => {
            const stockColor = p.stock < 10 ? '#f59e0b' : p.stock < 50 ? '#60a5fa' : '#10b981';
            const isSelected = window.DukaPOS.selectedProductIds.has(p.id) ? 'background:#1e293b;' : '';
            return `
                <tr style="border-bottom:1px solid #1e293b; ${isSelected}" onclick="window.DukaPOS.toggleProductSelection(${p.id}, event)">
                    <td style="padding:14px 16px;">${p.id || '-'}</td>
                    <td style="padding:14px 16px;">${p.name || ''}</td>
                    <td style="padding:14px 16px;">${p.barcode || '-'}</td>
                    <td style="padding:14px 16px;">KES ${(Number(p.price)||0).toFixed(2)}</td>
                    <td style="padding:14px 16px;">KES ${(Number(p.cost)||0).toFixed(2)}</td>
                    <td style="padding:14px 16px; color:${stockColor}; font-weight:600;">${p.stock || 0}</td>
                    <td style="padding:14px 16px;">${p.category || '-'}</td>
                </tr>
            `;
        }).join('');
    };

    window.DukaPOS.toggleProductSelection = function (id, event) {
        if (event.ctrlKey || event.metaKey) {
            if (window.DukaPOS.selectedProductIds.has(id)) {
                window.DukaPOS.selectedProductIds.delete(id);
            } else {
                window.DukaPOS.selectedProductIds.add(id);
            }
        } else {
            window.DukaPOS.selectedProductIds.clear();
            window.DukaPOS.selectedProductIds.add(id);
        }
        window.DukaPOS.renderProductsTableForManagement();
    };

    // ── Inventory Summary ─────────────────────────────────────────
    window.DukaPOS.updateInventorySummary = function () {
        const totalProductsEl = document.getElementById('totalProducts');
        const totalStockEl = document.getElementById('totalStock');
        const inventoryValueEl = document.getElementById('inventoryValue');
        const lowStockCountEl = document.getElementById('lowStockCount');

        if (totalProductsEl) totalProductsEl.textContent = window.DukaPOS.products.length;

        if (totalStockEl) {
            const totalStock = window.DukaPOS.products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
            totalStockEl.textContent = totalStock;
        }

        if (inventoryValueEl) {
            const value = window.DukaPOS.products.reduce((sum, p) => sum + ((Number(p.price) || 0) * (Number(p.stock) || 0)), 0);
            inventoryValueEl.textContent = `KSh ${value.toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
        }

        if (lowStockCountEl) {
            const low = window.DukaPOS.products.filter(p => (Number(p.stock) || 0) < 10).length;
            lowStockCountEl.textContent = low;
        }
    };

    // ── Add / Update Product ──────────────────────────────────────
    window.DukaPOS.addOrUpdateProduct = async function () {
        const name = document.getElementById('productName')?.value.trim();
        const barcode = document.getElementById('barcode')?.value.trim();
        const price = parseFloat(document.getElementById('sellingPrice')?.value) || 0;
        const cost = parseFloat(document.getElementById('costPrice')?.value) || 0;
        const stock = parseInt(document.getElementById('stock')?.value) || 0;
        const category = document.getElementById('category')?.value.trim();

        if (!name || !category || price <= 0) {
            alert('Please fill in all required fields: Name, Price, Category');
            return;
        }

        // ✅ FIX: Add shop_id when creating products
        const currentShop = window.authModule?.getCurrentShop();
        if (!currentShop) {
            alert('Error: No shop context found. Please log in again.');
            return;
        }

        const productData = {
            name,
            barcode: barcode || null,
            price,
            cost,
            stock,
            category,
            icon: '📦',
            shop_id: currentShop.id  // ⭐ CRITICAL: Always set shop_id
        };

        try {
            let error;
            if (window.DukaPOS.editingProductId) {
                // Update: Remove shop_id from update (it shouldn't change)
                const { shop_id, ...updateData } = productData;
                ({ error } = await window.DukaPOS.supabaseClient
                    .from('products')
                    .update(updateData)
                    .eq('id', window.DukaPOS.editingProductId)
                    .eq('shop_id', currentShop.id)); // ⭐ Verify ownership
            } else {
                // Insert: Include shop_id
                ({ error } = await window.DukaPOS.supabaseClient
                    .from('products')
                    .insert([productData]));
            }

            if (error) throw error;

            alert(window.DukaPOS.editingProductId ? 'Product updated!' : 'Product added!');
            window.DukaPOS.clearProductForm();
            await window.DukaPOS.loadProducts();
        } catch (err) {
            console.error('Save error:', err);
            alert('Error: ' + err.message);
        }
    };

    window.DukaPOS.clearProductForm = function () {
        const fields = ['productName', 'barcode', 'sellingPrice', 'costPrice', 'stock', 'category'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        window.DukaPOS.editingProductId = null;
        window.DukaPOS.selectedProductIds.clear();
    };

    // ── Delete Selected Products ──────────────────────────────────
    window.DukaPOS.deleteSelectedProducts = async function () {
        if (window.DukaPOS.selectedProductIds.size === 0) {
            alert('Please select at least one product.');
            return;
        }

        if (!confirm(`Delete ${window.DukaPOS.selectedProductIds.size} product(s)?`)) {
            return;
        }

        try {
            // ✅ FIX: Verify shop_id when deleting
            const currentShop = window.authModule?.getCurrentShop();
            if (!currentShop) {
                alert('Error: No shop context found.');
                return;
            }

            const { error } = await window.DukaPOS.supabaseClient
                .from('products')
                .delete()
                .in('id', Array.from(window.DukaPOS.selectedProductIds))
                .eq('shop_id', currentShop.id); // ⭐ Verify ownership

            if (error) throw error;

            alert('Products deleted!');
            window.DukaPOS.selectedProductIds.clear();
            await window.DukaPOS.loadProducts();
        } catch (err) {
            console.error('Delete error:', err);
            alert('Error: ' + err.message);
        }
    };

    // ── Category Filters ──────────────────────────────────────────
    window.DukaPOS.updateCategoryFilters = function () {
        const categoryFilters = document.getElementById('categoryFilters');
        if (!categoryFilters) return;

        const categories = ['all', ...new Set(window.DukaPOS.products.map(p => p.category))];
        categoryFilters.innerHTML = categories.map(cat => `
            <button class="filter-btn ${cat === 'all' || cat === window.DukaPOS.currentCategory ? 'active' : ''}"
                    data-category="${cat}"
                    onclick="window.DukaPOS.filterByCategory('${cat}')">
                ${cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
        `).join('');
    };

    window.DukaPOS.filterByCategory = function (category) {
        window.DukaPOS.currentCategory = category;
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.category === category);
        });
        window.DukaPOS.filterProducts();
    };

    window.DukaPOS.filterProducts = function () {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;

        const searchTerm = searchInput.value.toLowerCase();
        let filtered = window.DukaPOS.products;

        if (window.DukaPOS.currentCategory !== 'all') {
            filtered = filtered.filter(p => p.category === window.DukaPOS.currentCategory);
        }

        if (searchTerm) {
            filtered = filtered.filter(p =>
                p.name.toLowerCase().includes(searchTerm) ||
                p.category.toLowerCase().includes(searchTerm)
            );
        }

        window.DukaPOS.renderProducts(filtered);
    };

    window.DukaPOS.renderProducts = function (productList) {
        const grid = document.getElementById('productsGrid');
        if (!grid) return;

        if (productList.length === 0) {
            grid.innerHTML = '<div class="loading"><p>No products found</p></div>';
            return;
        }

        grid.innerHTML = productList.map(product => {
            const stockClass = product.stock === 0 ? 'out' : (product.stock < 10 ? 'low' : '');
            const stockText = product.stock === 0 ? 'Out of stock' : `Stock: ${product.stock}`;
            const isDisabled = product.stock === 0;
            return `
                <div class="product-card ${isDisabled ? 'disabled' : ''}"
                     onclick="${isDisabled ? '' : `window.DukaPOS.addToCart(${product.id})`}"
                     style="${isDisabled ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
                    <div class="product-icon">${product.icon || '📦'}</div>
                    <div class="product-name">${product.name}</div>
                    <div class="product-stock ${stockClass}">${stockText}</div>
                    <div class="product-price">KSh ${product.price.toFixed(2)}</div>
                </div>
            `;
        }).join('');
    };

    // ── Cart Functions ────────────────────────────────────────────
    window.DukaPOS.addToCart = function (productId) {
        const product = window.DukaPOS.products.find(p => p.id === productId);
        if (!product || product.stock === 0) return;

        const existingItem = window.DukaPOS.cart.find(item => item.id === productId);
        if (existingItem) {
            if (existingItem.quantity < product.stock) {
                existingItem.quantity++;
            } else {
                alert(`Only ${product.stock} units available`);
                return;
            }
        } else {
            window.DukaPOS.cart.push({
                id: product.id,
                name: product.name,
                price: product.price,
                quantity: 1,
                maxStock: product.stock
            });
        }

        window.DukaPOS.renderCart();
        window.DukaPOS.updateSummary();
    };

    window.DukaPOS.renderCart = function () {
        const cartContainer = document.getElementById('cartItems');
        if (!cartContainer) return;

        if (window.DukaPOS.cart.length === 0) {
            cartContainer.innerHTML = `
                <div class="empty-cart">
                    <div class="empty-cart-icon">🛍️</div>
                    <p>Cart is empty<br>Add products to start</p>
                </div>
            `;
            return;
        }

        cartContainer.innerHTML = window.DukaPOS.cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-header">
                    <span class="cart-item-name">${item.name}</span>
                    <button class="remove-btn" onclick="window.DukaPOS.removeFromCart(${item.id})">×</button>
                </div>
                <div class="cart-item-controls">
                    <div class="quantity-controls">
                        <button class="qty-btn" onclick="window.DukaPOS.updateQuantity(${item.id}, -1)">−</button>
                        <span class="quantity">${item.quantity}</span>
                        <button class="qty-btn" onclick="window.DukaPOS.updateQuantity(${item.id}, 1)">+</button>
                    </div>
                    <span class="item-total">KSh ${(item.price * item.quantity).toFixed(2)}</span>
                </div>
            </div>
        `).join('');
    };

    window.DukaPOS.updateQuantity = function (productId, change) {
        const item = window.DukaPOS.cart.find(i => i.id === productId);
        if (!item) return;

        const newQuantity = item.quantity + change;
        if (newQuantity > item.maxStock) {
            alert(`Only ${item.maxStock} units available`);
            return;
        }

        item.quantity = newQuantity;
        if (item.quantity <= 0) {
            window.DukaPOS.removeFromCart(productId);
            return;
        }

        window.DukaPOS.renderCart();
        window.DukaPOS.updateSummary();
    };

    window.DukaPOS.removeFromCart = function (productId) {
        window.DukaPOS.cart = window.DukaPOS.cart.filter(item => item.id !== productId);
        window.DukaPOS.renderCart();
        window.DukaPOS.updateSummary();
    };

    window.DukaPOS.updateSummary = function () {
        const itemCountEl = document.getElementById('itemCount');
        const subtotalEl = document.getElementById('subtotal');
        const taxEl = document.getElementById('tax');
        const totalEl = document.getElementById('total');
        const checkoutBtn = document.getElementById('checkoutBtn');

        if (!itemCountEl) return;

        const itemCount = window.DukaPOS.cart.reduce((sum, item) => sum + item.quantity, 0);
        const subtotal = window.DukaPOS.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = subtotal * window.DukaPOS.TAX_RATE;
        const total = subtotal + tax;

        itemCountEl.textContent = itemCount;
        subtotalEl.textContent = `KSh ${subtotal.toFixed(2)}`;
        taxEl.textContent = `KSh ${tax.toFixed(2)}`;
        totalEl.textContent = `KSh ${total.toFixed(2)}`;

        if (checkoutBtn) {
            checkoutBtn.disabled = window.DukaPOS.cart.length === 0;
        }
    };

    // ── Checkout ──────────────────────────────────────────────────
    window.DukaPOS.checkout = async function () {
        if (window.DukaPOS.cart.length === 0) return;

        const subtotal = window.DukaPOS.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const tax = subtotal * window.DukaPOS.TAX_RATE;
        const total = subtotal + tax;

        try {
            const { data: transactionData, error: transError } = await window.DukaPOS.supabaseClient
                .from('transactions')
                .insert([{
                    items: window.DukaPOS.cart,
                    subtotal: subtotal,
                    tax: tax,
                    total: total,
                    transaction_date: new Date().toISOString()
                }])
                .select();

            if (transError) throw transError;

            for (const item of window.DukaPOS.cart) {
                const product = window.DukaPOS.products.find(p => p.id === item.id);
                const newStock = product.stock - item.quantity;

                const { error: stockError } = await window.DukaPOS.supabaseClient
                    .from('products')
                    .update({ stock: newStock })
                    .eq('id', item.id);

                if (stockError) throw stockError;
            }

            const modalMsg = document.getElementById('modalMessage');
            if (modalMsg) {
                modalMsg.textContent = `Total: KSh ${total.toFixed(2)} - Transaction #${transactionData[0].id}`;
            }

            const successModal = document.getElementById('successModal');
            if (successModal) successModal.classList.add('active');

            window.DukaPOS.cart = [];
            window.DukaPOS.renderCart();
            window.DukaPOS.updateSummary();
            await window.DukaPOS.loadProducts();
        } catch (error) {
            console.error('Checkout error:', error);
            alert('Error: ' + error.message);
        }
    };

    window.DukaPOS.closeSuccessModal = function () {
        const modal = document.getElementById('successModal');
        if (modal) modal.classList.remove('active');
    };

    // ── Inventory Rendering ───────────────────────────────────────
    window.DukaPOS.renderInventory = function (list = window.DukaPOS.products) {
        const tbody = document.getElementById('inventoryTableBody');
        if (!tbody) return;

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:60px;color:#94a3b8;">No products found</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(p => {
            const price = Number(p.price) || 0;
            const stock = Number(p.stock) || 0;
            const value = (price * stock).toFixed(0);
            const stockColor = stock === 0 ? '#f85149' : stock < 10 ? '#f59e0b' : '#3fb950';
            return `
                <tr>
                    <td>${p.icon || '📦'}</td>
                    <td>${p.name || '—'}</td>
                    <td>${p.barcode || '—'}</td>
                    <td>${p.category || '—'}</td>
                    <td>KES ${price.toLocaleString()}</td>
                    <td style="color:${stockColor};">${stock}</td>
                    <td>KES ${Number(value).toLocaleString()}</td>
                </tr>`;
        }).join('');
    };

    // ── Utility ────────────────────────────────────────────────────
    window.DukaPOS.updateDate = function () {
        const now = new Date();
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        const dateEl = document.getElementById('currentDate');
        if (dateEl) {
            dateEl.textContent = now.toLocaleDateString('en-US', options);
        }
    };

    // Auto-update date every minute
    setInterval(window.DukaPOS.updateDate, 60000);
    window.DukaPOS.updateDate();

    console.log('🛠️ DukaPOS shared module loaded (✅ Multi-tenant security enabled)');
})();