import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureUserColumns } from "../../_lib/users";

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
  const path = (body?.path || "").toString().trim();
  if (!path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }

  await ensureUserColumns();
  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const userId = userRes.rows[0].id;
  if (!path.startsWith(`avatars/${userId}/`)) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  await query("UPDATE users SET avatar_path = $1 WHERE id = $2", [path, userId]);

  return NextResponse.json({ ok: true });
}
