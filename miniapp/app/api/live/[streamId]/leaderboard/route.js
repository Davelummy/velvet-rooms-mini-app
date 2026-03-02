import { NextResponse } from "next/server";
import { verifyInitData } from "../../../_lib/telegram";
import { query } from "../../../_lib/db";
import { createRequestContext } from "../../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(req, { params }) {
  const ctx = createRequestContext(`GET /api/live/${params.streamId}/leaderboard`);
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const res = await query(
      `SELECT lg.gifter_id, lg.total_ngn, lg.gift_count,
              u.username, mp.display_name, mp.avatar_url
       FROM live_gifters lg
       JOIN users u ON u.id = lg.gifter_id
       LEFT JOIN model_profiles mp ON mp.user_id = lg.gifter_id
       WHERE lg.stream_id = $1
       ORDER BY lg.total_ngn DESC
       LIMIT 20`,
      [params.streamId]
    );

    return NextResponse.json({ leaderboard: res.rows });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
