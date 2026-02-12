import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureSessionColumns } from "../../_lib/sessions";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const DISPUTE_REASONS = new Set([
  "client_no_show",
  "model_no_show",
  "safety_concern",
  "connection_issue",
]);

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
  const note = (body?.note || "").toString().trim();
  if (!sessionId || !reason) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const userId = userRes.rows[0].id;
  const userRole = userRes.rows[0].role || "user";

  await ensureSessionColumns();

  const sessionRes = await query(
    `SELECT id, client_id, model_id, status
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
  if (["completed", "cancelled_by_client", "cancelled_by_model", "rejected"].includes(session.status)) {
    return NextResponse.json({ error: "already_ended" }, { status: 409 });
  }

  const endActor = userId === session.client_id ? "client" : "model";
  const shouldDispute = DISPUTE_REASONS.has(reason);
  const nextStatus = shouldDispute ? "disputed" : "awaiting_confirmation";

  await query(
    `UPDATE sessions
     SET status = $2,
         ended_at = NOW(),
         end_reason = $3,
         end_actor = $4,
         end_note = $5
     WHERE id = $1`,
    [sessionId, nextStatus, reason, endActor, note || null]
  );

  if (shouldDispute) {
    await query(
      `UPDATE escrow_accounts
       SET status = 'disputed',
           dispute_reason = $2
       WHERE escrow_type IN ('session','extension') AND related_id = $1`,
      [sessionId, reason]
    );
  }

  return NextResponse.json({ ok: true, status: nextStatus, end_actor: endActor, role: userRole });
}
