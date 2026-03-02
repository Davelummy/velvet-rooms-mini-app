"use client";

import { memo } from "react";
import AvatarWithRing from "../../_components/AvatarWithRing";
import { resolveDisplayName } from "../../_lib/formatters";

const StoryAvatar = memo(function StoryAvatar({ group, groupIndex, onTap }) {
  const { model, stories, hasUnseen } = group;
  const name = resolveDisplayName(model, "Creator");
  const isLive = model.is_live || false;

  return (
    <button
      onClick={() => onTap?.(groupIndex)}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "6px",
        background: "none",
        border: "none",
        cursor: "pointer",
        flexShrink: 0,
        width: "64px",
        padding: 0,
      }}
    >
      <AvatarWithRing
        src={model.avatar_url}
        alt={name}
        size={56}
        hasStory={stories.length > 0}
        hasSeen={!hasUnseen}
        isLive={isLive}
        onClick={undefined} // handled by parent button
      />
      <span style={{
        fontSize: "11px",
        color: "var(--ink)",
        fontFamily: "'Space Grotesk', sans-serif",
        maxWidth: "60px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        textAlign: "center",
      }}>
        {name.split(" ")[0]}
      </span>
    </button>
  );
});

export default StoryAvatar;
