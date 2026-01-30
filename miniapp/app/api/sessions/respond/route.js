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

async function createSessionInviteLink(sessionRef, expiresInSeconds = 7200) {
  const channelId = normalizeChatId(SESSION_HUB_CHAT_ID);
  if (!BOT_TOKEN || !channelId) {
    return null;
  }
  const expireDate = Math.floor(Date.now() / 1000) + expiresInSeconds;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/createChatInviteLink`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          name: `Session ${sessionRef || ""}`.trim(),
          member_limit: 2,
          expire_date: expireDate,
        }),
      }
    );
    const data = await res.json();
    if (!data?.ok) {
      return null;
    }
    return data?.result?.invite_link || null;
  } catch {
    return null;
  }
}

async function sendMessage(chatId, text) {
  const token = BOT_TOKEN;
  if (!token || !chatId) {
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch {
    // ignore notification errors
  }
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
  const action = (body?.action || "").toString().toLowerCase();
  if (!sessionId || !["accept", "decline", "cancel"].includes(action)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  if (userRes.rows[0].role !== "model") {
    return NextResponse.json({ error: "model_only" }, { status: 403 });
  }
  const userId = userRes.rows[0].id;

  const sessionRes = await query(
    `SELECT id, client_id, model_id, status, duration_minutes, session_ref, session_type, started_at
     FROM sessions
     WHERE id = $1`,
    [sessionId]
  );
  if (!sessionRes.rowCount) {
    return NextResponse.json({ error: "session_missing" }, { status: 404 });
  }
  const session = sessionRes.rows[0];
  if (session.model_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (action === "accept") {
    if (session.status !== "pending") {
      return NextResponse.json({ error: "invalid_status" }, { status: 409 });
    }
    await query(
      `UPDATE sessions
       SET status = 'accepted'
       WHERE id = $1`,
      [sessionId]
    );
    const inviteLink = await createSessionInviteLink(session.session_ref);
    const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      session.client_id,
    ]);
    const typeLabel = session.session_type || "session";
    const clientMsg =
      `Your ${typeLabel} booking was accepted ✅ ` +
      (inviteLink
        ? `Join the session here: ${inviteLink}`
        : "Open the session group to begin.");
    const modelMsg =
      `You accepted a ${typeLabel} booking ✅ ` +
      (inviteLink
        ? `Join the session here: ${inviteLink}`
        : "Open the session group to begin.");
    if (clientRes.rowCount) {
      await sendMessage(clientRes.rows[0].telegram_id, clientMsg);
    }
    await sendMessage(tgUser.id, modelMsg);
    return NextResponse.json({ ok: true, status: "accepted", invite_link: inviteLink });
  }

  if (action === "decline") {
    if (session.status !== "pending") {
      return NextResponse.json({ error: "invalid_status" }, { status: 409 });
    }
    await query(
      `UPDATE sessions
       SET status = 'cancelled_by_model', completed_at = NOW()
       WHERE id = $1`,
      [sessionId]
    );
    const escrowRes = await query(
      `SELECT id, amount, payer_id
       FROM escrow_accounts
       WHERE escrow_type IN ('session','extension') AND related_id = $1 AND status = 'held'`,
      [sessionId]
    );
    if (escrowRes.rowCount) {
      const escrow = escrowRes.rows[0];
      await query(
        `UPDATE escrow_accounts
         SET status = 'refunded', released_at = NOW(), release_condition_met = TRUE,
             dispute_reason = 'model_cancelled'
         WHERE id = $1`,
        [escrow.id]
      );
      await query(
        `UPDATE users
         SET wallet_balance = COALESCE(wallet_balance, 0) + $1
         WHERE id = $2`,
        [escrow.amount, escrow.payer_id]
      );
    }
    const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      session.client_id,
    ]);
    if (clientRes.rowCount) {
      await sendMessage(
        clientRes.rows[0].telegram_id,
        "Your model declined the booking. Payment has been refunded."
      );
    }
    return NextResponse.json({ ok: true, status: "declined" });
  }

  if (!["accepted", "active"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }
  await query(
    `UPDATE sessions
     SET status = 'cancelled_by_model', completed_at = NOW(), ended_at = NOW()
     WHERE id = $1`,
    [sessionId]
  );
  const escrowRes = await query(
    `SELECT id, amount, payer_id
     FROM escrow_accounts
     WHERE escrow_type IN ('session','extension') AND related_id = $1 AND status = 'held'`,
    [sessionId]
  );
  if (escrowRes.rowCount) {
    const escrow = escrowRes.rows[0];
    await query(
      `UPDATE escrow_accounts
       SET status = 'refunded', released_at = NOW(), release_condition_met = TRUE,
           dispute_reason = 'model_cancelled'
       WHERE id = $1`,
      [escrow.id]
    );
    await query(
      `UPDATE users
       SET wallet_balance = COALESCE(wallet_balance, 0) + $1
       WHERE id = $2`,
      [escrow.amount, escrow.payer_id]
    );
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
      "Session cancelled by the model. Your payment has been refunded."
    );
    await removeFromSessionGroup(clientRes.rows[0].telegram_id);
  }
  if (modelRes.rowCount) {
    await sendMessage(
      modelRes.rows[0].telegram_id,
      "You cancelled the session. The client has been refunded."
    );
    await removeFromSessionGroup(modelRes.rows[0].telegram_id);
  }
  return NextResponse.json({ ok: true, status: "cancelled" });
}
