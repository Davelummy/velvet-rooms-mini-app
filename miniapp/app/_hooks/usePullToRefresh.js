"use client";

import { useRef, useCallback } from "react";

const THRESHOLD = 72;
const RESISTANCE = 0.4;

export function usePullToRefresh({ onRefresh, containerRef }) {
  const startY = useRef(null);
  const pulling = useRef(false);
  const pullEl = useRef(null);

  const onTouchStart = useCallback((e) => {
    const container = containerRef?.current;
    if (container && container.scrollTop > 0) return;
    startY.current = e.touches[0].clientY;
    pulling.current = true;
  }, [containerRef]);

  const onTouchMove = useCallback((e) => {
    if (!pulling.current || startY.current === null) return;
    const delta = (e.touches[0].clientY - startY.current) * RESISTANCE;
    if (delta < 0) return;
    if (pullEl.current) {
      pullEl.current.style.height = `${Math.min(delta, THRESHOLD)}px`;
      pullEl.current.style.opacity = Math.min(delta / THRESHOLD, 1);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!pulling.current) return;
    pulling.current = false;
    startY.current = null;
    if (pullEl.current) {
      const h = parseFloat(pullEl.current.style.height || "0");
      pullEl.current.style.height = "0px";
      pullEl.current.style.opacity = "0";
      if (h >= THRESHOLD * 0.9) {
        onRefresh?.();
      }
    }
  }, [onRefresh]);

  return { onTouchStart, onTouchMove, onTouchEnd, pullEl };
}
