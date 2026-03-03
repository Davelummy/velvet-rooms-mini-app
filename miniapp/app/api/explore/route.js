import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../_lib/telegram";
import { query } from "../_lib/db";
import { checkRateLimit } from "../_lib/rate_limit";
import { createRequestContext } from "../_lib/observability";
import { ensureUserColumns } from "../_lib/users";
import { ensureModelProfileColumns } from "../_lib/models";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(req) {
  const ctx = createRequestContext(req, "GET /api/explore");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await ensureUserColumns();
    await ensureModelProfileColumns();

    const rateAllowed = await checkRateLimit({
      key: `explore:${tgUser.id}`,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rateAllowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 50);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const params = [limit, offset];
    let whereClause =
      "WHERE COALESCE(u.status, 'active') = 'active' AND (u.role = 'model' OR mp.verification_status = 'approved')";

    if (q) {
      params.push(`%${q}%`);
      whereClause += ` AND (mp.display_name ILIKE $${params.length} OR u.username ILIKE $${params.length})`;
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
