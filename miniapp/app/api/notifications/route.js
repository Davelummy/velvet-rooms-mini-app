import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { listNotifications } from "../_lib/notifications";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
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
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 30), 50);
  const data = await listNotifications({
    recipientId: user.id,
    limit,
  });
  return NextResponse.json({
    items: data.items || [],
    unread: data.unreadCount || 0,
  });
}
