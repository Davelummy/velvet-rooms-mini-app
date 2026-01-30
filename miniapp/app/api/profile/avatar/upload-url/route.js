import { NextResponse } from "next/server";
import { getSupabase } from "../../../_lib/supabase";
import { query } from "../../../_lib/db";
import { extractUser, verifyInitData } from "../../../_lib/telegram";
import { ensureUserColumns } from "../../../_lib/users";

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

  await ensureUserColumns();
  const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const userId = userRes.rows[0].id;

  const filename = (body?.filename || "avatar.jpg").toString();
  const ext = filename.includes(".") ? filename.split(".").pop() : "jpg";
  const bucket = process.env.SUPABASE_AVATAR_BUCKET || "velvetrooms-avatars";
  const filePath = `avatars/${userId}/${Date.now()}.${ext}`;

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
  });
}
