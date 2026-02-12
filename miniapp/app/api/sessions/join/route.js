import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureSessionColumns } from "../../_lib/sessions";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

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

  await ensureSessionColumns();
  const sessionRes = await query(
    `SELECT id, client_id, model_id, status, session_ref, duration_minutes, scheduled_for,
            client_joined_at, model_joined_at
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
  if (!["accepted", "active", "awaiting_confirmation"].includes(session.status)) {
    return NextResponse.json({ error: "invalid_status" }, { status: 409 });
  }

  // Allow both parties to start early if they are ready, even if a future schedule was set.

  if (session.client_id === userId && !session.client_joined_at) {
    await query(
      "UPDATE sessions SET client_joined_at = NOW() WHERE id = $1",
      [sessionId]
    );
  }
  if (session.model_id === userId && !session.model_joined_at) {
    await query(
      "UPDATE sessions SET model_joined_at = NOW() WHERE id = $1",
      [sessionId]
    );
  }

  const updatedRes = await query(
    "SELECT client_joined_at, model_joined_at, duration_minutes FROM sessions WHERE id = $1",
    [sessionId]
  );
  const updated = updatedRes.rows[0];
  if (updated?.client_joined_at && updated?.model_joined_at) {
    const duration = Number(updated.duration_minutes || 0);
    const scheduledEnd = duration
      ? new Date(Date.now() + duration * 60 * 1000).toISOString()
      : null;
    await query(
      `UPDATE sessions
       SET status = 'active',
           started_at = NOW(),
           actual_start = NOW(),
           scheduled_end = COALESCE($2, scheduled_end)
       WHERE id = $1`,
      [sessionId, scheduledEnd]
    );
  }

  const stateRes = await query(
    `SELECT status, duration_minutes, actual_start, scheduled_end
     FROM sessions WHERE id = $1`,
    [sessionId]
  );
  const sessionState = stateRes.rows[0] || null;

  return NextResponse.json({ ok: true, session: sessionState });
}
