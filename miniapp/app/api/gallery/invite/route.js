import { NextResponse } from "next/server";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { getOrCreateInviteLink } from "../../_lib/telegram_invites";
import { createRequestContext, withRequestId } from "../../_lib/observability";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

function normalizeChannelId(rawId) {
  if (!rawId) {
    return null;
  }
  const asString = String(rawId);
  if (asString.startsWith("-")) {
    return asString;
  }
  if (asString.startsWith("100")) {
    return `-${asString}`;
  }
  return `-100${asString}`;
}

export async function POST(request) {
  const ctx = createRequestContext(request, "gallery/invite");
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

  const channelId = normalizeChannelId(process.env.MAIN_GALLERY_CHANNEL_ID || "");
  if (!BOT_TOKEN || !channelId) {
    return NextResponse.json(withRequestId({ error: "missing_channel" }, ctx.requestId), {
      status: 400,
    });
  }

  const ttlSeconds = Number(process.env.GALLERY_INVITE_TTL_SECONDS || 3600);
  const result = await getOrCreateInviteLink({
    botToken: BOT_TOKEN,
    chatId: channelId,
    ttlSeconds,
    rateLimitKey: `gallery_invite:${tgUser.id}`,
  });
  if (!result.ok) {
    const status = result.error === "rate_limited" ? 429 : 400;
    return NextResponse.json(
      withRequestId({ error: result.error || "invite_failed" }, ctx.requestId),
      { status }
    );
  }
  return NextResponse.json(
    withRequestId({ invite_link: result.invite_link || null }, ctx.requestId)
  );
}
