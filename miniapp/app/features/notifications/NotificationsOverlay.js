"use client";

import { useEffect, useState } from "react";
import { useNotificationStore } from "../../_store/useNotificationStore";
import { api } from "../../_lib/apiClient";
import { mapApiError, timeAgo } from "../../_lib/formatters";
import { EmptyState } from "../../_components/ui-kit";
import { SkeletonList } from "../../_components/SkeletonCard";

const TYPE_ICON = {
  booking_request: "📅",
  session_accepted: "✅",
  session_completed: "🎉",
  payment_received: "💰",
  new_follower: "👤",
  gift_received: "🎁",
  tip_received: "💜",
  new_story: "⭕",
  dispute: "⚠️",
  default: "🔔",
};

export default function NotificationsOverlay({ open, onClose, role }) {
  const { notifications, unreadCount, loading, setNotifications, setUnreadCount, setLoading, markRead } = useNotificationStore();
  const [error, setError] = useState(null);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.get("/api/notifications");
      setNotifications(data.items || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      setError(mapApiError(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open]);

  const handleMarkAllRead = async () => {
    try {
      await api.post("/api/notifications/read", {});
      markRead(null);
    } catch {}
  };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70, backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(380px, 100vw)",
        background: "var(--card)",
        zIndex: 71,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 16px", borderBottom: "1px solid var(--line)" }}>
          <h2 style={{ margin: 0, fontSize: "20px" }}>Notifications {unreadCount > 0 && <span style={{ fontSize: "14px", color: "var(--accent)" }}>({unreadCount})</span>}</h2>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "13px", cursor: "pointer" }}>
                Mark all read
              </button>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "22px", cursor: "pointer", lineHeight: 1 }}>×</button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <SkeletonList count={5} />
          ) : error ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>{error}</div>
          ) : notifications.length === 0 ? (
            <EmptyState title="All caught up!" body="No notifications yet." />
          ) : (
            notifications.map((n) => (
              <NotifRow key={n.id} notification={n} onRead={() => markRead([n.id])} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function NotifRow({ notification: n, onRead }) {
  const icon = TYPE_ICON[n.type] || TYPE_ICON.default;
  const isUnread = !n.read_at;

  return (
    <div
      onClick={onRead}
      style={{
        display: "flex",
        gap: "12px",
        padding: "14px 20px",
        borderBottom: "1px solid var(--line)",
        background: isUnread ? "rgba(227,23,62,0.04)" : "none",
        cursor: "pointer",
      }}
    >
      <div style={{ fontSize: "24px", lineHeight: 1.2 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "14px", fontWeight: isUnread ? 600 : 400, marginBottom: "2px" }}>
          {n.title}
        </div>
        {n.body && (
          <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "4px" }}>{n.body}</div>
        )}
        <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif" }}>
          {timeAgo(n.created_at)}
        </div>
      </div>
      {isUnread && (
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", marginTop: "6px", flexShrink: 0 }} />
      )}
    </div>
  );
}
