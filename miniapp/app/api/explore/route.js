import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../_lib/telegram";
import { query } from "../_lib/db";
import { checkRateLimit } from "../_lib/rate_limit";
import { createRequestContext } from "../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(req) {
  const ctx = createRequestContext("GET /api/explore");
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`explore:${tgUser.id}`, 60, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const tags = searchParams.get("tags") || "";
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const params = [limit, offset];
    let whereClause = "WHERE u.status = 'active' AND mp.approved = TRUE";

    if (q) {
      params.push(`%${q}%`);
      whereClause += ` AND (mp.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
    }

    if (tags) {
      const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (tagList.length > 0) {
        params.push(tagList);
        whereClause += ` AND mp.tags && $${params.length}::text[]`;
      }
    }

    const res = await query(
      `SELECT u.id, u.username, u.public_id,
              mp.display_name, mp.avatar_url, mp.cover_url, mp.bio,
              mp.tags, mp.avg_rating, mp.total_ratings,
              mp.is_available, mp.status_message,
              (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id) as follower_count,
              (SELECT COUNT(*) FROM digital_content WHERE model_id = u.id AND status = 'approved') as content_count
       FROM users u
       JOIN model_profiles mp ON mp.user_id = u.id
       ${whereClause}
       ORDER BY mp.avg_rating DESC NULLS LAST, follower_count DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    return NextResponse.json({ items: res.rows });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
