"use client";

import { useEffect } from "react";
import { useCallStore } from "../../_store/useCallStore";
import { formatSeconds } from "../../_lib/formatters";

export default function CallTimer({ durationMinutes }) {
  const { callStartTime, callElapsed, setCallElapsed } = useCallStore();

  useEffect(() => {
    if (!callStartTime) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      setCallElapsed(elapsed);
    }, 1000);
    return () => clearInterval(interval);
  }, [callStartTime, setCallElapsed]);

  const maxSeconds = durationMinutes * 60;
  const remaining = Math.max(0, maxSeconds - callElapsed);
  const pct = Math.min(1, callElapsed / maxSeconds);
  const isWarning = remaining <= 60;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: "6px",
    }}>
      <div style={{
        fontSize: "22px",
        fontWeight: 700,
        fontFamily: "'Space Grotesk', sans-serif",
        letterSpacing: "0.04em",
        color: isWarning ? "#f87171" : "var(--ink)",
        transition: "color 0.3s",
      }}>
        {formatSeconds(remaining)}
      </div>
      {/* Progress bar */}
      <div style={{ width: "120px", height: "3px", borderRadius: "2px", background: "var(--line)", overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${pct * 100}%`,
          borderRadius: "2px",
          background: isWarning ? "#f87171" : "var(--accent)",
          transition: "width 1s linear, background 0.3s",
        }} />
      </div>
    </div>
  );
}
