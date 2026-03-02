"use client";

export function SkeletonGallery() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "2px" }}>
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="skeleton-media skeleton-block" style={{ aspectRatio: "1", width: "100%" }} />
      ))}
    </div>
  );
}

export function SkeletonList({ count = 5 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <div className="skeleton-avatar skeleton-block" style={{ width: "44px", height: "44px", flexShrink: 0 }} />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "8px" }}>
            <div className="skeleton-text skeleton-block" style={{ width: "60%" }} />
            <div className="skeleton-text skeleton-block" style={{ width: "40%", height: "10px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonProfile() {
  return (
    <div style={{ padding: "16px" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <div className="skeleton-avatar skeleton-block" style={{ width: "80px", height: "80px" }} />
        <div className="skeleton-text skeleton-block" style={{ width: "140px" }} />
        <div className="skeleton-text skeleton-block" style={{ width: "200px", height: "10px" }} />
      </div>
      <SkeletonGallery />
    </div>
  );
}

export function SkeletonSession({ count = 4 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: "var(--card)",
          borderRadius: "16px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div className="skeleton-avatar skeleton-block" style={{ width: "40px", height: "40px" }} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
              <div className="skeleton-text skeleton-block" style={{ width: "50%" }} />
              <div className="skeleton-text skeleton-block" style={{ width: "35%", height: "10px" }} />
            </div>
            <div className="skeleton-text skeleton-block" style={{ width: "60px", height: "24px", borderRadius: "999px" }} />
          </div>
          <div className="skeleton-text skeleton-block" style={{ width: "80%" }} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonEarnings() {
  return (
    <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div className="skeleton-media skeleton-block" style={{ height: "180px", borderRadius: "16px" }} />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div className="skeleton-text skeleton-block" style={{ width: "100px" }} />
            <div className="skeleton-text skeleton-block" style={{ width: "60px", height: "10px" }} />
          </div>
          <div className="skeleton-text skeleton-block" style={{ width: "70px" }} />
        </div>
      ))}
    </div>
  );
}
