import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { createRequestContext } from "../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(req) {
  const ctx = createRequestContext("POST /api/live/end");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { streamId } = await req.json();
    if (!streamId) return NextResponse.json({ error: "streamId required" }, { status: 400 });

    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1 AND role = 'model'", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const modelId = userRes.rows[0].id;

    await query(
      `UPDATE live_streams SET status = 'ended', ended_at = NOW()
       WHERE id = $1 AND model_id = $2 AND status = 'live'`,
      [streamId, modelId]
    );

    // Calculate totals
    const giftTotals = await query(
      "SELECT COALESCE(SUM(total_ngn), 0) as total FROM live_gifters WHERE stream_id = $1",
      [streamId]
    );
    const totalGiftsNgn = giftTotals.rows[0]?.total || 0;

    const viewerCount = await query(
      "SELECT COUNT(DISTINCT viewer_id)::int as count FROM live_stream_viewers WHERE stream_id = $1",
      [streamId]
    );
    const peakViewers = viewerCount.rows[0]?.count || 0;

    await query(
      "UPDATE live_streams SET total_gifts_ngn = $1, peak_viewers = $2 WHERE id = $3",
      [totalGiftsNgn, peakViewers, streamId]
    );

    return NextResponse.json({ ok: true, totalGiftsNgn, peakViewers });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
