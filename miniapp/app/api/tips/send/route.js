import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query, withTransaction } from "../../_lib/db";
import { checkRateLimit } from "../../_lib/rate_limit";
import { reserveIdempotencyKey, finalizeIdempotencyKey, clearIdempotencyKey, ensureIdempotencyTable } from "../../_lib/idempotency";
import { createNotification } from "../../_lib/notifications";
import { createRequestContext } from "../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

const PLATFORM_FEE_PCT = 0.15;

async function ensureTipsTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS tips (
       id BIGSERIAL PRIMARY KEY,
       sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       amount_ngn INTEGER NOT NULL,
       context_type TEXT NOT NULL DEFAULT 'profile',
       context_id BIGINT,
       platform_fee INTEGER NOT NULL DEFAULT 0,
       net_amount INTEGER NOT NULL,
       transaction_id BIGINT REFERENCES transactions(id) ON DELETE SET NULL,
       message TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_tips_recipient ON tips(recipient_id)");
}

export async function POST(req) {
  const ctx = createRequestContext("POST /api/tips/send");
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`tip-send:${tgUser.id}`, 20, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const body = await req.json();
    const { recipientId, amount, contextType = "profile", contextId, message, idempotencyKey } = body;

    if (!recipientId || !amount || amount < 100) {
      return NextResponse.json({ error: "Invalid tip parameters" }, { status: 400 });
    }

    const userRes = await query("SELECT id, wallet_balance FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const sender = userRes.rows[0];

    if (sender.wallet_balance < amount) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 402 });
    }

    await ensureIdempotencyTable();
    await ensureTipsTable();

    const platformFee = Math.round(amount * PLATFORM_FEE_PCT);
    const netAmount = amount - platformFee;

    const result = await withTransaction(async (client) => {
      if (idempotencyKey) {
        const idem = await reserveIdempotencyKey(client, {
          key: idempotencyKey,
          userId: sender.id,
          scope: "tip",
        });
        if (!idem.reserved && idem.cached) return idem.cached;
        if (!idem.reserved && idem.pending) {
          throw new Error("Duplicate request in progress");
        }
      }

      // Deduct from sender wallet
      const deductRes = await client.query(
        "UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2 AND wallet_balance >= $1 RETURNING wallet_balance",
        [amount, sender.id]
      );
      if (!deductRes.rowCount) throw new Error("Insufficient balance");

      // Credit recipient wallet
      await client.query(
        "UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = $2",
        [netAmount, recipientId]
      );

      // Record tip
      const tipRes = await client.query(
        `INSERT INTO tips (sender_id, recipient_id, amount_ngn, context_type, context_id, platform_fee, net_amount, message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [sender.id, recipientId, amount, contextType, contextId || null, platformFee, netAmount, message || null]
      );

      const response = { ok: true, tipId: tipRes.rows[0].id };

      if (idempotencyKey) {
        await finalizeIdempotencyKey(client, { key: idempotencyKey, userId: sender.id, scope: "tip", response });
      }

      return response;
    });

    // Notify recipient
    await createNotification({
      recipientId,
      title: "Tip received! 💜",
      body: `You received a ${amount >= 1000 ? `₦${amount / 1000}k` : `₦${amount}`} tip`,
      type: "tip_received",
      metadata: { tipId: result.tipId, amount, senderId: sender.id },
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
