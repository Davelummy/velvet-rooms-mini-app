"use client";

import { useFeedStore } from "../../_store/useFeedStore";
import { useHaptic } from "../../_hooks/useHaptic";

export default function FeedTabSwitcher() {
  const { activeTab, setActiveTab } = useFeedStore();
  const { selection } = useHaptic();

  const handleSwitch = (tab) => {
    if (tab === activeTab) return;
    selection();
    setActiveTab(tab);
  };

  return (
    <div style={{
      position: "absolute",
      top: "16px",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 10,
      display: "flex",
      gap: "0",
      background: "rgba(0,0,0,0.4)",
      borderRadius: "999px",
      padding: "3px",
      backdropFilter: "blur(8px)",
    }}>
      {["foryou", "following"].map((tab) => (
        <button
          key={tab}
          onClick={() => handleSwitch(tab)}
          style={{
            padding: "6px 16px",
            borderRadius: "999px",
            border: "none",
            background: activeTab === tab ? "#fff" : "none",
            color: activeTab === tab ? "#000" : "rgba(255,255,255,0.7)",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "'Space Grotesk', sans-serif",
            transition: "all 0.2s",
          }}
        >
          {tab === "foryou" ? "For You" : "Following"}
        </button>
      ))}
    </div>
  );
}
