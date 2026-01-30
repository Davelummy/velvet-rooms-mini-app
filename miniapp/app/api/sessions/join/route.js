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
    `SELECT id, client_id, model_id, status, session_ref
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
  if (!["active", "awaiting_confirmation"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  const inviteLink = await createSessionInviteLink(session.session_ref);
  if (!inviteLink) {
    return NextResponse.json({ error: "invite_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, invite_link: inviteLink });
}
