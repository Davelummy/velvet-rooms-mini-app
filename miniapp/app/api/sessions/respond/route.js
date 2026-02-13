import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { createNotification, createAdminNotifications } from "../../_lib/notifications";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

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
    const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      session.client_id,
    ]);
    const typeLabel = session.session_type || "session";
    const clientMsg =
      `Your ${typeLabel} booking was accepted ✅ ` +
      "Open the mini app to start the session.";
    const modelMsg =
      `You accepted a ${typeLabel} booking ✅ ` +
      "Open the mini app to start the session.";
    if (clientRes.rowCount) {
      await sendMessage(clientRes.rows[0].telegram_id, clientMsg);
    }
    const modelLabelRes = await query(
      `SELECT COALESCE(mp.display_name, u.public_id) AS display_name
       FROM users u
       LEFT JOIN model_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [session.model_id]
    );
    const modelLabel = modelLabelRes.rows[0]?.display_name || "the model";
    await createNotification({
      recipientId: session.client_id,
      recipientRole: null,
      title: "Booking accepted",
      body: `Your ${typeLabel} booking with ${modelLabel} was accepted.`,
      type: "session_accept",
      metadata: { session_id: sessionId },
    });
    await sendMessage(tgUser.id, modelMsg);
    return NextResponse.json({ ok: true, status: "accepted" });
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
    const modelLabelRes = await query(
      `SELECT COALESCE(mp.display_name, u.public_id) AS display_name
       FROM users u
       LEFT JOIN model_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [session.model_id]
    );
    const modelLabel = modelLabelRes.rows[0]?.display_name || "the model";
    await createNotification({
      recipientId: session.client_id,
      recipientRole: null,
      title: "Booking declined",
      body: `Your booking with ${modelLabel} was declined. A refund is being processed.`,
      type: "session_declined",
      metadata: { session_id: sessionId },
    });
    return NextResponse.json({ ok: true, status: "declined" });
  }

  if (!["accepted", "active"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }
  await query(
    `UPDATE sessions
     SET status = 'disputed',
         completed_at = NOW(),
         ended_at = NOW(),
         end_reason = 'model_cancelled',
         end_actor = 'model',
         end_outcome = 'dispute'
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
       SET status = 'disputed',
           dispute_reason = 'model_cancelled'
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
      "Session cancelled by the model. Payment is under dispute review."
    );
  }
  if (modelRes.rowCount) {
    await sendMessage(
      modelRes.rows[0].telegram_id,
      "You cancelled the session. Payment is under dispute review."
    );
  }
  const modelLabelRes = await query(
    `SELECT COALESCE(mp.display_name, u.public_id) AS display_name
     FROM users u
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE u.id = $1`,
    [session.model_id]
  );
  const modelLabel = modelLabelRes.rows[0]?.display_name || "the model";
  await createNotification({
    recipientId: session.client_id,
    recipientRole: null,
    title: "Session cancelled",
    body: `Your session with ${modelLabel} was cancelled.`,
    type: "session_cancelled",
    metadata: { session_id: sessionId },
  });
  await createAdminNotifications({
    title: "Session dispute",
    body: `Model cancelled session ${sessionId}. Marked disputed.`,
    type: "session_dispute",
    metadata: { session_id: sessionId },
  });
  return NextResponse.json({ ok: true, status: "cancelled" });
}
