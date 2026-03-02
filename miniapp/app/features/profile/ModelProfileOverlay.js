"use client";

import { useEffect, useState, useRef } from "react";
import { api } from "../../_lib/apiClient";
import { mapApiError, formatNgn, resolveDisplayName } from "../../_lib/formatters";
import { useFollowStore } from "../../_store/useFollowStore";
import { useHaptic } from "../../_hooks/useHaptic";
import { SkeletonProfile } from "../../_components/SkeletonCard";
import GalleryCard from "../gallery/GalleryCard";

export default function ModelProfileOverlay({ publicId, open, onClose, onBook }) {
  const [model, setModel] = useState(null);
  const [content, setContent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { followedIds, toggleFollow } = useFollowStore();
  const { impact, notification } = useHaptic();
  const startY = useRef(null);

  useEffect(() => {
    if (!open || !publicId) return;
    setLoading(true);
    setError(null);
    Promise.all([
      api.get(`/api/models/${publicId}`),
      api.get("/api/content", { model_public_id: publicId, limit: 18 }),
    ]).then(([modelData, contentData]) => {
      setModel(modelData);
      setContent(contentData.items || contentData || []);
    }).catch((err) => setError(mapApiError(err)))
      .finally(() => setLoading(false));
  }, [open, publicId]);

  const handleFollow = async () => {
    if (!model) return;
    const modelId = model.id;
    const isFollowing = followedIds.has(modelId);
    impact("medium");
    toggleFollow(modelId);
    try {
      await api.post("/api/follow", { model_id: modelId, action: isFollowing ? "unfollow" : "follow" });
      notification("success");
    } catch {
      toggleFollow(modelId); // revert
      notification("error");
    }
  };

  // Swipe down to close
  const onTouchStart = (e) => { startY.current = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (startY.current === null) return;
    if (e.changedTouches[0].clientY - startY.current > 80) onClose?.();
    startY.current = null;
  };

  if (!open) return null;

  const name = model ? resolveDisplayName(model, "Creator") : "";
  const isFollowing = model ? followedIds.has(model.id) : false;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 75 }} />
      <div
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{
          position: "fixed",
          top: "5vh",
          left: 0,
          right: 0,
          bottom: 0,
          background: "var(--bg)",
          borderRadius: "22px 22px 0 0",
          zIndex: 76,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--line)" }} />
        </div>

        {loading ? (
          <SkeletonProfile />
        ) : error ? (
          <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>{error}</div>
        ) : model ? (
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Cover photo */}
            {model.cover_url && (
              <div style={{ height: "180px", overflow: "hidden" }}>
                <img src={model.cover_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}

            {/* Profile header */}
            <div style={{ padding: "16px", display: "flex", gap: "14px", alignItems: "flex-start" }}>
              <div style={{ width: "72px", height: "72px", borderRadius: "50%", overflow: "hidden", background: "var(--line)", flexShrink: 0, marginTop: model.cover_url ? "-36px" : 0, border: "3px solid var(--bg)" }}>
                {model.avatar_url ? (
                  <img src={model.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", color: "var(--muted)" }}>{name[0]}</div>
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "19px", fontWeight: 700 }}>{name}</div>
                {model.status_message && (
                  <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px" }}>{model.status_message}</div>
                )}
                {/* Stats row */}
                <div style={{ display: "flex", gap: "16px", marginTop: "8px" }}>
                  <Stat value={model.follower_count || 0} label="Followers" />
                  <Stat value={model.content_count || 0} label="Posts" />
                  {model.avg_rating > 0 && <Stat value={`★ ${Number(model.avg_rating).toFixed(1)}`} label={`${model.total_ratings} reviews`} />}
                </div>
              </div>
            </div>

            {/* Tags */}
            {model.tags?.length > 0 && (
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", padding: "0 16px 12px" }}>
                {model.tags.map((tag) => (
                  <span key={tag} className="tag-chip">{tag}</span>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: "flex", gap: "10px", padding: "0 16px 16px" }}>
              <button
                onClick={handleFollow}
                style={{
                  flex: 1,
                  padding: "12px",
                  borderRadius: "14px",
                  border: isFollowing ? "1px solid var(--line)" : "none",
                  background: isFollowing ? "none" : "var(--accent)",
                  color: isFollowing ? "var(--ink)" : "#fff",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {isFollowing ? "Following" : "Follow"}
              </button>
              {onBook && (
                <button
                  onClick={() => onBook(model)}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "14px",
                    border: "none",
                    background: "var(--card)",
                    color: "var(--ink)",
                    fontSize: "15px",
                    fontWeight: 600,
                    cursor: "pointer",
                    border: "1px solid var(--line)",
                  }}
                >
                  Book · {model.access_fee_ngn ? formatNgn(model.access_fee_ngn) : "Free"}
                </button>
              )}
            </div>

            {/* Content grid */}
            <div className="content-grid-3col">
              {content.map((item) => (
                <GalleryCard key={item.id} item={item} isPurchased={item.is_purchased} />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "16px", fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif" }}>{label}</div>
    </div>
  );
}
