"use client";

import { useEffect, useRef } from "react";

// Floating gift animation overlay — renders emoji floats via CSS animation
export default function VirtualGiftOverlay({ gifts }) {
  if (!gifts || gifts.length === 0) return null;

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 70, overflow: "hidden" }}>
      {gifts.map((gift) => (
        <FloatingGift key={gift.id} gift={gift} />
      ))}
    </div>
  );
}

function FloatingGift({ gift }) {
  const left = `${15 + Math.random() * 70}%`;

  return (
    <div
      style={{
        position: "absolute",
        bottom: "120px",
        left,
        fontSize: "48px",
        animation: "gift-float 3s ease-out forwards",
        pointerEvents: "none",
        userSelect: "none",
        textShadow: "0 4px 16px rgba(0,0,0,0.4)",
      }}
    >
      {gift.emoji}
      {gift.senderName && (
        <div style={{
          fontSize: "11px",
          fontFamily: "'Space Grotesk', sans-serif",
          color: "#fff",
          textAlign: "center",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          marginTop: "4px",
        }}>
          {gift.senderName}
        </div>
      )}
    </div>
  );
}
