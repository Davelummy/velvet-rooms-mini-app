import { create } from "zustand";

export const useStoriesStore = create((set, get) => ({
  // Stories strip (grouped by model)
  storyGroups: [], // [{ model, stories: [], hasUnseen: bool }]
  stripLoading: false,
  setStoryGroups: (groups) => set({ storyGroups: groups }),
  setStripLoading: (loading) => set({ stripLoading: loading }),

  // Story viewer
  viewer: {
    open: false,
    groupIndex: 0,
    storyIndex: 0,
    paused: false,
  },
  openViewer: (groupIndex, storyIndex = 0) =>
    set({ viewer: { open: true, groupIndex, storyIndex, paused: false } }),
  closeViewer: () =>
    set({ viewer: { open: false, groupIndex: 0, storyIndex: 0, paused: false } }),
  nextStory: () =>
    set((state) => {
      const { viewer, storyGroups } = state;
      const group = storyGroups[viewer.groupIndex];
      if (!group) return state;
      if (viewer.storyIndex < group.stories.length - 1) {
        return { viewer: { ...viewer, storyIndex: viewer.storyIndex + 1 } };
      }
      // Move to next group
      if (viewer.groupIndex < storyGroups.length - 1) {
        return { viewer: { ...viewer, groupIndex: viewer.groupIndex + 1, storyIndex: 0 } };
      }
      // All done
      return { viewer: { ...viewer, open: false } };
    }),
  prevStory: () =>
    set((state) => {
      const { viewer } = state;
      if (viewer.storyIndex > 0) {
        return { viewer: { ...viewer, storyIndex: viewer.storyIndex - 1 } };
      }
      if (viewer.groupIndex > 0) {
        const prevGroup = state.storyGroups[viewer.groupIndex - 1];
        return {
          viewer: {
            ...viewer,
            groupIndex: viewer.groupIndex - 1,
            storyIndex: prevGroup ? prevGroup.stories.length - 1 : 0,
          },
        };
      }
      return state;
    }),
  pauseViewer: () =>
    set((state) => ({ viewer: { ...state.viewer, paused: true } })),
  resumeViewer: () =>
    set((state) => ({ viewer: { ...state.viewer, paused: false } })),

  // Seen story IDs
  seenStoryIds: new Set(),
  markSeen: (id) =>
    set((state) => ({ seenStoryIds: new Set([...state.seenStoryIds, id]) })),

  // Upload sheet
  uploadSheetOpen: false,
  setUploadSheetOpen: (open) => set({ uploadSheetOpen: open }),
}));
