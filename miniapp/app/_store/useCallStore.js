import { create } from "zustand";

export const useCallStore = create((set, get) => ({
  // Active session context
  activeSession: null,
  setActiveSession: (session) => set({ activeSession: session }),

  // Call lifecycle
  callState: "idle", // 'idle' | 'connecting' | 'active' | 'ending' | 'ended'
  setCallState: (callState) => set({ callState }),

  // Peer connection
  peerConnection: null,
  setPeerConnection: (pc) => set({ peerConnection: pc }),

  // Media streams
  localStream: null,
  remoteStream: null,
  setLocalStream: (stream) => set({ localStream: stream }),
  setRemoteStream: (stream) => set({ remoteStream: stream }),

  // Call controls
  isMuted: false,
  isCameraOff: false,
  isSpeakerOn: true,
  setIsMuted: (val) => set({ isMuted: val }),
  setIsCameraOff: (val) => set({ isCameraOff: val }),
  setIsSpeakerOn: (val) => set({ isSpeakerOn: val }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  toggleCamera: () => set((state) => ({ isCameraOff: !state.isCameraOff })),

  // Timer
  callStartTime: null,
  callElapsed: 0,
  setCallStartTime: (time) => set({ callStartTime: time }),
  setCallElapsed: (elapsed) => set({ callElapsed: elapsed }),

  // Chat
  chatMessages: [],
  addChatMessage: (msg) =>
    set((state) => ({ chatMessages: [...state.chatMessages, msg] })),
  clearChat: () => set({ chatMessages: [] }),

  // Reactions
  reactions: [],
  addReaction: (reaction) => {
    const id = Date.now();
    set((state) => ({ reactions: [...state.reactions, { ...reaction, id }] }));
    setTimeout(() => {
      set((state) => ({ reactions: state.reactions.filter((r) => r.id !== id) }));
    }, 3000);
  },

  // Extension
  extensionRequested: false,
  extensionMinutes: 0,
  setExtensionRequested: (val) => set({ extensionRequested: val }),
  setExtensionMinutes: (min) => set({ extensionMinutes: min }),

  // Conclusion overlay
  callConclusion: { open: false, data: null },
  setCallConclusion: (conclusion) => set({ callConclusion: conclusion }),

  // Reset
  resetCall: () =>
    set({
      activeSession: null,
      callState: "idle",
      peerConnection: null,
      localStream: null,
      remoteStream: null,
      isMuted: false,
      isCameraOff: false,
      callStartTime: null,
      callElapsed: 0,
      chatMessages: [],
      reactions: [],
      extensionRequested: false,
      extensionMinutes: 0,
    }),
}));
