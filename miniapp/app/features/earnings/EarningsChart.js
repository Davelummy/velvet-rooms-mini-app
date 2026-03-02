"use client";

import { useMemo } from "react";
import { formatNgn } from "../../_lib/formatters";

const CATEGORY_COLORS = {
  sessions: "var(--accent)",
  content: "var(--accent-2)",
  tips: "var(--accent-3)",
  gifts: "var(--accent-4)",
};

const BAR_WIDTH = 36;
const BAR_GAP = 12;
const HEIGHT = 160;
const PADDING = { top: 20, bottom: 32, left: 8, right: 8 };

export default function EarningsChart({ data = [], activeCategory = "all" }) {
  const maxVal = useMemo(() => {
    if (!data.length) return 1;
    return Math.max(1, ...data.map((d) => {
      if (activeCategory === "all") return d.total_ngn || 0;
      return d[`${activeCategory}_ngn`] || 0;
    }));
  }, [data, activeCategory]);

  const svgWidth = data.length * (BAR_WIDTH + BAR_GAP) + PADDING.left + PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const points = data.map((d, i) => {
    const val = activeCategory === "all" ? (d.total_ngn || 0) : (d[`${activeCategory}_ngn`] || 0);
    const x = PADDING.left + i * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
    const y = PADDING.top + chartHeight - (val / maxVal) * chartHeight;
    return `${x},${y}`;
  });

  if (!data.length) {
    return (
      <div style={{ height: `${HEIGHT}px`, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "14px" }}>
        No data yet
      </div>
    );
  }

  const color = activeCategory === "all" ? "var(--accent)" : CATEGORY_COLORS[activeCategory] || "var(--accent)";

  return (
    <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <svg width={Math.max(svgWidth, 300)} height={HEIGHT} style={{ display: "block" }}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
          const y = PADDING.top + chartHeight * (1 - pct);
          return (
            <line key={pct} x1={PADDING.left} y1={y} x2={svgWidth - PADDING.right} y2={y}
              stroke="var(--line)" strokeWidth="1" />
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const val = activeCategory === "all" ? (d.total_ngn || 0) : (d[`${activeCategory}_ngn`] || 0);
          const barH = (val / maxVal) * chartHeight;
          const x = PADDING.left + i * (BAR_WIDTH + BAR_GAP);
          const y = PADDING.top + chartHeight - barH;

          return (
            <g key={i}>
              <rect
                x={x} y={y}
                width={BAR_WIDTH} height={barH}
                rx="6" fill={color} opacity="0.85"
              />
              {/* Month label */}
              <text
                x={x + BAR_WIDTH / 2} y={HEIGHT - 4}
                textAnchor="middle" fontSize="10"
                fill="var(--muted)" fontFamily="Space Grotesk, sans-serif"
              >
                {d.month ? new Date(d.month).toLocaleDateString("en", { month: "short" }) : ""}
              </text>
            </g>
          );
        })}

        {/* Trend line */}
        {points.length > 1 && (
          <polyline
            points={points.join(" ")}
            fill="none"
            stroke={color}
            strokeWidth="2"
            opacity="0.5"
            strokeDasharray="4 2"
          />
        )}
      </svg>
    </div>
  );
}
