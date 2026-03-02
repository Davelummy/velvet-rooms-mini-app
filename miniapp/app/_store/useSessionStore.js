import { create } from "zustand";

export const useSessionStore = create((set, get) => ({
  // Sessions list
  sessions: [],
  sessionsLoading: false,
  sessionsPage: 1,
  sessionsTotalPages: 1,
  setSessions: (sessions) => set({ sessions }),
  appendSessions: (sessions) =>
    set((state) => ({ sessions: [...state.sessions, ...sessions] })),
  setSessionsLoading: (loading) => set({ sessionsLoading: loading }),
  setSessionsPage: (page) => set({ sessionsPage: page }),
  setSessionsTotalPages: (total) => set({ sessionsTotalPages: total }),

  // Session filter
  sessionFilter: "all", // 'all' | 'pending' | 'active' | 'completed' | 'cancelled'
  setSessionFilter: (filter) => set({ sessionFilter: filter }),

  // Booking sheet
  bookingSheet: { open: false, model: null },
  openBookingSheet: (model) => set({ bookingSheet: { open: true, model } }),
  closeBookingSheet: () => set({ bookingSheet: { open: false, model: null } }),

  // Extension sheet
  extensionSheet: { open: false, session: null },
  openExtensionSheet: (session) => set({ extensionSheet: { open: true, session } }),
  closeExtensionSheet: () => set({ extensionSheet: { open: false, session: null } }),

  // Dispute dialog
  disputeDialog: { open: false, session: null },
  openDisputeDialog: (session) => set({ disputeDialog: { open: true, session } }),
  closeDisputeDialog: () => set({ disputeDialog: { open: false, session: null } }),

  // Selected session detail
  selectedSession: null,
  setSelectedSession: (session) => set({ selectedSession: session }),
}));
