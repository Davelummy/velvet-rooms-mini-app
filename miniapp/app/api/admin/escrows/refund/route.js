import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";
import { createNotification } from "../../../_lib/notifications";

export const runtime = "nodejs";

async function sendMessage(chatId, text) {
  const token = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
  if (!token) {
    return;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function POST(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const body = await request.json();
  const escrowRef = body?.escrow_ref;
  if (!escrowRef) {
    return NextResponse.json({ error: "missing_escrow" }, { status: 400 });
  }

  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });

  const escrowRes = await query(
    `SELECT id, escrow_type, payer_id, amount
     FROM escrow_accounts WHERE escrow_ref = $1`,
    [escrowRef]
  );
  if (!escrowRes.rowCount) {
    return NextResponse.json({ error: "escrow_missing" }, { status: 404 });
  }
  const escrow = escrowRes.rows[0];

  await query(
    `UPDATE escrow_accounts
     SET status = 'refunded', released_at = NOW(), release_condition_met = TRUE
     WHERE id = $1`,
    [escrow.id]
  );

  if (escrow.payer_id) {
    await query(
      `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2`,
      [escrow.amount, escrow.payer_id]
    );
  }

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'refund_escrow', 'escrow', $2, $3, NOW())`,
    [adminUserId, escrow.id, JSON.stringify({ escrow_ref: escrowRef })]
  );

  const payerRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
    escrow.payer_id,
  ]);
  if (payerRes.rowCount) {
    await sendMessage(payerRes.rows[0].telegram_id, `Escrow ${escrowRef} has been refunded.`);
  }
  if (escrow.payer_id) {
    await createNotification({
      recipientId: escrow.payer_id,
      recipientRole: null,
      title: "Escrow refunded",
      body: `Escrow ${escrowRef} was refunded to your wallet.`,
      type: "escrow_refunded",
      metadata: { escrow_ref: escrowRef },
    });
  }

  return NextResponse.json({ ok: true });
}
