import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { getSupabase } from "../_lib/supabase";
import { ensureFollowTable } from "../_lib/follows";
import { ensureBlockTable } from "../_lib/blocks";
import { ensureSessionColumns } from "../_lib/sessions";
import { ensureEngagementTables } from "../_lib/engagement";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

function getTeaserBucket() {
  return (
    process.env.SUPABASE_TEASER_BUCKET ||
    process.env.SUPABASE_CONTENT_BUCKET ||
    process.env.SUPABASE_BUCKET ||
    "teaser content bucket"
  );
}

function getAvatarBucket() {
  return process.env.SUPABASE_AVATAR_BUCKET || "velvetrooms-avatars";
}

export async function POST(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "direct_upload_disabled", detail: "Use signed upload URLs for teasers." },
      { status: 413 }
    );
  }
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const title = (body?.title || "").toString().trim();
  const description = (body?.description || "").toString().trim();
  const contentTypeRaw = (body?.content_type || "").toString().trim();
  const previewPath = (body?.preview_path || "").toString().trim();
  const fullPath = (body?.full_path || "").toString().trim();
  const priceRaw = body?.price;
  const priceValue = priceRaw === null || priceRaw === "" ? null : Number(priceRaw);

  if (!title || !contentTypeRaw || !previewPath) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  if (userRes.rows[0].role !== "model") {
    return NextResponse.json({ error: "model_only" }, { status: 403 });
  }
  const userId = userRes.rows[0].id;
  if (!previewPath.startsWith(`teasers/${userId}/`)) {
    return NextResponse.json({ error: "invalid_preview_path" }, { status: 400 });
  }

  const modelRes = await query(
    "SELECT verification_status FROM model_profiles WHERE user_id = $1",
    [userId]
  );
  if (!modelRes.rowCount || modelRes.rows[0].verification_status !== "approved") {
    return NextResponse.json({ error: "model_not_approved" }, { status: 403 });
  }

  if (!["video", "image"].includes(contentTypeRaw)) {
    return NextResponse.json({ error: "invalid_content_type" }, { status: 400 });
  }
  const safeType = contentTypeRaw;
  const sanitizedPrice = priceValue && priceValue > 0 ? priceValue : null;
  if (sanitizedPrice && !fullPath) {
    return NextResponse.json({ error: "full_content_required" }, { status: 400 });
  }
  if (fullPath && !fullPath.startsWith(`content/${userId}/`)) {
    return NextResponse.json({ error: "invalid_full_path" }, { status: 400 });
  }

  const now = new Date();
  const deliveryPath = fullPath || previewPath;
  const insertRes = await query(
    `INSERT INTO digital_content
     (model_id, content_type, title, description, price, telegram_file_id, preview_file_id, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, FALSE, $8)
     RETURNING id`,
    [
      userId,
      safeType,
      title,
      description,
      sanitizedPrice,
      deliveryPath,
      previewPath,
      now,
    ]
  );

  const adminToken = process.env.ADMIN_BOT_TOKEN || "";
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean);
  if (adminToken && adminIds.length > 0) {
    const keyboard = {
      inline_keyboard: [
        [{ text: "Open Admin Console", web_app: { url: `${process.env.WEBAPP_URL || ""}/admin` } }],
      ],
    };
    try {
      for (const adminId of adminIds) {
        await fetch(`https://api.telegram.org/bot${adminToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: adminId,
            text: `New teaser submitted: ${title}. Review in admin console.`,
            reply_markup: keyboard,
          }),
        });
      }
    } catch {
      // avoid failing the submission if Telegram is unreachable
    }
  }

  return NextResponse.json({ ok: true, id: insertRes.rows[0]?.id });
}

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  await ensureFollowTable();
  await ensureBlockTable();
  await ensureSessionColumns();
  await ensureEngagementTables();

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope");
  let res;
  if (scope === "mine") {
    const tgUser = extractUser(initData);
    if (!tgUser || !tgUser.id) {
      return NextResponse.json({ error: "user_missing" }, { status: 400 });
    }
    const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
      tgUser.id,
    ]);
    if (!userRes.rowCount) {
      return NextResponse.json({ items: [] });
    }
    if (userRes.rows[0].role !== "model") {
      return NextResponse.json({ error: "model_only" }, { status: 403 });
    }
    const userId = userRes.rows[0].id;
    res = await query(
      `SELECT dc.id, dc.title, dc.description, dc.price, dc.content_type,
              dc.preview_file_id, dc.is_active, dc.created_at,
              (SELECT COUNT(*)::int FROM content_likes cl WHERE cl.content_id = dc.id) AS likes_count,
              (SELECT COUNT(*)::int FROM content_views cv WHERE cv.content_id = dc.id) AS views_count
       FROM digital_content dc
       WHERE dc.model_id = $1
       ORDER BY dc.created_at DESC`,
      [userId]
    );
  } else {
    const tgUser = extractUser(initData);
    if (!tgUser || !tgUser.id) {
      return NextResponse.json({ error: "user_missing" }, { status: 400 });
    }
    const userRes = await query(
      "SELECT id, role FROM users WHERE telegram_id = $1",
      [tgUser.id]
    );
    if (!userRes.rowCount) {
      return NextResponse.json({ error: "user_missing" }, { status: 400 });
    }
    let role = userRes.rows[0].role;
    if (role !== "client") {
      const modelRes = await query(
        "SELECT id FROM model_profiles WHERE user_id = $1",
        [userRes.rows[0].id]
      );
      if (!modelRes.rowCount) {
        await query("UPDATE users SET role = 'client', status = 'active' WHERE id = $1", [
          userRes.rows[0].id,
        ]);
        role = "client";
      }
    }
    if (role !== "client") {
      return NextResponse.json({ error: "client_only" }, { status: 403 });
    }
    const profileRes = await query(
      "SELECT access_fee_paid FROM client_profiles WHERE user_id = $1",
      [userRes.rows[0].id]
    );
    if (!profileRes.rowCount || !profileRes.rows[0].access_fee_paid) {
      const accessEscrowRes = await query(
        `SELECT id FROM escrow_accounts
         WHERE payer_id = $1
           AND status = 'released'
           AND escrow_type IN ('access_fee','access')
         ORDER BY released_at DESC NULLS LAST
         LIMIT 1`,
        [userRes.rows[0].id]
      );
      if (!accessEscrowRes.rowCount) {
        return NextResponse.json({ error: "access_fee_required" }, { status: 403 });
      }
      const escrowId = accessEscrowRes.rows[0].id;
      if (!profileRes.rowCount) {
        await query(
          `INSERT INTO client_profiles (user_id, access_fee_paid, access_granted_at, access_fee_escrow_id)
           VALUES ($1, TRUE, NOW(), $2)`,
          [userRes.rows[0].id, escrowId]
        );
      } else {
        await query(
          `UPDATE client_profiles
           SET access_fee_paid = TRUE,
               access_granted_at = COALESCE(access_granted_at, NOW()),
               access_fee_escrow_id = COALESCE(access_fee_escrow_id, $1)
           WHERE user_id = $2`,
          [escrowId, userRes.rows[0].id]
        );
      }
    }
    res = await query(
      `SELECT dc.id, dc.title, dc.description, dc.price, dc.content_type,
              dc.preview_file_id, dc.model_id, dc.created_at,
              u.public_id, u.username, u.avatar_path,
              mp.display_name, mp.verification_status, mp.approved_at,
              mp.tags, mp.availability, mp.bio,
              (SELECT COUNT(*)::int FROM content_likes cl WHERE cl.content_id = dc.id) AS likes_count,
              (SELECT COUNT(*)::int FROM content_views cv WHERE cv.content_id = dc.id) AS views_count,
              EXISTS (
                SELECT 1 FROM content_likes cl
                WHERE cl.content_id = dc.id AND cl.user_id = $1
              ) AS has_liked,
              EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $1 AND f.followee_id = dc.model_id
              ) AS is_following,
              CASE
                WHEN mp.approved_at IS NOT NULL
                  AND mp.approved_at >= NOW() - INTERVAL '7 days'
                THEN TRUE
                ELSE FALSE
              END AS is_spotlight,
              CASE
                WHEN EXISTS (
                  SELECT 1 FROM follows f
                  WHERE f.follower_id = $1 AND f.followee_id = dc.model_id
                )
                AND dc.created_at >= NOW() - INTERVAL '7 days'
                THEN TRUE
                ELSE FALSE
              END AS is_new_from_followed
      FROM digital_content dc
       JOIN users u ON u.id = dc.model_id
       LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
       WHERE dc.is_active = TRUE
         AND NOT EXISTS (
           SELECT 1 FROM blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = dc.model_id)
              OR (b.blocker_id = dc.model_id AND b.blocked_id = $1)
         )
       ORDER BY is_following DESC, is_spotlight DESC, dc.created_at DESC`,
      [userRes.rows[0].id]
    );
  }

  const bucket = getTeaserBucket();
  const avatarBucket = getAvatarBucket();
  const supabase = getSupabase();
  const ttlSeconds = Number(process.env.TEASER_PREVIEW_TTL_SECONDS || 60);
  const items = [];
  for (const row of res.rows) {
    let previewUrl = null;
    let avatarUrl = null;
    if (row.preview_file_id) {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.preview_file_id, ttlSeconds);
      previewUrl = data?.signedUrl || null;
    }
    if (row.avatar_path) {
      const { data } = await supabase.storage
        .from(avatarBucket)
        .createSignedUrl(row.avatar_path, ttlSeconds);
      avatarUrl = data?.signedUrl || null;
    }
    items.push({
      ...row,
      likes_count: row.likes_count ?? 0,
      views_count: row.views_count ?? 0,
      has_liked: Boolean(row.has_liked),
      preview_url: previewUrl,
      avatar_url: avatarUrl,
    });
  }

  return NextResponse.json({ items });
}
