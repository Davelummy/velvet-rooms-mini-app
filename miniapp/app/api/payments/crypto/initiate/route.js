import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { ensureUser } from "../../../_lib/users";
import { getCryptoCurrencies, getCryptoNetworks, getCryptoWallets } from "../../../_lib/crypto";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const ACCESS_FEE_AMOUNT = 5000;
const PENDING_WINDOW_HOURS = 2;

function normalizeToken(value) {
  return (value || "").toString().trim().toUpperCase();
}

function generateTransactionRef() {
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CRYPTO-${Date.now()}-${random}`;
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

  const escrowType = body?.escrow_type || "";
  const contentId = Number(body?.content_id || 0);
  if (!["access_fee", "content", "session"].includes(escrowType)) {
    return NextResponse.json({ error: "invalid_escrow_type" }, { status: 400 });
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
  let existingTx = null;

  if (escrowType === "access_fee") {
    const profileRes = await query(
      "SELECT access_fee_paid FROM client_profiles WHERE user_id = $1",
      [userId]
    );
    if (profileRes.rowCount && profileRes.rows[0].access_fee_paid) {
      return NextResponse.json({ error: "access_already_unlocked" }, { status: 409 });
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
    const modelId = Number(body?.model_id || 0);
    const sessionType = (body?.session_type || "").toString().trim().toLowerCase();
    const durationMinutes = Number(body?.duration_minutes || 0);
    if (!modelId || !sessionType || !durationMinutes) {
      return NextResponse.json({ error: "missing_session_fields" }, { status: 400 });
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
    const priceTable = {
      chat: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
      voice: { 5: 2000, 10: 3500, 20: 6500, 30: 9000 },
      video: { 5: 5000, 10: 9000, 20: 16000, 30: 22000 },
    };
    const tier = priceTable[sessionType];
    const sessionAmount = tier?.[durationMinutes];
    if (!sessionAmount) {
      return NextResponse.json({ error: "invalid_session_package" }, { status: 400 });
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
        return NextResponse.json({ error: "wallets_not_configured" }, { status: 500 });
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
      `INSERT INTO sessions (session_ref, client_id, model_id, session_type, package_price, status, duration_minutes, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending_payment', $6, NOW())
       RETURNING id`,
      [sessionRef, userId, modelId, sessionType, amount, durationMinutes]
    );
    metadata.session_id = sessionRes.rows[0]?.id;
  }

  if (existingTx) {
    const wallets = getCryptoWallets();
    if (!Object.keys(wallets).length) {
      return NextResponse.json({ error: "wallets_not_configured" }, { status: 500 });
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
    return NextResponse.json({ error: "wallets_not_configured" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    transaction_ref: transactionRef,
    amount,
    wallets,
    networks: getCryptoNetworks(),
    currencies: getCryptoCurrencies(),
  });
}
