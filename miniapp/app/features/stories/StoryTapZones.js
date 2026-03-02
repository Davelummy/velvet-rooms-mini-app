"use client";

import { useRef } from "react";

const HOLD_THRESHOLD = 200; // ms

export default function StoryTapZones({ onPrev, onNext, onPause, onResume }) {
  const holdTimer = useRef(null);
  const isHolding = useRef(false);

  const makeZoneHandlers = (side) => ({
    onMouseDown: () => {
      holdTimer.current = setTimeout(() => {
        isHolding.current = true;
        onPause?.();
      }, HOLD_THRESHOLD);
    },
    onMouseUp: () => {
      clearTimeout(holdTimer.current);
      if (isHolding.current) {
        isHolding.current = false;
        onResume?.();
      } else {
        side === "left" ? onPrev?.() : onNext?.();
      }
    },
    onTouchStart: () => {
      holdTimer.current = setTimeout(() => {
        isHolding.current = true;
        onPause?.();
      }, HOLD_THRESHOLD);
    },
    onTouchEnd: () => {
      clearTimeout(holdTimer.current);
      if (isHolding.current) {
        isHolding.current = false;
        onResume?.();
      } else {
        side === "left" ? onPrev?.() : onNext?.();
      }
    },
  });

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 3, display: "flex" }}>
      <div style={{ flex: 1 }} {...makeZoneHandlers("left")} />
      <div style={{ flex: 1 }} {...makeZoneHandlers("right")} />
    </div>
  );
}
