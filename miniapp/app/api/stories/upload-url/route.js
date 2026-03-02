import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { getSupabase } from "../../_lib/supabase";
import { createRequestContext } from "../../_lib/observability";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(req) {
  const ctx = createRequestContext("POST /api/stories/upload-url");
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRes = await query(
      "SELECT id FROM users WHERE telegram_id = $1 AND role = 'model'",
      [tgUser.id]
    );
    if (!userRes.rowCount) {
      return NextResponse.json({ error: "Model account required" }, { status: 403 });
    }
    const userId = userRes.rows[0].id;

    const { contentType = "image/jpeg" } = await req.json().catch(() => ({}));
    const isVideo = contentType.startsWith("video/");
    const ext = isVideo
      ? contentType.includes("mp4") ? "mp4" : "mov"
      : contentType.includes("png") ? "png" : "jpg";
    const path = `stories/${userId}/${Date.now()}.${ext}`;

    const supabase = getSupabase();
    const { data, error } = await supabase.storage
      .from("uploads")
      .createSignedUploadUrl(path);

    if (error) {
      ctx.error(error);
      return NextResponse.json({ error: "Could not create upload URL" }, { status: 500 });
    }

    return NextResponse.json({
      uploadUrl: data.signedUrl,
      path,
      mediaType: isVideo ? "video" : "image",
      publicUrl: supabase.storage.from("uploads").getPublicUrl(path).data.publicUrl,
    });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
