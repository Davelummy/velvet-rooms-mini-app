import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../_lib/telegram";
import { query } from "../_lib/db";
import { checkRateLimit } from "../_lib/rate_limit";
import { createRequestContext } from "../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(req) {
  const ctx = createRequestContext("GET /api/feed");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`feed:${tgUser.id}`, 60, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

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

    let items = [];
    let nextCursor = null;

    if (tab === "following") {
      // Following feed: content from followed models only
      const params = [userId, limit + 1];
      const cursorClause = cursor ? `AND dc.id < $3` : "";
      if (cursor) params.push(cursor);

      const res = await query(
        `SELECT dc.id, dc.model_id, dc.media_url, dc.thumbnail_url, dc.media_type,
                dc.caption, dc.tags, dc.is_premium, dc.price_ngn, dc.like_count,
                dc.approved_at as created_at,
                mp.display_name as model_display_name,
                u.username as model_username,
                u.public_id as model_public_id,
                mp.avatar_url as model_avatar_url,
                EXISTS(SELECT 1 FROM content_purchases cp WHERE cp.content_id = dc.id AND cp.buyer_id = $1) as is_purchased
         FROM digital_content dc
         JOIN user_follows uf ON uf.following_id = dc.model_id AND uf.follower_id = $1
         JOIN users u ON u.id = dc.model_id
         LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
         WHERE dc.status = 'approved' ${cursorClause}
         ORDER BY dc.id DESC
         LIMIT $2`,
        params
      );
      items = res.rows;
    } else {
      // For You: weighted feed with followed boost
      const params = [userId, limit + 1];
      const cursorClause = cursor ? `AND dc.id < $3` : "";
      if (cursor) params.push(cursor);

      const res = await query(
        `SELECT dc.id, dc.model_id, dc.media_url, dc.thumbnail_url, dc.media_type,
                dc.caption, dc.tags, dc.is_premium, dc.price_ngn, dc.like_count,
                dc.approved_at as created_at,
                mp.display_name as model_display_name,
                u.username as model_username,
                u.public_id as model_public_id,
                mp.avatar_url as model_avatar_url,
                CASE WHEN uf.follower_id IS NOT NULL THEN 1 ELSE 0 END as followed_boost,
                EXISTS(SELECT 1 FROM content_purchases cp WHERE cp.content_id = dc.id AND cp.buyer_id = $1) as is_purchased
         FROM digital_content dc
         JOIN users u ON u.id = dc.model_id
         LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
         LEFT JOIN user_follows uf ON uf.following_id = dc.model_id AND uf.follower_id = $1
         WHERE dc.status = 'approved' ${cursorClause}
         ORDER BY (CASE WHEN uf.follower_id IS NOT NULL THEN 2 ELSE 1 END) * dc.id DESC
         LIMIT $2`,
        params
      );
      items = res.rows;
    }

    if (items.length > limit) {
      nextCursor = items[limit - 1].id;
      items = items.slice(0, limit);
    }

    return NextResponse.json({ items, nextCursor });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
