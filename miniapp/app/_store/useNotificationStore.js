import { create } from "zustand";

export const useNotificationStore = create((set, get) => ({
  // Notifications list
  notifications: [],
  unreadCount: 0,
  loading: false,
  setNotifications: (notifications) => set({ notifications }),
  setUnreadCount: (count) => set({ unreadCount: count }),
  setLoading: (loading) => set({ loading }),

  // Category filter
  activeCategory: "all", // 'all' | 'bookings' | 'payments' | 'activity'
  setActiveCategory: (cat) => set({ activeCategory: cat }),

  // Mark read
  markRead: (ids) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        !ids || ids.includes(n.id) ? { ...n, read_at: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - (ids ? ids.length : state.unreadCount)),
    })),

  // Append new notification
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),

  // Notification preferences
  preferences: {
    sound_enabled: true,
    bookings: true,
    payments: true,
    activity: true,
    stories: true,
    live: true,
  },
  setPreferences: (prefs) =>
    set((state) => ({ preferences: { ...state.preferences, ...prefs } })),
}));
