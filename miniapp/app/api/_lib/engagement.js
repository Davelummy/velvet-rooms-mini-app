import { query } from "./db";

let ensured = false;

export async function ensureEngagementTables() {
  if (ensured) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS content_likes (
      id BIGSERIAL PRIMARY KEY,
      content_id BIGINT NOT NULL REFERENCES digital_content(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      UNIQUE (content_id, user_id)
    );
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_content_likes_content_id ON content_likes(content_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_content_likes_user_id ON content_likes(user_id)");

  await query(`
    CREATE TABLE IF NOT EXISTS content_views (
      id BIGSERIAL PRIMARY KEY,
      content_id BIGINT NOT NULL REFERENCES digital_content(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW(),
      UNIQUE (content_id, user_id)
    );
  `);
  await query("CREATE INDEX IF NOT EXISTS idx_content_views_content_id ON content_views(content_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_content_views_user_id ON content_views(user_id)");

  ensured = true;
}

