import { query } from "./db";

let ensured = false;

export async function ensureUserActionsTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS user_actions (
       id BIGSERIAL PRIMARY KEY,
       actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
       action_type VARCHAR(64) NOT NULL,
       target_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
       details JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_user_actions_actor ON user_actions(actor_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_user_actions_target ON user_actions(target_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_user_actions_created ON user_actions(created_at)");
  ensured = true;
}

export async function logUserAction({ actorId, actionType, targetId, details }) {
  await ensureUserActionsTable();
  await query(
    `INSERT INTO user_actions (actor_id, action_type, target_id, details, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [actorId || null, actionType, targetId || null, details || null]
  );
}
