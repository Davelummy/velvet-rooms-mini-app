import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureFollowTable } from "../_lib/follows";
import { ensureUserColumns } from "../_lib/users";
import { ensureBlockTable } from "../_lib/blocks";
import { getSupabase } from "../_lib/supabase";
import { ensureClientProfileColumns } from "../_lib/clients";
import { checkRateLimit } from "../_lib/rate_limit";

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
  const allowed = await checkRateLimit({
    key: `me:${tgUser.id}`,
    limit: 40,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
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
    `SELECT mp.display_name, mp.verification_status,
            CASE
              WHEN u.last_seen_at IS NOT NULL
               AND u.last_seen_at >= NOW() - interval '5 minutes'
              THEN TRUE
              ELSE FALSE
            END AS is_online,
            u.last_seen_at,
            mp.tags, mp.availability, mp.bio, mp.location
     FROM model_profiles mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.user_id = $1`,
    [user.id]
  );
  const model = modelRes.rowCount ? modelRes.rows[0] : null;
  const clientRes = await query(
    `SELECT access_fee_paid, access_granted_at, display_name, location, birth_month, birth_year
     FROM client_profiles WHERE user_id = $1`,
    [user.id]
  );
  let client = clientRes.rowCount ? clientRes.rows[0] : null;
  const accessEscrowRes = await query(
    `SELECT id, status FROM escrow_accounts
     WHERE payer_id = $1
       AND escrow_type IN ('access_fee', 'access')
     ORDER BY released_at DESC NULLS LAST, held_at DESC NULLS LAST
     LIMIT 1`,
    [user.id]
  );
  const accessEscrow = accessEscrowRes.rowCount ? accessEscrowRes.rows[0] : null;
  const accessTxRes = await query(
    `SELECT id, status FROM transactions
     WHERE user_id = $1
       AND status IN ('pending','submitted','completed')
       AND metadata_json->>'escrow_type' IN ('access_fee','access')
     ORDER BY (status = 'completed') DESC,
              completed_at DESC NULLS LAST,
              created_at DESC
     LIMIT 1`,
    [user.id]
  );
  const accessTx = accessTxRes.rowCount ? accessTxRes.rows[0] : null;
  const accessTxCompleted = accessTx?.status === "completed";
  const accessEscrowReleased = accessEscrow?.status === "released";
  const shouldGrantAccess = accessTxCompleted || accessEscrowReleased;

  if (!client && (accessTx || accessEscrow)) {
    if (shouldGrantAccess) {
      await query(
        `INSERT INTO client_profiles (user_id, access_fee_paid, access_granted_at, access_fee_escrow_id)
         VALUES ($1, TRUE, NOW(), $2)`,
        [user.id, accessEscrow?.id || null]
      );
      client = {
        access_fee_paid: true,
        access_granted_at: new Date().toISOString(),
        access_fee_escrow_id: accessEscrow?.id || null,
        display_name: null,
        location: null,
        birth_month: null,
        birth_year: null,
      };
    } else {
      await query(
        `INSERT INTO client_profiles (user_id, access_fee_paid, access_fee_escrow_id)
         VALUES ($1, FALSE, $2)`,
        [user.id, accessEscrow?.id || null]
      );
      client = {
        access_fee_paid: false,
        access_granted_at: null,
        access_fee_escrow_id: accessEscrow?.id || null,
        display_name: null,
        location: null,
        birth_month: null,
        birth_year: null,
      };
    }
  }

  if (client && !client.access_fee_paid && shouldGrantAccess) {
    const escrowId = accessEscrowReleased ? accessEscrow.id : null;
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
      access_fee_escrow_id: client.access_fee_escrow_id || escrowId,
    };
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

  if (client && user.role !== "model" && user.role !== "admin" && user.role !== "client") {
    await query("UPDATE users SET role = 'client', status = 'active' WHERE id = $1", [
      user.id,
    ]);
    user.role = "client";
    user.status = "active";
  }

  const clientProfile = client
    ? {
        ...client,
        location: client.location,
      }
    : null;

  if (clientProfile && !clientProfile.display_name && user.username) {
    await query(
      "UPDATE client_profiles SET display_name = $1 WHERE user_id = $2",
      [user.username, user.id]
    );
    clientProfile.display_name = user.username;
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      telegram_id: user.telegram_id,
      public_id: user.public_id,
      username: user.username,
      email: user.email,
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
