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

  await ensureUserColumns();
  const hideEmail = Boolean(body?.hide_email);
  const hideLocation = Boolean(body?.hide_location);

  await query(
    "UPDATE users SET privacy_hide_email = $1, privacy_hide_location = $2 WHERE telegram_id = $3",
    [hideEmail, hideLocation, tgUser.id]
  );

  return NextResponse.json({ ok: true, hide_email: hideEmail, hide_location: hideLocation });
}
