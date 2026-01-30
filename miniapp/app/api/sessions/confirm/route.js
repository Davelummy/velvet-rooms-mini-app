import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const SESSION_HUB_CHAT_ID = process.env.SESSION_HUB_CHAT_ID || "";

function normalizeChatId(rawId) {
  if (!rawId) {
    return null;
  }
  const asString = String(rawId);
  if (asString.startsWith("-")) {
    return asString;
  }
  if (asString.startsWith("100")) {
    return `-${asString}`;
  }
  return `-100${asString}`;
}

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN || !chatId) {
    return;
  }
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function removeFromSessionGroup(userTelegramId) {
  const channelId = normalizeChatId(SESSION_HUB_CHAT_ID);
  if (!BOT_TOKEN || !channelId || !userTelegramId) {
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/banChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, user_id: userTelegramId }),
    });
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/unbanChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, user_id: userTelegramId }),
    });
  } catch {
    // ignore cleanup errors
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
    `SELECT id, client_id, model_id, status, client_confirmed, model_confirmed
     FROM sessions WHERE id = $1`,
    [sessionId]
  );
  if (!sessionRes.rowCount) {
    return NextResponse.json({ error: "session_missing" }, { status: 404 });
  }
  const session = sessionRes.rows[0];
  if (![session.client_id, session.model_id].includes(userId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const isClient = session.client_id === userId;
  const isModel = session.model_id === userId;

  if (!["active", "awaiting_confirmation"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  await query(
    `UPDATE sessions
     SET status = 'awaiting_confirmation',
         ended_at = COALESCE(ended_at, NOW()),
         client_confirmed = CASE WHEN $2 THEN TRUE ELSE client_confirmed END,
         model_confirmed = CASE WHEN $3 THEN TRUE ELSE model_confirmed END
     WHERE id = $1`,
    [sessionId, isClient, isModel]
  );

  const updatedRes = await query(
    `SELECT client_confirmed, model_confirmed, client_id, model_id
     FROM sessions WHERE id = $1`,
    [sessionId]
  );
  const updated = updatedRes.rows[0];
  const bothConfirmed = updated.client_confirmed && updated.model_confirmed;

  if (bothConfirmed) {
    await query(
      `UPDATE sessions
       SET status = 'completed', completed_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );
    await query(
      `UPDATE escrow_accounts
       SET release_condition_met = TRUE
       WHERE escrow_type IN ('session','extension') AND related_id = $1`,
      [sessionId]
    );

    const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      updated.client_id,
    ]);
    const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      updated.model_id,
    ]);
    if (clientRes.rowCount) {
      await sendMessage(
        clientRes.rows[0].telegram_id,
        "Session completed ✅ Thanks for confirming."
      );
      await removeFromSessionGroup(clientRes.rows[0].telegram_id);
    }
    if (modelRes.rowCount) {
      await sendMessage(
        modelRes.rows[0].telegram_id,
        "Session completed ✅ Thanks for confirming."
      );
      await removeFromSessionGroup(modelRes.rows[0].telegram_id);
    }
  }

  return NextResponse.json({ ok: true, completed: bothConfirmed });
}
