"use client";

export default function StoryProgress({ count, currentIndex, duration = 5, paused }) {
  return (
    <div className="story-progress-bar">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="story-segment">
          {i < currentIndex && (
            <div className="story-segment-fill" style={{ width: "100%", animationDuration: "0s" }} />
          )}
          {i === currentIndex && (
            <div
              className="story-segment-fill"
              style={{
                animationDuration: `${duration}s`,
                animationPlayState: paused ? "paused" : "running",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
