/**
 * Offline Manager - Handles offline state, queuing, and sync
 * File: offline-manager.js
 */

(function() {
    'use strict';

    const OFFLINE_STORAGE_KEY = 'offline_transactions';
    const PRODUCTS_CACHE_KEY = 'cached_products';
    const CUSTOMERS_CACHE_KEY = 'cached_customers';

    class OfflineManager {
        constructor() {
            this.isOnline = navigator.onLine;
            this.queuedTransactions = [];
            this.syncInProgress = false;
            this.serviceWorkerReady = false;
            
            this.init();
        }

        async init() {
            // Load queued transactions from localStorage
            this.loadQueue();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Register service worker
            await this.registerServiceWorker();
            
            // Update UI
            this.updateOnlineStatus();
            
            // Try to sync on startup if online
            if (this.isOnline) {
                setTimeout(() => this.syncNow(), 2000);
            }
            
            console.log('✅ Offline Manager initialized');
        }

        setupEventListeners() {
            // Online/Offline events
            window.addEventListener('online', () => {
                console.log('🌐 Connection restored');
                this.isOnline = true;
                this.updateOnlineStatus();
                this.syncNow();
            });

            window.addEventListener('offline', () => {
                console.log('📴 Connection lost');
                this.isOnline = false;
                this.updateOnlineStatus();
            });

            // Service worker messages
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('message', (event) => {
                    this.handleServiceWorkerMessage(event.data);
                });
            }

            // Visibility change - sync when tab becomes visible
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden && this.isOnline && this.queuedTransactions.length > 0) {
                    this.syncNow();
                }
            });
        }

        async registerServiceWorker() {
            if (!('serviceWorker' in navigator)) {
                console.warn('Service Worker not supported');
                return;
            }

            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                console.log('✅ Service Worker registered:', registration.scope);
                this.serviceWorkerReady = true;

                // Request background sync permission
                if ('sync' in registration) {
                    try {
                        await registration.sync.register('sync-offline-queue');
                        console.log('✅ Background sync registered');
                    } catch (err) {
                        console.log('Background sync not available:', err);
                    }
                }

                // Periodic sync (if supported)
                if ('periodicSync' in registration) {
                    try {
                        await registration.periodicSync.register('check-sync-queue', {
                            minInterval: 60000 // Check every minute
                        });
                        console.log('✅ Periodic sync registered');
                    } catch (err) {
                        console.log('Periodic sync not available:', err);
                    }
                }
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }

        handleServiceWorkerMessage(data) {
            switch (data.type) {
                case 'TRANSACTION_QUEUED':
                    this.showNotification('Transaction queued for sync', 'info');
                    this.updateQueueCount();
                    break;
                
                case 'SYNC_COMPLETE':
                    this.showNotification(
                        `Synced ${data.success} of ${data.total} transactions`,
                        data.failed > 0 ? 'warning' : 'success'
                    );
                    this.loadQueue(); // Refresh queue from storage
                    this.updateQueueCount();
                    break;
                
                case 'QUEUE_COUNT':
                    this.displayQueueCount(data.count);
                    break;
            }
        }

        updateOnlineStatus() {
            const statusIndicator = document.getElementById('onlineStatus');
            const queueInfo = document.getElementById('queueInfo');
            
            if (statusIndicator) {
                if (this.isOnline) {
                    statusIndicator.innerHTML = '🟢 Online';
                    statusIndicator.className = 'status-online';
                } else {
                    statusIndicator.innerHTML = '🔴 Offline Mode';
                    statusIndicator.className = 'status-offline';
                }
            }

            if (queueInfo && this.queuedTransactions.length > 0) {
                queueInfo.style.display = 'block';
            }

            this.updateQueueCount();
        }

        updateQueueCount() {
            const queueCount = document.getElementById('queueCount');
            if (queueCount) {
                const count = this.queuedTransactions.length;
                queueCount.textContent = count;
                queueCount.style.display = count > 0 ? 'inline' : 'none';
            }

            // Also get count from service worker IndexedDB
            if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'GET_QUEUE_COUNT'
                });
            }
        }

        displayQueueCount(count) {
            const queueBadge = document.getElementById('syncQueueBadge');
            if (queueBadge) {
                queueBadge.textContent = count;
                queueBadge.style.display = count > 0 ? 'block' : 'none';
            }
        }

        async queueTransaction(type, data) {
            const transaction = {
                id: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
                type: type,
                data: data,
                timestamp: new Date().toISOString(),
                attempts: 0,
                status: 'pending'
            };

            this.queuedTransactions.push(transaction);
            this.saveQueue();
            this.updateQueueCount();

            console.log('📝 Transaction queued:', transaction.id);
            this.showNotification('Transaction saved offline. Will sync when online.', 'info');

            return transaction;
        }

        loadQueue() {
            try {
                const stored = localStorage.getItem(OFFLINE_STORAGE_KEY);
                this.queuedTransactions = stored ? JSON.parse(stored) : [];
                console.log(`📦 Loaded ${this.queuedTransactions.length} queued transactions`);
            } catch (error) {
                console.error('Failed to load queue:', error);
                this.queuedTransactions = [];
            }
        }

        saveQueue() {
            try {
                localStorage.setItem(OFFLINE_STORAGE_KEY, JSON.stringify(this.queuedTransactions));
            } catch (error) {
                console.error('Failed to save queue:', error);
            }
        }

        async syncNow() {
            if (this.syncInProgress) {
                console.log('⏳ Sync already in progress');
                return;
            }

            if (!this.isOnline) {
                console.log('📴 Cannot sync - offline');
                return;
            }

            if (this.queuedTransactions.length === 0) {
                console.log('✅ No transactions to sync');
                return;
            }

            this.syncInProgress = true;
            this.showNotification('Syncing offline transactions...', 'info');

            console.log(`🔄 Syncing ${this.queuedTransactions.length} transactions...`);

            let successCount = 0;
            let failCount = 0;

            for (const transaction of [...this.queuedTransactions]) {
                try {
                    await this.syncTransaction(transaction);
                    
                    // Remove from queue on success
                    this.queuedTransactions = this.queuedTransactions.filter(
                        t => t.id !== transaction.id
                    );
                    successCount++;
                    
                    console.log('✅ Synced:', transaction.id);
                } catch (error) {
                    console.error('❌ Sync failed:', transaction.id, error);
                    
                    // Increment attempt count
                    transaction.attempts++;
                    
                    // Remove if too many attempts
                    if (transaction.attempts >= 5) {
                        console.error('⚠️  Max attempts reached, removing:', transaction.id);
                        this.queuedTransactions = this.queuedTransactions.filter(
                            t => t.id !== transaction.id
                        );
                    }
                    
                    failCount++;
                }
            }

            this.saveQueue();
            this.syncInProgress = false;
            this.updateQueueCount();

            // Show result
            if (successCount > 0 || failCount > 0) {
                const message = `Sync complete: ${successCount} synced${failCount > 0 ? `, ${failCount} failed` : ''}`;
                this.showNotification(message, failCount > 0 ? 'warning' : 'success');
            }

            // Also trigger service worker sync
            if (this.serviceWorkerReady && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'SYNC_NOW' });
            }
        }

        async syncTransaction(transaction) {
            switch (transaction.type) {
                case 'sale':
                    return await this.syncSale(transaction.data);
                case 'product':
                    return await this.syncProduct(transaction.data);
                case 'customer':
                    return await this.syncCustomer(transaction.data);
                case 'expense':
                    return await this.syncExpense(transaction.data);
                default:
                    throw new Error('Unknown transaction type: ' + transaction.type);
            }
        }

        async syncSale(saleData) {
            const result = await window.dataModule.createSale(saleData.sale, saleData.items);
            if (!result.success) {
                throw new Error(result.error);
            }

            // Update inventory
            for (const item of saleData.items) {
                await window.dataModule.updateInventory(item.product_id, item.quantity, 'subtract');
            }

            return result;
        }

        async syncProduct(productData) {
            if (productData.id) {
                return await window.dataModule.updateProduct(productData.id, productData);
            } else {
                return await window.dataModule.createProduct(productData);
            }
        }

        async syncCustomer(customerData) {
            if (customerData.id) {
                return await window.dataModule.updateCustomer(customerData.id, customerData);
            } else {
                return await window.dataModule.createCustomer(customerData);
            }
        }

        async syncExpense(expenseData) {
            return await window.dataModule.createExpense(expenseData);
        }

        // Cache products for offline use
        cacheProducts(products) {
            try {
                localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(products));
                console.log(`📦 Cached ${products.length} products`);
            } catch (error) {
                console.error('Failed to cache products:', error);
            }
        }

        getCachedProducts() {
            try {
                const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
                return cached ? JSON.parse(cached) : [];
            } catch (error) {
                console.error('Failed to get cached products:', error);
                return [];
            }
        }

        // Cache customers for offline use
        cacheCustomers(customers) {
            try {
                localStorage.setItem(CUSTOMERS_CACHE_KEY, JSON.stringify(customers));
                console.log(`📦 Cached ${customers.length} customers`);
            } catch (error) {
                console.error('Failed to cache customers:', error);
            }
        }

        getCachedCustomers() {
            try {
                const cached = localStorage.getItem(CUSTOMERS_CACHE_KEY);
                return cached ? JSON.parse(cached) : [];
            } catch (error) {
                console.error('Failed to get cached customers:', error);
                return [];
            }
        }

        showNotification(message, type = 'info') {
            // Create notification element
            const notification = document.createElement('div');
            notification.className = `offline-notification offline-notification-${type}`;
            notification.textContent = message;
            
            // Add to page
            document.body.appendChild(notification);
            
            // Remove after 4 seconds
            setTimeout(() => {
                notification.classList.add('fade-out');
                setTimeout(() => notification.remove(), 300);
            }, 4000);
        }

        getStatus() {
            return {
                online: this.isOnline,
                queued: this.queuedTransactions.length,
                syncing: this.syncInProgress,
                serviceWorker: this.serviceWorkerReady
            };
        }
    }

    // Create global instance
    window.offlineManager = new OfflineManager();

    console.log('✅ Offline Manager module loaded');
})();