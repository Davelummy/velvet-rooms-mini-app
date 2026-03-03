import { query } from "./db";

let ensured = false;

export async function ensureModelProfileColumns() {
  if (ensured) {
    return;
  }
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS display_name TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS cover_url TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS verification_status TEXT");
  await query(
    "ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS verification_submitted_at TIMESTAMPTZ"
  );
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS bio TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS tags JSONB");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS availability TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS location TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS avg_rating NUMERIC");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS total_ratings INTEGER");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS is_available BOOLEAN");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS status_message TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS status_expires_at TIMESTAMPTZ");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS access_fee_ngn INTEGER");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS pinned_content_id BIGINT");
  ensured = true;
}
