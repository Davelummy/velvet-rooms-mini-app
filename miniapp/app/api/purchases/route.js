import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ items: [] });
  }
  const userId = userRes.rows[0].id;

  const res = await query(
    `SELECT cp.id, cp.status, cp.price_paid, cp.purchased_at,
            dc.id AS content_id, dc.title, dc.content_type, dc.preview_file_id,
            u.public_id, mp.display_name
     FROM content_purchases cp
     JOIN digital_content dc ON dc.id = cp.content_id
     JOIN users u ON u.id = dc.model_id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE cp.client_id = $1
     ORDER BY cp.purchased_at DESC`,
    [userId]
  );

  return NextResponse.json({ items: res.rows });
}
