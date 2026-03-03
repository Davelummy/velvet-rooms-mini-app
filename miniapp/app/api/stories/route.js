import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../_lib/telegram";
import { query } from "../_lib/db";
import { checkRateLimit } from "../_lib/rate_limit";
import { getSupabase } from "../_lib/supabase";
import { createRequestContext } from "../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

async function ensureStoriesTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS stories (
       id BIGSERIAL PRIMARY KEY,
       model_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       media_url TEXT NOT NULL,
       media_type TEXT NOT NULL DEFAULT 'image',
       story_type TEXT NOT NULL DEFAULT 'free',
       caption TEXT, cta_text TEXT, cta_link TEXT,
       view_count INTEGER DEFAULT 0,
       expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_stories_model ON stories(model_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at)");

  await query(
    `CREATE TABLE IF NOT EXISTS story_views (
       id BIGSERIAL PRIMARY KEY,
       story_id BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
       viewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
       viewed_at TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE(story_id, viewer_id)
     )`
  );
}

export async function GET(req) {
  const ctx = createRequestContext(req, "GET /api/stories");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await ensureStoriesTables();

    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    const viewerId = userRes.rowCount ? userRes.rows[0].id : null;

    // Get non-expired stories, grouped by model, for followed models and popular models
    const seenSubquery = viewerId
      ? `EXISTS(SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.viewer_id = ${viewerId})`
      : "FALSE";

    const res = await query(
      `SELECT s.id, s.model_id, s.media_url, s.media_type, s.story_type,
              s.caption, s.cta_text, s.cta_link, s.view_count, s.created_at,
              ${seenSubquery} as is_seen,
              u.id as uid, u.username, u.public_id,
              mp.display_name, mp.avatar_url, mp.is_available
       FROM stories s
       JOIN users u ON u.id = s.model_id
       LEFT JOIN model_profiles mp ON mp.user_id = s.model_id
       WHERE s.expires_at > NOW()
         AND u.status = 'active'
       ORDER BY ${viewerId ? `EXISTS(SELECT 1 FROM user_follows WHERE following_id = s.model_id AND follower_id = ${viewerId}) DESC,` : ""} s.created_at DESC
       LIMIT 200`
    );

    // Group by model
    const modelMap = new Map();
    for (const row of res.rows) {
      if (!modelMap.has(row.model_id)) {
        modelMap.set(row.model_id, {
          model: {
            id: row.uid,
            username: row.username,
            public_id: row.public_id,
            display_name: row.display_name,
            avatar_url: row.avatar_url,
            is_available: row.is_available,
          },
          stories: [],
          hasUnseen: false,
        });
      }
      const group = modelMap.get(row.model_id);
      group.stories.push({
        id: row.id,
        media_url: row.media_url,
        media_type: row.media_type,
        story_type: row.story_type,
        caption: row.caption,
        cta_text: row.cta_text,
        view_count: row.view_count,
        created_at: row.created_at,
        is_seen: row.is_seen,
      });
      if (!row.is_seen) group.hasUnseen = true;
    }

    const groups = Array.from(modelMap.values());
    return NextResponse.json({ groups });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req) {
  const ctx = createRequestContext(req, "POST /api/stories");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rateAllowed = await checkRateLimit({
      key: `story-create:${tgUser.id}`,
      limit: 10,
      windowSeconds: 3600,
    });
    if (!rateAllowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const userRes = await query(
      "SELECT id FROM users WHERE telegram_id = $1 AND role = 'model'",
      [tgUser.id]
    );
    if (!userRes.rowCount) {
      return NextResponse.json({ error: "Model account required" }, { status: 403 });
    }
    const modelId = userRes.rows[0].id;

    await ensureStoriesTables();

    const { mediaUrl, mediaType = "image", storyType = "free", caption, ctaText, ctaLink } = await req.json();
    if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });

    const res = await query(
      `INSERT INTO stories (model_id, media_url, media_type, story_type, caption, cta_text, cta_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [modelId, mediaUrl, mediaType, storyType, caption || null, ctaText || null, ctaLink || null]
    );

    return NextResponse.json({ id: res.rows[0].id, ok: true });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
