import { query } from "./db";

let ensured = false;

export async function ensureNotificationsTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS app_notifications (
       id BIGSERIAL PRIMARY KEY,
       recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
       recipient_role TEXT,
       title TEXT NOT NULL,
       body TEXT,
       type TEXT,
       metadata JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       read_at TIMESTAMPTZ
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_app_notifications_recipient ON app_notifications(recipient_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_app_notifications_role ON app_notifications(recipient_role)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_app_notifications_read ON app_notifications(read_at)"
  );
  ensured = true;
}

export async function createNotification({
  recipientId,
  recipientRole,
  title,
  body,
  type,
  metadata,
}) {
  if (!recipientId && !recipientRole) {
    return;
  }
  await ensureNotificationsTable();
  await query(
    `INSERT INTO app_notifications
     (recipient_id, recipient_role, title, body, type, metadata, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [recipientId || null, recipientRole || null, title, body || null, type || null, metadata || null]
  );
}

export async function createAdminNotifications({ title, body, type, metadata }) {
  await ensureNotificationsTable();
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean);
  let adminRes;
  if (adminIds.length) {
    adminRes = await query(
      "SELECT id FROM users WHERE telegram_id = ANY($1::text[])",
      [adminIds]
    );
  } else {
    adminRes = await query("SELECT id FROM users WHERE role = 'admin'");
  }
  if (!adminRes.rowCount) {
    return;
  }
  const values = adminRes.rows.map((row) => [
    row.id,
    "admin",
    title,
    body || null,
    type || null,
    metadata || null,
  ]);
  const placeholders = values
    .map(
      (_, idx) =>
        `($${idx * 6 + 1}, $${idx * 6 + 2}, $${idx * 6 + 3}, $${idx * 6 + 4}, $${idx * 6 + 5}, $${idx * 6 + 6}, NOW())`
    )
    .join(", ");
  const flat = values.flat();
  await query(
    `INSERT INTO app_notifications
     (recipient_id, recipient_role, title, body, type, metadata, created_at)
     VALUES ${placeholders}`,
    flat
  );
}

export async function listNotifications({ recipientId, recipientRole, limit = 30 }) {
  await ensureNotificationsTable();
  const filters = [];
  const params = [];
  if (recipientId) {
    params.push(recipientId);
    filters.push(`recipient_id = $${params.length}`);
  }
  if (recipientRole) {
    params.push(recipientRole);
    filters.push(`recipient_role = $${params.length}`);
  }
  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  params.push(limit);
  const itemsRes = await query(
    `SELECT id, title, body, type, metadata, created_at, read_at
     FROM app_notifications
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params
  );
  const unreadRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM app_notifications
     ${whereClause ? `${whereClause} AND` : "WHERE"} read_at IS NULL`,
    params.slice(0, params.length - 1)
  );
  return {
    items: itemsRes.rows || [],
    unreadCount: unreadRes.rows[0]?.count || 0,
  };
}

export async function markNotificationsRead({ recipientId, recipientRole, ids }) {
  await ensureNotificationsTable();
  const filters = [];
  const params = [];
  if (recipientId) {
    params.push(recipientId);
    filters.push(`recipient_id = $${params.length}`);
  }
  if (recipientRole) {
    params.push(recipientRole);
    filters.push(`recipient_role = $${params.length}`);
  }
  if (!filters.length) {
    return;
  }
  let clause = filters.join(" AND ");
  if (Array.isArray(ids) && ids.length) {
    params.push(ids);
    clause += ` AND id = ANY($${params.length}::bigint[])`;
  }
  await query(
    `UPDATE app_notifications
     SET read_at = NOW()
     WHERE ${clause}`,
    params
  );
}
