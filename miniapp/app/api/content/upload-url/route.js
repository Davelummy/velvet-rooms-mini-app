import { NextResponse } from "next/server";
import { getSupabase } from "../../_lib/supabase";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";

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
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
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

  const modelRes = await query(
    "SELECT verification_status FROM model_profiles WHERE user_id = $1",
    [userRes.rows[0].id]
  );
  if (!modelRes.rowCount || modelRes.rows[0].verification_status !== "approved") {
    return NextResponse.json({ error: "model_not_approved" }, { status: 403 });
  }

  const filename = (body?.filename || "teaser.mp4").toString();
  const ext = filename.includes(".") ? filename.split(".").pop() : "mp4";
  const bucket = getTeaserBucket();
  const filePath = `teasers/${userRes.rows[0].id}/${Date.now()}.${ext}`;

  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUploadUrl(filePath);
  if (error) {
    return NextResponse.json(
      { error: "signed_url_failed", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    path: filePath,
    signed_url: data?.signedUrl,
    token: data?.token,
  });
}
