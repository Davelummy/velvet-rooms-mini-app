"use client";

import ExploreGrid from "./ExploreGrid";

export default function ExploreTab({ onModelTap, onBook }) {
  return (
    <section className="flow-card">
      <div style={{ marginBottom: "12px" }}>
        <p className="eyebrow" style={{ marginBottom: "6px" }}>Discover</p>
        <h3 style={{ margin: 0 }}>Explore Profiles</h3>
        <p className="helper" style={{ marginTop: "8px" }}>
          Find verified creators, open profiles, and jump into fresh posts below.
        </p>
      </div>
      <ExploreGrid onModelTap={onModelTap} onBook={onBook} />
    </section>
  );
}
