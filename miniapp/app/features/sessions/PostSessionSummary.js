"use client";

import { useState } from "react";
import { formatNgn, formatSeconds } from "../../_lib/formatters";
import { useCallStore } from "../../_store/useCallStore";
import { api } from "../../_lib/apiClient";
import { TIP_PRESETS } from "../../_lib/pricing";
import { useHaptic } from "../../_hooks/useHaptic";
import confetti from "canvas-confetti";

export default function PostSessionSummary({ session, onClose, onBookAgain }) {
  const { callElapsed } = useCallStore();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [tipSent, setTipSent] = useState(false);
  const [tipLoading, setTipLoading] = useState(false);
  const [error, setError] = useState(null);
  const { notification } = useHaptic();

  const handleTip = async (amount) => {
    setTipLoading(true);
    setError(null);
    try {
      await api.post("/api/tips/send", {
        recipientId: session.model_id,
        amount,
        contextType: "session",
        contextId: session.id,
      });
      notification("success");
      confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
      setTipSent(true);
    } catch (err) {
      notification("error");
      setError(err.data?.error || "Failed to send tip");
    } finally {
      setTipLoading(false);
    }
  };

  const handleRate = async (score) => {
    setRating(score);
    try {
      await api.post(`/api/sessions/${session.id}/rate`, { score });
    } catch {}
  };

  const cost = session?.amount_ngn || 0;
  const duration = callElapsed > 0 ? callElapsed : (session?.duration_minutes || 0) * 60;

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--bg)",
      zIndex: 96,
      display: "flex",
      flexDirection: "column",
      padding: "32px 24px 24px",
      overflowY: "auto",
    }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "32px" }}>
        <div style={{ fontSize: "52px", marginBottom: "12px" }}>🎉</div>
        <h2 style={{ fontSize: "24px", marginBottom: "8px" }}>Session Complete</h2>
        <div style={{ display: "flex", gap: "24px", justifyContent: "center" }}>
          <Stat label="Duration" value={formatSeconds(duration)} />
          <Stat label="Cost" value={formatNgn(cost)} />
        </div>
      </div>

      {/* Star rating */}
      <div style={{ marginBottom: "28px" }}>
        <h3 style={{ fontSize: "16px", textAlign: "center", marginBottom: "12px" }}>How was your session?</h3>
        <div style={{ display: "flex", justifyContent: "center", gap: "8px" }}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => handleRate(star)}
              onMouseEnter={() => setHoverRating(star)}
              onMouseLeave={() => setHoverRating(0)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: "36px",
                filter: star <= (hoverRating || rating) ? "none" : "grayscale(1) opacity(0.4)",
                transition: "filter 0.1s",
              }}
            >
              ⭐
            </button>
          ))}
        </div>
      </div>

      {/* Tip section */}
      {!tipSent && (
        <div style={{ marginBottom: "28px" }}>
          <h3 style={{ fontSize: "16px", textAlign: "center", marginBottom: "4px" }}>Leave a tip?</h3>
          <p style={{ fontSize: "13px", color: "var(--muted)", textAlign: "center", marginBottom: "14px" }}>100% goes to your creator</p>
          <div style={{ display: "flex", gap: "10px" }}>
            {TIP_PRESETS.map((amount) => (
              <button
                key={amount}
                onClick={() => handleTip(amount)}
                disabled={tipLoading}
                style={{
                  flex: 1,
                  padding: "14px 8px",
                  borderRadius: "14px",
                  border: "1px solid var(--line)",
                  background: "var(--card)",
                  color: "var(--accent)",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: "14px",
                  opacity: tipLoading ? 0.6 : 1,
                }}
              >
                {formatNgn(amount)}
              </button>
            ))}
          </div>
          {error && <p style={{ color: "var(--accent)", fontSize: "12px", textAlign: "center", marginTop: "8px" }}>{error}</p>}
        </div>
      )}

      {tipSent && (
        <div style={{ textAlign: "center", marginBottom: "28px", color: "#22c55e", fontSize: "15px" }}>
          💜 Tip sent — thank you!
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "auto" }}>
        {onBookAgain && (
          <button
            onClick={onBookAgain}
            style={{ padding: "16px", borderRadius: "16px", border: "none", background: "var(--accent)", color: "#fff", fontSize: "16px", fontWeight: 700, cursor: "pointer" }}
          >
            Book Again
          </button>
        )}
        <button
          onClick={onClose}
          style={{ padding: "14px", borderRadius: "14px", border: "1px solid var(--line)", background: "none", color: "var(--muted)", cursor: "pointer" }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</div>
    </div>
  );
}
