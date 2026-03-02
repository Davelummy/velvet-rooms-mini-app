"use client";

import { useEffect, useRef } from "react";

export default function BottomSheet({ open, onClose, children, title, maxHeight = "90vh" }) {
  const startY = useRef(null);
  const sheetRef = useRef(null);

  // Swipe down to close
  const onTouchStart = (e) => {
    startY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e) => {
    if (startY.current === null) return;
    const dy = e.changedTouches[0].clientY - startY.current;
    if (dy > 80) onClose?.();
    startY.current = null;
  };

  // Trap scroll inside sheet
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.6)",
          zIndex: 49,
          backdropFilter: "blur(2px)",
        }}
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`bottom-sheet open`}
        style={{
          zIndex: 50,
          background: "var(--card)",
          maxHeight,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--line)" }} />
        </div>
        {title && (
          <div style={{
            padding: "0 20px 16px",
            fontSize: "18px",
            fontWeight: 600,
            borderBottom: "1px solid var(--line)",
          }}>
            {title}
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </>
  );
}
