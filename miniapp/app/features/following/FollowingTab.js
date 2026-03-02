"use client";

import { useEffect } from "react";
import { useFollowStore } from "../../_store/useFollowStore";
import { api } from "../../_lib/apiClient";
import { resolveDisplayName, mapApiError } from "../../_lib/formatters";
import { EmptyState, ErrorState } from "../../_components/ui-kit";
import { SkeletonList } from "../../_components/SkeletonCard";
import { useState } from "react";
import { useHaptic } from "../../_hooks/useHaptic";

export default function FollowingTab({ onModelTap }) {
  const { following, followingLoading, setFollowing, setFollowingLoading, followedIds, setFollowedIds, toggleFollow } = useFollowStore();
  const [error, setError] = useState(null);
  const { impact } = useHaptic();

  const fetchFollowing = async () => {
    setFollowingLoading(true);
    setError(null);
    try {
      const data = await api.get("/api/following");
      const items = data.items || data || [];
      setFollowing(items);
      setFollowedIds(items.map((m) => m.id || m.model_id));
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setFollowingLoading(false);
    }
  };

  useEffect(() => {
    fetchFollowing();
  }, []);

  const handleUnfollow = async (model) => {
    impact("medium");
    try {
      await api.post("/api/follow", { model_id: model.id || model.model_id, action: "unfollow" });
      toggleFollow(model.id || model.model_id);
      setFollowing(following.filter((m) => (m.id || m.model_id) !== (model.id || model.model_id)));
    } catch {}
  };

  if (followingLoading) return <SkeletonList count={6} />;
  if (error) return <ErrorState message={error} onRetry={fetchFollowing} />;
  if (following.length === 0) return <EmptyState title="Not following anyone yet" body="Find creators to follow in Explore." />;

  return (
    <div>
      {following.map((model) => (
        <FollowerCard
          key={model.id || model.model_id}
          model={model}
          onTap={() => onModelTap?.(model)}
          onUnfollow={() => handleUnfollow(model)}
        />
      ))}
    </div>
  );
}

function FollowerCard({ model, onTap, onUnfollow }) {
  const name = resolveDisplayName(model, "Creator");
  return (
    <div style={{
      display: "flex",
      gap: "12px",
      alignItems: "center",
      padding: "14px 16px",
      borderBottom: "1px solid var(--line)",
    }}>
      <div onClick={onTap} style={{ width: "48px", height: "48px", borderRadius: "50%", overflow: "hidden", background: "var(--line)", flexShrink: 0, cursor: "pointer" }}>
        {model.avatar_url ? (
          <img src={model.avatar_url} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", color: "var(--muted)" }}>{name[0]}</div>
        )}
      </div>
      <div onClick={onTap} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
        <div style={{ fontWeight: 600, fontSize: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
        {model.tags?.length > 0 && (
          <div style={{ fontSize: "12px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{model.tags.join(" · ")}</div>
        )}
      </div>
      <button
        onClick={onUnfollow}
        style={{
          padding: "8px 14px",
          borderRadius: "10px",
          border: "1px solid var(--line)",
          background: "none",
          color: "var(--muted)",
          fontSize: "13px",
          cursor: "pointer",
        }}
      >
        Unfollow
      </button>
    </div>
  );
}
