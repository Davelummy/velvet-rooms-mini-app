import { NextResponse } from "next/server";
import { query, withTransaction } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureSessionColumns } from "../../_lib/sessions";
import { createRequestContext, logError, withRequestId } from "../../_lib/observability";
import { checkRateLimit } from "../../_lib/rate_limit";
import { logAppEvent } from "../../_lib/metrics";
import { createNotification, createAdminNotifications } from "../../_lib/notifications";
import {
  ensureIdempotencyTable,
  readIdempotencyRecord,
  writeIdempotencyRecord,
} from "../../_lib/idempotency";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const DISPUTE_REASONS = new Set([
  "safety_concern",
  "connection_issue",
  "screen_recording_detected",
  "other",
]);

export async function POST(request) {
  const ctx = createRequestContext(request, "sessions/end");
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
  const rateAllowed = await checkRateLimit({
    key: `session_end:${tgUser.id}`,
    limit: 6,
    windowSeconds: 60,
  });
  if (!rateAllowed) {
    return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
      status: 429,
    });
  }

  const sessionId = Number(body?.session_id || 0);
  const reason = (body?.reason || "").toString().trim();
  const note = (body?.note || "").toString().trim();
  const idempotencyKey = (body?.idempotency_key || "").toString().trim();
  if (!sessionId || !reason) {
    return NextResponse.json(withRequestId({ error: "invalid_request" }, ctx.requestId), {
      status: 400,
    });
  }
  if (idempotencyKey) {
    await ensureIdempotencyTable();
    const cached = await withTransaction(async (client) =>
      readIdempotencyRecord(client, idempotencyKey)
    );
    if (cached) {
      return NextResponse.json(withRequestId({ ...cached, cached: true }, ctx.requestId));
    }
  }

  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json(withRequestId({ error: "user_missing" }, ctx.requestId), {
      status: 400,
    });
  }
  const userId = userRes.rows[0].id;
  const userRole = userRes.rows[0].role || "user";

  await ensureSessionColumns();

  const sessionRes = await query(
    `SELECT id, client_id, model_id, status, scheduled_end
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
  if (["completed", "cancelled_by_client", "cancelled_by_model", "rejected"].includes(session.status)) {
    return NextResponse.json(withRequestId({ error: "already_ended" }, ctx.requestId), {
      status: 409,
    });
  }

  const endActor = userId === session.client_id ? "client" : "model";
  let outcome = "release";
  if (reason === "model_no_show") {
    outcome = endActor === "client" ? "refund" : "dispute";
  } else if (reason === "client_no_show") {
    outcome = endActor === "model" ? "release" : "dispute";
  } else if (DISPUTE_REASONS.has(reason)) {
    outcome = "dispute";
  } else if (reason === "completed_early") {
    outcome = "release";
  }
  const scheduledEndMs = session.scheduled_end ? new Date(session.scheduled_end).getTime() : null;
  const isEarlyEnd =
    scheduledEndMs && reason !== "time_elapsed" && Date.now() < scheduledEndMs - 30000;
  if (isEarlyEnd) {
    outcome = "dispute";
  }
  const shouldDispute = outcome === "dispute";
  const nextStatus = shouldDispute ? "disputed" : "completed";

  await query(
    `UPDATE sessions
     SET status = $2,
         ended_at = NOW(),
         end_reason = $3,
         end_actor = $4,
         end_note = $5,
         end_outcome = $6,
         completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
     WHERE id = $1`,
    [sessionId, nextStatus, reason, endActor, note || null, outcome]
  );

  try {
    if (shouldDispute) {
      await query(
        `UPDATE escrow_accounts
         SET status = 'disputed',
             dispute_reason = $2
         WHERE escrow_type IN ('session','extension')
           AND related_id = $1
           AND status = 'held'`,
        [sessionId, reason]
      );
    } else if (outcome === "refund") {
      await query(
        `UPDATE escrow_accounts
         SET status = 'refunded',
             released_at = NOW(),
             release_condition_met = TRUE
         WHERE escrow_type IN ('session','extension')
           AND related_id = $1
           AND status = 'held'`,
        [sessionId]
      );
    } else {
      await query(
        `UPDATE escrow_accounts
         SET status = 'released',
             released_at = NOW(),
             release_condition_met = TRUE
         WHERE escrow_type IN ('session','extension')
           AND related_id = $1
           AND status = 'held'`,
        [sessionId]
      );
    }
  } catch (err) {
    logError(ctx, "escrow_update_failed", { sessionId, error: err?.message });
  }

  await logAppEvent({
    eventType: "session_end",
    userId,
    sessionId,
    payload: { reason, outcome, actor: endActor },
  });

  const actorRes = await query(
    `SELECT COALESCE(cp.display_name, mp.display_name, u.public_id) AS display_name
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  const actorLabel = actorRes.rows[0]?.display_name || "Your partner";
  const recipientId = endActor === "client" ? session.model_id : session.client_id;
  if (recipientId) {
    await createNotification({
      recipientId,
      recipientRole: null,
      title: "Session ended",
      body: `${actorLabel} ended the session. Outcome: ${outcome}.`,
      type: "session_end",
      metadata: { session_id: sessionId, outcome, reason },
    });
  }
  if (shouldDispute) {
    await createAdminNotifications({
      title: "Session dispute",
      body: `Session ${sessionId} was marked disputed (${reason}).`,
      type: "session_dispute",
      metadata: { session_id: sessionId, reason },
    });
  }

  const response = { ok: true, status: nextStatus, end_actor: endActor, role: userRole, outcome };
  if (idempotencyKey) {
    await withTransaction(async (client) =>
      writeIdempotencyRecord(client, {
        key: idempotencyKey,
        userId,
        scope: "session_end",
        response,
      })
    );
  }

  return NextResponse.json(withRequestId(response, ctx.requestId));
}
