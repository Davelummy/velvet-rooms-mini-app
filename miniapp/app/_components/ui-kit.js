export function StatusPill({ tone = "neutral", children, className = "" }) {
  const toneClass =
    tone === "success"
      ? "success"
      : tone === "warning"
      ? "warning"
      : tone === "danger"
      ? "danger"
      : tone === "featured"
      ? "featured"
      : "ghost";
  return <span className={`pill ${toneClass} ${className}`.trim()}>{children}</span>;
}

export function EmptyState({ title = "Nothing here yet.", body = "", action = null }) {
  return (
    <div className="ui-state empty">
      <strong>{title}</strong>
      {body ? <p className="helper">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry = null,
  retryLabel = "Try again",
}) {
  return (
    <div className="ui-state error">
      <p className="helper error">{message}</p>
      {onRetry ? (
        <button type="button" className="cta ghost" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function SyncIndicator({ lastSyncedAt, active = false, label = "Last synced" }) {
  if (!lastSyncedAt) {
    return null;
  }
  const now = Date.now();
  const then = new Date(lastSyncedAt).getTime();
  if (Number.isNaN(then)) {
    return null;
  }
  const diffSec = Math.max(0, Math.floor((now - then) / 1000));
  const value =
    diffSec < 60
      ? `${diffSec}s ago`
      : diffSec < 3600
      ? `${Math.floor(diffSec / 60)}m ago`
      : `${Math.floor(diffSec / 3600)}h ago`;
  return (
    <span className={`sync-indicator ${active ? "active" : ""}`}>
      <span className="dot" />
      {label}: {value}
    </span>
  );
}

export function NotificationPriorityBadge({ type = "" }) {
  const key = (type || "").toLowerCase();
  if (
    key.includes("dispute") ||
    key.includes("report") ||
    key.includes("screen_recording") ||
    key.includes("safety")
  ) {
    return <span className="pill danger">High</span>;
  }
  if (
    key.includes("booking") ||
    key.includes("session") ||
    key.includes("payment") ||
    key.includes("escrow")
  ) {
    return <span className="pill warning">Medium</span>;
  }
  return <span className="pill ghost">Low</span>;
}
