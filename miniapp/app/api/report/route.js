import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { logUserAction } from "../_lib/user_actions";

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
  const targetId = Number(body?.target_id || 0);
  if (!targetId) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const actorId = userRes.rows[0].id;
  if (actorId === targetId) {
    return NextResponse.json({ error: "self_report" }, { status: 400 });
  }
  const reason = (body?.reason || "").toString().trim().slice(0, 500);

  await logUserAction({
    actorId,
    actionType: "report_user",
    targetId,
    details: reason ? { reason } : null,
  });

  const adminToken = process.env.ADMIN_BOT_TOKEN || "";
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean);
  if (adminToken && adminIds.length) {
    const webapp = (process.env.WEBAPP_URL || "").replace(/\/$/, "");
    const keyboard =
      webapp
        ? {
            inline_keyboard: [
              [{ text: "Open Admin Console", web_app: { url: `${webapp}/admin` } }],
            ],
          }
        : undefined;
    const reporterLabel = tgUser.username ? `@${tgUser.username}` : `User ${actorId}`;
    try {
      for (const adminId of adminIds) {
        await fetch(`https://api.telegram.org/bot${adminToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: adminId,
            text: `Profile report submitted by ${reporterLabel}.`,
            reply_markup: keyboard,
          }),
        });
      }
    } catch {
      // ignore notify failures
    }
  }

  return NextResponse.json({ ok: true });
}
