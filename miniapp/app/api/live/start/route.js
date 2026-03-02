import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { checkRateLimit } from "../../_lib/rate_limit";
import { createNotification } from "../../_lib/notifications";
import { createRequestContext } from "../../_lib/observability";
import { generateRtcToken } from "../../_lib/agora";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

async function ensureLiveTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS live_streams (
       id BIGSERIAL PRIMARY KEY,
       model_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       agora_channel TEXT NOT NULL,
       tier TEXT NOT NULL DEFAULT 'free',
       ppv_price_ngn INTEGER,
       title TEXT, scheduled_at TIMESTAMPTZ,
       started_at TIMESTAMPTZ, ended_at TIMESTAMPTZ,
       peak_viewers INTEGER DEFAULT 0,
       total_gifts_ngn INTEGER DEFAULT 0,
       status TEXT NOT NULL DEFAULT 'scheduled',
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_livestreams_model ON live_streams(model_id)");
  await query("CREATE INDEX IF NOT EXISTS idx_livestreams_status ON live_streams(status)");
  await query(
    `CREATE TABLE IF NOT EXISTS live_stream_viewers (
       id BIGSERIAL PRIMARY KEY,
       stream_id BIGINT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
       viewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       joined_at TIMESTAMPTZ DEFAULT NOW(),
       left_at TIMESTAMPTZ,
       ppv_paid BOOLEAN DEFAULT FALSE,
       UNIQUE(stream_id, viewer_id)
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS live_gifters (
       id BIGSERIAL PRIMARY KEY,
       stream_id BIGINT NOT NULL REFERENCES live_streams(id) ON DELETE CASCADE,
       gifter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       total_ngn INTEGER DEFAULT 0,
       gift_count INTEGER DEFAULT 0,
       UNIQUE(stream_id, gifter_id)
     )`
  );
}

export async function POST(req) {
  const ctx = createRequestContext("POST /api/live/start");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`live-start:${tgUser.id}`, 5, 3600);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const userRes = await query(
      "SELECT id, username FROM users WHERE telegram_id = $1 AND role = 'model'",
      [tgUser.id]
    );
    if (!userRes.rowCount) {
      return NextResponse.json({ error: "Model account required" }, { status: 403 });
    }
    const model = userRes.rows[0];

    const { title, tier = "free", ppvPriceNgn } = await req.json().catch(() => ({}));

    await ensureLiveTables();

    // Create stream record with placeholder channel, get the ID first
    const streamRes = await query(
      `INSERT INTO live_streams (model_id, agora_channel, tier, ppv_price_ngn, title, started_at, status)
       VALUES ($1, 'placeholder', $2, $3, $4, NOW(), 'live')
       RETURNING id`,
      [model.id, tier, tier === "ppv" ? ppvPriceNgn : null, title || null]
    );
    const streamId = streamRes.rows[0].id;
    const channelName = `vr-live-${streamId}`;

    await query("UPDATE live_streams SET agora_channel = $1 WHERE id = $2", [channelName, streamId]);

    // Generate host token for the model
    const { token, appId, expiresAt } = generateRtcToken({
      channelName,
      uid: model.id,
      role: "host",
    });

    // Notify followers
    const followersRes = await query(
      "SELECT follower_id FROM user_follows WHERE following_id = $1",
      [model.id]
    );
    await Promise.all(
      followersRes.rows.map((row) =>
        createNotification({
          recipientId: row.follower_id,
          title: `🔴 ${title || "Live stream"} started`,
          body: `${model.username || "A creator you follow"} is live now!`,
          type: "live_started",
          metadata: { streamId: streamId.toString(), modelId: model.id },
        }).catch(() => {})
      )
    );

    return NextResponse.json({
      id: streamId.toString(),
      model_id: model.id,
      agora_channel: channelName,
      agora_app_id: appId,
      agora_token: token,
      agora_uid: model.id,
      agora_expires_at: expiresAt,
      title,
      tier,
      status: "live",
    });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
