import { query } from "./db";

let ensured = false;

export async function ensureModelProfileColumns() {
  if (ensured) {
    return;
  }
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS bio TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS tags JSONB");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS availability TEXT");
  await query("ALTER TABLE model_profiles ADD COLUMN IF NOT EXISTS location TEXT");
  ensured = true;
}
