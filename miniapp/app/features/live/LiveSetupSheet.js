"use client";

import { useState } from "react";
import BottomSheet from "../../_components/BottomSheet";
import { api } from "../../_lib/apiClient";
import { mapApiError } from "../../_lib/formatters";
import { useLiveStore } from "../../_store/useLiveStore";

export default function LiveSetupSheet({ open, onClose, initData = "" }) {
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState("free");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { setCurrentStream, setRoomState } = useLiveStore();

  const postWithInit = async (path, body) => {
    if (!initData) {
      return api.post(path, body);
    }
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init": initData,
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(payload?.error || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = payload;
      throw err;
    }
    return payload;
  };

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await postWithInit("/api/live/start", {
        title: title || "Live stream",
        tier,
      });
      setCurrentStream(data);
      setRoomState("live");
      onClose?.();
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Go Live">
        <div style={{ padding: "20px" }}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "13px", color: "var(--muted)", marginBottom: "8px" }}>
              Stream title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What's happening?"
              style={{
                width: "100%",
                padding: "12px 16px",
                borderRadius: "14px",
                border: "1px solid var(--line)",
                background: "var(--bg)",
                color: "var(--ink)",
                fontSize: "15px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", fontSize: "13px", color: "var(--muted)", marginBottom: "8px" }}>
              Who can join?
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              {[
                { id: "free", label: "Everyone", emoji: "🌐" },
                { id: "subscriber", label: "Subscribers", emoji: "⭐" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  style={{
                    flex: 1,
                    padding: "14px",
                    borderRadius: "14px",
                    border: `1px solid ${tier === t.id ? "var(--accent)" : "var(--line)"}`,
                    background: tier === t.id ? "rgba(227,23,62,0.1)" : "none",
                    color: tier === t.id ? "var(--accent)" : "var(--ink)",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p style={{ color: "var(--accent)", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

          <button
            onClick={handleStart}
            disabled={loading}
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "16px",
              border: "none",
              background: "linear-gradient(135deg, var(--accent), #ff4d6d)",
              color: "#fff",
              fontSize: "16px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Starting…" : "Start Live Stream"}
          </button>
        </div>
      </BottomSheet>
    </>
  );
}
