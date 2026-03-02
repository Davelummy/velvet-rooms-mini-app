import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../../_lib/telegram";
import { query } from "../../../_lib/db";
import { createRequestContext } from "../../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(req, { params }) {
  const ctx = createRequestContext(`POST /api/live/${params.streamId}/leave`);
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const viewerId = userRes.rows[0].id;

    // Mark viewer as left
    await query(
      `UPDATE live_stream_viewers
       SET left_at = NOW()
       WHERE stream_id = $1 AND viewer_id = $2 AND left_at IS NULL`,
      [params.streamId, viewerId]
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
