"use client";

import { useState, useEffect } from "react";
import { api } from "../../_lib/apiClient";
import { formatNgn, formatDateTime, mapApiError } from "../../_lib/formatters";
import { EmptyState, ErrorState } from "../../_components/ui-kit";
import { SkeletonList } from "../../_components/SkeletonCard";

export default function WalletTab() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWallet = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get("/api/me");
      setWallet({
        balance: data.wallet_balance ?? data.profile?.wallet_balance ?? 0,
      });
      // Fetch recent transactions if available
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, []);

  if (loading) return <SkeletonList count={3} />;
  if (error) return <ErrorState message={error} onRetry={fetchWallet} />;

  return (
    <div style={{ padding: "16px" }}>
      {/* Balance card */}
      <div style={{
        background: "var(--card)",
        borderRadius: "20px",
        padding: "24px",
        marginBottom: "24px",
        border: "1px solid var(--line)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "8px", fontFamily: "'Space Grotesk', sans-serif", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Wallet Balance
        </div>
        <div style={{ fontSize: "40px", fontWeight: 700, color: "var(--accent)" }}>
          {formatNgn(wallet?.balance ?? 0)}
        </div>
      </div>

      {/* Top up section */}
      <div style={{ marginBottom: "24px" }}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>Top Up</h3>
        <div style={{ display: "flex", gap: "10px" }}>
          {[5000, 10000, 20000].map((amount) => (
            <button
              key={amount}
              style={{
                flex: 1,
                padding: "14px 8px",
                borderRadius: "14px",
                border: "1px solid var(--line)",
                background: "var(--card)",
                color: "var(--ink)",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {formatNgn(amount)}
            </button>
          ))}
        </div>
      </div>

      {transactions.length === 0 ? (
        <EmptyState title="No transactions yet" body="Your payment history will appear here." />
      ) : (
        <div>
          <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "12px" }}>History</h3>
          {transactions.map((tx) => (
            <div key={tx.id} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "12px 0",
              borderBottom: "1px solid var(--line)",
            }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 500 }}>{tx.description || tx.type}</div>
                <div style={{ fontSize: "12px", color: "var(--muted)" }}>{formatDateTime(tx.created_at)}</div>
              </div>
              <div style={{ color: tx.amount > 0 ? "#22c55e" : "var(--accent)", fontWeight: 600 }}>
                {tx.amount > 0 ? "+" : ""}{formatNgn(tx.amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
