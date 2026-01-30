import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureFollowTable } from "../_lib/follows";

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
  const targetId = Number(body?.target_id);
  if (!targetId) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }

  await ensureFollowTable();
  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const followerId = userRes.rows[0].id;
  if (followerId === targetId) {
    return NextResponse.json({ error: "self_follow" }, { status: 400 });
  }

  const exists = await query(
    "SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2",
    [followerId, targetId]
  );
  let following = false;
  if (exists.rowCount) {
    await query(
      "DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [followerId, targetId]
    );
    following = false;
  } else {
    await query(
      "INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)",
      [followerId, targetId]
    );
    following = true;
  }

  const counts = await query(
    `SELECT
        (SELECT COUNT(*) FROM follows WHERE followee_id = $1) AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS following`,
    [targetId]
  );

  return NextResponse.json({
    ok: true,
    following,
    followers: Number(counts.rows[0]?.followers || 0),
    following_count: Number(counts.rows[0]?.following || 0),
  });
}
