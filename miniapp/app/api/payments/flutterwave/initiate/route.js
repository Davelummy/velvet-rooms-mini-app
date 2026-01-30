import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { ensureUser } from "../../../_lib/users";
import { ensureSessionColumns } from "../../_lib/sessions";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const FLW_SECRET = process.env.FLUTTERWAVE_SECRET_KEY || "";
const WEBAPP_URL_RAW = (process.env.WEBAPP_URL || "").trim();
const WEBAPP_URL = (WEBAPP_URL_RAW.startsWith("http://") || WEBAPP_URL_RAW.startsWith("https://")
  ? WEBAPP_URL_RAW
  : WEBAPP_URL_RAW
  ? `https://${WEBAPP_URL_RAW}`
  : ""
).replace(/\/$/, "");
const ACCESS_FEE_AMOUNT = 5000;
const PENDING_WINDOW_HOURS = 2;

function generateTransactionRef() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `FLW-${Date.now()}-${random}`;
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

export async function POST(request) {
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  if (!FLW_SECRET) {
    return NextResponse.json({ error: "flutterwave_not_configured" }, { status: 503 });
  }
  if (!WEBAPP_URL) {
    return NextResponse.json({ error: "webapp_url_missing" }, { status: 500 });
  }

  const escrowType = body?.escrow_type || "";
  const contentId = Number(body?.content_id || 0);
  if (!["access_fee", "content", "session", "extension"].includes(escrowType)) {
    return NextResponse.json({ error: "invalid_escrow_type" }, { status: 400 });
  }

  let userId;
  const existingUser = await query(
    "SELECT id, role, email, public_id FROM users WHERE telegram_id = $1",
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
      return NextResponse.json({ error: "client_only" }, { status: 403 });
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

  if (escrowType === "access_fee") {
    const profileRes = await query(
      "SELECT access_fee_paid FROM client_profiles WHERE user_id = $1",
      [userId]
    );
    if (profileRes.rowCount && profileRes.rows[0].access_fee_paid) {
      return NextResponse.json({ error: "access_already_unlocked" }, { status: 409 });
    }
    metadata.client_id = userId;
  }

  if (escrowType === "content") {
    if (!contentId) {
      return NextResponse.json({ error: "missing_content" }, { status: 400 });
    }
    const contentRes = await query(
      `SELECT dc.id, dc.price, dc.model_id, dc.is_active, dc.telegram_file_id
       FROM digital_content dc
       WHERE dc.id = $1`,
      [contentId]
    );
    if (!contentRes.rowCount) {
      return NextResponse.json({ error: "content_missing" }, { status: 404 });
    }
    const content = contentRes.rows[0];
    if (!content.is_active) {
      return NextResponse.json({ error: "content_not_approved" }, { status: 400 });
    }
    if (!content.price || Number(content.price) <= 0) {
      return NextResponse.json({ error: "content_not_priced" }, { status: 400 });
    }
    if (!content.telegram_file_id) {
      return NextResponse.json({ error: "content_missing_full_media" }, { status: 400 });
    }
    amount = Number(content.price);
    metadata.content_id = contentId;
    metadata.model_id = content.model_id;
  }

  if (escrowType === "session") {
    await ensureSessionColumns();
    const modelId = Number(body?.model_id || 0);
    const sessionType = (body?.session_type || "").toString().trim().toLowerCase();
    const durationMinutes = Number(body?.duration_minutes || 0);
    const scheduledFor = parseScheduledFor(body?.scheduled_for);
    if (!modelId || !sessionType || !durationMinutes) {
      return NextResponse.json({ error: "missing_session_fields" }, { status: 400 });
    }
    if (!scheduledFor) {
      return NextResponse.json({ error: "invalid_schedule" }, { status: 400 });
    }
    const modelRes = await query(
      `SELECT u.id, mp.verification_status
       FROM users u
       JOIN model_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [modelId]
    );
    if (!modelRes.rowCount || modelRes.rows[0].verification_status !== "approved") {
      return NextResponse.json({ error: "model_not_approved" }, { status: 400 });
    }
    const sessionAmount = sessionPricing(sessionType, durationMinutes);
    if (!sessionAmount) {
      return NextResponse.json({ error: "invalid_session_package" }, { status: 400 });
    }
    amount = sessionAmount;
    metadata.model_id = modelId;
    metadata.session_type = sessionType;
    metadata.duration_minutes = durationMinutes;
    const sessionRef = generateTransactionRef().replace("FLW", "SES");
    const sessionRes = await query(
      `INSERT INTO sessions (session_ref, client_id, model_id, session_type, package_price, status, duration_minutes, scheduled_for, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending_payment', $6, $7, NOW())
       RETURNING id`,
      [sessionRef, userId, modelId, sessionType, amount, durationMinutes, scheduledFor]
    );
    metadata.session_id = sessionRes.rows[0]?.id;
  }

  if (escrowType === "extension") {
    await ensureSessionColumns();
    const sessionId = Number(body?.session_id || 0);
    const extensionMinutes = Number(body?.extension_minutes || 5);
    if (!sessionId || extensionMinutes !== 5) {
      return NextResponse.json({ error: "invalid_extension_request" }, { status: 400 });
    }
    const sessionRes = await query(
      `SELECT id, client_id, model_id, session_type, status
       FROM sessions WHERE id = $1`,
      [sessionId]
    );
    if (!sessionRes.rowCount) {
      return NextResponse.json({ error: "session_missing" }, { status: 404 });
    }
    const session = sessionRes.rows[0];
    if (session.client_id !== userId) {
      return NextResponse.json({ error: "client_only" }, { status: 403 });
    }
    if (!["accepted", "active"].includes(session.status)) {
      return NextResponse.json({ error: "extension_not_allowed" }, { status: 409 });
    }
    const extensionAmount = extensionPricing(session.session_type);
    if (!extensionAmount) {
      return NextResponse.json({ error: "extension_not_supported" }, { status: 400 });
    }
    const existingRes = await query(
      `SELECT transaction_ref
       FROM transactions
       WHERE user_id = $1
         AND payment_provider = 'flutterwave'
         AND status IN ('pending','submitted')
         AND metadata_json->>'escrow_type' = 'extension'
         AND metadata_json->>'session_id' = $2
         AND created_at >= NOW() - INTERVAL '${PENDING_WINDOW_HOURS} hours'
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, String(sessionId)]
    );
    if (existingRes.rowCount) {
      return NextResponse.json({ error: "extension_pending" }, { status: 409 });
    }
    amount = extensionAmount;
    metadata.session_id = sessionId;
    metadata.model_id = session.model_id;
    metadata.session_type = session.session_type;
    metadata.extension_minutes = extensionMinutes;
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
      "flutterwave",
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

  const userRow = existingUser.rowCount ? existingUser.rows[0] : null;
  const email =
    userRow?.email || `${userRow?.username || userRow?.public_id || userId}@velvetrooms.app`;
  const customerName = userRow?.username || userRow?.public_id || "Client";

  const payload = {
    tx_ref: transactionRef,
    amount,
    currency: "NGN",
    redirect_url: `${WEBAPP_URL}/?payment=flutterwave&tx_ref=${transactionRef}`,
    payment_options: "card,banktransfer,ussd",
    customer: { email, name: customerName },
    customizations: {
      title: "Velvet Rooms",
      description: "Escrow payment",
      logo: "",
    },
  };

  const fwRes = await fetch("https://api.flutterwave.com/v3/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FLW_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const fwBody = await fwRes.json().catch(() => ({}));
  if (!fwRes.ok || fwBody?.status !== "success") {
    return NextResponse.json(
      { error: "flutterwave_init_failed", detail: fwBody?.message || "error" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    transaction_ref: transactionRef,
    amount,
    payment_link: fwBody?.data?.link,
  });
}
