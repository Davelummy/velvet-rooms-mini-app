"use client";

import { memo } from "react";
import { formatNgn, formatDateTime, resolveDisplayName } from "../../_lib/formatters";
import { StatusPill } from "../../_components/ui-kit";

const STATUS_TONE = {
  pending: "warning",
  accepted: "success",
  active: "success",
  completed: "ghost",
  cancelled: "danger",
  disputed: "danger",
};

const SessionCard = memo(function SessionCard({ session, role, onAction, onDispute }) {
  const isModel = role === "model";
  const counterpart = isModel
    ? resolveDisplayName({ display_name: session.client_display_name || session.client_username }, "Fan")
    : resolveDisplayName({ display_name: session.model_display_name || session.model_username }, "Creator");

  const counterpartAvatar = isModel ? session.client_avatar_url : session.model_avatar_url;
  const status = session.status || "pending";
  const tone = STATUS_TONE[status] || "ghost";

  return (
    <div style={{
      background: "var(--card)",
      borderRadius: "18px",
      padding: "16px",
      border: "1px solid var(--line)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", marginBottom: "12px" }}>
        <div style={{
          width: "42px",
          height: "42px",
          borderRadius: "50%",
          background: "var(--line)",
          overflow: "hidden",
          flexShrink: 0,
        }}>
          {counterpartAvatar ? (
            <img src={counterpartAvatar} alt={counterpart} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px", color: "var(--muted)" }}>
              {counterpart[0]}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: "15px", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {counterpart}
          </div>
          <div style={{ fontSize: "12px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif" }}>
            {session.session_type?.replace("_", " ")} · {session.duration_minutes}m
          </div>
        </div>
        <StatusPill tone={tone}>{status}</StatusPill>
      </div>

      {/* Details */}
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", color: "var(--muted)", marginBottom: "12px" }}>
        <span>{formatDateTime(session.scheduled_at || session.created_at)}</span>
        <span style={{ color: "var(--accent)", fontWeight: 600 }}>{formatNgn(session.amount_ngn)}</span>
      </div>

      {/* Actions */}
      {onAction && (
        <div style={{ display: "flex", gap: "8px" }}>
          {status === "pending" && isModel && (
            <>
              <button
                onClick={() => onAction("accept", session)}
                style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", background: "var(--accent)", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
              >
                Accept
              </button>
              <button
                onClick={() => onAction("decline", session)}
                style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "1px solid var(--line)", background: "none", color: "var(--ink)", fontSize: "14px", cursor: "pointer" }}
              >
                Decline
              </button>
            </>
          )}
          {status === "accepted" && (
            <button
              onClick={() => onAction("join", session)}
              style={{ flex: 1, padding: "10px", borderRadius: "12px", border: "none", background: "var(--accent)", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
            >
              Join Session
            </button>
          )}
          {status === "completed" && !isModel && onDispute && (
            <button
              onClick={() => onDispute(session)}
              style={{ padding: "8px 14px", borderRadius: "10px", border: "1px solid var(--line)", background: "none", color: "var(--muted)", fontSize: "12px", cursor: "pointer" }}
            >
              Dispute
            </button>
          )}
        </div>
      )}
    </div>
  );
});

export default SessionCard;
