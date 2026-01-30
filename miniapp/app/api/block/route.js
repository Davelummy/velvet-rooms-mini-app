import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureBlockTable } from "../_lib/blocks";
import { ensureFollowTable } from "../_lib/follows";
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
  const targetId = Number(body?.target_id);
  if (!targetId) {
    return NextResponse.json({ error: "missing_target" }, { status: 400 });
  }

  await ensureBlockTable();
  await ensureFollowTable();
  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const blockerId = userRes.rows[0].id;
  if (blockerId === targetId) {
    return NextResponse.json({ error: "self_block" }, { status: 400 });
  }

  const exists = await query(
    "SELECT 1 FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
    [blockerId, targetId]
  );
  let blocked = false;
  if (exists.rowCount) {
    await query(
      "DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2",
      [blockerId, targetId]
    );
    blocked = false;
    await logUserAction({
      actorId: blockerId,
      actionType: "unblock_user",
      targetId,
    });
  } else {
    await query(
      "INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)",
      [blockerId, targetId]
    );
    blocked = true;
    await query(
      "DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [blockerId, targetId]
    );
    await query(
      "DELETE FROM follows WHERE follower_id = $1 AND followee_id = $2",
      [targetId, blockerId]
    );
    await logUserAction({
      actorId: blockerId,
      actionType: "block_user",
      targetId,
    });
  }

  return NextResponse.json({ ok: true, blocked });
}
