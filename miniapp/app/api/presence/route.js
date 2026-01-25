import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(request) {
  try {
    const body = await request.json();
    const initData = body?.initData || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser || !tgUser.id) {
      return NextResponse.json({ error: "user_missing" }, { status: 400 });
    }

    const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
      tgUser.id,
    ]);
    if (!userRes.rowCount) {
      return NextResponse.json({ ok: true });
    }
    const userId = userRes.rows[0].id;
    const role = userRes.rows[0].role;
    if (role !== "model") {
      return NextResponse.json({ ok: true });
    }

    await query(
      `UPDATE model_profiles
       SET is_online = TRUE, last_seen_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Presence update failed:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
