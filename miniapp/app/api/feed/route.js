import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../_lib/telegram";
import { query } from "../_lib/db";
import { checkRateLimit } from "../_lib/rate_limit";
import { createRequestContext } from "../_lib/observability";
import { getSupabase } from "../_lib/supabase";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

function getTeaserBucket() {
  return (
    process.env.SUPABASE_TEASER_BUCKET ||
    process.env.SUPABASE_CONTENT_BUCKET ||
    process.env.SUPABASE_BUCKET ||
    "teaser content bucket"
  );
}

function getAvatarBucket() {
  return process.env.SUPABASE_AVATAR_BUCKET || "velvetrooms-avatars";
}

export async function GET(req) {
  const ctx = createRequestContext(req, "GET /api/feed");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rateAllowed = await checkRateLimit({
      key: `feed:${tgUser.id}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rateAllowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab") || "foryou";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const cursor = searchParams.get("cursor") ? parseInt(searchParams.get("cursor"), 10) : null;

    // Get user ID
    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) {
      return NextResponse.json({ items: [], nextCursor: null });
    }
    const userId = userRes.rows[0].id;

    let rows = [];
    let nextCursor = null;

    if (tab === "following") {
      // Following feed: content from followed models only
      const params = [userId, limit + 1];
      const cursorClause = cursor ? `AND dc.id < $3` : "";
      if (cursor) params.push(cursor);

      const res = await query(
        `SELECT dc.id, dc.model_id, dc.telegram_file_id as media_path, dc.preview_file_id as thumb_path,
                dc.content_type as media_type,
                dc.description as caption, dc.tags,
                CASE WHEN dc.price IS NOT NULL AND dc.price > 0 THEN TRUE ELSE FALSE END as is_premium,
                dc.price as price_ngn,
                (SELECT COUNT(*)::int FROM content_likes cl WHERE cl.content_id = dc.id) as like_count,
                dc.created_at,
                mp.display_name as model_display_name,
                u.username as model_username,
                u.public_id as model_public_id,
                mp.avatar_url as model_avatar_url,
                u.avatar_path as model_avatar_path,
                EXISTS(
                  SELECT 1 FROM transactions t
                  WHERE t.user_id = $1
                    AND t.status = 'completed'
                    AND t.metadata_json->>'content_id' = dc.id::text
                ) as is_purchased
         FROM digital_content dc
         JOIN follows uf ON uf.followee_id = dc.model_id AND uf.follower_id = $1
         JOIN users u ON u.id = dc.model_id
         LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
         WHERE dc.is_active = TRUE
           AND (dc.publish_at IS NULL OR dc.publish_at <= NOW())
           AND (dc.expires_at IS NULL OR dc.expires_at > NOW())
           ${cursorClause}
         ORDER BY dc.id DESC
         LIMIT $2`,
        params
      );
      rows = res.rows;
    } else {
      // For You: weighted feed with followed boost
      const params = [userId, limit + 1];
      const cursorClause = cursor ? `AND dc.id < $3` : "";
      if (cursor) params.push(cursor);

      const res = await query(
        `SELECT dc.id, dc.model_id, dc.telegram_file_id as media_path, dc.preview_file_id as thumb_path,
                dc.content_type as media_type,
                dc.description as caption, dc.tags,
                CASE WHEN dc.price IS NOT NULL AND dc.price > 0 THEN TRUE ELSE FALSE END as is_premium,
                dc.price as price_ngn,
                (SELECT COUNT(*)::int FROM content_likes cl WHERE cl.content_id = dc.id) as like_count,
                dc.created_at,
                mp.display_name as model_display_name,
                u.username as model_username,
                u.public_id as model_public_id,
                mp.avatar_url as model_avatar_url,
                u.avatar_path as model_avatar_path,
                CASE WHEN uf.follower_id IS NOT NULL THEN 1 ELSE 0 END as followed_boost,
                EXISTS(
                  SELECT 1 FROM transactions t
                  WHERE t.user_id = $1
                    AND t.status = 'completed'
                    AND t.metadata_json->>'content_id' = dc.id::text
                ) as is_purchased
         FROM digital_content dc
         JOIN users u ON u.id = dc.model_id
         LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
         LEFT JOIN follows uf ON uf.followee_id = dc.model_id AND uf.follower_id = $1
         WHERE dc.is_active = TRUE
           AND (dc.publish_at IS NULL OR dc.publish_at <= NOW())
           AND (dc.expires_at IS NULL OR dc.expires_at > NOW())
           ${cursorClause}
         ORDER BY (CASE WHEN uf.follower_id IS NOT NULL THEN 2 ELSE 1 END) * dc.id DESC
         LIMIT $2`,
        params
      );
      rows = res.rows;
    }

    if (rows.length > limit) {
      nextCursor = rows[limit - 1]?.id ?? null;
      rows = rows.slice(0, limit);
    }

    // Generate signed URLs for media
    const teaserBucket = getTeaserBucket();
    const avatarBucket = getAvatarBucket();
    const supabase = getSupabase();
    const ttl = Number(process.env.TEASER_PREVIEW_TTL_SECONDS || 3600);

    const items = await Promise.all(
      rows.map(async (row) => {
        let media_url = null;
        let thumbnail_url = null;
        let model_avatar_url = row.model_avatar_url || null;

        if (row.media_path) {
          try {
            const { data } = await supabase.storage
              .from(teaserBucket)
              .createSignedUrl(row.media_path, ttl);
            media_url = data?.signedUrl || null;
          } catch {
            media_url = null;
          }
        }

        if (row.thumb_path && row.thumb_path !== row.media_path) {
          try {
            const { data } = await supabase.storage
              .from(teaserBucket)
              .createSignedUrl(row.thumb_path, ttl);
            thumbnail_url = data?.signedUrl || null;
          } catch {
            thumbnail_url = null;
          }
        } else {
          thumbnail_url = media_url;
        }

        if (!model_avatar_url && row.model_avatar_path) {
          try {
            const { data } = await supabase.storage
              .from(avatarBucket)
              .createSignedUrl(row.model_avatar_path, ttl);
            model_avatar_url = data?.signedUrl || null;
          } catch {
            model_avatar_url = null;
          }
        }

        return {
          id: row.id,
          model_id: row.model_id,
          media_url,
          thumbnail_url,
          media_type: row.media_type,
          caption: row.caption,
          tags: row.tags,
          is_premium: Boolean(row.is_premium),
          price_ngn: row.price_ngn,
          like_count: row.like_count ?? 0,
          created_at: row.created_at,
          model_display_name: row.model_display_name,
          model_username: row.model_username,
          model_public_id: row.model_public_id,
          model_avatar_url,
          is_purchased: Boolean(row.is_purchased),
          followed_boost: row.followed_boost ?? 0,
        };
      })
    );

    return NextResponse.json({ items, nextCursor });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
