"use client";

import { memo, useState, useCallback } from "react";
import { useGalleryStore } from "../../_store/useGalleryStore";
import { useHaptic } from "../../_hooks/useHaptic";
import { formatNgn } from "../../_lib/formatters";

const GalleryCard = memo(function GalleryCard({ item, onTap, isPurchased = false }) {
  const { likedItems, toggleLike } = useGalleryStore();
  const { impact } = useHaptic();
  const [doubleTapTimer, setDoubleTapTimer] = useState(null);
  const [heartBurst, setHeartBurst] = useState(false);

  const isLiked = likedItems.has(item.id);
  const isLocked = item.is_premium && !isPurchased;

  const handleTap = useCallback(() => {
    if (doubleTapTimer) {
      // Double tap — like!
      clearTimeout(doubleTapTimer);
      setDoubleTapTimer(null);
      if (!isLiked) {
        toggleLike(item.id);
        impact("medium");
        setHeartBurst(true);
        setTimeout(() => setHeartBurst(false), 800);
      }
    } else {
      const timer = setTimeout(() => {
        setDoubleTapTimer(null);
        onTap?.(item);
      }, 250);
      setDoubleTapTimer(timer);
    }
  }, [doubleTapTimer, isLiked, item, toggleLike, impact, onTap]);

  return (
    <div
      onClick={handleTap}
      style={{
        position: "relative",
        aspectRatio: "1",
        borderRadius: "2px",
        overflow: "hidden",
        background: "var(--line)",
        cursor: "pointer",
      }}
    >
      {item.thumbnail_url || item.media_url ? (
        <img
          src={item.thumbnail_url || item.media_url}
          alt=""
          loading="lazy"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: isLocked ? "blur(12px)" : "none",
          }}
        />
      ) : (
        <div style={{ width: "100%", height: "100%", background: "var(--line)" }} />
      )}

      {/* Video indicator */}
      {item.media_type === "video" && !isLocked && (
        <div style={{
          position: "absolute",
          top: "6px",
          left: "6px",
          background: "rgba(0,0,0,0.6)",
          color: "#fff",
          fontSize: "10px",
          padding: "2px 6px",
          borderRadius: "6px",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          ▶
        </div>
      )}

      {/* Lock overlay */}
      {isLocked && (
        <div className="lock-overlay">
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "28px", marginBottom: "4px" }}>🔒</div>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>{formatNgn(item.price_ngn)}</div>
          </div>
        </div>
      )}

      {/* Like count */}
      {item.like_count > 0 && !isLocked && (
        <div style={{
          position: "absolute",
          bottom: "4px",
          right: "6px",
          fontSize: "11px",
          color: "rgba(255,255,255,0.9)",
          fontFamily: "'Space Grotesk', sans-serif",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
        }}>
          ♥ {item.like_count}
        </div>
      )}

      {/* Heart burst animation */}
      {heartBurst && (
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          animation: "gift-float 0.8s ease-out forwards",
          fontSize: "48px",
        }}>
          ❤️
        </div>
      )}
    </div>
  );
});

export default GalleryCard;
