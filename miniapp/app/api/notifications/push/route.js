import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { createNotification } from "../../_lib/notifications";
import { checkRateLimit } from "../../_lib/rate_limit";

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
  const allowed = await checkRateLimit({
    key: `notifications_push:${tgUser.id}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const user = userRes.rows[0];
  const title = (body?.title || "").toString().trim();
  if (!title) {
    return NextResponse.json({ error: "missing_title" }, { status: 400 });
  }
  const bodyText = (body?.body || "").toString().trim();
  const type = (body?.type || "").toString().trim();
  const metadata = body?.metadata ?? null;
  await createNotification({
    recipientId: user.id,
    recipientRole: user.role,
    title,
    body: bodyText || null,
    type: type || null,
    metadata,
  });
  return NextResponse.json({ ok: true });
}
