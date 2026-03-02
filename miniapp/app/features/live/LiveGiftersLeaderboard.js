"use client";

import { useLiveStore } from "../../_store/useLiveStore";
import { formatNgn } from "../../_lib/formatters";

export default function LiveGiftersLeaderboard({ open, onClose }) {
  const { leaderboard } = useLiveStore();

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 105 }} />
      <div style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--card)",
        borderRadius: "22px 22px 0 0",
        zIndex: 106,
        maxHeight: "60vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, fontSize: "18px" }}>Top Gifters 💎</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "22px", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
          {leaderboard.length === 0 ? (
            <p style={{ color: "var(--muted)", textAlign: "center" }}>No gifts sent yet</p>
          ) : (
            leaderboard.map((entry, i) => (
              <div key={entry.gifter_id || i} style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
                <div style={{ fontSize: "18px", width: "28px", textAlign: "center", color: i === 0 ? "#ffd700" : i === 1 ? "#c0c0c0" : i === 2 ? "#cd7f32" : "var(--muted)" }}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{entry.username || "Anonymous"}</div>
                  <div style={{ fontSize: "12px", color: "var(--muted)" }}>{entry.gift_count} gifts</div>
                </div>
                <div style={{ fontWeight: 700, color: "var(--accent-4)" }}>{formatNgn(entry.total_ngn)}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
