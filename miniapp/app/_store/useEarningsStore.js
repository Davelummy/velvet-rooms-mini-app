import { create } from "zustand";

export const useEarningsStore = create((set) => ({
  // Summary
  summary: null,
  setSummary: (summary) => set({ summary }),

  // Monthly breakdown
  monthly: [],
  setMonthly: (monthly) => set({ monthly }),

  // Transactions
  transactions: [],
  transactionsLoading: false,
  transactionsPage: 1,
  transactionsHasMore: false,
  setTransactions: (transactions) => set({ transactions }),
  appendTransactions: (transactions) =>
    set((state) => ({ transactions: [...state.transactions, ...transactions] })),
  setTransactionsLoading: (loading) => set({ transactionsLoading: loading }),
  setTransactionsPage: (page) => set({ transactionsPage: page }),
  setTransactionsHasMore: (hasMore) => set({ transactionsHasMore: hasMore }),

  // Top fans
  topFans: [],
  setTopFans: (fans) => set({ topFans: fans }),

  // Loading state
  loading: false,
  setLoading: (loading) => set({ loading }),

  // Category filter
  category: "all", // 'all' | 'sessions' | 'content' | 'tips' | 'gifts'
  setCategory: (category) => set({ category }),
}));
