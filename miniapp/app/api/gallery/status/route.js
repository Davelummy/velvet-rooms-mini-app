import { NextResponse } from "next/server";
import { extractUser, verifyInitData } from "../../_lib/telegram";

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
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const channelId = normalizeChannelId(process.env.MAIN_GALLERY_CHANNEL_ID || "");
  if (!BOT_TOKEN || !channelId) {
    return NextResponse.json({ error: "missing_channel" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: channelId, user_id: tgUser.id }),
      }
    );
    const data = await res.json();
    if (!data?.ok) {
      return NextResponse.json({ joined: false, status: "unknown" });
    }
    const status = data?.result?.status || "unknown";
    const joined = !["left", "kicked"].includes(status);
    return NextResponse.json({ joined, status });
  } catch {
    return NextResponse.json({ joined: false, status: "unknown" });
  }
}
