import { NextResponse } from "next/server";
import { query, withTransaction } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { createNotification, createAdminNotifications } from "../../_lib/notifications";
import {
  ensureIdempotencyTable,
  readIdempotencyRecord,
  writeIdempotencyRecord,
} from "../../_lib/idempotency";
import { checkRateLimit } from "../../_lib/rate_limit";

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
  const allowed = await checkRateLimit({
    key: `session_cancel:${tgUser.id}`,
    limit: 6,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const idempotencyKey = (body?.idempotency_key || "").toString().trim();
  if (idempotencyKey) {
    await ensureIdempotencyTable();
    const cached = await withTransaction(async (client) =>
      readIdempotencyRecord(client, idempotencyKey)
    );
    if (cached) {
      return NextResponse.json({ ...cached, cached: true });
    }
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
  if (!["pending_payment", "pending", "accepted", "active", "awaiting_confirmation"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  const nextStatus = "disputed";
  await query(
    `UPDATE sessions
     SET status = $2,
         completed_at = NOW(),
         ended_at = NOW(),
         end_reason = 'client_cancelled',
         end_actor = 'client',
         end_outcome = 'dispute'
     WHERE id = $1`,
    [sessionId, nextStatus]
  );

  const escrowRes = await query(
    `SELECT id
     FROM escrow_accounts
     WHERE escrow_type IN ('session','extension') AND related_id = $1 AND status = 'held'`,
    [sessionId]
  );
  if (escrowRes.rowCount) {
    const escrow = escrowRes.rows[0];
    await query(
      `UPDATE escrow_accounts
       SET status = 'disputed',
           dispute_reason = 'client_cancelled'
       WHERE id = $1`,
      [escrow.id]
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
      "Session cancelled. Payment is under dispute review."
    );
  }
  if (modelRes.rowCount) {
    await sendMessage(
      modelRes.rows[0].telegram_id,
      "Client cancelled the session. Payment is under dispute review."
    );
  }
  const clientLabelRes = await query(
    `SELECT COALESCE(cp.display_name, u.public_id) AS display_name
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     WHERE u.id = $1`,
    [session.client_id]
  );
  const clientLabel = clientLabelRes.rows[0]?.display_name || "A client";
  await createNotification({
    recipientId: session.model_id,
    recipientRole: null,
    title: "Session cancelled",
    body: `${clientLabel} cancelled a session. Marked disputed.`,
    type: "session_cancelled",
    metadata: { session_id: sessionId },
  });
  await createAdminNotifications({
    title: "Session dispute",
    body: `Client cancelled session ${sessionId}. Marked disputed.`,
    type: "session_dispute",
    metadata: { session_id: sessionId },
  });

  const response = { ok: true, status: nextStatus };
  if (idempotencyKey) {
    await withTransaction(async (client) =>
      writeIdempotencyRecord(client, {
        key: idempotencyKey,
        userId,
        scope: "session_cancel",
        response,
      })
    );
  }

  return NextResponse.json(response);
}
