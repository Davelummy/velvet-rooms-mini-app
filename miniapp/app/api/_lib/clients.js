import { query } from "./db";

let ensured = false;

export async function ensureClientProfileColumns() {
  if (ensured) {
    return;
  }
  await query("ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS display_name TEXT");
  await query("ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS location TEXT");
  await query("ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS birth_month INTEGER");
  await query("ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS birth_year INTEGER");
  ensured = true;
}
