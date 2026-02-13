import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { ensureUser } from "../../../_lib/users";
import { getCryptoCurrencies, getCryptoNetworks, getCryptoWallets } from "../../../_lib/crypto";
import { ensureSessionColumns } from "../../../_lib/sessions";
import { ensureBlockTable } from "../../../_lib/blocks";
import { createRequestContext, withRequestId } from "../../../_lib/observability";
import { checkRateLimit } from "../../../_lib/rate_limit";
import { createNotification } from "../../../_lib/notifications";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const ACCESS_FEE_AMOUNT = 5000;
const PENDING_WINDOW_HOURS = 2;

async function notifyModelBooking({
  modelId,
  clientId,
  sessionType,
  durationMinutes,
  scheduledFor,
  statusLabel,
}) {
  const token = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
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
  const label = statusLabel ? ` (${statusLabel})` : "";
  const text = `New booking${label}: ${clientLabel} · ${sessionType} · ${durationMinutes} min · ${when}.`;
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
    metadata: { client_id: clientId, session_type: sessionType },
  });
}

function normalizeToken(value) {
  return (value || "").toString().trim().toUpperCase();
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

function generateTransactionRef() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CRYPTO-${Date.now()}-${random}`;
}

function extensionPricing(type) {
  const table = { voice: 1500, video: 4000 };
  return table[type] ?? null;
}

export async function POST(request) {
  const ctx = createRequestContext(request, "payments/crypto/initiate");
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
  const allowed = await checkRateLimit({
    key: `pay_init:${tgUser.id}`,
    limit: 6,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
      status: 429,
    });
  }

  const escrowType = body?.escrow_type || "";
  const contentId = Number(body?.content_id || 0);
  if (!["access_fee", "content", "session", "extension"].includes(escrowType)) {
    return NextResponse.json(withRequestId({ error: "invalid_escrow_type" }, ctx.requestId), {
      status: 400,
    });
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

  let amount = ACCESS_FEE_AMOUNT;
  const metadata = { escrow_type: escrowType };
  let existingTx = null;

  if (escrowType === "access_fee") {
    const profileRes = await query(
      "SELECT access_fee_paid FROM client_profiles WHERE user_id = $1",
      [userId]
    );
    if (profileRes.rowCount && profileRes.rows[0].access_fee_paid) {
      return NextResponse.json(
        withRequestId({ error: "access_already_unlocked" }, ctx.requestId),
        { status: 409 }
      );
    }
    metadata.client_id = userId;
    const existingRes = await query(
      `SELECT transaction_ref, amount, metadata_json
       FROM transactions
       WHERE user_id = $1
         AND payment_provider = 'crypto'
         AND status IN ('pending','submitted')
         AND metadata_json->>'escrow_type' = 'access_fee'
         AND created_at >= NOW() - INTERVAL '${PENDING_WINDOW_HOURS} hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId]
    );
    if (existingRes.rowCount) {
      existingTx = existingRes.rows[0];
    }
  }

  if (escrowType === "content") {
    await ensureBlockTable();
    if (!contentId) {
      return NextResponse.json(withRequestId({ error: "missing_content" }, ctx.requestId), {
        status: 400,
      });
    }
    const contentRes = await query(
      `SELECT dc.id, dc.price, dc.model_id, dc.is_active, dc.telegram_file_id
       FROM digital_content dc
       WHERE dc.id = $1`,
      [contentId]
    );
    if (!contentRes.rowCount) {
      return NextResponse.json(withRequestId({ error: "content_missing" }, ctx.requestId), {
        status: 404,
      });
    }
    const content = contentRes.rows[0];
    if (!content.is_active) {
      return NextResponse.json(
        withRequestId({ error: "content_not_approved" }, ctx.requestId),
        { status: 400 }
      );
    }
    if (!content.price || Number(content.price) <= 0) {
      return NextResponse.json(
        withRequestId({ error: "content_not_priced" }, ctx.requestId),
        { status: 400 }
      );
    }
    if (!content.telegram_file_id) {
      return NextResponse.json(
        withRequestId({ error: "content_missing_full_media" }, ctx.requestId),
        { status: 400 }
      );
    }
    const blockRes = await query(
      `SELECT 1 FROM blocks
       WHERE (blocker_id = $1 AND blocked_id = $2)
          OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId, content.model_id]
    );
    if (blockRes.rowCount) {
      return NextResponse.json(withRequestId({ error: "blocked" }, ctx.requestId), {
        status: 403,
      });
    }
    amount = Number(content.price);
    metadata.content_id = contentId;
    metadata.model_id = content.model_id;
    const existingRes = await query(
      `SELECT transaction_ref, amount, metadata_json
       FROM transactions
       WHERE user_id = $1
         AND payment_provider = 'crypto'
         AND status IN ('pending','submitted')
         AND metadata_json->>'escrow_type' = 'content'
         AND metadata_json->>'content_id' = $2
         AND created_at >= NOW() - INTERVAL '${PENDING_WINDOW_HOURS} hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, String(contentId)]
    );
    if (existingRes.rowCount) {
      existingTx = existingRes.rows[0];
    }
  }

  if (escrowType === "session") {
    await ensureSessionColumns();
    await ensureBlockTable();
    const modelId = Number(body?.model_id || 0);
    const sessionType = (body?.session_type || "").toString().trim().toLowerCase();
    const durationMinutes = Number(body?.duration_minutes || 0);
    const scheduledFor = parseScheduledFor(body?.scheduled_for);
    if (!modelId || !sessionType || !durationMinutes) {
      return NextResponse.json(
        withRequestId({ error: "missing_session_fields" }, ctx.requestId),
        { status: 400 }
      );
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
      return NextResponse.json(
        withRequestId({ error: "model_not_approved" }, ctx.requestId),
        { status: 400 }
      );
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
    const priceTable = {
      chat: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
      voice: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
      video: { 5: 5000, 10: 9000, 20: 16000, 30: 22000 },
    };
    const tier = priceTable[sessionType];
    const sessionAmount = tier?.[durationMinutes];
    if (!sessionAmount) {
      return NextResponse.json(
        withRequestId({ error: "invalid_session_package" }, ctx.requestId),
        { status: 400 }
      );
    }
    amount = sessionAmount;
    metadata.model_id = modelId;
    metadata.session_type = normalizeToken(sessionType);
    metadata.duration_minutes = durationMinutes;
    const existingRes = await query(
      `SELECT transaction_ref, amount, metadata_json
       FROM transactions
       WHERE user_id = $1
         AND payment_provider = 'crypto'
         AND status IN ('pending','submitted')
         AND metadata_json->>'escrow_type' = 'session'
         AND metadata_json->>'model_id' = $2
         AND metadata_json->>'session_type' = $3
         AND metadata_json->>'duration_minutes' = $4
         AND created_at >= NOW() - INTERVAL '${PENDING_WINDOW_HOURS} hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, String(modelId), metadata.session_type, String(durationMinutes)]
    );
    if (existingRes.rowCount) {
      existingTx = existingRes.rows[0];
    }
    if (existingTx) {
      const wallets = getCryptoWallets();
      if (!Object.keys(wallets).length) {
        return NextResponse.json(
          withRequestId({ error: "wallets_not_configured" }, ctx.requestId),
          { status: 500 }
        );
      }
      return NextResponse.json({
        ok: true,
        transaction_ref: existingTx.transaction_ref,
        amount: existingTx.amount,
        wallets,
        networks: getCryptoNetworks(),
        currencies: getCryptoCurrencies(),
      });
    }
    const sessionRef = generateTransactionRef().replace("CRYPTO", "SES");
    const sessionRes = await query(
      `INSERT INTO sessions (session_ref, client_id, model_id, session_type, package_price, status, duration_minutes, scheduled_for, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending_payment', $6, $7, NOW())
       RETURNING id`,
      [sessionRef, userId, modelId, sessionType, amount, durationMinutes, scheduledFor]
    );
    metadata.session_id = sessionRes.rows[0]?.id;
    await notifyModelBooking({
      modelId,
      clientId: userId,
      sessionType,
      durationMinutes,
      scheduledFor,
      statusLabel: "pending payment",
    });
  }

  if (escrowType === "extension") {
    await ensureSessionColumns();
    await ensureBlockTable();
    const sessionId = Number(body?.session_id || 0);
    const extensionMinutes = Number(body?.extension_minutes || 5);
    if (!sessionId || extensionMinutes !== 5) {
      return NextResponse.json(
        withRequestId({ error: "invalid_extension_request" }, ctx.requestId),
        { status: 400 }
      );
    }
    const sessionRes = await query(
      `SELECT id, client_id, model_id, session_type, status
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
    if (!["accepted", "active"].includes(session.status)) {
      return NextResponse.json(
        withRequestId({ error: "extension_not_allowed" }, ctx.requestId),
        { status: 409 }
      );
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
      return NextResponse.json(
        withRequestId({ error: "extension_not_supported" }, ctx.requestId),
        { status: 400 }
      );
    }
    amount = extensionAmount;
    metadata.session_id = sessionId;
    metadata.model_id = session.model_id;
    metadata.session_type = normalizeToken(session.session_type);
    metadata.extension_minutes = extensionMinutes;
    const existingRes = await query(
      `SELECT transaction_ref, amount, metadata_json
       FROM transactions
       WHERE user_id = $1
         AND payment_provider = 'crypto'
         AND status IN ('pending','submitted')
         AND metadata_json->>'escrow_type' = 'extension'
         AND metadata_json->>'session_id' = $2
         AND created_at >= NOW() - INTERVAL '${PENDING_WINDOW_HOURS} hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, String(sessionId)]
    );
    if (existingRes.rowCount) {
      existingTx = existingRes.rows[0];
    }
  }

  if (existingTx) {
    const wallets = getCryptoWallets();
    if (!Object.keys(wallets).length) {
      return NextResponse.json(
        withRequestId({ error: "wallets_not_configured" }, ctx.requestId),
        { status: 500 }
      );
    }
    return NextResponse.json(
      withRequestId(
        {
          ok: true,
          transaction_ref: existingTx.transaction_ref,
          amount: existingTx.amount,
          wallets,
          networks: getCryptoNetworks(),
          currencies: getCryptoCurrencies(),
        },
        ctx.requestId
      )
    );
  }

  const transactionRef = generateTransactionRef();
  await query(
    `INSERT INTO transactions (transaction_ref, user_id, transaction_type, amount, payment_provider, status, metadata_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
    [
      transactionRef,
      userId,
      "payment",
      amount,
      "crypto",
      "pending",
      JSON.stringify(metadata),
    ]
  );

  if (escrowType === "content") {
    await query(
      `INSERT INTO content_purchases (content_id, client_id, transaction_id, price_paid, status, purchased_at)
       VALUES ($1, $2, (SELECT id FROM transactions WHERE transaction_ref = $3), $4, $5, NOW())`,
      [contentId, userId, transactionRef, amount, "pending"]
    );
  }

  const wallets = getCryptoWallets();
  if (!Object.keys(wallets).length) {
    return NextResponse.json(
      withRequestId({ error: "wallets_not_configured" }, ctx.requestId),
      { status: 500 }
    );
  }

  return NextResponse.json(
    withRequestId(
      {
        ok: true,
        transaction_ref: transactionRef,
        amount,
        wallets,
        networks: getCryptoNetworks(),
        currencies: getCryptoCurrencies(),
      },
      ctx.requestId
    )
  );
}
