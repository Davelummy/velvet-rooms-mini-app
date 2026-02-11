import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureFollowTable } from "../_lib/follows";
import { ensureUserColumns } from "../_lib/users";
import { ensureBlockTable } from "../_lib/blocks";
import { getSupabase } from "../_lib/supabase";
import { ensureClientProfileColumns } from "../_lib/clients";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureUserColumns();
  await ensureFollowTable();
  await ensureBlockTable();
  await ensureClientProfileColumns();
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const userRes = await query(
    `SELECT id, telegram_id, public_id, username, role, status, email, created_at, wallet_balance, first_name, last_name, avatar_path, privacy_hide_email, privacy_hide_location
     FROM users WHERE telegram_id = $1`,
    [tgUser.id]
  );
  if (!userRes.rowCount) {
    return NextResponse.json({ ok: true, user: null });
  }
  const user = userRes.rows[0];

  const modelRes = await query(
    `SELECT display_name, verification_status, is_online, last_seen_at, tags, availability, bio, location
     FROM model_profiles WHERE user_id = $1`,
    [user.id]
  );
  const model = modelRes.rowCount ? modelRes.rows[0] : null;
  const clientRes = await query(
    `SELECT access_fee_paid, access_granted_at, display_name, location, birth_month, birth_year
     FROM client_profiles WHERE user_id = $1`,
    [user.id]
  );
  let client = clientRes.rowCount ? clientRes.rows[0] : null;
  if (client && !client.access_fee_paid) {
    const accessEscrowRes = await query(
      `SELECT id FROM escrow_accounts
       WHERE payer_id = $1
         AND status = 'released'
         AND escrow_type IN ('access_fee', 'access')
       ORDER BY released_at DESC NULLS LAST
       LIMIT 1`,
      [user.id]
    );
    if (accessEscrowRes.rowCount) {
      const escrowId = accessEscrowRes.rows[0].id;
      await query(
        `UPDATE client_profiles
         SET access_fee_paid = TRUE,
             access_granted_at = COALESCE(access_granted_at, NOW()),
             access_fee_escrow_id = COALESCE(access_fee_escrow_id, $1)
         WHERE user_id = $2`,
        [escrowId, user.id]
      );
      client = {
        ...client,
        access_fee_paid: true,
        access_granted_at: client.access_granted_at || new Date().toISOString(),
      };
    }
  }
  const followCountsRes = await query(
    `SELECT
        (SELECT COUNT(*) FROM follows WHERE followee_id = $1) AS followers,
        (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS following`,
    [user.id]
  );
  const blockedRes = await query(
    "SELECT blocked_id FROM blocks WHERE blocker_id = $1",
    [user.id]
  );
  const blockedIds = blockedRes.rows.map((row) => row.blocked_id);
  const followersCount = Number(followCountsRes.rows[0]?.followers || 0);
  const followingCount = Number(followCountsRes.rows[0]?.following || 0);
  let avatarUrl = null;
  if (user.avatar_path) {
    try {
      const bucket =
        process.env.SUPABASE_AVATAR_BUCKET || "velvetrooms-avatars";
      const supabase = getSupabase();
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(user.avatar_path, 60 * 60);
      avatarUrl = data?.signedUrl || null;
    } catch {
      avatarUrl = null;
    }
  }
  if (model?.verification_status === "approved" && user.role !== "model") {
    await query("UPDATE users SET role = 'model', status = 'active' WHERE id = $1", [
      user.id,
    ]);
    user.role = "model";
    user.status = "active";
  } else if (!model && user.role === "model") {
    await query("UPDATE users SET role = 'client', status = 'active' WHERE id = $1", [
      user.id,
    ]);
    user.role = "client";
    user.status = "active";
  }

  const clientProfile = client
    ? {
        ...client,
        location: user.privacy_hide_location ? null : client.location,
      }
    : null;

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      telegram_id: user.telegram_id,
      public_id: user.public_id,
      username: user.username,
      email: user.privacy_hide_email ? null : user.email,
      created_at: user.created_at,
      wallet_balance: user.wallet_balance,
      first_name: user.first_name,
      last_name: user.last_name,
      avatar_path: user.avatar_path || null,
      avatar_url: avatarUrl,
      followers_count: followersCount,
      following_count: followingCount,
      privacy_hide_email: Boolean(user.privacy_hide_email),
      privacy_hide_location: Boolean(user.privacy_hide_location),
      role: user.role,
      status: user.status,
    },
    model,
    client: clientProfile,
    blocked_ids: blockedIds,
  });
}
