import { query } from "./db";

let ensured = false;

export async function ensureContentColumns() {
  if (ensured) {
    return;
  }
  await query(
    "ALTER TABLE digital_content ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE digital_content ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE digital_content ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ"
  );
  await query(
    "ALTER TABLE digital_content ADD COLUMN IF NOT EXISTS published_to_channel BOOLEAN DEFAULT FALSE"
  );
  ensured = true;
}
