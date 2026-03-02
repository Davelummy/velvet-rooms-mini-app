"use client";

import { useState, useRef, useEffect } from "react";
import { useCallStore } from "../../_store/useCallStore";

export default function CallChat({ onSendMessage }) {
  const { chatMessages } = useCallStore();
  const [text, setText] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSendMessage?.(text.trim());
    setText("");
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "rgba(0,0,0,0.6)",
    }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {chatMessages.map((msg) => (
          <div
            key={msg.id || msg.timestamp}
            style={{
              alignSelf: msg.isLocal ? "flex-end" : "flex-start",
              maxWidth: "80%",
              padding: "8px 12px",
              borderRadius: msg.isLocal ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.isLocal ? "var(--accent)" : "rgba(255,255,255,0.15)",
              color: "#fff",
              fontSize: "14px",
              lineHeight: 1.4,
            }}
          >
            {msg.text}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div style={{ display: "flex", gap: "8px", padding: "8px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.1)" }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Message…"
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.2)",
            background: "rgba(255,255,255,0.1)",
            color: "#fff",
            fontSize: "14px",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          style={{
            padding: "10px 16px",
            borderRadius: "12px",
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: "14px",
            cursor: "pointer",
            opacity: text.trim() ? 1 : 0.5,
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
