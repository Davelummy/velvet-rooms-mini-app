"use client";

import { EmptyState } from "../../_components/ui-kit";
import { SkeletonList } from "../../_components/SkeletonCard";

export default function PurchasesTab({ status, loading, purchases, getStatusTone }) {
  return (
    <div className="flow-card">
      <h3>Your Purchases</h3>
      {status && <p className="helper error">{status}</p>}
      {loading && <SkeletonList count={3} />}
      {!status && !loading && purchases.length === 0 && (
        <EmptyState title="No purchases yet" body="Completed unlocks and sessions will appear here." />
      )}
      {!loading &&
        purchases.map((item) => (
          <div key={`purchase-${item.id}`} className="list-row">
            <div>
              <strong>{item.title || "Session"}</strong>
              <p className="muted">
                {item.display_name || item.public_id} · {item.content_type}
              </p>
            </div>
            <span className={`status-pill ${getStatusTone(item.status)}`}>
              {item.item_type === "session"
                ? "Session completed"
                : item.status === "rejected"
                ? "Rejected by admin"
                : item.status}
            </span>
          </div>
        ))}
    </div>
  );
}
