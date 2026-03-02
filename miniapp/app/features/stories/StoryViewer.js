"use client";

import { useEffect, useRef, useCallback } from "react";
import { useStoriesStore } from "../../_store/useStoriesStore";
import { resolveDisplayName, timeAgo } from "../../_lib/formatters";
import { api } from "../../_lib/apiClient";
import StoryProgress from "./StoryProgress";
import StoryTapZones from "./StoryTapZones";

const STORY_DURATION = 5000; // 5 seconds per story

export default function StoryViewer({ onClose }) {
  const { viewer, storyGroups, nextStory, prevStory, pauseViewer, resumeViewer, markSeen } = useStoriesStore();
  const timerRef = useRef(null);

  const currentGroup = storyGroups[viewer.groupIndex];
  const currentStory = currentGroup?.stories[viewer.storyIndex];

  const advance = useCallback(() => {
    if (currentStory) {
      markSeen(currentStory.id);
      // Record view
      api.post(`/api/stories/${currentStory.id}/view`, {}).catch(() => {});
    }
    nextStory();
  }, [currentStory, markSeen, nextStory]);

  // Auto-advance timer
  useEffect(() => {
    if (!viewer.open || viewer.paused || !currentStory) return;
    timerRef.current = setTimeout(advance, STORY_DURATION);
    return () => clearTimeout(timerRef.current);
  }, [viewer.open, viewer.paused, viewer.groupIndex, viewer.storyIndex, advance]);

  // Handle close when all stories done
  useEffect(() => {
    if (viewer.open === false) onClose?.();
  }, [viewer.open, onClose]);

  // Prefetch next story media
  useEffect(() => {
    if (!currentGroup) return;
    const nextStoryInGroup = currentGroup.stories[viewer.storyIndex + 1];
    const nextGroup = storyGroups[viewer.groupIndex + 1];
    const nextUrl = nextStoryInGroup?.media_url || nextGroup?.stories[0]?.media_url;
    if (!nextUrl) return;
    if (nextUrl.match(/\.(mp4|webm|mov)$/i)) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "video";
      link.href = nextUrl;
      document.head.appendChild(link);
      return () => document.head.removeChild(link);
    } else {
      const img = new Image();
      img.src = nextUrl;
    }
  }, [currentGroup, storyGroups, viewer.storyIndex, viewer.groupIndex]);

  if (!viewer.open || !currentGroup || !currentStory) return null;

  const model = currentGroup.model;
  const modelName = resolveDisplayName(model, "Creator");

  return (
    <div className="story-viewer" style={{ userSelect: "none" }}>
      {/* Background media */}
      {currentStory.media_type === "video" ? (
        <video
          key={currentStory.id}
          src={currentStory.media_url}
          autoPlay
          playsInline
          muted={false}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          onPlay={resumeViewer}
        />
      ) : (
        <img
          key={currentStory.id}
          src={currentStory.media_url}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}

      {/* Gradient top */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "160px", background: "linear-gradient(rgba(0,0,0,0.6), transparent)", zIndex: 1 }} />
      {/* Gradient bottom */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "120px", background: "linear-gradient(transparent, rgba(0,0,0,0.7))", zIndex: 1 }} />

      {/* Progress */}
      <div style={{ position: "absolute", top: "env(safe-area-inset-top)", left: 0, right: 0, zIndex: 2 }}>
        <StoryProgress
          count={currentGroup.stories.length}
          currentIndex={viewer.storyIndex}
          duration={STORY_DURATION / 1000}
          paused={viewer.paused}
        />
      </div>

      {/* Header */}
      <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 24px)", left: "12px", right: "48px", display: "flex", gap: "10px", alignItems: "center", zIndex: 2 }}>
        <div style={{ width: "36px", height: "36px", borderRadius: "50%", overflow: "hidden", background: "var(--line)" }}>
          {model.avatar_url ? (
            <img src={model.avatar_url} alt={modelName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff" }}>{modelName[0]}</div>
          )}
        </div>
        <div>
          <div style={{ color: "#fff", fontWeight: 600, fontSize: "14px" }}>{modelName}</div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px" }}>{timeAgo(currentStory.created_at)}</div>
        </div>
      </div>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top) + 24px)", right: "16px", background: "none", border: "none", color: "#fff", fontSize: "26px", cursor: "pointer", zIndex: 2, lineHeight: 1 }}
      >
        ×
      </button>

      {/* Caption / CTA */}
      {(currentStory.caption || currentStory.cta_text) && (
        <div style={{ position: "absolute", bottom: "60px", left: "16px", right: "16px", zIndex: 2 }}>
          {currentStory.caption && (
            <p style={{ color: "#fff", margin: "0 0 8px", fontSize: "14px", lineHeight: 1.5, textShadow: "0 1px 4px rgba(0,0,0,0.6)" }}>{currentStory.caption}</p>
          )}
          {currentStory.cta_text && (
            <button style={{ padding: "10px 20px", borderRadius: "12px", background: "var(--accent)", border: "none", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>
              {currentStory.cta_text}
            </button>
          )}
        </div>
      )}

      {/* Tap zones (pause on hold, prev/next on tap) */}
      <StoryTapZones onPrev={prevStory} onNext={advance} onPause={pauseViewer} onResume={resumeViewer} />
    </div>
  );
}
