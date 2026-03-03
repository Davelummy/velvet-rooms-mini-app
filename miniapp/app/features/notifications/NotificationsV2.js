"use client";

import { useEffect, useRef, useState } from "react";
import { useNotificationStore } from "../../_store/useNotificationStore";
import { api } from "../../_lib/apiClient";
import { mapApiError, timeAgo } from "../../_lib/formatters";
import { EmptyState } from "../../_components/ui-kit";
import { SkeletonList } from "../../_components/SkeletonCard";
import { playNotificationSoundForType } from "../../_lib/notificationSound";
import NotificationSettings from "./NotificationSettings";

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "bookings", label: "Bookings" },
  { id: "payments", label: "Payments" },
  { id: "activity", label: "Activity" },
];

const CATEGORY_MAP = {
  booking_request: "bookings",
  session_accepted: "bookings",
  session_started: "bookings",
  session_completed: "bookings",
  session_cancelled: "bookings",
  lobby_ready: "bookings",
  payment_received: "payments",
  payment_approved: "payments",
  escrow_released: "payments",
  payout_requested: "payments",
  tip_received: "activity",
  gift_received: "activity",
  new_follower: "activity",
  new_like: "activity",
  new_story: "activity",
  live_started: "activity",
};

const TYPE_ICON = {
  booking_request: "📅",
  session_accepted: "✅",
  session_completed: "🎉",
  session_cancelled: "❌",
  payment_received: "💰",
  escrow_released: "✅",
  tip_received: "💜",
  gift_received: "🎁",
  new_follower: "👤",
  new_like: "❤️",
  new_story: "⭕",
  live_started: "🔴",
  dispute: "⚠️",
};

export default function NotificationsV2({ open, onClose, initData = "" }) {
  const { notifications, unreadCount, activeCategory, loading, preferences, setNotifications, setUnreadCount, setLoading, setActiveCategory, markRead } = useNotificationStore();
  const [error, setError] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const prevCountRef = useRef(0);

  const requestWithInit = async (path, { method = "GET", body } = {}) => {
    if (!initData) {
      if (method === "GET") {
        return api.get(path);
      }
      return api.post(path, body || {});
    }
    const res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "x-telegram-init": initData,
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
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

  // Play sound when new notifications arrive
  useEffect(() => {
    if (notifications.length > prevCountRef.current && prevCountRef.current > 0) {
      const newest = notifications[0];
      if (newest) playNotificationSoundForType(newest.type, preferences.sound_enabled);
    }
    prevCountRef.current = notifications.length;
  }, [notifications, preferences.sound_enabled]);

  const fetchNotifications = async () => {
    setLoading(true);
    setError(null);
    try {
      const query = activeCategory !== "all" ? `?category=${activeCategory}` : "";
      const data = await requestWithInit(`/api/notifications${query}`);
      setNotifications(data.items || []);
      setUnreadCount(data.unreadCount || data.unread || 0);
    } catch (err) {
      if (err?.status === 401) {
        setError("Session expired. Reopen the mini app in Telegram.");
      } else {
        setError(mapApiError(err));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, activeCategory]);

  const handleMarkAllRead = async () => {
    try {
      await requestWithInit("/api/notifications/read", { method: "POST", body: {} });
      markRead(null);
    } catch {}
  };

  const handleAcceptBooking = async (notification) => {
    const sessionId = notification.metadata?.session_id;
    if (!sessionId) return;
    try {
      await requestWithInit("/api/sessions/respond", {
        method: "POST",
        body: { session_id: sessionId, action: "accept", initData: initData || undefined },
      });
      fetchNotifications();
    } catch {}
  };

  const handleDeclineBooking = async (notification) => {
    const sessionId = notification.metadata?.session_id;
    if (!sessionId) return;
    try {
      await requestWithInit("/api/sessions/respond", {
        method: "POST",
        body: { session_id: sessionId, action: "decline", initData: initData || undefined },
      });
      fetchNotifications();
    } catch {}
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeCategory === "all") return true;
    const cat = CATEGORY_MAP[n.type] || "activity";
    return cat === activeCategory;
  });

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 70, backdropFilter: "blur(4px)" }} />
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(400px, 100vw)",
        background: "var(--card)",
        zIndex: 71,
        display: "flex",
        flexDirection: "column",
        boxShadow: "-4px 0 32px rgba(0,0,0,0.4)",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 20px 0", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
            <h2 style={{ margin: 0, fontSize: "20px" }}>
              Notifications{unreadCount > 0 && <span style={{ fontSize: "14px", color: "var(--accent)", marginLeft: "8px" }}>({unreadCount})</span>}
            </h2>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "20px", cursor: "pointer" }}
                aria-label="Open notification settings"
              >
                ⚙️
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "24px", cursor: "pointer", lineHeight: 1 }}
                aria-label="Close notifications"
              >
                ×
              </button>
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: "flex", gap: "4px", marginBottom: "12px", overflowX: "auto" }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  padding: "6px 14px",
                  borderRadius: "999px",
                  border: "none",
                  background: activeCategory === cat.id ? "var(--accent)" : "var(--line)",
                  color: activeCategory === cat.id ? "#fff" : "var(--muted)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mark all read */}
        {unreadCount > 0 && (
          <div style={{ padding: "8px 20px", borderBottom: "1px solid var(--line)" }}>
            <button onClick={handleMarkAllRead} style={{ background: "none", border: "none", color: "var(--accent)", fontSize: "13px", cursor: "pointer", padding: 0 }}>
              Mark all as read
            </button>
          </div>
        )}

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <SkeletonList count={5} />
          ) : error ? (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--muted)" }}>{error}</div>
          ) : filteredNotifications.length === 0 ? (
            <EmptyState title="All caught up!" body="No notifications yet." />
          ) : (
            filteredNotifications.map((n) => (
              <NotifCardV2
                key={n.id}
                notification={n}
                onRead={() => markRead([n.id])}
                onAccept={n.type === "booking_request" ? () => handleAcceptBooking(n) : null}
                onDecline={n.type === "booking_request" ? () => handleDeclineBooking(n) : null}
              />
            ))
          )}
        </div>
      </div>

      {showSettings && (
        <NotificationSettings
          open={showSettings}
          onClose={() => setShowSettings(false)}
          initData={initData}
        />
      )}
    </>
  );
}

function NotifCardV2({ notification: n, onRead, onAccept, onDecline }) {
  const icon = TYPE_ICON[n.type] || "🔔";
  const isUnread = !n.read_at;

  return (
    <div
      onClick={onRead}
      style={{
        padding: "14px 20px",
        borderBottom: "1px solid var(--line)",
        background: isUnread ? "rgba(227,23,62,0.04)" : "none",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", gap: "12px" }}>
        <div style={{ fontSize: "24px", lineHeight: 1.2, flexShrink: 0 }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: isUnread ? 600 : 400, marginBottom: "2px" }}>{n.title}</div>
          {n.body && <div style={{ fontSize: "13px", color: "var(--muted)", marginBottom: "4px", lineHeight: 1.4 }}>{n.body}</div>}
          <div style={{ fontSize: "11px", color: "var(--muted)", fontFamily: "'Space Grotesk', sans-serif" }}>{timeAgo(n.created_at)}</div>

          {/* Inline accept/decline for booking requests */}
          {(onAccept || onDecline) && (
            <div style={{ display: "flex", gap: "8px", marginTop: "10px" }} onClick={(e) => e.stopPropagation()}>
              {onAccept && (
                <button onClick={onAccept} style={{ padding: "8px 16px", borderRadius: "10px", border: "none", background: "var(--accent)", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                  Accept
                </button>
              )}
              {onDecline && (
                <button onClick={onDecline} style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid var(--line)", background: "none", color: "var(--muted)", fontSize: "13px", cursor: "pointer" }}>
                  Decline
                </button>
              )}
            </div>
          )}
        </div>
        {isUnread && (
          <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--accent)", marginTop: "6px", flexShrink: 0 }} />
        )}
      </div>
    </div>
  );
}
