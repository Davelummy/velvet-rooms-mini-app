"use client";

import { useHaptic } from "../../_hooks/useHaptic";

export default function RoleSelect({ onSelectRole }) {
  const { impact } = useHaptic();

  const handleSelect = (role) => {
    impact("medium");
    onSelectRole?.(role);
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--bg)",
      zIndex: 180,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ maxWidth: "340px", width: "100%", textAlign: "center" }}>
        <h2 style={{ fontSize: "26px", marginBottom: "8px" }}>How are you joining?</h2>
        <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "32px" }}>
          Choose your role to get started
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <RoleCard
            emoji="💜"
            title="I'm a Fan"
            subtitle="Browse creators, book sessions, enjoy content"
            onClick={() => handleSelect("client")}
          />
          <RoleCard
            emoji="⭐"
            title="I'm a Creator"
            subtitle="Create content, accept bookings, earn money"
            onClick={() => handleSelect("model")}
          />
        </div>
      </div>
    </div>
  );
}

function RoleCard({ emoji, title, subtitle, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        padding: "20px",
        borderRadius: "20px",
        border: "1px solid var(--line)",
        background: "var(--card)",
        color: "var(--ink)",
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        gap: "16px",
        alignItems: "center",
        transition: "border-color 0.15s",
      }}
    >
      <div style={{ fontSize: "36px", lineHeight: 1 }}>{emoji}</div>
      <div>
        <div style={{ fontSize: "17px", fontWeight: 700, marginBottom: "4px" }}>{title}</div>
        <div style={{ fontSize: "13px", color: "var(--muted)" }}>{subtitle}</div>
      </div>
      <div style={{ marginLeft: "auto", color: "var(--muted)" }}>›</div>
    </button>
  );
}
