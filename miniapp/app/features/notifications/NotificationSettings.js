"use client";

import { useState } from "react";
import { useNotificationStore } from "../../_store/useNotificationStore";
import { useUIStore } from "../../_store/useUIStore";
import { api } from "../../_lib/apiClient";
import BottomSheet from "../../_components/BottomSheet";

const PREF_ITEMS = [
  { key: "sound_enabled", label: "Notification sounds", emoji: "🔔" },
  { key: "bookings", label: "Booking notifications", emoji: "📅" },
  { key: "payments", label: "Payment notifications", emoji: "💰" },
  { key: "activity", label: "Activity (likes, follows)", emoji: "❤️" },
  { key: "stories", label: "New stories", emoji: "⭕" },
  { key: "live", label: "Live streams", emoji: "📡" },
];

export default function NotificationSettings({ open, onClose }) {
  const { preferences, setPreferences } = useNotificationStore();
  const { theme, setTheme } = useUIStore();
  const [saving, setSaving] = useState(false);

  const togglePref = async (key) => {
    const updated = { ...preferences, [key]: !preferences[key] };
    setPreferences(updated);
    setSaving(true);
    try {
      await api.post("/api/notifications/preferences", updated);
    } catch {}
    setSaving(false);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings">
      <div style={{ padding: "16px" }}>
        {/* Theme toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <span style={{ fontSize: "20px" }}>{theme === "light" ? "☀️" : "🌙"}</span>
            <span style={{ fontSize: "14px" }}>Light theme</span>
          </div>
          <ToggleSwitch
            checked={theme === "light"}
            onChange={() => setTheme(theme === "light" ? "dark" : "light")}
          />
        </div>

        {PREF_ITEMS.map(({ key, label, emoji }) => (
          <div
            key={key}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 0",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "20px" }}>{emoji}</span>
              <span style={{ fontSize: "14px" }}>{label}</span>
            </div>
            <ToggleSwitch
              checked={preferences[key] ?? true}
              onChange={() => togglePref(key)}
            />
          </div>
        ))}
      </div>
    </BottomSheet>
  );
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      style={{
        width: "44px",
        height: "26px",
        borderRadius: "13px",
        border: "none",
        background: checked ? "var(--accent)" : "var(--line)",
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: "absolute",
        top: "3px",
        left: checked ? "21px" : "3px",
        width: "20px",
        height: "20px",
        borderRadius: "50%",
        background: "#fff",
        transition: "left 0.2s",
        boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
      }} />
    </button>
  );
}
