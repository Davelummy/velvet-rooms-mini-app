import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

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

  const sessionId = Number(body?.session_id || 0);
  if (!sessionId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const userId = userRes.rows[0].id;

  const sessionRes = await query(
    `SELECT id, client_id, model_id, status
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
  if (!["pending_payment", "pending", "accepted", "active"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  await query(
    `UPDATE sessions SET status = 'cancelled_by_client', completed_at = NOW() WHERE id = $1`,
    [sessionId]
  );

  const escrowRes = await query(
    `SELECT id, amount, receiver_id
     FROM escrow_accounts
     WHERE escrow_type IN ('session','extension') AND related_id = $1 AND status = 'held'`,
    [sessionId]
  );
  if (escrowRes.rowCount) {
    const escrow = escrowRes.rows[0];
    await query(
      `UPDATE escrow_accounts
       SET status = 'released', released_at = NOW(), release_condition_met = TRUE,
           dispute_reason = 'client_cancelled'
       WHERE id = $1`,
      [escrow.id]
    );
    if (escrow.receiver_id) {
      await query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) + $1
         WHERE id = $2`,
        [escrow.amount, escrow.receiver_id]
      );
    }
  }

  const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
    session.client_id,
  ]);
  const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
    session.model_id,
  ]);
  if (clientRes.rowCount) {
    await sendMessage(
      clientRes.rows[0].telegram_id,
      "Session cancelled. Payment released to the model."
    );
  }
  if (modelRes.rowCount) {
    await sendMessage(
      modelRes.rows[0].telegram_id,
      "Client cancelled the session. Payment released to you."
    );
  }

  return NextResponse.json({ ok: true });
}
