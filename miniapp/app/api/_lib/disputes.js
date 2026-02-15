import { query } from "./db";

let ensured = false;

export async function ensureDisputeSchema() {
  if (ensured) {
    return;
  }
  await query(
    "ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS dispute_opened_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS dispute_resolution TEXT"
  );
  await query(
    "ALTER TABLE escrow_accounts ADD COLUMN IF NOT EXISTS dispute_resolver_id INTEGER REFERENCES users(id) ON DELETE SET NULL"
  );
  await query(
    `CREATE TABLE IF NOT EXISTS escrow_disputes (
       id BIGSERIAL PRIMARY KEY,
       escrow_id INTEGER NOT NULL REFERENCES escrow_accounts(id) ON DELETE CASCADE,
       session_id INTEGER,
       opened_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       opened_reason TEXT,
       opened_note TEXT,
       status TEXT NOT NULL DEFAULT 'open',
       resolution TEXT,
       winner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       resolved_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       resolved_note TEXT,
       opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       resolved_at TIMESTAMPTZ
     )`
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_escrow_disputes_escrow ON escrow_disputes(escrow_id, status)"
  );
  await query(
    "CREATE INDEX IF NOT EXISTS idx_escrow_disputes_session ON escrow_disputes(session_id)"
  );
  ensured = true;
}

export async function openEscrowDispute({
  escrowId,
  sessionId = null,
  openedByUserId = null,
  reason = "",
  note = "",
}) {
  if (!escrowId) {
    return;
  }
  await ensureDisputeSchema();
  await query(
    `UPDATE escrow_accounts
     SET status = 'disputed',
         dispute_reason = COALESCE(NULLIF($2, ''), dispute_reason),
         dispute_opened_at = COALESCE(dispute_opened_at, NOW()),
         dispute_resolution = NULL,
         dispute_resolved_at = NULL,
         dispute_resolver_id = NULL
     WHERE id = $1`,
    [escrowId, reason || null]
  );
  await query(
    `INSERT INTO escrow_disputes
     (escrow_id, session_id, opened_by_user_id, opened_reason, opened_note, status, opened_at)
     VALUES ($1, $2, $3, $4, $5, 'open', NOW())`,
    [escrowId, sessionId || null, openedByUserId || null, reason || null, note || null]
  );
}

export async function resolveEscrowDispute({
  escrowId,
  resolution,
  winnerUserId = null,
  resolvedByAdminId = null,
  note = "",
}) {
  if (!escrowId || !resolution) {
    return;
  }
  await ensureDisputeSchema();
  await query(
    `UPDATE escrow_accounts
     SET dispute_resolution = $2,
         dispute_resolved_at = NOW(),
         dispute_resolver_id = $3
     WHERE id = $1`,
    [escrowId, resolution, resolvedByAdminId || null]
  );
  await query(
    `UPDATE escrow_disputes
     SET status = 'resolved',
         resolution = $2,
         winner_user_id = $3,
         resolved_by_admin_id = $4,
         resolved_note = $5,
         resolved_at = NOW()
     WHERE escrow_id = $1
       AND status = 'open'`,
    [escrowId, resolution, winnerUserId || null, resolvedByAdminId || null, note || null]
  );
}
