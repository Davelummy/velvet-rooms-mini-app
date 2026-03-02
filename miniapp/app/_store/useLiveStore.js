import { create } from "zustand";

export const useLiveStore = create((set, get) => ({
  // Current live stream
  currentStream: null,
  setCurrentStream: (stream) => set({ currentStream: stream }),

  // Live room state
  roomState: "idle", // 'idle' | 'joining' | 'live' | 'ended'
  setRoomState: (state) => set({ roomState: state }),

  // Agora client reference (not serializable — stored as ref via external ref)
  agoraChannel: null,
  setAgoraChannel: (channel) => set({ agoraChannel: channel }),

  // Viewer count
  viewerCount: 0,
  setViewerCount: (count) => set({ viewerCount: count }),

  // Peak viewers
  peakViewers: 0,
  setPeakViewers: (count) =>
    set((state) => ({ peakViewers: Math.max(state.peakViewers, count) })),

  // Live chat messages
  chatMessages: [],
  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [...state.chatMessages.slice(-100), msg], // cap at 100
    })),
  clearChat: () => set({ chatMessages: [] }),

  // Gift animations queue
  giftQueue: [],
  addGift: (gift) => {
    const id = Date.now();
    set((state) => ({ giftQueue: [...state.giftQueue, { ...gift, id }] }));
    setTimeout(() => {
      set((state) => ({ giftQueue: state.giftQueue.filter((g) => g.id !== id) }));
    }, 4000);
  },

  // Leaderboard
  leaderboard: [],
  setLeaderboard: (board) => set({ leaderboard: board }),

  // Setup sheet
  setupSheetOpen: false,
  setSetupSheetOpen: (open) => set({ setupSheetOpen: open }),

  // Scheduled streams
  scheduledStreams: [],
  setScheduledStreams: (streams) => set({ scheduledStreams: streams }),

  // Total gifts earned in current stream
  totalGiftsNgn: 0,
  addGiftEarning: (amount) =>
    set((state) => ({ totalGiftsNgn: state.totalGiftsNgn + amount })),

  // Reset
  resetLive: () =>
    set({
      currentStream: null,
      roomState: "idle",
      agoraChannel: null,
      viewerCount: 0,
      peakViewers: 0,
      chatMessages: [],
      giftQueue: [],
      leaderboard: [],
      totalGiftsNgn: 0,
    }),
}));
