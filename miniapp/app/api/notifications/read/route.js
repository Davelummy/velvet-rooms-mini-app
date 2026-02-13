import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { markNotificationsRead } from "../../_lib/notifications";

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
  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const user = userRes.rows[0];
  const ids = Array.isArray(body?.ids) ? body.ids.map((val) => Number(val)).filter(Boolean) : [];
  await markNotificationsRead({
    recipientId: user.id,
    ids,
  });
  return NextResponse.json({ ok: true });
}
