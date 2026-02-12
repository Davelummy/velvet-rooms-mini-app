import { query } from "./db";

let ensured = false;

export async function ensureConsentLogs() {
  if (ensured) {
    return;
  }
  await query(
    `CREATE TABLE IF NOT EXISTS consent_logs (
       id BIGSERIAL PRIMARY KEY,
       user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       consent_type TEXT NOT NULL,
       consent_version TEXT,
       metadata JSONB,
       consented_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_consent_logs_user ON consent_logs(user_id)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_consent_logs_type ON consent_logs(consent_type)"
  );
  ensured = true;
}

export async function logConsent({ userId, consentType, consentVersion, metadata }) {
  await ensureConsentLogs();
  await query(
    `INSERT INTO consent_logs (user_id, consent_type, consent_version, metadata, consented_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId || null, consentType, consentVersion || null, metadata || null]
  );
}
