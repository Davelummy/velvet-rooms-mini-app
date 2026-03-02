export function formatSeconds(seconds) {
  if (!seconds && seconds !== 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function resolveDisplayName(item, fallback = "User") {
  if (!item) return fallback;
  return (
    item.display_name ||
    item.client_display_name ||
    item.model_display_name ||
    item.username ||
    item.public_id ||
    fallback
  );
}

export function mapApiError(err) {
  if (!err) return "Something went wrong";
  if (typeof err === "string") return err;
  if (err.data?.error) return err.data.error;
  if (err.data?.message) return err.data.message;
  if (err.message) return err.message;
  return "Something went wrong";
}

export function formatNgn(amount) {
  if (amount == null) return "₦0";
  return `₦${Number(amount).toLocaleString("en-NG")}`;
}

export function formatDate(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(dateStr);
}

export function cleanTagLabel(value) {
  if (!value) return "";
  let out = value.toString().trim();
  if (
    out.length >= 2 &&
    ((out[0] === '"' && out[out.length - 1] === '"') ||
      (out[0] === "'" && out[out.length - 1] === "'"))
  ) {
    out = out.slice(1, -1).trim();
  }
  out = out.replace(/^#/, "").trim();
  out = out.replace(/^\[/, "").replace(/\]$/, "").trim();
  return out.slice(0, 24);
}
