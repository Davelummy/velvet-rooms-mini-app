"use client";

import { useEffect, useState } from "react";
import BottomSheet from "../../_components/BottomSheet";
import { api } from "../../_lib/apiClient";
import { formatNgn, mapApiError } from "../../_lib/formatters";
import { generateIdempotencyKey } from "../../_lib/idempotency";
import { useHaptic } from "../../_hooks/useHaptic";
import VirtualGiftOverlay from "../../_components/VirtualGiftOverlay";

export default function GiftPicker({ open, onClose, recipientId, sessionId, liveStreamId }) {
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [animating, setAnimating] = useState([]);
  const { impact, notification } = useHaptic();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.get("/api/gifts/catalog").then((data) => {
      setCatalog(data.gifts || data || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [open]);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    setError(null);
    impact("medium");
    try {
      const key = generateIdempotencyKey();
      await api.post("/api/gifts/send", {
        giftId: selected.id,
        recipientId,
        sessionId: sessionId || undefined,
        liveStreamId: liveStreamId || undefined,
        idempotencyKey: key,
      });
      notification("success");
      // Trigger animation
      setAnimating([{ id: Date.now(), emoji: selected.emoji, animationKey: selected.animation_key }]);
      setTimeout(() => setAnimating([]), 4000);
      setSelected(null);
    } catch (err) {
      notification("error");
      setError(mapApiError(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <BottomSheet open={open} onClose={onClose} title="Send a Gift">
        <div style={{ padding: "16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "24px", color: "var(--muted)" }}>Loading gifts…</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "20px" }}>
                {catalog.map((gift) => (
                  <button
                    key={gift.id}
                    onClick={() => { setSelected(gift); impact("light"); }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "14px 8px",
                      borderRadius: "16px",
                      border: `1px solid ${selected?.id === gift.id ? "var(--accent)" : "var(--line)"}`,
                      background: selected?.id === gift.id ? "rgba(227,23,62,0.1)" : "var(--card)",
                      cursor: "pointer",
                      gap: "6px",
                    }}
                  >
                    <span style={{ fontSize: "32px" }}>{gift.emoji}</span>
                    <span style={{ fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif", color: "var(--muted)" }}>{gift.name}</span>
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>{formatNgn(gift.price_ngn)}</span>
                  </button>
                ))}
              </div>

              {error && <p style={{ color: "var(--accent)", fontSize: "13px", marginBottom: "12px" }}>{error}</p>}

              <button
                onClick={handleSend}
                disabled={!selected || sending}
                style={{
                  width: "100%",
                  padding: "16px",
                  borderRadius: "16px",
                  border: "none",
                  background: selected ? "linear-gradient(135deg, var(--accent-4), var(--accent))" : "var(--line)",
                  color: "#fff",
                  fontSize: "16px",
                  fontWeight: 700,
                  cursor: selected && !sending ? "pointer" : "not-allowed",
                }}
              >
                {sending ? "Sending…" : selected ? `Send ${selected.emoji} ${selected.name} — ${formatNgn(selected.price_ngn)}` : "Select a gift"}
              </button>
            </>
          )}
        </div>
      </BottomSheet>

      <VirtualGiftOverlay gifts={animating} />
    </>
  );
}
