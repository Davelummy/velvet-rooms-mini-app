import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { logUserAction } from "../_lib/user_actions";
import { ensureContentReportsTable } from "../_lib/moderation";
import { createRequestContext, withRequestId } from "../_lib/observability";
import { checkRateLimit } from "../_lib/rate_limit";
import { createAdminNotifications } from "../_lib/notifications";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(request) {
  const ctx = createRequestContext(request, "report");
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json(withRequestId({ error: "unauthorized" }, ctx.requestId), {
      status: 401,
    });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json(withRequestId({ error: "user_missing" }, ctx.requestId), {
      status: 400,
    });
  }
  const allowed = await checkRateLimit({
    key: `report:${tgUser.id}`,
    limit: 5,
    windowSeconds: 600,
  });
  if (!allowed) {
    return NextResponse.json(withRequestId({ error: "rate_limited" }, ctx.requestId), {
      status: 429,
    });
  }
  const targetType = (body?.target_type || "user").toString().trim();
  const targetId = Number(body?.target_id || 0);
  const contentId = Number(body?.content_id || 0);
  if (targetType === "content" && !contentId) {
    return NextResponse.json(withRequestId({ error: "missing_content" }, ctx.requestId), {
      status: 400,
    });
  }
  if (targetType !== "content" && !targetId) {
    return NextResponse.json(withRequestId({ error: "missing_target" }, ctx.requestId), {
      status: 400,
    });
  }

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json(withRequestId({ error: "user_missing" }, ctx.requestId), {
      status: 400,
    });
  }
  const actorId = userRes.rows[0].id;
  const reason = (body?.reason || "").toString().trim().slice(0, 500);

  if (targetType === "content") {
    await ensureContentReportsTable();
    const contentRes = await query(
      "SELECT id, model_id FROM digital_content WHERE id = $1",
      [contentId]
    );
    if (!contentRes.rowCount) {
      return NextResponse.json(withRequestId({ error: "content_missing" }, ctx.requestId), {
        status: 404,
      });
    }
    const content = contentRes.rows[0];
    await query(
      `INSERT INTO content_reports (content_id, reporter_id, reason, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [contentId, actorId, reason || null]
    );
    await logUserAction({
      actorId,
      actionType: "report_content",
      targetId: content.model_id,
      details: { content_id: contentId, reason: reason || null },
    });
  } else {
    if (actorId === targetId) {
      return NextResponse.json(withRequestId({ error: "self_report" }, ctx.requestId), {
        status: 400,
      });
    }
    await logUserAction({
      actorId,
      actionType: "report_user",
      targetId,
      details: reason ? { reason } : null,
    });
  }

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
            text:
              targetType === "content"
                ? `Content report submitted by ${reporterLabel}. Content ID: ${contentId}. ${
                    reason ? `Reason: ${reason}` : ""
                  }`
                : `Profile report submitted by ${reporterLabel}. ${reason ? `Reason: ${reason}` : ""}`,
            reply_markup: keyboard,
          }),
        });
      }
    } catch {
      // ignore notify failures
    }
  }

  await createAdminNotifications({
    title: targetType === "content" ? "Content report" : "Profile report",
    body:
      targetType === "content"
        ? `Content ${contentId} was reported. ${reason ? `Reason: ${reason}` : ""}`
        : `User ${targetId} was reported. ${reason ? `Reason: ${reason}` : ""}`,
    type: "report",
    metadata: { target_type: targetType, target_id: targetType === "content" ? contentId : targetId },
  });

  return NextResponse.json(withRequestId({ ok: true }, ctx.requestId));
}
