import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureFollowTable } from "../_lib/follows";
import { ensureUserColumns } from "../_lib/users";
import { getSupabase } from "../_lib/supabase";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  await ensureFollowTable();
  await ensureUserColumns();

  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ items: [] });
  }
  const userId = userRes.rows[0].id;

  const res = await query(
    `SELECT u.id, u.public_id, u.username, u.role, u.avatar_path,
            mp.display_name, mp.is_online, mp.verification_status, mp.bio, mp.tags, mp.availability
     FROM follows f
     JOIN users u ON u.id = f.followee_id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE f.follower_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );

  const bucket = process.env.SUPABASE_AVATAR_BUCKET || "velvetrooms-avatars";
  const supabase = getSupabase();
  const ttlSeconds = Number(process.env.TEASER_PREVIEW_TTL_SECONDS || 60);
  const items = [];
  for (const row of res.rows) {
    let avatarUrl = null;
    if (row.avatar_path) {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.avatar_path, ttlSeconds);
      avatarUrl = data?.signedUrl || null;
    }
    items.push({
      ...row,
      avatar_url: avatarUrl,
      is_online: Boolean(row.is_online),
      verified: row.verification_status === "approved",
      is_following: true,
    });
  }

  return NextResponse.json({ items });
}
