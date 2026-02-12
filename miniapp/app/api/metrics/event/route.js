import { NextResponse } from "next/server";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { logAppEvent } from "../../_lib/metrics";
import { createRequestContext, withRequestId } from "../../_lib/observability";
import { checkRateLimit } from "../../_lib/rate_limit";
import { query } from "../../_lib/db";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(request) {
  const ctx = createRequestContext(request, "metrics/event");
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
    key: `metrics:${tgUser.id}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
      status: 429,
    });
  }

  const eventType = (body?.event_type || "").toString().trim();
  if (!eventType) {
    return NextResponse.json(withRequestId({ error: "missing_event_type" }, ctx.requestId), {
      status: 400,
    });
  }
  const sessionId = Number(body?.session_id || 0) || null;
  const payload = body?.payload || null;

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
  const userId = userRes.rowCount ? userRes.rows[0].id : null;

  await logAppEvent({
    eventType,
    userId,
    sessionId,
    payload,
  });

  return NextResponse.json(withRequestId({ ok: true }, ctx.requestId));
}
