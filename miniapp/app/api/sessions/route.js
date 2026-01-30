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
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") || "mine";
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

  if (scope === "mine") {
    const res = await query(
      `SELECT s.id, s.session_type, s.status, s.duration_minutes,
              COALESCE(u.username, u.public_id) AS client_label
       FROM sessions s
       JOIN users u ON u.id = s.client_id
       WHERE s.model_id = $1
         AND s.status != 'rejected'
       ORDER BY s.created_at DESC`,
      [userId]
    );
    return NextResponse.json({ items: res.rows });
  }

  if (scope === "client") {
    const res = await query(
      `SELECT s.id, s.session_type, s.status, s.duration_minutes,
              COALESCE(mp.display_name, u.public_id) AS model_label
       FROM sessions s
       JOIN users u ON u.id = s.model_id
       LEFT JOIN model_profiles mp ON mp.user_id = u.id
       WHERE s.client_id = $1
       ORDER BY s.created_at DESC`,
      [userId]
    );
    return NextResponse.json({ items: res.rows });
  }

  return NextResponse.json({ items: [] });
}
