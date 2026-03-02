import { create } from "zustand";

export const useFeedStore = create((set, get) => ({
  // Active feed tab
  activeTab: "foryou", // 'foryou' | 'following'
  setActiveTab: (tab) => set({ activeTab: tab }),

  // For You feed
  forYouItems: [],
  forYouCursor: null,
  forYouLoading: false,
  forYouHasMore: true,
  setForYouItems: (items) => set({ forYouItems: items }),
  appendForYouItems: (items) =>
    set((state) => ({ forYouItems: [...state.forYouItems, ...items] })),
  setForYouCursor: (cursor) => set({ forYouCursor: cursor }),
  setForYouLoading: (loading) => set({ forYouLoading: loading }),
  setForYouHasMore: (hasMore) => set({ forYouHasMore: hasMore }),

  // Following feed
  followingItems: [],
  followingCursor: null,
  followingLoading: false,
  followingHasMore: true,
  setFollowingItems: (items) => set({ followingItems: items }),
  appendFollowingItems: (items) =>
    set((state) => ({ followingItems: [...state.followingItems, ...items] })),
  setFollowingCursor: (cursor) => set({ followingCursor: cursor }),
  setFollowingLoading: (loading) => set({ followingLoading: loading }),
  setFollowingHasMore: (hasMore) => set({ followingHasMore: hasMore }),

  // Current visible index
  currentIndex: 0,
  setCurrentIndex: (index) => set({ currentIndex: index }),

  // Liked items
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
