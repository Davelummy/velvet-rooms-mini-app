"use client";

import { useLiveStore } from "../../_store/useLiveStore";

export default function LiveViewerCount() {
  const { viewerCount } = useLiveStore();

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: "6px",
      background: "rgba(0,0,0,0.5)",
      borderRadius: "999px",
      padding: "4px 10px",
      backdropFilter: "blur(8px)",
    }}>
      <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#f87171", animation: "pulse 1.5s ease-in-out infinite" }} />
      <span style={{ color: "#fff", fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600 }}>
        {viewerCount} watching
      </span>
    </div>
  );
}
