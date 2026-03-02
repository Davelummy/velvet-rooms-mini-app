import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { createRequestContext } from "../../_lib/observability";

export async function GET(req, { params }) {
  const ctx = createRequestContext(`GET /api/models/${params.publicId}`);
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);

    // Get viewer ID if logged in
    let viewerId = null;
    if (tgUser) {
      const vRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
      if (vRes.rowCount) viewerId = vRes.rows[0].id;
    }

    const res = await query(
      `SELECT u.id, u.username, u.public_id, u.status,
              mp.display_name, mp.avatar_url, mp.cover_url, mp.bio, mp.tags,
              mp.is_available, mp.avg_rating, mp.total_ratings,
              mp.access_fee_ngn, mp.status_message, mp.status_expires_at,
              mp.pinned_content_id,
              (SELECT COUNT(*) FROM user_follows WHERE following_id = u.id)::int as follower_count,
              (SELECT COUNT(*) FROM digital_content WHERE model_id = u.id AND status = 'approved')::int as content_count,
              ${viewerId ? `EXISTS(SELECT 1 FROM user_follows WHERE following_id = u.id AND follower_id = ${viewerId}) as is_following,` : "FALSE as is_following,"}
              ${viewerId ? `EXISTS(SELECT 1 FROM sessions WHERE model_id = u.id AND client_id = ${viewerId} AND status = 'completed' LIMIT 1) as has_booked` : "FALSE as has_booked"}
       FROM users u
       JOIN model_profiles mp ON mp.user_id = u.id
       WHERE (u.public_id = $1 OR u.username = $1)
         AND u.status = 'active'
         AND mp.approved = TRUE`,
      [params.publicId]
    );

    if (!res.rowCount) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const model = res.rows[0];

    // Get pinned content if exists
    if (model.pinned_content_id) {
      const pinnedRes = await query(
        "SELECT id, media_url, thumbnail_url, media_type, caption, is_premium, price_ngn FROM digital_content WHERE id = $1 AND status = 'approved'",
        [model.pinned_content_id]
      );
      model.pinned_content = pinnedRes.rows[0] || null;
    }

    return NextResponse.json(model);
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
