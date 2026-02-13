import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureEngagementTables } from "../../_lib/engagement";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
const ADMIN_BOT_TOKEN = process.env.ADMIN_BOT_TOKEN || "";

async function notifyModelLike({ modelTelegramId, teaserTitle, likerName }) {
  if (!BOT_TOKEN || !modelTelegramId) {
    return;
  }
  const actorLabel = likerName || "Someone";
  const title = teaserTitle ? `“${teaserTitle}”` : "your teaser";
  const text = `${actorLabel} liked ${title}.`;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: modelTelegramId,
        text,
      }),
    });
  } catch {
    // ignore notify failures
  }
}

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
  const contentId = Number(body?.content_id || 0);
  if (!contentId) {
    return NextResponse.json({ error: "missing_content_id" }, { status: 400 });
  }

  await ensureEngagementTables();

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const userId = userRes.rows[0].id;

  const teaserRes = await query(
    "SELECT id, model_id, title FROM digital_content WHERE id = $1 AND is_active = TRUE",
    [contentId]
  );
  if (!teaserRes.rowCount) {
    return NextResponse.json({ error: "content_missing" }, { status: 404 });
  }
  const modelId = teaserRes.rows[0].model_id;
  const teaserTitle = teaserRes.rows[0].title || "";

  const exists = await query(
    "SELECT 1 FROM content_likes WHERE content_id = $1 AND user_id = $2",
    [contentId, userId]
  );

  let liked = false;
  if (exists.rowCount) {
    await query("DELETE FROM content_likes WHERE content_id = $1 AND user_id = $2", [
      contentId,
      userId,
    ]);
    liked = false;
  } else {
    await query("INSERT INTO content_likes (content_id, user_id) VALUES ($1, $2)", [
      contentId,
      userId,
    ]);
    liked = true;

    // Notify model (only on like, not on unlike).
    const modelTelegramRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      modelId,
    ]);
    const modelTelegramId = modelTelegramRes.rows[0]?.telegram_id || null;
    const likerRes = await query(
      `SELECT u.public_id,
              COALESCE(cp.display_name, mp.display_name, u.public_id) AS display_name
       FROM users u
       LEFT JOIN client_profiles cp ON cp.user_id = u.id
       LEFT JOIN model_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [userId]
    );
    const likerName =
      likerRes.rows[0]?.display_name || `User ${likerRes.rows[0]?.public_id || userId}`;
    await notifyModelLike({
      modelTelegramId,
      teaserTitle,
      likerName,
    });
  }

  const counts = await query(
    `SELECT
        (SELECT COUNT(*)::int FROM content_likes WHERE content_id = $1) AS likes,
        (SELECT COUNT(*)::int FROM content_views WHERE content_id = $1) AS views`,
    [contentId]
  );

  return NextResponse.json({
    ok: true,
    liked,
    likes_count: counts.rows[0]?.likes ?? 0,
    views_count: counts.rows[0]?.views ?? 0,
  });
}
