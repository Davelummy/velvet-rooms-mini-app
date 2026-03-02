"use client";

import { memo } from "react";
import { resolveDisplayName } from "../../_lib/formatters";
import { useFollowStore } from "../../_store/useFollowStore";
import { useSwipe } from "../../_hooks/useSwipe";
import { useHaptic } from "../../_hooks/useHaptic";
import { api } from "../../_lib/apiClient";

const ModelCard = memo(function ModelCard({ model, onTap, onBook, onDismiss }) {
  const { followedIds, toggleFollow } = useFollowStore();
  const { impact } = useHaptic();
  const name = resolveDisplayName(model, "Creator");
  const modelId = model.id || model.user_id;
  const isFollowing = followedIds.has(modelId);
  const isAvailable = model.is_available || model.availability_status === "available";

  const swipe = useSwipe({
    onSwipeRight: () => {
      impact("light");
      if (!isFollowing) {
        toggleFollow(modelId);
        api.post(`/api/follow/${modelId}`, {}).catch(() => toggleFollow(modelId));
      }
    },
    onSwipeLeft: () => {
      impact("light");
      onDismiss?.(modelId);
    },
  });

  return (
    <div className="model-card" onClick={() => onTap?.(model)} style={{ cursor: "pointer" }} {...swipe}>
      {/* Cover photo */}
      <div style={{ position: "relative", paddingTop: "120%" }}>
        <img
          src={model.avatar_url || model.cover_url}
          alt={name}
          loading="lazy"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
        {/* Gradient */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(transparent 50%, rgba(0,0,0,0.85) 100%)",
        }} />

        {/* Available badge */}
        {isAvailable && (
          <div style={{ position: "absolute", top: "10px", right: "10px" }}>
            <span className="available-badge" style={{ fontSize: "11px", color: "#fff", fontFamily: "'Space Grotesk', sans-serif", padding: "3px 8px", background: "rgba(0,0,0,0.5)", borderRadius: "999px" }}>
              Available
            </span>
          </div>
        )}

        {/* Following badge */}
        {isFollowing && (
          <div style={{ position: "absolute", top: "10px", left: "10px", background: "var(--accent)", borderRadius: "999px", padding: "2px 8px" }}>
            <span style={{ fontSize: "10px", color: "#fff", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>Following</span>
          </div>
        )}

        {/* Name / info */}
        <div style={{ position: "absolute", bottom: "10px", left: "10px", right: "10px" }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {name}
          </div>
          {model.tags?.length > 0 && (
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {model.tags.slice(0, 2).join(" · ")}
            </div>
          )}
        </div>
      </div>

      {/* Book button */}
      {onBook && (
        <button
          onClick={(e) => { e.stopPropagation(); onBook(model); }}
          style={{
            width: "100%",
            padding: "10px",
            background: "var(--accent)",
            border: "none",
            color: "#fff",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Book Session
        </button>
      )}
    </div>
  );
});

export default ModelCard;
