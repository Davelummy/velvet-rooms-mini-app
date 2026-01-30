import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";

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
    `SELECT id, metadata_json FROM transactions WHERE transaction_ref = $1`,
    [transactionRef]
  );
  if (!txRes.rowCount) {
    return NextResponse.json({ error: "transaction_missing" }, { status: 404 });
  }

  await query(
    `UPDATE transactions SET status = 'rejected' WHERE transaction_ref = $1`,
    [transactionRef]
  );
  await query(
    `UPDATE content_purchases
     SET status = 'rejected'
     WHERE transaction_id = $1`,
    [txRes.rows[0].id]
  );

  let metadata = txRes.rows[0].metadata_json || {};
  if (typeof metadata === "string") {
    try {
      metadata = JSON.parse(metadata);
    } catch {
      metadata = {};
    }
  }
  if (metadata.escrow_type === "session" && metadata.session_id) {
    const sessionRes = await query(
      "SELECT id, client_id, model_id, session_type, duration_minutes FROM sessions WHERE id = $1",
      [metadata.session_id]
    );
    await query("UPDATE sessions SET status = 'rejected' WHERE id = $1", [
      metadata.session_id,
    ]);
    if (sessionRes.rowCount) {
      const session = sessionRes.rows[0];
      await query(
        `UPDATE sessions
         SET status = 'rejected'
         WHERE status = 'pending_payment'
           AND client_id = $1
           AND model_id = $2
           AND session_type = $3
           AND duration_minutes = $4`,
        [session.client_id, session.model_id, session.session_type, session.duration_minutes]
      );
      const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
        session.client_id,
      ]);
      const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
        session.model_id,
      ]);
      if (clientRes.rowCount) {
        await sendMessage(
          clientRes.rows[0].telegram_id,
          "Session payment was rejected by admin. Please try again."
        );
      }
      if (modelRes.rowCount) {
        await sendMessage(
          modelRes.rows[0].telegram_id,
          "Session booking was rejected by admin."
        );
      }
    }
  }

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'reject_crypto', 'transaction', $2, $3, NOW())`,
    [adminUserId, txRes.rows[0].id, JSON.stringify({ transaction_ref: transactionRef })]
  );

  return NextResponse.json({ ok: true });
}
