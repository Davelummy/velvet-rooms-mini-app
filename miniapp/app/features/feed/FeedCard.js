"use client";

import { memo } from "react";
import { resolveDisplayName } from "../../_lib/formatters";
import FeedCardActions from "./FeedCardActions";

const FeedCard = memo(function FeedCard({ item, onModelTap, onBook }) {
  const modelName = resolveDisplayName({
    display_name: item.model_display_name || item.model_name,
    username: item.model_username,
    public_id: item.model_public_id,
  }, "Creator");

  const isVideo = item.media_type === "video";
  const isLocked = item.is_premium && !item.is_purchased;

  return (
    <div className="feed-slide">
      {/* Background media */}
      <div style={{ position: "absolute", inset: 0 }}>
        {isLocked ? (
          <div style={{ width: "100%", height: "100%", background: "var(--card)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: "48px" }}>🔒</div>
              <div style={{ color: "var(--muted)", marginTop: "8px" }}>Premium Content</div>
            </div>
          </div>
        ) : isVideo ? (
          <video
            src={item.media_url}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : (
          <img
            src={item.media_url || item.thumbnail_url}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        )}

        {/* Gradient overlay */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(transparent 40%, rgba(0,0,0,0.7) 75%, rgba(0,0,0,0.9) 100%)",
        }} />
      </div>

      {/* Caption overlay */}
      <div style={{
        position: "absolute",
        bottom: "100px",
        left: "16px",
        right: "72px",
      }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: "15px", marginBottom: "6px" }}>
          {modelName}
        </div>
        {item.caption && (
          <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "13px", lineHeight: 1.4, margin: 0 }}>
            {item.caption}
          </p>
        )}
        {item.tags?.length > 0 && (
          <div style={{ marginTop: "8px", display: "flex", gap: "6px", flexWrap: "wrap" }}>
            {item.tags.slice(0, 3).map((tag) => (
              <span key={tag} style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px" }}>
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions rail */}
      <FeedCardActions item={item} onModelTap={() => onModelTap?.(item)} onBook={() => onBook?.(item)} />
    </div>
  );
});

export default FeedCard;
