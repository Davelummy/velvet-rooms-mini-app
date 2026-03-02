"use client";

import { forwardRef } from "react";

const PullToRefresh = forwardRef(function PullToRefresh(props, ref) {
  return (
    <div
      ref={ref}
      style={{
        height: 0,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "height 0.1s",
        opacity: 0,
      }}
    >
      <div style={{
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        border: "3px solid var(--line)",
        borderTopColor: "var(--accent)",
        animation: "spin 0.8s linear infinite",
      }} />
    </div>
  );
});

export default PullToRefresh;
