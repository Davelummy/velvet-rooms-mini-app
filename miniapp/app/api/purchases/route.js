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

  const sessionRes = await query(
    `SELECT s.id, s.status, s.package_price AS price_paid, s.completed_at AS purchased_at,
            s.session_type, s.duration_minutes,
            u.public_id, mp.display_name
     FROM sessions s
     JOIN users u ON u.id = s.model_id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE s.client_id = $1 AND s.status = 'completed' AND s.completed_at IS NOT NULL
     ORDER BY s.completed_at DESC`,
    [userId]
  );

  const contentItems = res.rows.map((row) => ({
    ...row,
    item_type: "content",
  }));
  const sessionItems = sessionRes.rows.map((row) => ({
    ...row,
    item_type: "session",
    title: `${row.session_type || "Session"} · ${row.duration_minutes || "-"} min`,
    content_type: "session",
  }));
  const items = [...contentItems, ...sessionItems].sort((a, b) => {
    const da = a.purchased_at ? new Date(a.purchased_at).getTime() : 0;
    const db = b.purchased_at ? new Date(b.purchased_at).getTime() : 0;
    return db - da;
  });

  return NextResponse.json({ items });
}
