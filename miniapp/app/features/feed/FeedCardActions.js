"use client";

import { useState } from "react";
import { useFeedStore } from "../../_store/useFeedStore";
import { useHaptic } from "../../_hooks/useHaptic";
import { api } from "../../_lib/apiClient";
import { formatNgn } from "../../_lib/formatters";

export default function FeedCardActions({ item, onModelTap, onBook }) {
  const { likedItems, toggleLike } = useFeedStore();
  const { impact } = useHaptic();
  const [likeCount, setLikeCount] = useState(item.like_count || 0);

  const isLiked = likedItems.has(item.id);

  const handleLike = async () => {
    if (isLiked) return;
    impact("medium");
    toggleLike(item.id);
    setLikeCount((c) => c + 1);
    try {
      await api.post("/api/content/like", { content_id: item.id });
    } catch {}
  };

  return (
    <div className="feed-actions-rail">
      {/* Model avatar */}
      <button onClick={onModelTap} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
        <div style={{
          width: "46px",
          height: "46px",
          borderRadius: "50%",
          overflow: "hidden",
          background: "var(--line)",
          border: "2px solid #fff",
        }}>
          {item.model_avatar_url ? (
            <img src={item.model_avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>?</div>
          )}
        </div>
      </button>

      {/* Like */}
      <ActionButton icon={isLiked ? "❤️" : "🤍"} label={likeCount || ""} onClick={handleLike} />

      {/* Book */}
      {onBook && (
        <ActionButton icon="📅" label="Book" onClick={() => { impact("light"); onBook(item); }} />
      )}
    </div>
  );
}

function ActionButton({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "4px",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px",
      }}
    >
      <div style={{ fontSize: "28px", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>{icon}</div>
      {label !== "" && (
        <span style={{ fontSize: "11px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif", textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
          {label}
        </span>
      )}
    </button>
  );
}
