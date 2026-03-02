import { create } from "zustand";

export const useGalleryStore = create((set, get) => ({
  // Gallery items
  items: [],
  loading: false,
  page: 1,
  totalPages: 1,
  hasMore: false,
  setItems: (items) => set({ items }),
  appendItems: (items) => set((state) => ({ items: [...state.items, ...items] })),
  setLoading: (loading) => set({ loading }),
  setPage: (page) => set({ page }),
  setTotalPages: (total) => set({ totalPages: total }),
  setHasMore: (hasMore) => set({ hasMore }),

  // Filters
  filter: "all", // 'all' | 'free' | 'premium'
  filterTag: null,
  sortBy: "newest", // 'newest' | 'popular' | 'price_asc'
  setFilter: (filter) => set({ filter }),
  setFilterTag: (tag) => set({ filterTag: tag }),
  setSortBy: (sortBy) => set({ sortBy }),

  // Selected item
  selectedItem: null,
  setSelectedItem: (item) => set({ selectedItem: item }),

  // Like state
  likedItems: new Set(),
  toggleLike: (id) =>
    set((state) => {
      const next = new Set(state.likedItems);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { likedItems: next };
    }),
}));
