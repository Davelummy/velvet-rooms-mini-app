"use client";

import { useState } from "react";

const ONBOARDING_STORAGE_KEY = "vr_onboarding_seen";
const ONBOARDING_VERSION = "2026-02-10";

const SLIDES = [
  {
    emoji: "✨",
    title: "Welcome to Velvet Rooms",
    body: "Book exclusive 1-on-1 sessions with verified creators. Video, voice, or chat — your choice.",
  },
  {
    emoji: "🔒",
    title: "Fully Secured",
    body: "Payments are held in escrow and only released after your session completes. Your money is always protected.",
  },
  {
    emoji: "💎",
    title: "Premium Experiences",
    body: "Access exclusive content, send gifts, and support your favourite creators directly.",
  },
];

export default function Onboarding({ onDone }) {
  const [slide, setSlide] = useState(0);

  const handleNext = () => {
    if (slide < SLIDES.length - 1) {
      setSlide(slide + 1);
    } else {
      localStorage.setItem(ONBOARDING_STORAGE_KEY, ONBOARDING_VERSION);
      onDone?.();
    }
  };

  const current = SLIDES[slide];

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--bg)",
      zIndex: 190,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "32px 24px",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", maxWidth: "320px" }}>
        <div style={{ fontSize: "72px", marginBottom: "24px", lineHeight: 1 }}>{current.emoji}</div>
        <h2 style={{ fontSize: "26px", marginBottom: "14px" }}>{current.title}</h2>
        <p style={{ color: "var(--muted)", fontSize: "15px", lineHeight: 1.6 }}>{current.body}</p>
      </div>

      {/* Dots */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "24px" }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === slide ? "24px" : "8px",
              height: "8px",
              borderRadius: "4px",
              background: i === slide ? "var(--accent)" : "var(--line)",
              transition: "width 0.2s, background 0.2s",
            }}
          />
        ))}
      </div>

      <button
        onClick={handleNext}
        style={{
          width: "100%",
          maxWidth: "320px",
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
        {slide < SLIDES.length - 1 ? "Next" : "Get Started"}
      </button>
    </div>
  );
}
