"use client";

import { useState } from "react";
import TipSheet from "./TipSheet";

export default function TipButton({ recipientId, contextType = "profile", contextId, label = "Send Tip" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 20px",
          borderRadius: "14px",
          border: "none",
          background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
          color: "#fff",
          fontSize: "14px",
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        💜 {label}
      </button>
      <TipSheet
        open={open}
        onClose={() => setOpen(false)}
        recipientId={recipientId}
        contextType={contextType}
        contextId={contextId}
      />
    </>
  );
}
