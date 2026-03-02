"use client";

import { useLiveStore } from "../../_store/useLiveStore";
import { useHaptic } from "../../_hooks/useHaptic";
import LiveSetupSheet from "./LiveSetupSheet";

export default function GoLiveButton() {
  const { setupSheetOpen, setSetupSheetOpen } = useLiveStore();
  const { impact } = useHaptic();

  return (
    <>
      <button
        onClick={() => { impact("medium"); setSetupSheetOpen(true); }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "12px 20px",
          borderRadius: "14px",
          border: "none",
          background: "linear-gradient(135deg, var(--accent), #ff4d6d)",
          color: "#fff",
          fontSize: "15px",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 4px 16px rgba(227,23,62,0.4)",
        }}
      >
        <span style={{ fontSize: "18px" }}>📡</span>
        Go Live
      </button>
      <LiveSetupSheet open={setupSheetOpen} onClose={() => setSetupSheetOpen(false)} />
    </>
  );
}
