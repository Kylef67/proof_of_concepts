import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { apiService, ApiResponse } from '../services/apiService';
import storageService from '../services/storageService';
import networkManager from '../services/networkManager';
import syncService from '../services/syncService';
import type { Category as ApiCategory, Transaction as ApiTransaction } from '../services/apiService';
import type { OfflineOperation, OperationType, ResourceType } from '../types/offline';

// Frontend types that match the server models
export interface Account {
  id: string;
  name: string;
  description?: string;
  balance?: number;
  type?: 'debit' | 'credit' | 'wallet';
  icon?: string;
  color?: string;
  includeInTotal?: boolean;
  creditLimit?: number;
  order?: number;
  isDeleted?: boolean;
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  type?: 'Income' | 'Expense';
  parent?: string | null;
  order?: number;
  balance?: number;
  directBalance?: number;
  transactionCount?: number;
  directTransactionCount?: number;
  subcategories?: Category[];
}

export interface Transaction {
  id: string;
  transactionDate: string;
  fromAccount: string;
  toAccount?: string;
  category?: string;
  amount: number;
  description?: string;
  notes?: string;
  type?: 'income' | 'expense' | 'transfer';
  isDeleted?: boolean;
}

// Context type
interface DataContextType {
  // State
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  loading: boolean;
  error: string | null;
  isInitialized: boolean;
  isLoadingData: boolean;
  
  // Offline/Sync state
  isOnline: boolean;
  isSyncing: boolean;
  offlineQueueCount: number;
  lastSyncTime: number;

  // Account methods
  addAccount: (account: Omit<Account, 'id'>) => Promise<void>;
  updateAccount: (account: Account) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  reorderAccounts: (accounts: Account[]) => Promise<void>;

  // Category methods
  addCategory: (category: Omit<Category, 'id'>) => Promise<void>;
  updateCategory: (category: Category) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  reorderCategories: (categories: Category[]) => Promise<void>;
  getSubcategories: (parentId: string) => Promise<Category[]>;
  getCategoryTransactions: (categoryId: string, fromDate?: string, toDate?: string) => Promise<any>;

  // Transaction methods
  addTransaction: (transaction: Omit<Transaction, 'id'>) => Promise<void>;
  updateTransaction: (transaction: Transaction) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  getTransactions: (params?: any) => Promise<Transaction[]>;

  // Utility methods
  refreshData: () => Promise<void>;
  triggerSync: () => Promise<void>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Provider component
interface DataProviderProps {
  children: ReactNode;
}

export function DataProvider({ children }: DataProviderProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Offline/Sync state
  const [isOnline, setIsOnline] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [offlineQueue, setOfflineQueue] = useState<OfflineOperation[]>([]);
  const [lastSyncTimestamp, setLastSyncTimestamp] = useState<number>(0);
  const [deviceId, setDeviceId] = useState<string>('');

  // Computed properties
  const isLoadingData = loading;
  const offlineQueueCount = offlineQueue.length;

  // Load all data on mount
  useEffect(() => {
    initializeApp();
  }, []);

  // Network state listener
  useEffect(() => {
    const unsubscribe = networkManager.addListener((connected) => {
      console.log(`📡 Network state changed in DataContext: ${connected ? 'Online' : 'Offline'}`);
      setIsOnline(connected);
      
      // When coming online, trigger sync
      if (connected && offlineQueue.length > 0) {
        console.log('🔄 Coming online with pending operations, triggering sync');
        triggerSync();
      }
    });

    // Set initial state
    setIsOnline(networkManager.getIsConnected());

    return unsubscribe;
  }, [offlineQueue.length]);

  // Periodic sync when online (every 30 seconds)
  useEffect(() => {
    if (!isOnline || !isInitialized) return;

    const interval = setInterval(() => {
      console.log('⏰ Periodic sync check');
      triggerSync();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isOnline, isInitialized]);

  const initializeApp = async () => {
    setLoading(true);
    try {
      // Load device ID
      const id = await storageService.getDeviceId();
      setDeviceId(id);

      // Load data from local storage first (for immediate UI)
      const localData = await storageService.loadAllData();
      setAccounts(localData.accounts);
      setCategories(localData.categories);
      setTransactions(localData.transactions);

      // Load offline queue and sync timestamp
      const queue = await storageService.getOfflineQueue();
      setOfflineQueue(queue);
      
      const timestamp = await storageService.getLastSyncTimestamp();
      setLastSyncTimestamp(timestamp);

      console.log(`📦 Loaded from storage: ${localData.accounts.length} accounts, ${localData.categories.length} categories, ${localData.transactions.length} transactions, ${queue.length} queued operations`);

      // If online, fetch from API
      if (networkManager.getIsConnected()) {
        await loadAllData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize app');
      console.error('Error initializing app:', err);
    } finally {
      setLoading(false);
      setIsInitialized(true);
    }
  };

  const loadAllData = async () => {
    try {
      const [accountsResponse, categoriesResponse, transactionsResponse] = await Promise.all([
        apiService.getAllAccounts(),
        apiService.getAllCategories(),
        apiService.getAllTransactions()
      ]);
      
      if (accountsResponse.success && accountsResponse.data) {
        setAccounts(accountsResponse.data);
        await storageService.saveAccounts(accountsResponse.data);
      }
      if (categoriesResponse.success && categoriesResponse.data) {
        setCategories(categoriesResponse.data);
        await storageService.saveCategories(categoriesResponse.data);
      }
      if (transactionsResponse.success && transactionsResponse.data) {
        setTransactions(transactionsResponse.data);
        await storageService.saveTransactions(transactionsResponse.data);
      }

      // Update sync timestamp
      const newTimestamp = Date.now();
      setLastSyncTimestamp(newTimestamp);
      await storageService.saveLastSyncTimestamp(newTimestamp);

      // Check for any errors
      if (!accountsResponse.success) {
        throw new Error(accountsResponse.error || 'Failed to load accounts');
      }
      if (!categoriesResponse.success) {
        throw new Error(categoriesResponse.error || 'Failed to load categories');
      }
      if (!transactionsResponse.success) {
        throw new Error(transactionsResponse.error || 'Failed to load transactions');
      }
    } catch (err) {
      console.error('Error loading data:', err);
      // Don't throw - we have local data
    }
  };

  // Helper: Add operation to offline queue
  const queueOperation = async (
    type: OperationType,
    resource: ResourceType,
    data: any,
    expectedSyncVersion?: number
  ): Promise<void> => {
    const operation: OfflineOperation = {
      id: `op-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      operationId: `op-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`,
      type,
      resource,
      data,
      localTimestamp: Date.now(),
      expectedSyncVersion,
      retryCount: 0,
      deviceId
    };

    const newQueue = [...offlineQueue, operation];
    setOfflineQueue(newQueue);
    await storageService.saveOfflineQueue(newQueue);

    console.log(`📝 Queued ${type} operation for ${resource}:`, data.id || data.name, `(expected v${expectedSyncVersion})`);
  };

  // Trigger manual or automatic sync
  const triggerSync = async (): Promise<void> => {
    if (!isOnline || isSyncing || offlineQueue.length === 0) {
      // Still fetch changes even if no queue
      if (isOnline && !isSyncing && offlineQueue.length === 0) {
        console.log('🔄 No queue, but checking for server changes');
        const id = await storageService.getDeviceId();
        const changes = await syncService.performIncrementalSync(lastSyncTimestamp, id);
        
        if (changes) {
          const merged = syncService.mergeServerChanges(
            accounts,
            categories,
            transactions,
            changes
          );
          
          setAccounts(merged.accounts);
          setCategories(merged.categories);
          setTransactions(merged.transactions);
          
          await storageService.saveAllData(
            merged.accounts,
            merged.categories,
            merged.transactions
          );
          
          setLastSyncTimestamp(changes.currentTimestamp);
          await storageService.saveLastSyncTimestamp(changes.currentTimestamp);
        }
      }
      return;
    }

    setIsSyncing(true);
    setError(null);

    try {
      console.log('🔄 Starting full sync...');
      
      const result = await syncService.fullSync(
        accounts,
        categories,
        transactions,
        offlineQueue,
        lastSyncTimestamp
      );

      if (result) {
        // Update state with synced data
        setAccounts(result.accounts);
        setCategories(result.categories);
        setTransactions(result.transactions);
        setOfflineQueue(result.newQueue);
        setLastSyncTimestamp(result.newTimestamp);

        // Save to storage
        await storageService.saveAllData(
          result.accounts,
          result.categories,
          result.transactions
        );
        await storageService.saveOfflineQueue(result.newQueue);
        await storageService.saveLastSyncTimestamp(result.newTimestamp);

        if (result.conflicts > 0) {
          console.log(`⚠️  Sync completed with ${result.conflicts} conflicts (server wins)`);
        } else {
          console.log('✅ Sync completed successfully');
        }
      } else {
        setError('Sync failed. Will retry when connection is stable.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Sync failed';
      setError(errorMessage);
      console.error('❌ Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Account methods
  const addAccount = async (accountData: Omit<Account, 'id'>) => {
    try {
      // Optimistic update
      const tempAccount: Account = {
        ...accountData,
        id: `temp-${Date.now()}`, // Temporary ID for optimistic update
      };
      const newAccounts = [...accounts, tempAccount];
      setAccounts(newAccounts);
      await storageService.saveAccounts(newAccounts);

      if (!isOnline) {
        // Queue for later
        await queueOperation('CREATE', 'account', tempAccount);
        console.log('📴 Offline: Account creation queued');
        return;
      }

      // API call
      const response = await apiService.createAccount(accountData);
      
      if (response.success && response.data?.data) {
        // Replace temp account with real one
        const updatedAccounts = newAccounts.map(acc => 
          acc.id === tempAccount.id ? response.data!.data : acc
        );
        setAccounts(updatedAccounts);
        await storageService.saveAccounts(updatedAccounts);
      } else {
        throw new Error(response.error || 'Failed to create account');
      }
    } catch (err) {
      // If online and failed, revert optimistic update
      if (isOnline) {
        setAccounts(accounts);
        await storageService.saveAccounts(accounts);
      } else {
        // If offline, keep the change and queue it
        await queueOperation('CREATE', 'account', {
          ...accountData,
          id: `temp-${Date.now()}`
        });
      }
      setError(err instanceof Error ? err.message : 'Failed to add account');
      throw err;
    }
  };

  const updateAccount = async (account: Account) => {
    try {
      // Find current account for syncVersion
      const currentAccount = accounts.find(a => a.id === account.id);
      const expectedSyncVersion = currentAccount?.syncVersion || 1;

      // Optimistic update
      const originalAccounts = [...accounts];
      const updatedAccounts = accounts.map(acc =>
        acc.id === account.id ? account : acc
      );
      setAccounts(updatedAccounts);
      await storageService.saveAccounts(updatedAccounts);

      if (!isOnline) {
        await queueOperation('UPDATE', 'account', account, expectedSyncVersion);
        console.log('📴 Offline: Account update queued');
        return;
      }

      // API call
      const response = await apiService.updateAccount(account.id, account);

      if (!response.success) {
        // Revert optimistic update
        setAccounts(originalAccounts);
        await storageService.saveAccounts(originalAccounts);
        throw new Error(response.error || 'Failed to update account');
      }
    } catch (err) {
      if (isOnline) {
        await loadAllData();
      } else {
        const currentAccount = accounts.find(a => a.id === account.id);
        await queueOperation('UPDATE', 'account', account, currentAccount?.syncVersion || 1);
      }
      setError(err instanceof Error ? err.message : 'Failed to update account');
      throw err;
    }
  };

  const deleteAccount = async (id: string) => {
    try {
      // Find current account for syncVersion
      const currentAccount = accounts.find(a => a.id === id);
      const expectedSyncVersion = currentAccount?.syncVersion || 1;

      // Optimistic update - mark as deleted instead of removing
      const originalAccounts = [...accounts];
      const updatedAccounts = accounts.map(acc =>
        acc.id === id ? { ...acc, isDeleted: true } : acc
      );
      setAccounts(updatedAccounts);
      await storageService.saveAccounts(updatedAccounts);

      if (!isOnline) {
        await queueOperation('DELETE', 'account', { id, syncVersion: expectedSyncVersion }, expectedSyncVersion);
        console.log('📴 Offline: Account deletion queued');
        return;
      }

      // API call
      const response = await apiService.deleteAccount(id);

      if (!response.success) {
        // Revert optimistic update
        setAccounts(originalAccounts);
        await storageService.saveAccounts(originalAccounts);
        throw new Error(response.error || 'Failed to delete account');
      }
    } catch (err) {
      // Revert to original state on error
      if (isOnline) {
        await loadAllData();
      }
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      throw err;
    }
  };

  const reorderAccounts = async (reorderedAccounts: Account[]) => {
    try {
      // Optimistic update
      const originalAccounts = [...accounts];
      setAccounts(reorderedAccounts);
      await storageService.saveAccounts(reorderedAccounts);

      if (!isOnline) {
        // Queue multiple updates
        for (const account of reorderedAccounts) {
          const currentAccount = originalAccounts.find(a => a.id === account.id);
          await queueOperation('UPDATE', 'account', account, currentAccount?.syncVersion || 1);
        }
        console.log('📴 Offline: Account reordering queued');
        return;
      }

      // API call - use the order update endpoint
      const orderData = reorderedAccounts.map((account, index) => ({
        id: account.id,
        order: index
      }));
      
      const response = await apiService.updateAccountsOrder(orderData);
      
      if (!response.success) {
        // Revert optimistic update
        setAccounts(originalAccounts);
        await storageService.saveAccounts(originalAccounts);
        throw new Error(response.error || 'Failed to reorder accounts');
      }
    } catch (err) {
      if (isOnline) {
        await loadAllData();
      }
      setError(err instanceof Error ? err.message : 'Failed to reorder accounts');
      throw err;
    }
  };

  // Category methods
  const addCategory = async (categoryData: Omit<Category, 'id'>) => {
    try {
      const tempCategory: Category = { ...categoryData, id: `temp-${Date.now()}` };
      const newCategories = [...categories, tempCategory];
      setCategories(newCategories);
      await storageService.saveCategories(newCategories);

      if (!isOnline) {
        await queueOperation('CREATE', 'category', tempCategory);
        return;
      }

      const response = await apiService.createCategory(categoryData);
      if (response.success && response.data?.data) {
        const updated = newCategories.map(cat => cat.id === tempCategory.id ? response.data!.data : cat);
        setCategories(updated);
        await storageService.saveCategories(updated);
      } else {
        throw new Error(response.error || 'Failed to create category');
      }
    } catch (err) {
      if (isOnline) {
        setCategories(categories);
        await storageService.saveCategories(categories);
      } else {
        await queueOperation('CREATE', 'category', { ...categoryData, id: `temp-${Date.now()}` });
      }
      setError(err instanceof Error ? err.message : 'Failed to add category');
      throw err;
    }
  };

  const updateCategory = async (category: Category) => {
    try {
      const currentCategory = categories.find(c => c.id === category.id);
      const expectedSyncVersion = currentCategory?.syncVersion || 1;

      const originalCategories = [...categories];
      const updated = categories.map(cat => cat.id === category.id ? category : cat);
      setCategories(updated);
      await storageService.saveCategories(updated);

      if (!isOnline) {
        await queueOperation('UPDATE', 'category', category, expectedSyncVersion);
        return;
      }

      const response = await apiService.updateCategory(category.id, category);
      if (!response.success) {
        setCategories(originalCategories);
        await storageService.saveCategories(originalCategories);
        throw new Error(response.error || 'Failed to update category');
      }
    } catch (err) {
      if (isOnline) await loadAllData();
      else {
        const currentCategory = categories.find(c => c.id === category.id);
        await queueOperation('UPDATE', 'category', category, currentCategory?.syncVersion || 1);
      }
      setError(err instanceof Error ? err.message : 'Failed to update category');
      throw err;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const currentCategory = categories.find(c => c.id === id);
      const expectedSyncVersion = currentCategory?.syncVersion || 1;

      const originalCategories = [...categories];
      const updated = categories.filter(cat => cat.id !== id);
      setCategories(updated);
      await storageService.saveCategories(updated);

      if (!isOnline) {
        await queueOperation('DELETE', 'category', { id, syncVersion: expectedSyncVersion }, expectedSyncVersion);
        return;
      }

      const response = await apiService.deleteCategory(id);
      if (!response.success) {
        setCategories(originalCategories);
        await storageService.saveCategories(originalCategories);
        throw new Error(response.error || 'Failed to delete category');
      }
    } catch (err) {
      if (isOnline) {
        setCategories(categories);
        await storageService.saveCategories(categories);
      } else {
        const currentCategory = categories.find(c => c.id === id);
        await queueOperation('DELETE', 'category', { id, syncVersion: expectedSyncVersion }, currentCategory?.syncVersion || 1);
      }
      setError(err instanceof Error ? err.message : 'Failed to delete category');
      throw err;
    }
  };

  const reorderCategories = async (reorderedCategories: Category[]) => {
    try {
      const originalCategories = [...categories];
      setCategories(reorderedCategories);
      await storageService.saveCategories(reorderedCategories);

      if (!isOnline) {
        for (const category of reorderedCategories) {
          const currentCategory = originalCategories.find(c => c.id === category.id);
          await queueOperation('UPDATE', 'category', category, currentCategory?.syncVersion || 1);
        }
        return;
      }

      const updatePromises = reorderedCategories.map((category, index) =>
        apiService.updateCategory(category.id, { order: index })
      );
      const responses = await Promise.all(updatePromises);
      const failedResponse = responses.find(response => !response.success);
      if (failedResponse) {
        setCategories(originalCategories);
        await storageService.saveCategories(originalCategories);
        throw new Error(failedResponse.error || 'Failed to reorder categories');
      }
    } catch (err) {
      if (isOnline) await loadAllData();
      setError(err instanceof Error ? err.message : 'Failed to reorder categories');
      throw err;
    }
  };

  // Transaction methods
  const addTransaction = async (transactionData: Omit<Transaction, 'id'>) => {
    try {
      const tempTransaction: Transaction = { ...transactionData, id: `temp-${Date.now()}` };
      const newTransactions = [...transactions, tempTransaction];
      setTransactions(newTransactions);
      await storageService.saveTransactions(newTransactions);

      if (!isOnline) {
        await queueOperation('CREATE', 'transaction', tempTransaction);
        return;
      }

      const response = await apiService.createTransaction(transactionData);
      if (response.success && response.data?.data) {
        const updated = newTransactions.map(trans => trans.id === tempTransaction.id ? response.data!.data : trans);
        setTransactions(updated);
        await storageService.saveTransactions(updated);
      } else {
        throw new Error(response.error || 'Failed to create transaction');
      }
    } catch (err) {
      if (isOnline) {
        setTransactions(transactions);
        await storageService.saveTransactions(transactions);
      } else {
        await queueOperation('CREATE', 'transaction', { ...transactionData, id: `temp-${Date.now()}` });
      }
      setError(err instanceof Error ? err.message : 'Failed to add transaction');
      throw err;
    }
  };

  const updateTransaction = async (transaction: Transaction) => {
    try {
      const currentTransaction = transactions.find(t => t.id === transaction.id);
      const expectedSyncVersion = currentTransaction?.syncVersion || 1;

      const originalTransactions = [...transactions];
      const updated = transactions.map(trans => trans.id === transaction.id ? transaction : trans);
      setTransactions(updated);
      await storageService.saveTransactions(updated);

      if (!isOnline) {
        await queueOperation('UPDATE', 'transaction', transaction, expectedSyncVersion);
        return;
      }

      const response = await apiService.updateTransaction(transaction.id, transaction);
      if (!response.success) {
        setTransactions(originalTransactions);
        await storageService.saveTransactions(originalTransactions);
        throw new Error(response.error || 'Failed to update transaction');
      }
    } catch (err) {
      if (isOnline) await loadAllData();
      else {
        const currentTransaction = transactions.find(t => t.id === transaction.id);
        await queueOperation('UPDATE', 'transaction', transaction, currentTransaction?.syncVersion || 1);
      }
      setError(err instanceof Error ? err.message : 'Failed to update transaction');
      throw err;
    }
  };

  const deleteTransaction = async (id: string) => {
    try {
      const currentTransaction = transactions.find(t => t.id === id);
      const expectedSyncVersion = currentTransaction?.syncVersion || 1;

      const originalTransactions = [...transactions];
      const updated = transactions.filter(trans => trans.id !== id);
      setTransactions(updated);
      await storageService.saveTransactions(updated);

      if (!isOnline) {
        await queueOperation('DELETE', 'transaction', { id, syncVersion: expectedSyncVersion }, expectedSyncVersion);
        return;
      }

      const response = await apiService.deleteTransaction(id);
      if (!response.success) {
        setTransactions(originalTransactions);
        await storageService.saveTransactions(originalTransactions);
        throw new Error(response.error || 'Failed to delete transaction');
      }
    } catch (err) {
      if (isOnline) {
        setTransactions(transactions);
        await storageService.saveTransactions(transactions);
      } else {
        const currentTransaction = transactions.find(t => t.id === id);
        await queueOperation('DELETE', 'transaction', { id, syncVersion: expectedSyncVersion }, currentTransaction?.syncVersion || 1);
      }
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
      throw err;
    }
  };

  const refreshData = async () => {
    await loadAllData();
  };

  // Additional API methods
  const getSubcategories = async (parentId: string): Promise<Category[]> => {
    try {
      const response = await apiService.getSubcategories(parentId);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get subcategories');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get subcategories');
      return [];
    }
  };

  const getCategoryTransactions = async (categoryId: string, fromDate?: string, toDate?: string): Promise<any> => {
    try {
      const response = await apiService.getCategoryTransactions(categoryId, fromDate, toDate);
      if (response.success && response.data) {
        return response.data;
      }
      throw new Error(response.error || 'Failed to get category transactions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get category transactions');
      return null;
    }
  };

  const getTransactions = async (params?: any): Promise<Transaction[]> => {
    try {
      const response = await apiService.getAllTransactions(params);
      if (response.success && response.data) {
        // Filter out deleted transactions
        return response.data.filter(t => !t.isDeleted);
      }
      throw new Error(response.error || 'Failed to get transactions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get transactions');
      return [];
    }
  };

  const value: DataContextType = {
    // State
    accounts,
    categories,
    transactions,
    loading,
    error,
    isInitialized,
    isLoadingData,

    // Offline/Sync state
    isOnline,
    isSyncing,
    offlineQueueCount,
    lastSyncTime: lastSyncTimestamp,

    // Account methods
    addAccount,
    updateAccount,
    deleteAccount,
    reorderAccounts,

    // Category methods
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    getSubcategories,
    getCategoryTransactions,

    // Transaction methods
    addTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactions,

    // Utility methods
    refreshData,
    triggerSync,
  };

  // Expose sync state for testing (development/test only)
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      (window as any).__DATA_CONTEXT__ = {
        isSyncing,
        offlineQueueCount,
        lastSyncTime: lastSyncTimestamp,
        isOnline,
        triggerSync,
        // Test-only method to manually set online/offline state
        setOfflineForTesting: (online: boolean) => {
          console.log(`🧪 Test: Setting isOnline to ${online}`);
          setIsOnline(online);
        }
      };
    }
  }, [isSyncing, offlineQueueCount, lastSyncTimestamp, isOnline, triggerSync]);

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
}

// Hook to use the context
export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
}