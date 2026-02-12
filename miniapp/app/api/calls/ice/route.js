import { NextResponse } from "next/server";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { createRequestContext, logError, withRequestId } from "../../_lib/observability";
import { checkRateLimit } from "../../_lib/rate_limit";
import { logAppEvent } from "../../_lib/metrics";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";

export async function POST(request) {
  const ctx = createRequestContext(request, "calls/ice");
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json(withRequestId({ error: "unauthorized" }, ctx.requestId), {
      status: 401,
    });
  }
  const tgUser = extractUser(initData);
  if (tgUser?.id) {
    const allowed = await checkRateLimit({
      key: `turn_token:${tgUser.id}`,
      limit: 10,
      windowSeconds: 60,
    });
    if (!allowed) {
      return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
        status: 429,
      });
    }
  }
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return NextResponse.json(withRequestId({ error: "turn_not_configured" }, ctx.requestId), {
      status: 500,
    });
  }

  try {
    const token = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString(
      "base64"
    );
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Tokens.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    const data = await res.json();
    if (!res.ok) {
      await logAppEvent({
        eventType: "turn_token_error",
        userId: null,
        payload: { status: res.status, detail: data?.message || "Unable to fetch TURN" },
      });
      return NextResponse.json(
        withRequestId(
          { error: "turn_token_failed", detail: data?.message || "Unable to fetch TURN" },
          ctx.requestId
        ),
        { status: 502 }
      );
    }
    return NextResponse.json(
      withRequestId({ ok: true, iceServers: data?.ice_servers || [] }, ctx.requestId)
    );
  } catch (error) {
    await logAppEvent({
      eventType: "turn_token_error",
      userId: null,
      payload: { detail: error?.message || "Unable to fetch TURN" },
    });
    logError(ctx, "turn_token_failed", { error: error?.message });
    return NextResponse.json(
      withRequestId(
        { error: "turn_token_failed", detail: error?.message || "Unable to fetch TURN" },
        ctx.requestId
      ),
      { status: 502 }
    );
  }
}
