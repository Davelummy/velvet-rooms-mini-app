import { NextResponse } from "next/server";
import crypto from "crypto";
import { query, withTransaction } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { ensureUser } from "../../../_lib/users";
import { ensureSessionColumns } from "../../../_lib/sessions";
import { ensureBlockTable } from "../../../_lib/blocks";
import { ensureIdempotencyTable, readIdempotencyRecord, writeIdempotencyRecord } from "../../../_lib/idempotency";
import { createRequestContext, logError, withRequestId } from "../../../_lib/observability";
import { checkRateLimit } from "../../../_lib/rate_limit";
import { createNotification } from "../../../_lib/notifications";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

async function notifyModelBooking({
  modelId,
  clientId,
  sessionId,
  sessionType,
  durationMinutes,
  scheduledFor,
}) {
  const token = BOT_TOKEN;
  if (!token || !modelId || !clientId) {
    return;
  }
  const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [modelId]);
  const clientRes = await query(
    `SELECT u.public_id,
            COALESCE(cp.display_name, mp.display_name, u.public_id) AS display_name
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE u.id = $1`,
    [clientId]
  );
  const modelTelegramId = modelRes.rows[0]?.telegram_id || null;
  const clientLabel =
    clientRes.rows[0]?.display_name || `Client ${clientRes.rows[0]?.public_id || clientId}`;
  if (!modelTelegramId) {
    return;
  }
  const when = scheduledFor ? new Date(scheduledFor).toLocaleString() : "Soon";
  const text = `New booking: ${clientLabel} · ${sessionType} · ${durationMinutes} min · ${when}.`;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: modelTelegramId, text }),
    });
  } catch {
    // ignore notification failures
  }
  await createNotification({
    recipientId: modelId,
    recipientRole: "model",
    title: "New booking request",
    body: `Booking from ${clientLabel} · ${sessionType} · ${durationMinutes} min · ${when}.`,
    type: "booking_request",
    metadata: { client_id: clientId, session_id: sessionId || null, session_type: sessionType },
  });
}

function generateTransactionRef() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `WAL-${Date.now()}-${random}`;
}

function sessionPricing(type, duration) {
  const table = {
    chat: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
    voice: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
    video: { 5: 5000, 10: 9000, 20: 16000, 30: 22000 },
  };
  return table[type]?.[duration] ?? null;
}

function extensionPricing(type) {
  const table = { voice: 1500, video: 4000 };
  return table[type] ?? null;
}

function parseScheduledFor(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const now = new Date();
  const max = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (parsed < now || parsed > max) {
    return null;
  }
  return parsed.toISOString();
}

function calculateFees(amount) {
  const platformFee = Number((amount * 0.2).toFixed(2));
  const receiverPayout = Number((amount - platformFee).toFixed(2));
  return { platformFee, receiverPayout };
}

function generateEscrowRef(prefix) {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export async function POST(request) {
  const ctx = createRequestContext(request, "payments/wallet/charge");
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json(withRequestId({ error: "unauthorized" }, ctx.requestId), {
      status: 401,
    });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json(withRequestId({ error: "user_missing" }, ctx.requestId), {
      status: 400,
    });
  }

  const rateAllowed = await checkRateLimit({
    key: `wallet_charge:${tgUser.id}`,
    limit: 6,
    windowSeconds: 60,
  });
  if (!rateAllowed) {
    return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
      status: 429,
    });
  }

  const escrowType = (body?.escrow_type || "").toString().trim().toLowerCase();
  if (!['session', 'extension'].includes(escrowType)) {
    return NextResponse.json(withRequestId({ error: "invalid_escrow_type" }, ctx.requestId), {
      status: 400,
    });
  }

  const idempotencyKeyRaw =
    request.headers.get("Idempotency-Key") ||
    request.headers.get("idempotency-key") ||
    body?.idempotency_key ||
    "";
  const idempotencyKey = idempotencyKeyRaw.toString().trim();
  if (!idempotencyKey) {
    return NextResponse.json(
      withRequestId({ error: "missing_idempotency_key" }, ctx.requestId),
      { status: 400 }
    );
  }

  let userId;
  const existingUser = await query(
    "SELECT id, role FROM users WHERE telegram_id = $1",
    [tgUser.id]
  );
  if (existingUser.rowCount) {
    let role = existingUser.rows[0].role;
    if (role && role !== "client") {
      const modelRes = await query(
        "SELECT id FROM model_profiles WHERE user_id = $1",
        [existingUser.rows[0].id]
      );
      if (!modelRes.rowCount) {
        await query("UPDATE users SET role = 'client', status = 'active' WHERE id = $1", [
          existingUser.rows[0].id,
        ]);
        role = "client";
      }
    }
    if (role && role !== "client") {
      return NextResponse.json(withRequestId({ error: "client_only" }, ctx.requestId), {
        status: 403,
      });
    }
    userId = existingUser.rows[0].id;
  } else {
    userId = await ensureUser({
      telegramId: tgUser.id,
      username: null,
      firstName: tgUser.first_name || null,
      lastName: tgUser.last_name || null,
      role: "client",
      status: "active",
      email: null,
    });
  }

  await ensureSessionColumns();
  await ensureBlockTable();
  await ensureIdempotencyTable();

  let amount = 0;
  let metadata = { escrow_type: escrowType };
  let receiverId = null;
  let releaseCondition = "both_confirmed";
  let sessionPayload = null;
  let extensionPayload = null;

  if (escrowType === "session") {
    const modelId = Number(body?.model_id || 0);
    const sessionType = (body?.session_type || "").toString().trim().toLowerCase();
    const durationMinutes = Number(body?.duration_minutes || 0);
    const scheduledFor = parseScheduledFor(body?.scheduled_for);
    if (!modelId || !sessionType || !durationMinutes) {
      return NextResponse.json(withRequestId({ error: "missing_session_fields" }, ctx.requestId), {
        status: 400,
      });
    }
    if (!scheduledFor) {
      return NextResponse.json(withRequestId({ error: "invalid_schedule" }, ctx.requestId), {
        status: 400,
      });
    }
    const modelRes = await query(
      `SELECT u.id, mp.verification_status
       FROM users u
       JOIN model_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [modelId]
    );
    if (!modelRes.rowCount || modelRes.rows[0].verification_status !== "approved") {
      return NextResponse.json(withRequestId({ error: "model_not_approved" }, ctx.requestId), {
        status: 400,
      });
    }
    const blockRes = await query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId, modelId]
    );
    if (blockRes.rowCount) {
      return NextResponse.json(withRequestId({ error: "blocked" }, ctx.requestId), {
        status: 403,
      });
    }
    const sessionAmount = sessionPricing(sessionType, durationMinutes);
    if (!sessionAmount) {
      return NextResponse.json(withRequestId({ error: "invalid_session_package" }, ctx.requestId), {
        status: 400,
      });
    }
    amount = sessionAmount;
    receiverId = modelId;
    metadata = {
      ...metadata,
      model_id: modelId,
      session_type: sessionType,
      duration_minutes: durationMinutes,
    };
    sessionPayload = {
      modelId,
      sessionType,
      durationMinutes,
      scheduledFor,
    };
  }

  if (escrowType === "extension") {
    const sessionId = Number(body?.session_id || 0);
    const extensionMinutes = Number(body?.extension_minutes || 5);
    if (!sessionId || extensionMinutes !== 5) {
      return NextResponse.json(withRequestId({ error: "invalid_extension_request" }, ctx.requestId), {
        status: 400,
      });
    }
    const sessionRes = await query(
      `SELECT id, client_id, model_id, session_type, status, duration_minutes, actual_start, scheduled_end
       FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (!sessionRes.rowCount) {
      return NextResponse.json(withRequestId({ error: "session_missing" }, ctx.requestId), {
        status: 404,
      });
    }
    const session = sessionRes.rows[0];
    if (session.client_id !== userId) {
      return NextResponse.json(withRequestId({ error: "client_only" }, ctx.requestId), {
        status: 403,
      });
    }
    if (!['accepted', 'active', 'awaiting_confirmation'].includes(session.status)) {
      return NextResponse.json(withRequestId({ error: "extension_not_allowed" }, ctx.requestId), {
        status: 409,
      });
    }
    const blockRes = await query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId, session.model_id]
    );
    if (blockRes.rowCount) {
      return NextResponse.json(withRequestId({ error: "blocked" }, ctx.requestId), {
        status: 403,
      });
    }
    const extensionAmount = extensionPricing(session.session_type);
    if (!extensionAmount) {
      return NextResponse.json(withRequestId({ error: "extension_not_supported" }, ctx.requestId), {
        status: 400,
      });
    }
    amount = extensionAmount;
    receiverId = session.model_id;
    metadata = {
      ...metadata,
      model_id: receiverId,
      session_id: sessionId,
      session_type: session.session_type,
      extension_minutes: extensionMinutes,
    };
    extensionPayload = {
      sessionId,
      extensionMinutes,
    };
  }

  try {
    const result = await withTransaction(async (client) => {
      const cached = await readIdempotencyRecord(client, idempotencyKey);
      if (cached) {
        return { cached: true, response: cached };
      }

      const balanceRes = await client.query(
        "SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE",
        [userId]
      );
      const balance = Number(balanceRes.rows[0]?.wallet_balance || 0);
      if (balance < amount) {
        return { error: "insufficient_wallet", balance };
      }

      const updateBalance = await client.query(
        `UPDATE users
         SET wallet_balance = wallet_balance - $1
         WHERE id = $2 AND wallet_balance >= $1`,
        [amount, userId]
      );
      if (!updateBalance.rowCount) {
        return { error: "insufficient_wallet" };
      }

      let relatedId = null;
      let sessionBooking = null;
      if (sessionPayload) {
        const sessionRef = generateTransactionRef().replace("WAL", "SES");
        const sessionRes = await client.query(
          `INSERT INTO sessions (session_ref, client_id, model_id, session_type, package_price, status, duration_minutes, scheduled_for, created_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, NOW())
           RETURNING id`,
          [
            sessionRef,
            userId,
            sessionPayload.modelId,
            sessionPayload.sessionType,
            amount,
            sessionPayload.durationMinutes,
            sessionPayload.scheduledFor,
          ]
        );
        relatedId = sessionRes.rows[0]?.id || null;
        metadata = { ...metadata, session_id: relatedId };
        sessionBooking = {
          modelId: sessionPayload.modelId,
          clientId: userId,
          sessionId: relatedId,
          sessionType: sessionPayload.sessionType,
          durationMinutes: sessionPayload.durationMinutes,
          scheduledFor: sessionPayload.scheduledFor,
        };
      }

      if (extensionPayload) {
        const sessionRes = await client.query(
          `SELECT duration_minutes, actual_start, scheduled_end
           FROM sessions
           WHERE id = $1 FOR UPDATE`,
          [extensionPayload.sessionId]
        );
        const session = sessionRes.rows[0] || {};
        const currentDuration = Number(session.duration_minutes || 0);
        const newDuration = currentDuration + extensionPayload.extensionMinutes;
        let newEnd = null;
        if (session.scheduled_end) {
          const base = new Date(session.scheduled_end);
          newEnd = new Date(base.getTime() + extensionPayload.extensionMinutes * 60 * 1000).toISOString();
        } else if (session.actual_start) {
          const base = new Date(session.actual_start);
          newEnd = new Date(base.getTime() + newDuration * 60 * 1000).toISOString();
        }
        await client.query(
          `UPDATE sessions
           SET duration_minutes = $1,
               extension_minutes = COALESCE(extension_minutes, 0) + $2,
               scheduled_end = COALESCE($3, scheduled_end)
           WHERE id = $4`,
          [newDuration, extensionPayload.extensionMinutes, newEnd, extensionPayload.sessionId]
        );
        relatedId = extensionPayload.sessionId;
      }

      const transactionRef = generateTransactionRef();
      const transactionRes = await client.query(
        `INSERT INTO transactions
         (transaction_ref, user_id, transaction_type, amount, payment_provider, status, metadata_json, created_at, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [
          transactionRef,
          userId,
          "payment",
          amount,
          "wallet",
          "completed",
          JSON.stringify(metadata),
        ]
      );
      const transactionId = transactionRes.rows[0]?.id;

      const { platformFee, receiverPayout } = calculateFees(amount);
      const escrowRef = generateEscrowRef("WAL");
      await client.query(
        `INSERT INTO escrow_accounts
         (escrow_ref, escrow_type, related_id, payer_id, receiver_id, amount, platform_fee, receiver_payout, status, transaction_id, held_at, release_condition)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'held', $9, NOW(), $10)`,
        [
          escrowRef,
          escrowType,
          relatedId,
          userId,
          receiverId,
          amount,
          platformFee,
          receiverPayout,
          transactionId,
          releaseCondition,
        ]
      );

      const response = { ok: true, transaction_ref: transactionRef, amount, idempotency_key: idempotencyKey };
      await writeIdempotencyRecord(client, {
        key: idempotencyKey,
        userId,
        scope: "wallet_charge",
        response,
      });

      return { response, sessionBooking };
    });

    if (result?.cached) {
      return NextResponse.json(withRequestId({ ...result.response, cached: true }, ctx.requestId));
    }
    if (result?.error === "insufficient_wallet") {
      return NextResponse.json(withRequestId({ error: "insufficient_wallet", balance: result.balance }, ctx.requestId), {
        status: 409,
      });
    }
    if (result?.error) {
      return NextResponse.json(withRequestId({ error: result.error }, ctx.requestId), { status: 400 });
    }
    if (result?.sessionBooking) {
      notifyModelBooking(result.sessionBooking).catch(() => null);
    }
    return NextResponse.json(withRequestId(result.response, ctx.requestId));
  } catch (err) {
    logError(ctx, "wallet_charge_failed", { error: err?.message });
    return NextResponse.json(withRequestId({ error: "wallet_charge_failed" }, ctx.requestId), {
      status: 500,
    });
  }
}
