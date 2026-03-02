"use client";

import { useState, useCallback } from "react";

function useDebounce(fn, delay = 400) {
  const timer = typeof window !== "undefined" ? { current: null } : null;
  return useCallback((...args) => {
    if (timer?.current) clearTimeout(timer.current);
    if (timer) timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

export default function ExploreSearch({ value, onChange }) {
  return (
    <div style={{ position: "relative", padding: "12px 16px" }}>
      <div style={{ position: "absolute", left: "28px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)", fontSize: "16px", pointerEvents: "none" }}>
        🔍
      </div>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder="Search creators…"
        style={{
          width: "100%",
          padding: "12px 16px 12px 42px",
          borderRadius: "14px",
          border: "1px solid var(--line)",
          background: "var(--card)",
          color: "var(--ink)",
          fontSize: "15px",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}
