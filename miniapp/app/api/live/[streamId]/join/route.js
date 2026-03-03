import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../../_lib/telegram";
import { query } from "../../../_lib/db";
import { createRequestContext } from "../../../_lib/observability";
import { generateRtcToken } from "../../../_lib/agora";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(req, { params }) {
  const ctx = createRequestContext(req, `POST /api/live/${params.streamId}/join`);
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

    const streamRes = await query(
      "SELECT id, model_id, agora_channel, tier, ppv_price_ngn, status FROM live_streams WHERE id = $1",
      [params.streamId]
    );
    if (!streamRes.rowCount) return NextResponse.json({ error: "Stream not found" }, { status: 404 });
    const stream = streamRes.rows[0];

    if (stream.status !== "live") {
      return NextResponse.json({ error: "Stream is not live" }, { status: 400 });
    }

    // PPV gate — check if viewer paid
    if (stream.tier === "ppv" && stream.ppv_price_ngn) {
      const paidRes = await query(
        "SELECT id FROM live_stream_viewers WHERE stream_id = $1 AND viewer_id = $2 AND ppv_paid = TRUE",
        [stream.id, viewerId]
      );
      if (!paidRes.rowCount) {
        return NextResponse.json({
          error: "PPV access required",
          ppv_price_ngn: stream.ppv_price_ngn,
        }, { status: 402 });
      }
    }

    // Record viewer join
    await query(
      `INSERT INTO live_stream_viewers (stream_id, viewer_id, joined_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (stream_id, viewer_id) DO UPDATE SET joined_at = NOW(), left_at = NULL`,
      [stream.id, viewerId]
    ).catch(() => {});

    // Generate audience token
    const { token, appId, expiresAt } = generateRtcToken({
      channelName: stream.agora_channel,
      uid: viewerId,
      role: "audience",
    });

    return NextResponse.json({
      agora_channel: stream.agora_channel,
      agora_app_id: appId,
      agora_token: token,
      agora_uid: viewerId,
      agora_expires_at: expiresAt,
      role: "audience",
    });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
