"use client";

import { useEffect, useState } from "react";
import { api } from "../../_lib/apiClient";
import { formatNgn, formatDate, mapApiError } from "../../_lib/formatters";
import { EmptyState, ErrorState } from "../../_components/ui-kit";
import { SkeletonEarnings } from "../../_components/SkeletonCard";

export default function EarningsTab() {
  const [earnings, setEarnings] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEarnings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get("/api/earnings");
      setEarnings(data);
      setTransactions(data.transactions || data.recent || []);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
  }, []);

  if (loading) return <SkeletonEarnings />;
  if (error) return <ErrorState message={error} onRetry={fetchEarnings} />;

  return (
    <div style={{ padding: "16px" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "24px" }}>
        <SummaryCard label="Total Earned" value={formatNgn(earnings?.total_ngn || earnings?.total || 0)} accent />
        <SummaryCard label="Pending" value={formatNgn(earnings?.pending_ngn || earnings?.pending || 0)} />
        <SummaryCard label="This Month" value={formatNgn(earnings?.this_month_ngn || earnings?.this_month || 0)} />
        <SummaryCard label="Sessions" value={earnings?.session_count || 0} />
      </div>

      {/* Recent transactions */}
      <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Recent</h3>
      {transactions.length === 0 ? (
        <EmptyState title="No earnings yet" body="Complete sessions to start earning." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {transactions.map((tx, i) => (
            <EarningsRow key={tx.id || i} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div style={{
      background: "var(--card)",
      borderRadius: "16px",
      padding: "16px",
      border: "1px solid var(--line)",
    }}>
      <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif", marginBottom: "6px" }}>
        {label}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: accent ? "var(--accent)" : "var(--ink)" }}>
        {value}
      </div>
    </div>
  );
}

function EarningsRow({ tx }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 16px",
      background: "var(--card)",
      borderRadius: "14px",
      border: "1px solid var(--line)",
    }}>
      <div>
        <div style={{ fontSize: "14px", fontWeight: 500 }}>{tx.description || tx.type || "Session"}</div>
        <div style={{ fontSize: "12px", color: "var(--muted)" }}>{formatDate(tx.created_at)}</div>
      </div>
      <div style={{ color: "#22c55e", fontWeight: 700, fontSize: "15px" }}>
        +{formatNgn(tx.amount_ngn || tx.net_amount || tx.amount)}
      </div>
    </div>
  );
}
