import { NextResponse } from "next/server";
import { getSupabase } from "../_lib/supabase";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";
import { ensureUser } from "../_lib/users";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

function isAdult(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!y || !m || m < 1 || m > 12) {
    return { ok: false, message: "birth_month and birth_year are required" };
  }
  const now = new Date();
  const cutoff = new Date(now.getFullYear() - 18, now.getMonth(), 1);
  const dob = new Date(y, m - 1, 1);
  if (dob > cutoff) {
    return { ok: false, message: "must_be_18_plus" };
  }
  return { ok: true };
}

async function sendAdminNotification(message, videoUrl) {
  const adminToken = process.env.ADMIN_BOT_TOKEN || "";
  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((val) => val.trim())
    .filter(Boolean);
  if (!adminToken || adminIds.length === 0) {
    return;
  }
  const keyboard = {
    inline_keyboard: [
      [
        { text: "Open Admin Console", web_app: { url: `${process.env.WEBAPP_URL || ""}/admin` } },
      ],
    ],
  };
  for (const adminId of adminIds) {
    await fetch(`https://api.telegram.org/bot${adminToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminId,
        text: message + (videoUrl ? `\nVideo: ${videoUrl}` : ""),
        reply_markup: keyboard,
      }),
    });
  }
}

export async function POST(request) {
  const formData = await request.formData();
  const initData = formData.get("initData");
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const displayName = (formData.get("display_name") || "").toString().trim();
  const email = (formData.get("email") || "").toString().trim();
  const birthMonth = (formData.get("birth_month") || "").toString().trim();
  const birthYear = (formData.get("birth_year") || "").toString().trim();
  const file = formData.get("video");
  if (!displayName || !email || !file) {
    return NextResponse.json(
      { error: "missing_fields", detail: "display_name, email, and video are required" },
      { status: 400 }
    );
  }
  const ageCheck = isAdult(birthYear, birthMonth);
  if (!ageCheck.ok) {
    return NextResponse.json(
      { error: "age_restricted", detail: "18+ only" },
      { status: 400 }
    );
  }

  const bucket = process.env.SUPABASE_VERIFICATION_BUCKET || "velvetrooms-verification";
  const ext = (file.name || "video.mp4").split(".").pop();
  const filePath = `verifications/${tgUser.id}/video.${ext}`;
  const supabase = getSupabase();

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const uploadRes = await supabase.storage.from(bucket).upload(filePath, buffer, {
    contentType: file.type || "video/mp4",
    upsert: true,
  });
  if (uploadRes.error) {
    return NextResponse.json(
      { error: "upload_failed", detail: uploadRes.error.message },
      { status: 500 }
    );
  }
  const videoUrl = null;

  const now = new Date();
  const userId = await ensureUser({
    telegramId: tgUser.id,
    username: tgUser.username || null,
    firstName: tgUser.first_name || null,
    lastName: tgUser.last_name || null,
    role: "unassigned",
    status: "inactive",
    email,
  });

  const existingProfile = await query(
    "SELECT id FROM model_profiles WHERE user_id = $1",
    [userId]
  );
  if (existingProfile.rowCount) {
    await query(
      `UPDATE model_profiles
       SET display_name = $1,
           verification_status = $2,
           verification_submitted_at = $3,
           verification_video_url = $4,
           verification_video_path = $5
       WHERE user_id = $6`,
      [displayName, "submitted", now, videoUrl, filePath, userId]
    );
  } else {
    await query(
      `INSERT INTO model_profiles (user_id, display_name, verification_status, verification_submitted_at, verification_video_url, verification_video_path, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, displayName, "submitted", now, videoUrl, filePath, now]
    );
  }

  const idRes = await query("SELECT public_id FROM users WHERE id = $1", [userId]);
  const publicId = idRes.rows[0]?.public_id || "N/A";
  await sendAdminNotification(
    `New model verification submitted: ${displayName} (ID ${publicId}). Review in admin console.`,
    null
  );

  return NextResponse.json({ ok: true });
}
