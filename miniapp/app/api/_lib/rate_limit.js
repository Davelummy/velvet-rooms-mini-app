import { query } from "./db";

let ensured = false;

export async function ensureRateLimitTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS api_rate_limits (
       key TEXT NOT NULL,
       window_start TIMESTAMPTZ NOT NULL,
       count INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (key, window_start)
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window ON api_rate_limits(window_start)"
  );
  ensured = true;
}

export async function checkRateLimit({ key, limit = 10, windowSeconds = 60 }) {
  await ensureRateLimitTable();
  const now = Date.now();
  const windowStart = new Date(
    Math.floor(now / (windowSeconds * 1000)) * windowSeconds * 1000
  );
  const res = await query(
    `INSERT INTO api_rate_limits (key, window_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (key, window_start)
     DO UPDATE SET count = api_rate_limits.count + 1
     RETURNING count`,
    [key, windowStart.toISOString()]
  );
  const count = Number(res.rows[0]?.count || 0);
  return count <= limit;
}
