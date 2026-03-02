"use client";

import { useState } from "react";
import BottomSheet from "../../_components/BottomSheet";
import { api } from "../../_lib/apiClient";
import { formatNgn, mapApiError } from "../../_lib/formatters";
import { TIP_PRESETS } from "../../_lib/pricing";
import { generateIdempotencyKey } from "../../_lib/idempotency";
import { useHaptic } from "../../_hooks/useHaptic";
import confetti from "canvas-confetti";

export default function TipSheet({ open, onClose, recipientId, contextType = "profile", contextId, recipientName }) {
  const [amount, setAmount] = useState(null);
  const [custom, setCustom] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const { notification } = useHaptic();

  const finalAmount = amount || (custom ? parseInt(custom, 10) : null);

  const handleSend = async () => {
    if (!finalAmount || finalAmount < 100) {
      setError("Minimum tip is ₦100");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const key = generateIdempotencyKey();
      await api.post("/api/tips/send", {
        recipientId,
        amount: finalAmount,
        contextType,
        contextId,
        message: message || undefined,
        idempotencyKey: key,
      });
      notification("success");
      confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
      setDone(true);
    } catch (err) {
      notification("error");
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(null);
    setCustom("");
    setMessage("");
    setError(null);
    setDone(false);
    onClose?.();
  };

  return (
    <BottomSheet open={open} onClose={handleClose} title="Send a Tip">
      <div style={{ padding: "20px" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>💜</div>
            <h3 style={{ margin: "0 0 8px" }}>Tip Sent!</h3>
            <p style={{ color: "var(--muted)", margin: "0 0 24px" }}>
              {formatNgn(finalAmount)} sent{recipientName ? ` to ${recipientName}` : ""}
            </p>
            <button onClick={handleClose} style={{ padding: "14px 32px", borderRadius: "14px", border: "none", background: "var(--accent)", color: "#fff", fontSize: "15px", fontWeight: 600, cursor: "pointer" }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <p style={{ color: "var(--muted)", fontSize: "14px", marginBottom: "20px" }}>
              Choose an amount to send{recipientName ? ` to ${recipientName}` : ""}
            </p>

            {/* Preset amounts */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
              {TIP_PRESETS.map((preset) => (
                <button
                  key={preset}
                  onClick={() => { setAmount(preset); setCustom(""); }}
                  style={{
                    flex: 1,
                    padding: "14px 8px",
                    borderRadius: "14px",
                    border: `1px solid ${amount === preset ? "var(--accent)" : "var(--line)"}`,
                    background: amount === preset ? "rgba(227,23,62,0.1)" : "none",
                    color: amount === preset ? "var(--accent)" : "var(--ink)",
                    fontSize: "15px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {formatNgn(preset)}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div style={{ marginBottom: "16px" }}>
              <input
                type="number"
                placeholder="Custom amount"
                value={custom}
                onChange={(e) => { setCustom(e.target.value); setAmount(null); }}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: "14px",
                  border: `1px solid ${custom ? "var(--accent)" : "var(--line)"}`,
                  background: "var(--bg)",
                  color: "var(--ink)",
                  fontSize: "15px",
                  boxSizing: "border-box",
                }}
              />
            </div>

            {/* Optional message */}
            <textarea
              placeholder="Add a message (optional)"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "14px",
                border: "1px solid var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
                fontSize: "14px",
                resize: "none",
                boxSizing: "border-box",
                marginBottom: "20px",
              }}
            />

            {error && <p style={{ color: "var(--accent)", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

            <button
              onClick={handleSend}
              disabled={!finalAmount || loading}
              style={{
                width: "100%",
                padding: "16px",
                borderRadius: "16px",
                border: "none",
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "#fff",
                fontSize: "16px",
                fontWeight: 700,
                cursor: finalAmount && !loading ? "pointer" : "not-allowed",
                opacity: !finalAmount || loading ? 0.6 : 1,
              }}
            >
              {loading ? "Sending…" : finalAmount ? `Send ${formatNgn(finalAmount)}` : "Choose Amount"}
            </button>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
