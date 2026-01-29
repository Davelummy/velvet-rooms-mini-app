import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";

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

  const userRes = await query(
    "SELECT id, role FROM users WHERE telegram_id = $1",
    [tgUser.id]
  );
  if (!userRes.rowCount) {
    return NextResponse.json({ ok: true });
  }
  const user = userRes.rows[0];

  if (user.role && user.role !== "client") {
    return NextResponse.json({ error: "client_only" }, { status: 403 });
  }

  const userId = user.id;

  // Clean up client-linked records
  await query("DELETE FROM content_purchases WHERE client_id = $1", [userId]);
  await query("DELETE FROM sessions WHERE client_id = $1", [userId]);
  await query("DELETE FROM escrow_accounts WHERE payer_id = $1", [userId]);
  await query("DELETE FROM transactions WHERE user_id = $1", [userId]);
  await query("DELETE FROM client_profiles WHERE user_id = $1", [userId]);
  await query("DELETE FROM users WHERE id = $1", [userId]);

  return NextResponse.json({ ok: true });
}
