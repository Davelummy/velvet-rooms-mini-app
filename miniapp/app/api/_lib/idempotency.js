import { query } from "./db";

let ensured = false;

export async function ensureIdempotencyTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS idempotency_keys (
       key TEXT PRIMARY KEY,
       user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       scope TEXT,
       response JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_idempotency_user ON idempotency_keys(user_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_idempotency_created ON idempotency_keys(created_at)"
  );
  ensured = true;
}

export async function readIdempotencyRecord(client, key) {
  const res = await client.query(
    "SELECT response FROM idempotency_keys WHERE key = $1",
    [key]
  );
  return res.rowCount ? res.rows[0].response : null;
}

export async function writeIdempotencyRecord(client, { key, userId, scope, response }) {
  await client.query(
    `INSERT INTO idempotency_keys (key, user_id, scope, response, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (key) DO NOTHING`,
    [key, userId || null, scope || null, response || null]
  );
}

export async function reserveIdempotencyKey(client, { key, userId, scope }) {
  const inserted = await client.query(
    `INSERT INTO idempotency_keys (key, user_id, scope, response, created_at)
     VALUES ($1, $2, $3, NULL, NOW())
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
    [key, userId || null, scope || null]
  );
  if (inserted.rowCount) {
    return { reserved: true, cached: null, pending: false };
  }
  const existing = await client.query(
    "SELECT response FROM idempotency_keys WHERE key = $1",
    [key]
  );
  if (!existing.rowCount) {
    return { reserved: false, cached: null, pending: false };
  }
  const cached = existing.rows[0].response || null;
  return { reserved: false, cached, pending: cached == null };
}

export async function finalizeIdempotencyKey(client, { key, userId, scope, response }) {
  await client.query(
    `UPDATE idempotency_keys
     SET response = $2,
         user_id = COALESCE(user_id, $3),
         scope = COALESCE(scope, $4)
     WHERE key = $1`,
    [key, response || null, userId || null, scope || null]
  );
}

export async function clearIdempotencyKey(client, key) {
  await client.query("DELETE FROM idempotency_keys WHERE key = $1 AND response IS NULL", [key]);
}
