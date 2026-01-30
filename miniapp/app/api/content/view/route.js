import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureEngagementTables } from "../../_lib/engagement";

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
    "SELECT id FROM digital_content WHERE id = $1 AND is_active = TRUE",
    [contentId]
  );
  if (!teaserRes.rowCount) {
    return NextResponse.json({ error: "content_missing" }, { status: 404 });
  }

  // Unique view per user per teaser (prevents spam).
  try {
    await query("INSERT INTO content_views (content_id, user_id) VALUES ($1, $2)", [
      contentId,
      userId,
    ]);
  } catch {
    // ignore unique violation
  }

  const counts = await query(
    `SELECT
        (SELECT COUNT(*)::int FROM content_likes WHERE content_id = $1) AS likes,
        (SELECT COUNT(*)::int FROM content_views WHERE content_id = $1) AS views`,
    [contentId]
  );

  return NextResponse.json({
    ok: true,
    likes_count: counts.rows[0]?.likes ?? 0,
    views_count: counts.rows[0]?.views ?? 0,
  });
}

