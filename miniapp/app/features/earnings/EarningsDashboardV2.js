"use client";

import { useEffect } from "react";
import { useEarningsStore } from "../../_store/useEarningsStore";
import { api } from "../../_lib/apiClient";
import { formatNgn, formatDate, mapApiError } from "../../_lib/formatters";
import { SkeletonEarnings } from "../../_components/SkeletonCard";
import { EmptyState, ErrorState, TabBar } from "../../_components/ui-kit";
import EarningsChart from "./EarningsChart";
import { useState } from "react";

const CATEGORY_TABS = [
  { id: "all", label: "All" },
  { id: "sessions", label: "Sessions" },
  { id: "content", label: "Content" },
  { id: "tips", label: "Tips" },
  { id: "gifts", label: "Gifts" },
];

export default function EarningsDashboardV2({ initData = "" }) {
  const { summary, monthly, transactions, loading, category, setSummary, setMonthly, setTransactions, setLoading, setCategory } = useEarningsStore();
  const [error, setError] = useState(null);

  const fetchEarnings = async () => {
    setLoading(true);
    setError(null);
    try {
      const requestWithInit = async (path) => {
        if (!initData) {
          return api.get(path);
        }
        const res = await fetch(path, {
          headers: {
            "x-telegram-init": initData,
          },
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          const err = new Error(payload?.error || `HTTP ${res.status}`);
          err.status = res.status;
          err.data = payload;
          throw err;
        }
        return payload;
      };
      const [summaryData, monthlyData] = await Promise.all([
        requestWithInit("/api/earnings/v2"),
        requestWithInit("/api/earnings/v2?breakdown=monthly"),
      ]);
      setSummary(summaryData.summary || summaryData);
      setMonthly(summaryData.monthly || monthlyData.monthly || []);
      setTransactions(summaryData.transactions || []);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEarnings();
  }, [initData]);

  if (loading) return <SkeletonEarnings />;
  if (error) return <ErrorState message={error} onRetry={fetchEarnings} />;

  return (
    <div style={{ padding: "16px", paddingBottom: "32px" }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "20px" }}>
        <SummaryCard label="Total Earned" value={formatNgn(summary?.total_ngn || 0)} accent />
        <SummaryCard label="This Month" value={formatNgn(summary?.this_month_ngn || 0)} />
        <SummaryCard label="Tips" value={formatNgn(summary?.tips_ngn || 0)} color="var(--accent-3)" />
        <SummaryCard label="Gifts" value={formatNgn(summary?.gifts_ngn || 0)} color="var(--accent-4)" />
      </div>

      {/* Category tabs */}
      <TabBar
        tabs={CATEGORY_TABS}
        activeTab={category}
        onTabChange={setCategory}
        style={{ marginBottom: "16px" }}
      />

      {/* Chart */}
      {monthly.length > 0 && (
        <div style={{ background: "var(--card)", borderRadius: "16px", padding: "16px", marginBottom: "20px", border: "1px solid var(--line)" }}>
          <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "12px", fontFamily: "'Space Grotesk', sans-serif" }}>Monthly Trend</div>
          <EarningsChart data={monthly} activeCategory={category} />
        </div>
      )}

      {/* Transactions */}
      <h3 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "14px" }}>Recent</h3>
      {transactions.length === 0 ? (
        <EmptyState title="No earnings yet" body="Complete sessions to start earning." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {transactions.map((tx, i) => (
            <TxRow key={tx.id || i} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, accent, color }) {
  return (
    <div style={{ background: "var(--card)", borderRadius: "16px", padding: "16px", border: "1px solid var(--line)" }}>
      <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 700, color: accent ? "var(--accent)" : color || "var(--ink)" }}>{value}</div>
    </div>
  );
}

function TxRow({ tx }) {
  const categoryEmoji = {
    sessions: "📅",
    content: "🖼️",
    tips: "💜",
    gifts: "🎁",
  };
  const emoji = categoryEmoji[tx.category] || "💰";

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "var(--card)", borderRadius: "14px", border: "1px solid var(--line)" }}>
      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <span style={{ fontSize: "20px" }}>{emoji}</span>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 500 }}>{tx.description || tx.type}</div>
          <div style={{ fontSize: "12px", color: "var(--muted)" }}>{formatDate(tx.created_at)}</div>
        </div>
      </div>
      <div style={{ color: "#22c55e", fontWeight: 700 }}>+{formatNgn(tx.net_amount || tx.amount)}</div>
    </div>
  );
}
