import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";
import { getSupabase } from "../../../_lib/supabase";

export const runtime = "nodejs";

async function sendGalleryPost(content, modelTelegramId) {
  const token = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
  const rawChannelId = process.env.MAIN_GALLERY_CHANNEL_ID || "";
  let channelId = rawChannelId;
  if (channelId && !channelId.startsWith("-")) {
    channelId = channelId.startsWith("100") ? `-${channelId}` : `-100${channelId}`;
  }
  if (!token || !channelId) {
    return { ok: false, error: "missing_bot_or_channel" };
  }
  const webapp = (process.env.WEBAPP_URL || "").replace(/\/$/, "");
  const keyboard = {
    inline_keyboard: [
      [
        { text: "Buy content", url: `${webapp}/?content=${content.id}` },
        { text: "Book session", url: `${webapp}/?model=${modelTelegramId || 0}` },
      ],
    ],
  };
  const caption = `${content.title}\n${content.description || ""}`.trim();
  const payloadBase = {
    chat_id: channelId,
    caption,
    protect_content: true,
    has_spoiler: true,
    reply_markup: keyboard,
  };
  const method = content.content_type === "video" ? "sendVideo" : "sendPhoto";
  let media = content.telegram_file_id;
  if (!media && content.preview_file_id) {
    const bucket =
      process.env.SUPABASE_CONTENT_BUCKET ||
      process.env.SUPABASE_BUCKET ||
      "velvetrooms-content";
    const supabase = getSupabase();
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(content.preview_file_id, 60 * 60);
    media = data?.signedUrl || null;
  }
  if (!media) {
    return { ok: false, error: "missing_media" };
  }
  const payload = {
    ...payloadBase,
    [content.content_type === "video" ? "video" : "photo"]: media,
  };
  const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await resp.text();
  if (!resp.ok) {
    console.error("Gallery post failed:", resp.status, body);
    return { ok: false, error: "telegram_error", detail: body };
  }
  let messageId = null;
  try {
    const payloadJson = JSON.parse(body);
    messageId = payloadJson?.result?.message_id || null;
  } catch {
    messageId = null;
  }
  if (messageId) {
    const ttlSeconds = Number(process.env.GALLERY_TEASER_TTL_SECONDS || 60);
    if (ttlSeconds > 0) {
      setTimeout(async () => {
        try {
          await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: channelId,
              message_id: messageId,
            }),
          });
        } catch (err) {
          console.error("Failed to auto-delete teaser:", err);
        }
      }, ttlSeconds * 1000);
    }
  }
  return { ok: true };
}

export async function POST(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const body = await request.json();
  const contentId = Number(body?.content_id);
  if (!contentId) {
    return NextResponse.json({ error: "missing_content" }, { status: 400 });
  }

  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });

  const contentRes = await query(
    `SELECT dc.id, dc.title, dc.description, dc.price, dc.content_type, dc.telegram_file_id,
            dc.preview_file_id, dc.model_id, mp.verification_status, u.telegram_id
     FROM digital_content dc
     JOIN users u ON u.id = dc.model_id
     LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
     WHERE dc.id = $1`,
    [contentId]
  );
  if (!contentRes.rowCount) {
    return NextResponse.json({ error: "content_missing" }, { status: 404 });
  }
  const content = contentRes.rows[0];
  if (content.verification_status !== "approved") {
    return NextResponse.json({ error: "model_not_approved" }, { status: 400 });
  }

  await query("UPDATE digital_content SET is_active = TRUE WHERE id = $1", [contentId]);
  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'approve_content', 'digital_content', $2, $3, NOW())`,
    [adminUserId, contentId, JSON.stringify({ status: "approved" })]
  );

  const postResult = await sendGalleryPost(content, content.telegram_id);
  if (postResult?.ok === false) {
    return NextResponse.json(
      { error: "gallery_post_failed", detail: postResult.detail || postResult.error },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
