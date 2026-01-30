import { query } from "./db";

let ensured = false;

export async function ensureSessionColumns() {
  if (ensured) {
    return;
  }
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS tags TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS availability TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS bio TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ");
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scheduled_for TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_joined_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS model_joined_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS actual_start TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS scheduled_end TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS extension_minutes INTEGER DEFAULT 0"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client_confirmed BOOLEAN DEFAULT FALSE"
  );
  await query(
    "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS model_confirmed BOOLEAN DEFAULT FALSE"
  );
  ensured = true;
}
