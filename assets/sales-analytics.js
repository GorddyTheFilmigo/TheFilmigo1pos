// ════════════════════════════════════════════════════════════════
// DUKA POS - SALES ANALYTICS MODULE (CORRECT COLUMN NAMES)
// ════════════════════════════════════════════════════════════════

(function () {
    // Prevent re-loading issues
    if (window.salesAnalytics && window.salesAnalytics.initialized) {
        console.log('salesAnalytics module already initialized');
        return;
    }
    window.salesAnalytics = window.salesAnalytics || {};
    window.salesAnalytics.initialized = true;

    // ── GET SALES SUMMARY (total revenue, tax, count, etc.) ───────────────────────
    async function getSalesSummary(startDate = null, endDate = null) {
        try {
            let query = window.DukaPOS.supabaseClient
                .from('transactions')
                .select('total, tax, subtotal, transaction_date');

            if (startDate) query = query.gte('transaction_date', startDate);
            if (endDate) query = query.lte('transaction_date', endDate);

            const { data, error } = await query;

            if (error) {
                console.error('❌ Supabase error in getSalesSummary:', error);
                throw error;
            }

            const summary = data.reduce((acc, tx) => {
                acc.totalRevenue += tx.total || 0;
                acc.totalTax += tx.tax || 0;
                acc.transactionCount += 1;
                return acc;
            }, { 
                totalRevenue: 0, 
                totalTax: 0, 
                transactionCount: 0 
            });

            console.log('✅ Sales summary loaded:', summary);
            return { success: true, summary };
        } catch (error) {
            console.error('❌ Get sales summary failed:', error);
            return { 
                success: false, 
                error: error.message, 
                summary: { totalRevenue: 0, totalTax: 0, transactionCount: 0 } 
            };
        }
    }

    // ── GET SALES BY CASHIER (with profit calculations using cost) ───────────────────────
    async function getSalesByCashier(userId = null, startDate = null, endDate = null) {
        try {
            const currentUser = authModule.getCurrentUser();
           
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }
            console.log('🔍 Fetching sales...', { userId, startDate, endDate });
            
            // Build query using correct column names: price (not selling_price) and cost (not buying_price)
            let query = window.DukaPOS.supabaseClient
                .from('sales')
                .select(`
                    id,
                    total_amount,
                    items_sold,
                    payment_method,
                    created_at,
                    user_id,
                    users!inner(id, username, full_name, role),
                    sale_items(
                        id,
                        product_id,
                        quantity,
                        unit_price,
                        subtotal,
                        products(id, name, cost, price)
                    )
                `)
                .order('created_at', { ascending: false });
            
            // Apply filters
            if (userId) query = query.eq('user_id', userId);
            if (startDate) query = query.gte('created_at', startDate);
            if (endDate) query = query.lte('created_at', endDate);
            
            const { data: sales, error } = await query;
            
            if (error) {
                console.error('❌ Supabase error:', error);
                throw error;
            }
            
            console.log('📦 Fetched sales:', sales ? sales.length : 0);
            
            if (!sales || sales.length === 0) {
                console.log('⚠️ No sales found for the specified period');
                return { success: true, sales: [] };
            }
            
            // Calculate ACTUAL profit for each sale using cost column
            const salesWithProfit = sales.map(sale => {
                let totalProfit = 0;
                let totalCost = 0;
                
                if (sale.sale_items && Array.isArray(sale.sale_items)) {
                    sale.sale_items.forEach(item => {
                        const costPrice = item.products?.cost || 0;  // Using 'cost' column
                        const sellingPrice = item.unit_price;
                        const quantity = item.quantity;
                        
                        const itemCost = costPrice * quantity;
                        const itemRevenue = sellingPrice * quantity;
                        const itemProfit = itemRevenue - itemCost;
                        
                        totalCost += itemCost;
                        totalProfit += itemProfit;
                    });
                }
                
                return {
                    ...sale,
                    total_cost: totalCost,
                    total_profit: totalProfit,
                    profit_margin: sale.total_amount > 0 ? (totalProfit / sale.total_amount * 100).toFixed(2) : 0
                };
            });
            
            console.log('✅ Processed sales with ACTUAL profit:', salesWithProfit.length);
            return { success: true, sales: salesWithProfit };
            
        } catch (error) {
            console.error('❌ Get sales by cashier failed:', error);
            return { success: false, error: error.message, sales: [] };
        }
    }

    // ── GET CASHIER PERFORMANCE SUMMARY ──────────────────────────────────────
    async function getCashierPerformance(startDate = null, endDate = null) {
        try {
            const currentUser = authModule.getCurrentUser();
           
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }
            
            const salesResult = await getSalesByCashier(null, startDate, endDate);
           
            if (!salesResult.success) {
                throw new Error(salesResult.error);
            }
            
            const sales = salesResult.sales;
            
            // Group by cashier
            const cashierStats = {};
            sales.forEach(sale => {
                const cashierId = sale.user_id;
                const cashierName = sale.users?.full_name || 'Unknown';
                const cashierUsername = sale.users?.username || 'unknown';
                
                if (!cashierStats[cashierId]) {
                    cashierStats[cashierId] = {
                        user_id: cashierId,
                        username: cashierUsername,
                        full_name: cashierName,
                        total_sales: 0,
                        total_revenue: 0,
                        total_cost: 0,
                        total_profit: 0,
                        total_transactions: 0,
                        items_sold: 0,
                        average_sale: 0,
                        profit_margin: 0
                    };
                }
                
                cashierStats[cashierId].total_transactions += 1;
                cashierStats[cashierId].total_revenue += sale.total_amount;
                cashierStats[cashierId].total_cost += sale.total_cost;
                cashierStats[cashierId].total_profit += sale.total_profit;
                cashierStats[cashierId].items_sold += sale.items_sold;
            });
            
            // Calculate averages and margins
            const cashiers = Object.values(cashierStats).map(cashier => {
                cashier.average_sale = cashier.total_transactions > 0
                    ? cashier.total_revenue / cashier.total_transactions
                    : 0;
                cashier.profit_margin = cashier.total_revenue > 0
                    ? (cashier.total_profit / cashier.total_revenue * 100)
                    : 0;
                return cashier;
            });
            
            // Sort by total profit (highest first)
            cashiers.sort((a, b) => b.total_profit - a.total_profit);
            
            return { success: true, cashiers };
            
        } catch (error) {
            console.error('❌ Get cashier performance failed:', error);
            return { success: false, error: error.message, cashiers: [] };
        }
    }

    // ── CALCULATE COMMISSION ─────────────────────────────────────────────────
    function calculateCommission(profit, commissionRate) {
        return profit * (commissionRate / 100);
    }

    // ── GET COMMISSION REPORT ────────────────────────────────────────────────
    async function getCommissionReport(startDate, endDate, commissionRate = 10) {
        try {
            const performanceResult = await getCashierPerformance(startDate, endDate);
           
            if (!performanceResult.success) {
                throw new Error(performanceResult.error);
            }
            
            const cashiers = performanceResult.cashiers.map(cashier => {
                const commission = calculateCommission(cashier.total_profit, commissionRate);
               
                return {
                    ...cashier,
                    commission_rate: commissionRate,
                    commission_amount: commission
                };
            });
            
            return { success: true, report: cashiers };
            
        } catch (error) {
            console.error('❌ Get commission report failed:', error);
            return { success: false, error: error.message, report: [] };
        }
    }

    // ── GET DETAILED CASHIER REPORT ──────────────────────────────────────────
    async function getDetailedCashierReport(userId, startDate, endDate) {
        try {
            const currentUser = authModule.getCurrentUser();
           
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }
            
            // Get user info
            const { data: user, error: userError } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('*')
                .eq('id', userId)
                .single();
            
            if (userError) throw userError;
            
            // Get sales
            const salesResult = await getSalesByCashier(userId, startDate, endDate);
           
            if (!salesResult.success) {
                throw new Error(salesResult.error);
            }
            
            const sales = salesResult.sales;
            
            // Calculate summary
            const summary = {
                total_transactions: sales.length,
                total_revenue: sales.reduce((sum, s) => sum + s.total_amount, 0),
                total_cost: sales.reduce((sum, s) => sum + s.total_cost, 0),
                total_profit: sales.reduce((sum, s) => sum + s.total_profit, 0),
                items_sold: sales.reduce((sum, s) => sum + s.items_sold, 0),
                average_sale: 0,
                profit_margin: 0
            };
            
            summary.average_sale = summary.total_transactions > 0
                ? summary.total_revenue / summary.total_transactions
                : 0;
            
            summary.profit_margin = summary.total_revenue > 0
                ? (summary.total_profit / summary.total_revenue * 100)
                : 0;
            
            // Group sales by day
            const salesByDay = {};
            sales.forEach(sale => {
                const date = new Date(sale.created_at).toISOString().split('T')[0];
                if (!salesByDay[date]) {
                    salesByDay[date] = {
                        date,
                        transactions: 0,
                        revenue: 0,
                        cost: 0,
                        profit: 0,
                        items: 0
                    };
                }
                salesByDay[date].transactions += 1;
                salesByDay[date].revenue += sale.total_amount;
                salesByDay[date].cost += sale.total_cost;
                salesByDay[date].profit += sale.total_profit;
                salesByDay[date].items += sale.items_sold;
            });
            
            const dailyBreakdown = Object.values(salesByDay).sort((a, b) =>
                new Date(b.date) - new Date(a.date)
            );
            
            return {
                success: true,
                report: {
                    user,
                    summary,
                    sales,
                    dailyBreakdown
                }
            };
            
        } catch (error) {
            console.error('❌ Get detailed cashier report failed:', error);
            return { success: false, error: error.message };
        }
    }

    // ── GET TOP SELLING PRODUCTS BY CASHIER ──────────────────────────────────
    async function getTopProductsByCashier(userId, startDate = null, endDate = null, limit = 10) {
        try {
            const currentUser = authModule.getCurrentUser();
           
            if (!['administrator', 'manager'].includes(currentUser.role)) {
                throw new Error('Insufficient permissions');
            }
            
            // Build query for sale_items with correct column names
            let query = window.DukaPOS.supabaseClient
                .from('sale_items')
                .select(`
                    *,
                    products(id, name, cost, price),
                    sales!inner(user_id, created_at)
                `)
                .eq('sales.user_id', userId);
            
            if (startDate) query = query.gte('sales.created_at', startDate);
            if (endDate) query = query.lte('sales.created_at', endDate);
            
            const { data: items, error } = await query;
            
            if (error) throw error;
            
            // Group by product
            const productStats = {};
            items.forEach(item => {
                const productId = item.product_id;
                const productName = item.products?.name || 'Unknown';
                const costPrice = item.products?.cost || 0;  // Using 'cost' column
                const sellingPrice = item.unit_price;
                
                if (!productStats[productId]) {
                    productStats[productId] = {
                        product_id: productId,
                        product_name: productName,
                        quantity_sold: 0,
                        revenue: 0,
                        cost: 0,
                        profit: 0
                    };
                }
                
                productStats[productId].quantity_sold += item.quantity;
                productStats[productId].revenue += item.subtotal;
                productStats[productId].cost += (costPrice * item.quantity);
                productStats[productId].profit += (item.subtotal - (costPrice * item.quantity));
            });
            
            const products = Object.values(productStats)
                .sort((a, b) => b.profit - a.profit)
                .slice(0, limit);
            
            return { success: true, products };
            
        } catch (error) {
            console.error('❌ Get top products by cashier failed:', error);
            return { success: false, error: error.message, products: [] };
        }
    }

    // ── EXPOSE FUNCTIONS TO GLOBAL SCOPE ─────────────────────────────────────
    Object.assign(window.salesAnalytics, {
        getSalesSummary,
        getSalesByCashier,
        getCashierPerformance,
        calculateCommission,
        getCommissionReport,
        getDetailedCashierReport,
        getTopProductsByCashier
    });

    console.log('✅ SalesAnalytics module loaded (CORRECT COLUMNS: price & cost)');
})();