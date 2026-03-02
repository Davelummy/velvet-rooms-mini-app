"use client";

import { useState } from "react";
import { api } from "../_lib/apiClient";
import { mapApiError } from "../_lib/formatters";

const REPORT_REASONS = [
  "Inappropriate content",
  "Fake profile",
  "Harassment",
  "Spam",
  "Underage",
  "Other",
];

export default function ReportDialog({ open, onClose, targetId, targetType = "user" }) {
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!reason) return;
    setLoading(true);
    setError(null);
    try {
      await api.post("/api/report", { targetId, targetType, reason, details });
      setDone(true);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReason("");
    setDetails("");
    setError(null);
    setDone(false);
    onClose?.();
  };

  return (
    <>
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 80, backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 81,
        background: "var(--card)",
        borderRadius: "20px",
        padding: "24px",
        width: "min(360px, 92vw)",
        maxHeight: "80vh",
        overflowY: "auto",
      }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "18px" }}>Report</h3>
        {done ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>✅</div>
            <p style={{ color: "var(--muted)" }}>Report submitted. We'll review it shortly.</p>
            <button onClick={handleClose} style={{ marginTop: "16px", padding: "12px 24px", borderRadius: "12px", background: "var(--accent)", border: "none", color: "#fff", cursor: "pointer" }}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "16px" }}>
              {REPORT_REASONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    border: `1px solid ${reason === r ? "var(--accent)" : "var(--line)"}`,
                    background: reason === r ? "rgba(227,23,62,0.1)" : "none",
                    color: reason === r ? "var(--accent)" : "var(--ink)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: "14px",
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Additional details (optional)"
              rows={3}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
                fontSize: "14px",
                resize: "none",
                marginBottom: "16px",
                boxSizing: "border-box",
              }}
            />
            {error && <p style={{ color: "var(--accent)", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: "10px" }}>
              <button onClick={handleClose} style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "1px solid var(--line)", background: "none", color: "var(--ink)", cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!reason || loading}
                style={{ flex: 1, padding: "12px", borderRadius: "12px", border: "none", background: "var(--accent)", color: "#fff", cursor: reason && !loading ? "pointer" : "not-allowed", opacity: !reason || loading ? 0.6 : 1 }}
              >
                {loading ? "Submitting…" : "Submit"}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
