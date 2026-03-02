"use client";

export default function ConfirmDialog({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm, onCancel, destructive = false }) {
  if (!open) return null;

  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 80,
          backdropFilter: "blur(4px)",
        }}
      />
      <div style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%,-50%)",
        zIndex: 81,
        background: "var(--card)",
        borderRadius: "20px",
        padding: "24px",
        width: "min(340px, 90vw)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {title && (
          <h3 style={{ margin: "0 0 12px", fontSize: "18px", fontWeight: 700 }}>
            {title}
          </h3>
        )}
        {message && (
          <p style={{ margin: "0 0 24px", color: "var(--muted)", fontSize: "14px", lineHeight: 1.5 }}>
            {message}
          </p>
        )}
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid var(--line)",
              background: "none",
              color: "var(--ink)",
              fontSize: "15px",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "12px",
              border: "none",
              background: destructive ? "#dc2626" : "var(--accent)",
              color: "#fff",
              fontSize: "15px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}
