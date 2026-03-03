"use client";

import { useUIStore } from "../_store/useUIStore";
import { useNotificationStore } from "../_store/useNotificationStore";
import { useHaptic } from "../_hooks/useHaptic";

const CLIENT_TABS = [
  {
    id: "feed",
    label: "Feed",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: "explore",
    label: "Explore",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    id: "wallet",
    label: "Wallet",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M16 13a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" />
      </svg>
    ),
  },
  {
    id: "profile",
    label: "Profile",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
];

const MODEL_TABS = [
  {
    id: "profile",
    label: "Profile",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    id: "content",
    label: "Content",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="m21 15-5-5L5 21" />
      </svg>
    ),
  },
  {
    id: "sessions",
    label: "Sessions",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
      </svg>
    ),
  },
  {
    id: "followers",
    label: "Followers",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    id: "earnings",
    label: "Earnings",
    icon: (active) => (
      <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7h5a3.5 3.5 0 1 1 0 7H6" />
      </svg>
    ),
  },
];

export default function BottomNav({ role, hidden = false, feedMode = false }) {
  const { activeClientTab, activeModelTab, setActiveClientTab, setActiveModelTab } = useUIStore();
  const { unreadCount } = useNotificationStore();
  const { selection } = useHaptic();

  const isModel = role === "model";
  const tabs = isModel ? MODEL_TABS : CLIENT_TABS;
  const activeTab = isModel ? activeModelTab : activeClientTab;
  const setActiveTab = isModel ? setActiveModelTab : setActiveClientTab;

  const handleTabClick = (tabId) => {
    if (tabId === activeTab) return;
    try {
      selection();
    } catch {
      // Defensive: haptics should never block tab navigation.
    }
    setActiveTab(tabId);
  };

  return (
    <nav className={`bottom-nav ${hidden ? "hidden" : ""} ${feedMode ? "feed-mode" : ""}`.trim()}>
      <div className="bottom-nav-inner">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const showBadge = !isModel && tab.id === "sessions" && unreadCount > 0;
          return (
            <button
              key={tab.id}
              type="button"
              className="bottom-nav-item"
              onClick={() => handleTabClick(tab.id)}
              style={{ color: isActive ? "var(--accent)" : "var(--muted)" }}
            >
              {tab.icon(isActive)}
              <span className="bottom-nav-label">
                {tab.label}
              </span>
              {showBadge && (
                <span className="bottom-nav-badge">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
