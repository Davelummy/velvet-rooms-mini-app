import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const WEBAPP_URL = process.env.WEBAPP_URL || "";

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN || !chatId) {
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // ignore notification errors
  }
}

function calculateFees(amount, escrowType) {
  if (escrowType === "access_fee") {
    return { platformFee: amount, receiverPayout: null };
  }
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
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const body = await request.json();
  const transactionRef = body?.transaction_ref;
  if (!transactionRef) {
    return NextResponse.json({ error: "missing_transaction" }, { status: 400 });
  }

  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });

  const txRes = await query(
    `SELECT id, user_id, amount, status, metadata_json
     FROM transactions WHERE transaction_ref = $1`,
    [transactionRef]
  );
  if (!txRes.rowCount) {
    return NextResponse.json({ error: "transaction_missing" }, { status: 404 });
  }
  const transaction = txRes.rows[0];
  if (transaction.status === "completed") {
    return NextResponse.json({ ok: true, status: "already_completed" });
  }
  if (!["pending", "submitted"].includes(transaction.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  let metadata = transaction.metadata_json || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }
  const escrowType = metadata.escrow_type;
  if (!escrowType) {
    return NextResponse.json({ error: "missing_escrow_type" }, { status: 400 });
  }

  let escrowId = null;
  let relatedId = null;
  let receiverId = null;
  let releaseCondition = null;
  let autoReleaseAt = null;

  if (escrowType === "access_fee") {
    const profileRes = await query(
      "SELECT id FROM client_profiles WHERE user_id = $1",
      [transaction.user_id]
    );
    if (profileRes.rowCount) {
      relatedId = profileRes.rows[0].id;
    } else {
      const insertRes = await query(
        `INSERT INTO client_profiles (user_id, access_fee_paid)
         VALUES ($1, FALSE)
         RETURNING id`,
        [transaction.user_id]
      );
      relatedId = insertRes.rows[0].id;
    }
    releaseCondition = "access_granted";
  }

  if (escrowType === "content") {
    relatedId = metadata.content_id || null;
    receiverId = metadata.model_id || null;
    releaseCondition = "content_delivered";
    if (!relatedId || !receiverId) {
      return NextResponse.json({ error: "content_metadata_missing" }, { status: 400 });
    }
  }

  if (escrowType === "session") {
    relatedId = metadata.session_id || null;
    receiverId = metadata.model_id || null;
    releaseCondition = "both_confirmed";
    if (!relatedId || !receiverId) {
      return NextResponse.json({ error: "session_metadata_missing" }, { status: 400 });
    }
    await query(
      `UPDATE sessions
       SET status = 'pending', package_price = $1, duration_minutes = $2
       WHERE id = $3`,
      [transaction.amount, metadata.duration_minutes || null, relatedId]
    );
  }

  const amount = Number(transaction.amount || 0);
  const { platformFee, receiverPayout } = calculateFees(amount, escrowType);
  const escrowRef = generateEscrowRef(escrowType.slice(0, 3));

  const escrowRes = await query(
    `INSERT INTO escrow_accounts
     (escrow_ref, escrow_type, related_id, payer_id, receiver_id, amount, platform_fee, receiver_payout, status, transaction_id, held_at, release_condition)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'held', $9, NOW(), $10)
     RETURNING id`,
    [
      escrowRef,
      escrowType,
      relatedId,
      transaction.user_id,
      receiverId,
      amount,
      platformFee,
      receiverPayout,
      transaction.id,
      releaseCondition,
    ]
  );
  escrowId = escrowRes.rows[0].id;

  if (escrowType === "access_fee") {
    await query(
      `UPDATE client_profiles
       SET access_fee_paid = FALSE, access_fee_escrow_id = $1
       WHERE user_id = $2`,
      [escrowId, transaction.user_id]
    );
  }

  if (escrowType === "content") {
    const purchaseRes = await query(
      `UPDATE content_purchases
       SET escrow_id = $1, status = 'paid'
       WHERE transaction_id = $2
       RETURNING id`,
      [escrowId, transaction.id]
    );
    if (!purchaseRes.rowCount) {
      await query(
        `INSERT INTO content_purchases (content_id, client_id, transaction_id, price_paid, escrow_id, status, purchased_at)
         VALUES ($1, $2, $3, $4, $5, 'paid', NOW())`,
        [relatedId, transaction.user_id, transaction.id, amount, escrowId]
      );
    }
  }

  await query(
    `UPDATE transactions
     SET status = 'completed', completed_at = NOW()
     WHERE id = $1`,
    [transaction.id]
  );

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'approve_crypto', 'transaction', $2, $3, NOW())`,
    [adminUserId, transaction.id, JSON.stringify({ escrow_ref: escrowRef })]
  );

  if (escrowType === "session" && receiverId) {
    const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      receiverId,
    ]);
    if (modelRes.rowCount) {
      const link = WEBAPP_URL ? `\nOpen: ${WEBAPP_URL}` : "";
      await sendMessage(
        modelRes.rows[0].telegram_id,
        `New booking approved. Please review and accept the session.${link}`
      );
    }
  }

  return NextResponse.json({ ok: true, escrow_ref: escrowRef });
}
