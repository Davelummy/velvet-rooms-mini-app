import { create } from "zustand";

export const useAppStore = create((set) => ({
  // Boot state
  booting: true,
  bootError: null,
  setBooting: (booting) => set({ booting }),
  setBootError: (bootError) => set({ bootError }),

  // Init data from Telegram
  initData: null,
  setInitData: (initData) => set({ initData }),

  // Role management
  role: null, // 'client' | 'model' | 'admin' | null
  roleLocked: false,
  setRole: (role) => set({ role }),
  setRoleLocked: (roleLocked) => set({ roleLocked }),

  // User profile
  profile: null,
  setProfile: (profile) => set({ profile }),
  updateProfile: (updates) =>
    set((state) => ({ profile: state.profile ? { ...state.profile, ...updates } : updates })),

  // Age gate
  ageConfirmed: false,
  setAgeConfirmed: (ageConfirmed) => set({ ageConfirmed }),

  // Onboarding
  onboardingDone: false,
  setOnboardingDone: (onboardingDone) => set({ onboardingDone }),
}));
