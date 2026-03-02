"use client";

const AGE_GATE_STORAGE_KEY = "vr_age_confirmed";

export default function AgeGate({ onConfirm }) {
  const handleConfirm = () => {
    localStorage.setItem(AGE_GATE_STORAGE_KEY, "true");
    onConfirm?.();
  };

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--bg)",
      zIndex: 200,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ maxWidth: "340px", width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "60px", marginBottom: "20px" }}>🔞</div>
        <h1 style={{ fontSize: "28px", marginBottom: "12px" }}>Adults Only</h1>
        <p style={{ color: "var(--muted)", fontSize: "15px", lineHeight: 1.6, marginBottom: "32px" }}>
          Velvet Rooms contains adult content. By continuing, you confirm you are 18 years of age or older.
        </p>
        <button
          onClick={handleConfirm}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "16px",
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: "16px",
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: "12px",
          }}
        >
          I am 18+ — Enter
        </button>
        <p style={{ fontSize: "11px", color: "var(--muted)", lineHeight: 1.5 }}>
          By entering, you agree to our Terms of Service and confirm you meet age requirements in your jurisdiction.
        </p>
      </div>
    </div>
  );
}
