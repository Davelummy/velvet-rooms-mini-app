import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { openEscrowDispute } from "../../_lib/disputes";

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
  const reason = (body?.reason || "").toString().trim();
  if (!sessionId || reason.length < 5) {
    return NextResponse.json({ error: "missing_reason" }, { status: 400 });
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

  await query(
    `UPDATE sessions
     SET status = 'disputed'
     WHERE id = $1`,
    [sessionId]
  );
  const escrowRes = await query(
    `SELECT id
     FROM escrow_accounts
     WHERE escrow_type IN ('session','extension')
       AND related_id = $1
       AND status IN ('held', 'disputed')`,
    [sessionId]
  );
  for (const row of escrowRes.rows || []) {
    await openEscrowDispute({
      escrowId: row.id,
      sessionId,
      openedByUserId: userId,
      reason,
      note: "client_reported_dispute",
    });
  }

  const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
    session.model_id,
  ]);
  if (modelRes.rowCount) {
    await sendMessage(
      modelRes.rows[0].telegram_id,
      "A client opened a dispute on this session. Admin will review."
    );
  }
  await sendMessage(tgUser.id, "Dispute submitted. Admin will review.");

  return NextResponse.json({ ok: true });
}
