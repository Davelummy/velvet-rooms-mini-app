import { create } from "zustand";

export const useFollowStore = create((set, get) => ({
  // Following list
  following: [],
  followingLoading: false,
  followingPage: 1,
  followingHasMore: false,
  setFollowing: (following) => set({ following }),
  appendFollowing: (items) =>
    set((state) => ({ following: [...state.following, ...items] })),
  setFollowingLoading: (loading) => set({ followingLoading: loading }),
  setFollowingPage: (page) => set({ followingPage: page }),
  setFollowingHasMore: (hasMore) => set({ followingHasMore: hasMore }),

  // Followers list
  followers: [],
  followersLoading: false,
  followersPage: 1,
  followersHasMore: false,
  setFollowers: (followers) => set({ followers }),
  appendFollowers: (items) =>
    set((state) => ({ followers: [...state.followers, ...items] })),
  setFollowersLoading: (loading) => set({ followersLoading: loading }),
  setFollowersPage: (page) => set({ followersPage: page }),
  setFollowersHasMore: (hasMore) => set({ followersHasMore: hasMore }),

  // Follow actions
  followedIds: new Set(),
  setFollowedIds: (ids) => set({ followedIds: new Set(ids) }),
  toggleFollow: (modelId) =>
    set((state) => {
      const next = new Set(state.followedIds);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return { followedIds: next };
    }),
  isFollowing: (modelId) => get().followedIds.has(modelId),
}));
