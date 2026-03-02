"use client";

import VerticalFeed from "./VerticalFeed";
import FeedTabSwitcher from "./FeedTabSwitcher";
import StoriesStrip from "../stories/StoriesStrip";

export default function FeedTab({ onModelTap, onBook }) {
  return (
    <div style={{ position: "relative" }}>
      <FeedTabSwitcher />
      <VerticalFeed onModelTap={onModelTap} onBook={onBook} />
    </div>
  );
}
