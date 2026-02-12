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
            mp.is_online, mp.display_name,
            COALESCE(cp.display_name, mp.display_name, u.username, u.public_id) AS display_name
     FROM follows f
     JOIN users u ON u.id = f.follower_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     WHERE f.followee_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );

  const statsRes = await query(
    `SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::int AS last_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '14 days' AND created_at < NOW() - INTERVAL '7 days')::int AS prev_7d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days')::int AS last_30d,
        COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '60 days' AND created_at < NOW() - INTERVAL '30 days')::int AS prev_30d
     FROM follows WHERE followee_id = $1`,
    [userId]
  );
  const roleRes = await query(
    `SELECT u.role, COUNT(*)::int AS count
     FROM follows f
     JOIN users u ON u.id = f.follower_id
     WHERE f.followee_id = $1
     GROUP BY u.role`,
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
    });
  }

  const statsRow = statsRes.rows[0] || {};
  const roleCounts = roleRes.rows.reduce((acc, row) => {
    acc[row.role || "unknown"] = Number(row.count || 0);
    return acc;
  }, {});

  return NextResponse.json({
    items,
    stats: {
      total: Number(statsRow.total || 0),
      last_7d: Number(statsRow.last_7d || 0),
      last_30d: Number(statsRow.last_30d || 0),
      growth_7d: Number(statsRow.last_7d || 0) - Number(statsRow.prev_7d || 0),
      growth_30d: Number(statsRow.last_30d || 0) - Number(statsRow.prev_30d || 0),
      roles: roleCounts,
    },
  });
}
