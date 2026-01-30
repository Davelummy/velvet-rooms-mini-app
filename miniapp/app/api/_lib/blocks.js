import { query } from "./db";

let ensured = false;

export async function ensureBlockTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS blocks (
       blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       created_at TIMESTAMPTZ DEFAULT NOW(),
       PRIMARY KEY (blocker_id, blocked_id)
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_blocks_blocker ON blocks(blocker_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_id)");
  ensured = true;
}
