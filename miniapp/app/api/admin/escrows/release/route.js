import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";

export const runtime = "nodejs";

async function sendContent(buyerTelegramId, content) {
  const token = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
  if (!token) {
    return false;
  }
  const method = content.content_type === "video" ? "sendVideo" : "sendPhoto";
  const payload = {
    chat_id: buyerTelegramId,
    caption: `${content.title}\n${content.description || ""}`.trim(),
    [content.content_type === "video" ? "video" : "photo"]: content.telegram_file_id,
  };
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

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
    `SELECT id, escrow_type, payer_id, receiver_id, amount, receiver_payout, related_id
     FROM escrow_accounts WHERE escrow_ref = $1`,
    [escrowRef]
  );
  if (!escrowRes.rowCount) {
    return NextResponse.json({ error: "escrow_missing" }, { status: 404 });
  }
  const escrow = escrowRes.rows[0];

  if (escrow.escrow_type === "content") {
    const purchaseRes = await query(
      "SELECT id FROM content_purchases WHERE escrow_id = $1",
      [escrow.id]
    );
    const contentRes = await query(
      "SELECT id, title, description, content_type, telegram_file_id FROM digital_content WHERE id = $1",
      [escrow.related_id]
    );
    const buyerRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      escrow.payer_id,
    ]);
    if (!purchaseRes.rowCount || !contentRes.rowCount || !buyerRes.rowCount) {
      return NextResponse.json({ error: "content_missing" }, { status: 400 });
    }
    const delivered = await sendContent(buyerRes.rows[0].telegram_id, contentRes.rows[0]);
    if (!delivered) {
      return NextResponse.json({ error: "delivery_failed" }, { status: 500 });
    }
    await query("UPDATE content_purchases SET status = 'delivered' WHERE escrow_id = $1", [
      escrow.id,
    ]);
  }

  if (escrow.escrow_type === "access_fee") {
    await query(
      `UPDATE client_profiles SET access_fee_paid = TRUE, access_granted_at = NOW()
       WHERE access_fee_escrow_id = $1`,
      [escrow.id]
    );
  }

  await query(
    `UPDATE escrow_accounts
     SET status = 'released', released_at = NOW(), release_condition_met = TRUE
     WHERE id = $1`,
    [escrow.id]
  );

  if (escrow.receiver_id && escrow.receiver_payout) {
    await query(
      `UPDATE users SET wallet_balance = COALESCE(wallet_balance, 0) + $1 WHERE id = $2`,
      [escrow.receiver_payout, escrow.receiver_id]
    );
  }

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'release_escrow', 'escrow', $2, $3, NOW())`,
    [adminUserId, escrow.id, JSON.stringify({ escrow_ref: escrowRef })]
  );

  const payerRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
    escrow.payer_id,
  ]);
  if (payerRes.rowCount) {
    const message =
      escrow.escrow_type === "access_fee"
        ? "Access granted ✅ Your gallery is now unlocked."
        : `Escrow ${escrowRef} has been released.`;
    await sendMessage(payerRes.rows[0].telegram_id, message);
  }

  return NextResponse.json({ ok: true });
}
