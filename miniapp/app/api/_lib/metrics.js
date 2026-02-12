import { query } from "./db";

let ensured = false;

export async function ensureAppEventsTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS app_events (
       id BIGSERIAL PRIMARY KEY,
       event_type TEXT NOT NULL,
       user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       session_id INTEGER,
       payload JSONB,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_app_events_type ON app_events(event_type)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_app_events_created ON app_events(created_at)"
  );
  ensured = true;
}

export async function logAppEvent({ eventType, userId, sessionId, payload }) {
  await ensureAppEventsTable();
  await query(
    `INSERT INTO app_events (event_type, user_id, session_id, payload, created_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [eventType, userId || null, sessionId || null, payload || null]
  );
}
