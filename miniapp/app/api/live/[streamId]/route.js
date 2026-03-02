import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { createRequestContext } from "../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(req, { params }) {
  const ctx = createRequestContext(`GET /api/live/${params.streamId}`);
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const streamRes = await query(
      `SELECT ls.id, ls.model_id, ls.agora_channel, ls.tier, ls.title, ls.status,
              ls.started_at, ls.peak_viewers, ls.total_gifts_ngn,
              mp.display_name as model_name, mp.avatar_url as model_avatar,
              (SELECT COUNT(DISTINCT viewer_id)::int FROM live_stream_viewers WHERE stream_id = ls.id AND left_at IS NULL) as viewer_count
       FROM live_streams ls
       LEFT JOIN model_profiles mp ON mp.user_id = ls.model_id
       WHERE ls.id = $1`,
      [params.streamId]
    );

    if (!streamRes.rowCount) {
      return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    }

    return NextResponse.json(streamRes.rows[0]);
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
