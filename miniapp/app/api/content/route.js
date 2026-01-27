import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { getSupabase } from "../_lib/supabase";

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
  const insertRes = await query(
    `INSERT INTO digital_content
     (model_id, content_type, title, description, price, telegram_file_id, preview_file_id, is_active, created_at)
     VALUES ($1, $2, $3, $4, $5, NULL, $6, FALSE, $7)
     RETURNING id`,
    [userId, safeType, title, description, sanitizedPrice, fullPath || null, previewPath, now]
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
  }

  return NextResponse.json({ ok: true, id: insertRes.rows[0]?.id });
}

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
              dc.preview_file_id, dc.is_active, dc.created_at
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
    if (userRes.rows[0].role !== "client") {
      return NextResponse.json({ error: "client_only" }, { status: 403 });
    }
    const profileRes = await query(
      "SELECT access_fee_paid FROM client_profiles WHERE user_id = $1",
      [userRes.rows[0].id]
    );
    if (!profileRes.rowCount || !profileRes.rows[0].access_fee_paid) {
      return NextResponse.json({ error: "access_fee_required" }, { status: 403 });
    }
    res = await query(
      `SELECT dc.id, dc.title, dc.description, dc.price, dc.content_type,
              dc.preview_file_id, dc.model_id, u.public_id, mp.display_name
       FROM digital_content dc
       JOIN users u ON u.id = dc.model_id
       LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
       WHERE dc.is_active = TRUE
       ORDER BY dc.created_at DESC`
    );
  }

  const bucket = getTeaserBucket();
  const supabase = getSupabase();
  const ttlSeconds = Number(process.env.TEASER_PREVIEW_TTL_SECONDS || 60);
  const items = [];
  for (const row of res.rows) {
    let previewUrl = null;
    if (row.preview_file_id) {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.preview_file_id, ttlSeconds);
      previewUrl = data?.signedUrl || null;
    }
    items.push({
      ...row,
      preview_url: previewUrl,
    });
  }

  return NextResponse.json({ items });
}
