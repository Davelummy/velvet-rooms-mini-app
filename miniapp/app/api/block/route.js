import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureBlockTable } from "../_lib/blocks";
import { ensureFollowTable } from "../_lib/follows";
import { logUserAction } from "../_lib/user_actions";
import { getSupabase } from "../_lib/supabase";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

async function getSignedAvatarUrl(supabase, path) {
  if (!path) {
    return null;
  }
  try {
    const bucket = process.env.SUPABASE_AVATAR_BUCKET || "velvetrooms-avatars";
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    return data?.signedUrl || null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  await ensureBlockTable();

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const blockerId = userRes.rows[0].id;

  const res = await query(
    `SELECT
        u.id,
        u.public_id,
        u.username,
        u.first_name,
        u.last_name,
        u.role,
        u.status,
        u.avatar_path,
        mp.display_name AS model_display_name,
        mp.verification_status,
        mp.is_online,
        mp.last_seen_at
     FROM blocks b
     JOIN users u ON u.id = b.blocked_id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE b.blocker_id = $1
     ORDER BY u.id DESC`,
    [blockerId]
  );

  const supabase = getSupabase();
  const blocked = [];
  for (const row of res.rows) {
    blocked.push({
      id: row.id,
      public_id: row.public_id,
      username: row.username,
      first_name: row.first_name,
      last_name: row.last_name,
      role: row.role,
      status: row.status,
      avatar_url: await getSignedAvatarUrl(supabase, row.avatar_path),
      model_display_name: row.model_display_name,
      verification_status: row.verification_status,
      is_online: row.is_online,
      last_seen_at: row.last_seen_at,
    });
  }

  return NextResponse.json({ ok: true, blocked });
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
