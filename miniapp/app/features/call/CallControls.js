"use client";

import { useCallStore } from "../../_store/useCallStore";
import { useHaptic } from "../../_hooks/useHaptic";

function ControlButton({ icon, label, active, danger, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "8px",
      }}
    >
      <div style={{
        width: "52px",
        height: "52px",
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: danger ? "#dc2626" : active ? "rgba(227,23,62,0.15)" : "rgba(255,255,255,0.1)",
        fontSize: "22px",
        transition: "background 0.2s",
      }}>
        {icon}
      </div>
      <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.7)", fontFamily: "'Space Grotesk', sans-serif" }}>
        {label}
      </span>
    </button>
  );
}

export default function CallControls({ onEndCall, onExtend, sessionType = "video" }) {
  const { isMuted, isCameraOff, toggleMute, toggleCamera } = useCallStore();
  const { impact } = useHaptic();

  const handleMute = () => { impact("light"); toggleMute(); };
  const handleCamera = () => { impact("light"); toggleCamera(); };
  const handleEnd = () => { impact("medium"); onEndCall?.(); };

  const isVideo = sessionType === "video";

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-evenly",
      alignItems: "center",
      padding: "16px 8px",
    }}>
      <ControlButton
        icon={isMuted ? "🔇" : "🎙️"}
        label={isMuted ? "Unmute" : "Mute"}
        active={isMuted}
        onClick={handleMute}
      />
      {isVideo && (
        <ControlButton
          icon={isCameraOff ? "📷" : "📹"}
          label={isCameraOff ? "Camera On" : "Camera Off"}
          active={isCameraOff}
          onClick={handleCamera}
        />
      )}
      {onExtend && (
        <ControlButton
          icon="⏱️"
          label="Extend"
          onClick={() => { impact("light"); onExtend?.(); }}
        />
      )}
      <ControlButton
        icon="📞"
        label="End"
        danger
        onClick={handleEnd}
      />
    </div>
  );
}
