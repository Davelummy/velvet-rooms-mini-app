"use client";

export default function TopBar({
  tabLabel = "Dashboard",
  unreadCount = 0,
  onOpenNotifications,
  showBack = false,
  onBack,
  backLabel = "Back",
  transparent = false,
  hidden = false,
}) {
  return (
    <header
      className={`top-bar ${transparent ? "feed-mode" : ""} ${hidden ? "hidden" : ""}`.trim()}
    >
      <div className="top-bar-left">
        {showBack && (
          <button
            type="button"
            className="top-bar-back"
            onClick={onBack}
            aria-label={backLabel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15 18 9 12l6-6" />
            </svg>
            <span>{backLabel}</span>
          </button>
        )}
        <span className="logo-mark small">
          <img loading="lazy" decoding="async" src="/brand/logo.png" alt="Velvet Rooms logo" />
        </span>
        <div className="top-bar-title-wrap">
          <span className="top-bar-title">{tabLabel}</span>
        </div>
      </div>
      <div className="top-bar-right">
        <button
          type="button"
          className="icon-btn notice-bell"
          onClick={onOpenNotifications}
          aria-label="Notifications"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 22a2.5 2.5 0 0 0 2.45-2H9.55A2.5 2.5 0 0 0 12 22zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" />
          </svg>
          {unreadCount > 0 && (
            <span className="notify-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}
