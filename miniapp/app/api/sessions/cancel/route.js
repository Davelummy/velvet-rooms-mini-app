import { NextResponse } from "next/server";
import { query, withTransaction } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { createNotification, createAdminNotifications } from "../../_lib/notifications";
import { openEscrowDispute } from "../../_lib/disputes";
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
  const preAcceptance = ["pending_payment", "pending"].includes(session.status);
  const postAcceptance = ["accepted", "active", "awaiting_confirmation"].includes(
    session.status
  );
  if (!preAcceptance && !postAcceptance) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  const nextStatus = preAcceptance ? "cancelled_by_client" : "disputed";
  await query(
    `UPDATE sessions
     SET status = $2,
         completed_at = NOW(),
         ended_at = NOW(),
         end_reason = 'client_cancelled',
         end_actor = 'client',
         end_outcome = $3
     WHERE id = $1`,
    [sessionId, nextStatus, preAcceptance ? "cancelled" : "dispute"]
  );

  const escrowRes = await query(
    `SELECT id, amount, payer_id
     FROM escrow_accounts
     WHERE escrow_type IN ('session','extension') AND related_id = $1 AND status = 'held'`,
    [sessionId]
  );
  if (escrowRes.rowCount && preAcceptance) {
    for (const escrow of escrowRes.rows) {
      await query(
        `UPDATE escrow_accounts
         SET status = 'refunded',
             released_at = NOW(),
             release_condition_met = TRUE,
             dispute_reason = 'client_cancelled_before_acceptance'
         WHERE id = $1`,
        [escrow.id]
      );
      if (escrow.payer_id && escrow.amount) {
        await query(
          `UPDATE users
           SET wallet_balance = COALESCE(wallet_balance, 0) + $1
           WHERE id = $2`,
          [escrow.amount, escrow.payer_id]
        );
      }
    }
  } else if (escrowRes.rowCount) {
    for (const escrow of escrowRes.rows) {
      await openEscrowDispute({
        escrowId: escrow.id,
        sessionId,
        openedByUserId: userId,
        reason: "client_cancelled",
        note: "client_cancel_confirmed",
      });
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
      preAcceptance
        ? "Session cancelled before acceptance. Any held funds were refunded to your wallet."
        : "Session cancelled. Payment is under dispute review."
    );
  }
  if (modelRes.rowCount) {
    await sendMessage(
      modelRes.rows[0].telegram_id,
      preAcceptance
        ? "Client cancelled the booking before acceptance."
        : "Client cancelled the session. Payment is under dispute review."
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
    body: preAcceptance
      ? `${clientLabel} cancelled the booking before acceptance.`
      : `${clientLabel} cancelled a session. Marked disputed.`,
    type: "session_cancelled",
    metadata: { session_id: sessionId },
  });
  await createAdminNotifications({
    title: preAcceptance ? "Session cancelled" : "Session dispute",
    body: preAcceptance
      ? `Client cancelled session ${sessionId} before model acceptance.`
      : `Client cancelled session ${sessionId}. Marked disputed.`,
    type: preAcceptance ? "session_cancelled" : "session_dispute",
    metadata: { session_id: sessionId, outcome: nextStatus },
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
