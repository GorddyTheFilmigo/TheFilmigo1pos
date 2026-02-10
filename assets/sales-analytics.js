// ════════════════════════════════════════════════════════════════
// DUKA POS - SALES ANALYTICS (MULTI-TENANT)
// ════════════════════════════════════════════════════════════════

(function() {
    if (window.salesAnalytics && window.salesAnalytics.initialized) {
        console.log('salesAnalytics already initialized');
        return;
    }

    window.salesAnalytics = window.salesAnalytics || {};
    window.salesAnalytics.initialized = true;

    /**
     * Get current shop ID from auth module
     */
    function getCurrentShopId() {
        const shop = window.authModule.getCurrentShop();
        if (!shop || !shop.id) {
            throw new Error('No shop context found. Please login again.');
        }
        return shop.id;
    }

    /**
     * Get sales by cashier (filtered by current shop)
     */
    async function getSalesByCashier(userId = null, startDate = null, endDate = null) {
        try {
            const shopId = getCurrentShopId();

            let query = window.DukaPOS.supabaseClient
                .from('sales')
                .select(`
                    *,
                    users!inner (
                        id,
                        username,
                        full_name,
                        role,
                        shop_id
                    ),
                    sale_items (
                        *,
                        products (
                            name,
                            cost,
                            price
                        )
                    )
                `)
                .eq('shop_id', shopId)  // ✅ FILTER BY SHOP
                .order('created_at', { ascending: false });

            // Filter by user if specified
            if (userId) {
                query = query.eq('user_id', userId);
            }

            // Filter by date range if specified
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

            // Calculate profit for each sale
            const salesWithProfit = (data || []).map(sale => {
                let totalCost = 0;
                let totalRevenue = sale.total_amount || 0;

                if (sale.sale_items && Array.isArray(sale.sale_items)) {
                    sale.sale_items.forEach(item => {
                        const cost = item.products?.cost || 0;
                        totalCost += cost * item.quantity;
                    });
                }

                return {
                    ...sale,
                    total_cost: totalCost,
                    total_profit: totalRevenue - totalCost,
                    profit_margin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
                };
            });

            return {
                success: true,
                sales: salesWithProfit
            };

        } catch (error) {
            console.error('❌ Get sales by cashier failed:', error);
            return {
                success: false,
                error: error.message,
                sales: []
            };
        }
    }

    /**
     * Get commission report for all cashiers (filtered by current shop)
     */
    async function getCommissionReport(startDate, endDate, commissionRate = 10) {
        try {
            const shopId = getCurrentShopId();

            // Get all sales from current shop in date range
            const salesResult = await getSalesByCashier(null, startDate, endDate);

            if (!salesResult.success) {
                throw new Error(salesResult.error);
            }

            const sales = salesResult.sales;

            // Group by user
            const cashierMap = {};

            sales.forEach(sale => {
                const userId = sale.user_id;
                const userName = sale.users?.full_name || 'Unknown';
                const username = sale.users?.username || 'unknown';

                if (!cashierMap[userId]) {
                    cashierMap[userId] = {
                        user_id: userId,
                        username: username,
                        full_name: userName,
                        total_transactions: 0,
                        items_sold: 0,
                        total_revenue: 0,
                        total_cost: 0,
                        total_profit: 0,
                        profit_margin: 0,
                        commission_rate: commissionRate,
                        commission_amount: 0
                    };
                }

                const cashier = cashierMap[userId];
                cashier.total_transactions++;
                cashier.items_sold += sale.items_sold || 0;
                cashier.total_revenue += sale.total_amount || 0;
                cashier.total_cost += sale.total_cost || 0;
                cashier.total_profit += sale.total_profit || 0;
            });

            // Calculate commission and profit margin
            const report = Object.values(cashierMap).map(cashier => {
                cashier.profit_margin = cashier.total_revenue > 0 
                    ? (cashier.total_profit / cashier.total_revenue * 100) 
                    : 0;
                cashier.commission_amount = calculateCommission(cashier.total_profit, commissionRate);
                return cashier;
            });

            // Sort by total profit descending
            report.sort((a, b) => b.total_profit - a.total_profit);

            return {
                success: true,
                report: report
            };

        } catch (error) {
            console.error('❌ Get commission report failed:', error);
            return {
                success: false,
                error: error.message,
                report: []
            };
        }
    }

    /**
     * Get detailed report for a specific cashier (filtered by current shop)
     */
    async function getDetailedCashierReport(userId, startDate, endDate) {
        try {
            const shopId = getCurrentShopId();

            // Verify user belongs to current shop
            const { data: user } = await window.DukaPOS.supabaseClient
                .from('users')
                .select('id, username, full_name, role, shop_id')
                .eq('id', userId)
                .eq('shop_id', shopId)
                .single();

            if (!user) {
                throw new Error('User not found or does not belong to your shop');
            }

            // Get sales for this user
            const salesResult = await getSalesByCashier(userId, startDate, endDate);

            if (!salesResult.success) {
                throw new Error(salesResult.error);
            }

            const sales = salesResult.sales;

            // Calculate summary
            const summary = {
                total_transactions: sales.length,
                items_sold: sales.reduce((sum, s) => sum + (s.items_sold || 0), 0),
                total_revenue: sales.reduce((sum, s) => sum + (s.total_amount || 0), 0),
                total_cost: sales.reduce((sum, s) => sum + (s.total_cost || 0), 0),
                total_profit: sales.reduce((sum, s) => sum + (s.total_profit || 0), 0),
                profit_margin: 0
            };

            summary.profit_margin = summary.total_revenue > 0 
                ? (summary.total_profit / summary.total_revenue * 100) 
                : 0;

            // Group by day
            const dailyMap = {};

            sales.forEach(sale => {
                const date = sale.created_at.split('T')[0];

                if (!dailyMap[date]) {
                    dailyMap[date] = {
                        date: date,
                        transactions: 0,
                        items: 0,
                        revenue: 0,
                        cost: 0,
                        profit: 0
                    };
                }

                const day = dailyMap[date];
                day.transactions++;
                day.items += sale.items_sold || 0;
                day.revenue += sale.total_amount || 0;
                day.cost += sale.total_cost || 0;
                day.profit += sale.total_profit || 0;
            });

            const dailyBreakdown = Object.values(dailyMap).sort((a, b) => 
                new Date(a.date) - new Date(b.date)
            );

            return {
                success: true,
                report: {
                    user: user,
                    summary: summary,
                    dailyBreakdown: dailyBreakdown,
                    transactions: sales
                }
            };

        } catch (error) {
            console.error('❌ Get detailed cashier report failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Calculate commission based on profit and rate
     */
    function calculateCommission(profit, rate) {
        return (profit * rate) / 100;
    }

    /**
     * Get sales summary for current shop
     */
    async function getSalesSummary(startDate = null, endDate = null) {
        try {
            const salesResult = await getSalesByCashier(null, startDate, endDate);

            if (!salesResult.success) {
                throw new Error(salesResult.error);
            }

            const sales = salesResult.sales;

            const summary = {
                total_transactions: sales.length,
                total_items_sold: sales.reduce((sum, s) => sum + (s.items_sold || 0), 0),
                total_revenue: sales.reduce((sum, s) => sum + (s.total_amount || 0), 0),
                total_cost: sales.reduce((sum, s) => sum + (s.total_cost || 0), 0),
                total_profit: sales.reduce((sum, s) => sum + (s.total_profit || 0), 0),
                profit_margin: 0,
                average_transaction: 0,
                payment_methods: {}
            };

            summary.profit_margin = summary.total_revenue > 0 
                ? (summary.total_profit / summary.total_revenue * 100) 
                : 0;

            summary.average_transaction = sales.length > 0 
                ? summary.total_revenue / sales.length 
                : 0;

            // Count payment methods
            sales.forEach(sale => {
                const method = sale.payment_method || 'unknown';
                summary.payment_methods[method] = (summary.payment_methods[method] || 0) + 1;
            });

            return {
                success: true,
                summary: summary,
                sales: sales
            };

        } catch (error) {
            console.error('❌ Get sales summary failed:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ────────────────────────────────────────────────────────────
    // EXPOSE MODULE
    // ────────────────────────────────────────────────────────────

    Object.assign(window.salesAnalytics, {
        getSalesByCashier,
        getCommissionReport,
        getDetailedCashierReport,
        calculateCommission,
        getSalesSummary,
        getCurrentShopId
    });

    console.log('📊 Multi-tenant salesAnalytics loaded');
})();