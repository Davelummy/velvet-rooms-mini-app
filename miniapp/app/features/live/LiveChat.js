"use client";

import { useRef, useEffect, useState } from "react";
import { useLiveStore } from "../../_store/useLiveStore";

export default function LiveChat({ onSend, canSend = true }) {
  const { chatMessages } = useLiveStore();
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend?.(text.trim());
    setText("");
  };

  return (
    <div style={{ position: "absolute", bottom: "80px", left: 0, right: 0, height: "240px", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px", display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: "4px" }}>
        {chatMessages.slice(-20).map((msg, i) => (
          <div key={i} style={{ color: "#fff", fontSize: "13px", textShadow: "0 1px 3px rgba(0,0,0,0.7)" }}>
            <span style={{ fontWeight: 700, color: "rgba(255,200,100,0.9)" }}>{msg.username}: </span>
            {msg.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {canSend && (
        <div style={{ display: "flex", gap: "8px", padding: "4px 12px" }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            placeholder="Say something…"
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "20px",
              border: "none",
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: "13px",
            }}
          />
          <button onClick={handleSend} disabled={!text.trim()} style={{ padding: "8px 14px", borderRadius: "20px", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontSize: "13px" }}>
            ➤
          </button>
        </div>
      )}
    </div>
  );
}
