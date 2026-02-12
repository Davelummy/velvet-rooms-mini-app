import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { createRequestContext, withRequestId } from "../../_lib/observability";
import { checkRateLimit } from "../../_lib/rate_limit";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

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


export async function POST(request) {
  const ctx = createRequestContext(request, "sessions/confirm");
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json(withRequestId({ error: "unauthorized" }, ctx.requestId), {
      status: 401,
    });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json(withRequestId({ error: "user_missing" }, ctx.requestId), {
      status: 400,
    });
  }
  const allowed = await checkRateLimit({
    key: `session_confirm:${tgUser.id}`,
    limit: 8,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
      status: 429,
    });
  }

  const sessionId = Number(body?.session_id || 0);
  if (!sessionId) {
    return NextResponse.json(withRequestId({ error: "invalid_request" }, ctx.requestId), {
      status: 400,
    });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json(withRequestId({ error: "user_missing" }, ctx.requestId), {
      status: 400,
    });
  }
  const userId = userRes.rows[0].id;

  const sessionRes = await query(
    `SELECT id, client_id, model_id, status, client_confirmed, model_confirmed
     FROM sessions WHERE id = $1`,
    [sessionId]
  );
  if (!sessionRes.rowCount) {
    return NextResponse.json(withRequestId({ error: "session_missing" }, ctx.requestId), {
      status: 404,
    });
  }
  const session = sessionRes.rows[0];
  if (![session.client_id, session.model_id].includes(userId)) {
    return NextResponse.json(withRequestId({ error: "forbidden" }, ctx.requestId), {
      status: 403,
    });
  }

  const isClient = session.client_id === userId;
  const isModel = session.model_id === userId;

  if (!["active", "awaiting_confirmation"].includes(session.status)) {
    return NextResponse.json(withRequestId({ error: "invalid_status" }, ctx.requestId), {
      status: 409,
    });
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
    }
    if (modelRes.rowCount) {
      await sendMessage(
        modelRes.rows[0].telegram_id,
        "Session completed ✅ Thanks for confirming."
      );
    }
  }

  return NextResponse.json(
    withRequestId({ ok: true, completed: bothConfirmed }, ctx.requestId)
  );
}
