import { query } from "./db";

let ensured = false;

export async function ensureContentReportsTable() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS content_reports (
       id BIGSERIAL PRIMARY KEY,
       content_id INTEGER REFERENCES digital_content(id) ON DELETE CASCADE,
       reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       reason TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_content_reports_content ON content_reports(content_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_content_reports_created ON content_reports(created_at)"
  );
  ensured = true;
}
