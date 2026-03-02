"use client";

import { useEffect, useState } from "react";
import { formatSeconds, resolveDisplayName } from "../../_lib/formatters";
import { api } from "../../_lib/apiClient";
import { useHaptic } from "../../_hooks/useHaptic";

export default function SessionLobby({ session, role, onJoin, onCancel }) {
  const [countdown, setCountdown] = useState(null);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const { notification } = useHaptic();

  const isModel = role === "model";
  const otherParty = isModel
    ? resolveDisplayName({ display_name: session?.client_display_name }, "Fan")
    : resolveDisplayName({ display_name: session?.model_display_name }, "Creator");

  // Countdown to scheduled time
  useEffect(() => {
    if (!session?.scheduled_at) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(session.scheduled_at) - Date.now()) / 1000));
      setCountdown(diff);
      if (diff === 0) {
        notification("success");
      }
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [session?.scheduled_at]);

  const handleReady = async () => {
    setLoading(true);
    try {
      await api.post(`/api/sessions/${session.id}/ready`, {});
      setReady(true);
      notification("success");
    } catch {
      notification("error");
    } finally {
      setLoading(false);
    }
  };

  const canJoin = countdown === 0 || !session?.scheduled_at;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--bg)",
      zIndex: 95,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      {/* Pulsing avatar */}
      <div style={{ position: "relative", marginBottom: "24px" }}>
        <div style={{
          width: "96px",
          height: "96px",
          borderRadius: "50%",
          background: "var(--card)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "36px",
          border: "3px solid var(--accent)",
          animation: "ring-pulse 2s ease-in-out infinite",
        }}>
          {otherParty[0]}
        </div>
        {ready && (
          <div style={{ position: "absolute", bottom: 0, right: 0, width: "26px", height: "26px", borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
            ✓
          </div>
        )}
      </div>

      <h2 style={{ fontSize: "22px", marginBottom: "8px", textAlign: "center" }}>
        Session with {otherParty}
      </h2>
      <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "32px", textAlign: "center" }}>
        {session?.session_type?.replace("_", " ")} · {session?.duration_minutes}m
      </p>

      {/* Countdown */}
      {countdown !== null && countdown > 0 && (
        <div style={{ marginBottom: "24px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif", color: "var(--accent)" }}>
            {formatSeconds(countdown)}
          </div>
          <div style={{ fontSize: "13px", color: "var(--muted)" }}>until session starts</div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", width: "100%", maxWidth: "300px" }}>
        {canJoin && (
          <button
            onClick={ready ? onJoin : handleReady}
            disabled={loading}
            style={{
              padding: "16px",
              borderRadius: "16px",
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {loading ? "…" : ready ? "Join Now" : "I'm Ready"}
          </button>
        )}
        <button
          onClick={onCancel}
          style={{
            padding: "14px",
            borderRadius: "14px",
            border: "1px solid var(--line)",
            background: "none",
            color: "var(--muted)",
            fontSize: "14px",
            cursor: "pointer",
          }}
        >
          Cancel Session
        </button>
      </div>
    </div>
  );
}
