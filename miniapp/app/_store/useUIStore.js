import { create } from "zustand";

// Client tabs: feed | explore | sessions | wallet | profile
// Model tabs: profile | content | sessions | followers | earnings
const DEFAULT_CLIENT_TAB = "feed";
const DEFAULT_MODEL_TAB = "profile";

export const useUIStore = create((set, get) => ({
  // Tab state
  activeClientTab: DEFAULT_CLIENT_TAB,
  activeModelTab: DEFAULT_MODEL_TAB,
  setActiveClientTab: (tab) => set({ activeClientTab: tab }),
  setActiveModelTab: (tab) => set({ activeModelTab: tab }),

  // Overlay visibility
  overlays: {},
  openOverlay: (name, data = null) =>
    set((state) => ({ overlays: { ...state.overlays, [name]: data ?? true } })),
  closeOverlay: (name) =>
    set((state) => {
      const next = { ...state.overlays };
      delete next[name];
      return { overlays: next };
    }),
  isOverlayOpen: (name) => !!get().overlays[name],
  getOverlayData: (name) => get().overlays[name],

  // Toasts
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [...state.toasts, { id: Date.now(), ...toast }],
    })),
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  showToast: (message, type = "info") => {
    const id = Date.now();
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }],
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  // Theme
  theme: "dark", // 'dark' | 'light'
  setTheme: (theme) => {
    set({ theme });
    if (typeof window !== "undefined") {
      localStorage.setItem("vr_theme", theme);
      document.body.classList.toggle("theme-light", theme === "light");
    }
  },
  initTheme: () => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vr_theme") || "dark";
      set({ theme: saved });
      document.body.classList.toggle("theme-light", saved === "light");
    }
  },

  // Notification badge
  notificationUnreadCount: 0,
  setNotificationUnreadCount: (count) => set({ notificationUnreadCount: count }),
}));
