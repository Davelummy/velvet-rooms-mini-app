import { query } from "./db";

let ensured = false;

export async function ensureFollowTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS follows (
       follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       PRIMARY KEY (follower_id, followee_id)
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id)"
  );
  ensured = true;
}
