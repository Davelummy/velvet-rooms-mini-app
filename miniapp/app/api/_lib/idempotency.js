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
