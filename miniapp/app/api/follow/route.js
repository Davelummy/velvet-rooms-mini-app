import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureFollowTable } from "../_lib/follows";
import { ensureBlockTable } from "../_lib/blocks";
import { logUserAction } from "../_lib/user_actions";
import { createNotification } from "../_lib/notifications";
import { checkRateLimit } from "../_lib/rate_limit";

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
  const allowed = await checkRateLimit({
    key: `follow_toggle:${tgUser.id}`,
    limit: 20,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const targetId = Number(body?.target_id);
  if (!targetId) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }

  await ensureFollowTable();
  await ensureBlockTable();
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
  const blockRes = await query(
    "SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)",
    [followerId, targetId]
  );
  if (blockRes.rowCount) {
    return NextResponse.json({ error: "blocked" }, { status: 403 });
  }

  const exists = await query(
    "SELECT 1 FROM follows WHERE follower_id = $1 AND followee_id = $2",
    [followerId, targetId]
  );
  let following = false;
  let shouldNotify = false;
  if (exists.rowCount) {
    await query(
      "DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [followerId, targetId]
    );
    following = false;
    await logUserAction({
      actorId: followerId,
      actionType: "unfollow_user",
      targetId,
    });
  } else {
    await query(
      "INSERT INTO follows (follower_id, followee_id) VALUES ($1, $2)",
      [followerId, targetId]
    );
    following = true;
    shouldNotify = true;
    await logUserAction({
      actorId: followerId,
      actionType: "follow_user",
      targetId,
    });
  }

  const counts = await query(
    `SELECT
        (SELECT COUNT(*) FROM follows WHERE followee_id = $1) AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS following`,
    [targetId]
  );

  if (shouldNotify) {
    const userRes = await query(
      `SELECT u.telegram_id, u.public_id,
              COALESCE(cp.display_name, mp.display_name, u.public_id) AS display_name
       FROM users u
       LEFT JOIN client_profiles cp ON cp.user_id = u.id
       LEFT JOIN model_profiles mp ON mp.user_id = u.id
       WHERE u.id = $1`,
      [followerId]
    );
    const targetRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      targetId,
    ]);
    const follower = userRes.rows[0];
    const target = targetRes.rows[0];
    const token = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
    if (token && target?.telegram_id && follower) {
      const handle = follower.display_name || `User ${follower.public_id || followerId}`;
      const webapp = (process.env.WEBAPP_URL || "").replace(/\/$/, "");
      const keyboard =
        webapp
          ? {
              inline_keyboard: [
                [{ text: "Open Velvet Rooms", web_app: { url: webapp } }],
              ],
            }
          : undefined;
      try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: target.telegram_id,
            text: `New follower: ${handle}`,
            reply_markup: keyboard,
          }),
        });
      } catch {
        // ignore notification failures
      }
    }
    if (follower) {
      const handle = follower.display_name || `User ${follower.public_id || followerId}`;
      await createNotification({
        recipientId: targetId,
        recipientRole: null,
        title: "New follower",
        body: `${handle} followed you.`,
        type: "follow",
        metadata: { follower_id: followerId },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    following,
    followers: Number(counts.rows[0]?.followers || 0),
    following_count: Number(counts.rows[0]?.following || 0),
  });
}
