"use client";

import ExploreGrid from "./ExploreGrid";

export default function ExploreTab({ onModelTap, onBook }) {
  return (
    <div style={{ paddingBottom: "80px" }}>
      <div style={{ padding: "16px 16px 0", fontSize: "22px", fontWeight: 700 }}>
        Explore
      </div>
      <ExploreGrid onModelTap={onModelTap} onBook={onBook} />
    </div>
  );
}
