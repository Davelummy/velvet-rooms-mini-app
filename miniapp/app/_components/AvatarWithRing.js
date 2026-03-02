"use client";

export default function AvatarWithRing({
  src,
  alt = "Avatar",
  size = 56,
  hasStory = false,
  hasSeen = false,
  isLive = false,
  onClick,
}) {
  const ringState = isLive ? "going-live" : hasSeen ? "seen" : hasStory ? "unseen" : "none";

  return (
    <div
      onClick={onClick}
      style={{ position: "relative", display: "inline-flex", cursor: onClick ? "pointer" : "default" }}
    >
      {(hasStory || isLive) && (
        <div
          className={`story-ring ${ringState === "seen" ? "seen" : ""} ${ringState === "going-live" ? "going-live" : ""}`}
          style={{
            position: "absolute",
            inset: "-3px",
            borderRadius: "50%",
          }}
        />
      )}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          overflow: "hidden",
          background: "var(--line)",
          flexShrink: 0,
          position: "relative",
        }}
      >
        {src ? (
          <img
            src={src}
            alt={alt}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
            loading="lazy"
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: size * 0.4,
              color: "var(--muted)",
            }}
          >
            {alt?.[0]?.toUpperCase() ?? "?"}
          </div>
        )}
      </div>
      {isLive && (
        <div style={{
          position: "absolute",
          bottom: 0,
          left: "50%",
          transform: "translateX(-50%)",
          background: "var(--accent)",
          color: "#fff",
          fontSize: "8px",
          fontWeight: 700,
          letterSpacing: "0.06em",
          padding: "1px 5px",
          borderRadius: "4px",
          fontFamily: "'Space Grotesk', sans-serif",
        }}>
          LIVE
        </div>
      )}
    </div>
  );
}
