import { NextResponse } from "next/server";
import crypto from "crypto";
import { query } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { ensureUser } from "../../../_lib/users";
import { getCryptoCurrencies, getCryptoNetworks, getCryptoWallets } from "../../../_lib/crypto";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const ACCESS_FEE_AMOUNT = 5000;

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
  if (!["access_fee", "content"].includes(escrowType)) {
    return NextResponse.json({ error: "invalid_escrow_type" }, { status: 400 });
  }

  let userId;
  const existingUser = await query(
    "SELECT id, role FROM users WHERE telegram_id = $1",
    [tgUser.id]
  );
  if (existingUser.rowCount) {
    const role = existingUser.rows[0].role;
    if (role && role !== "client") {
      return NextResponse.json({ error: "client_only" }, { status: 403 });
    }
    userId = existingUser.rows[0].id;
  } else {
    userId = await ensureUser({
      telegramId: tgUser.id,
      username: tgUser.username || null,
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
      `SELECT dc.id, dc.price, dc.model_id, dc.is_active
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
    amount = Number(content.price);
    metadata.content_id = contentId;
    metadata.model_id = content.model_id;
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
