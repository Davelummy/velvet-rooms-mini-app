import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query, withTransaction } from "../../_lib/db";
import { checkRateLimit } from "../../_lib/rate_limit";
import { reserveIdempotencyKey, finalizeIdempotencyKey, ensureIdempotencyTable } from "../../_lib/idempotency";
import { createNotification } from "../../_lib/notifications";
import { createRequestContext } from "../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

const PLATFORM_FEE_PCT = 0.15;

async function ensureGiftsTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS virtual_gifts_sent (
       id BIGSERIAL PRIMARY KEY,
       gift_id INTEGER NOT NULL REFERENCES virtual_gifts_catalog(id),
       sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
       live_stream_id BIGINT,
       amount_ngn INTEGER NOT NULL,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_gifts_recipient ON virtual_gifts_sent(recipient_id)");
}

export async function POST(req) {
  const ctx = createRequestContext("POST /api/gifts/send");
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`gift-send:${tgUser.id}`, 10, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const { giftId, recipientId, sessionId, liveStreamId, idempotencyKey } = await req.json();
    if (!giftId || !recipientId) {
      return NextResponse.json({ error: "giftId and recipientId required" }, { status: 400 });
    }

    // Look up gift
    const giftRes = await query("SELECT id, name, emoji, price_ngn FROM virtual_gifts_catalog WHERE id = $1 AND is_active = TRUE", [giftId]);
    if (!giftRes.rowCount) return NextResponse.json({ error: "Gift not found" }, { status: 404 });
    const gift = giftRes.rows[0];

    const userRes = await query("SELECT id, wallet_balance FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const sender = userRes.rows[0];

    if (sender.wallet_balance < gift.price_ngn) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
    }

    await ensureIdempotencyTable();
    await ensureGiftsTables();

    const platformFee = Math.round(gift.price_ngn * PLATFORM_FEE_PCT);
    const netAmount = gift.price_ngn - platformFee;

    const result = await withTransaction(async (client) => {
      if (idempotencyKey) {
        const idem = await reserveIdempotencyKey(client, { key: idempotencyKey, userId: sender.id, scope: "gift" });
        if (!idem.reserved && idem.cached) return idem.cached;
      }

      // Deduct sender wallet
      const deductRes = await client.query(
        "UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance",
        [gift.price_ngn, sender.id]
      );
      if (!deductRes.rowCount) throw new Error("Insufficient balance");

      // Credit recipient
      await client.query(
        "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2",
        [netAmount, recipientId]
      );

      // Record gift
      const giftSentRes = await client.query(
        `INSERT INTO virtual_gifts_sent (gift_id, sender_id, recipient_id, session_id, live_stream_id, amount_ngn)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [gift.id, sender.id, recipientId, sessionId || null, liveStreamId || null, gift.price_ngn]
      );

      const response = { ok: true, giftSentId: giftSentRes.rows[0].id, emoji: gift.emoji, name: gift.name };

      if (idempotencyKey) {
        await finalizeIdempotencyKey(client, { key: idempotencyKey, userId: sender.id, scope: "gift", response });
      }

      return response;
    });

    // Notify recipient
    await createNotification({
      recipientId,
      title: `${gift.emoji} Gift received!`,
      body: `Someone sent you a ${gift.name}`,
      type: "gift_received",
      metadata: { giftId: gift.id, emoji: gift.emoji, amount: gift.price_ngn },
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    ctx.error(err);
    if (err.message === "Insufficient balance") {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
