import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureUser } from "../../_lib/users";
import { ensureSessionColumns } from "../../_lib/sessions";

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
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const displayName = (body?.display_name || "").toString().trim();
  const email = (body?.email || "").toString().trim();
  const birthMonth = (body?.birth_month || "").toString().trim();
  const birthYear = (body?.birth_year || "").toString().trim();
  const videoPath = (body?.video_path || "").toString().trim();
  const tags = (body?.tags || "").toString().trim();
  const availability = (body?.availability || "").toString().trim();
  const bio = (body?.bio || "").toString().trim();
  const disclaimerAccepted = Boolean(body?.disclaimer_accepted);
  const disclaimerVersion = (body?.disclaimer_version || "").toString().trim();

  if (!displayName || !email || !videoPath) {
    return NextResponse.json(
      { error: "missing_fields", detail: "display_name, email, and video are required" },
      { status: 400 }
    );
  }
  const ageCheck = isAdult(birthYear, birthMonth);
  if (!ageCheck.ok) {
    return NextResponse.json({ error: "age_restricted", detail: "18+ only" }, { status: 400 });
  }
  if (!disclaimerAccepted || !disclaimerVersion) {
    return NextResponse.json({ error: "disclaimer_required" }, { status: 400 });
  }

  const existingUser = await query("SELECT role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (existingUser.rowCount) {
    const role = existingUser.rows[0].role;
    if (role === "client") {
      return NextResponse.json({ error: "role_locked" }, { status: 403 });
    }
  }

  const now = new Date();
  await ensureSessionColumns();
  const userId = await ensureUser({
    telegramId: tgUser.id,
    username: tgUser.username || null,
    firstName: tgUser.first_name || null,
    lastName: tgUser.last_name || null,
    role: "model",
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
           verification_video_path = $5,
           tags = COALESCE(NULLIF($6,''), tags),
           availability = COALESCE(NULLIF($7,''), availability),
           bio = COALESCE(NULLIF($8,''), bio)
       WHERE user_id = $9`,
      [displayName, "submitted", now, null, videoPath, tags, availability, bio, userId]
    );
  } else {
    await query(
      `INSERT INTO model_profiles (user_id, display_name, verification_status, verification_submitted_at, verification_video_url, verification_video_path, tags, availability, bio, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [userId, displayName, "submitted", now, null, videoPath, tags, availability, bio, now]
    );
  }

  const idRes = await query("SELECT public_id FROM users WHERE id = $1", [userId]);
  const publicId = idRes.rows[0]?.public_id || "N/A";
  await sendAdminNotification(
    `New model verification submitted: ${displayName} (ID ${publicId}). Review in admin console.`,
    null
  );
  await query(
    "UPDATE users SET disclaimer_accepted_at = NOW(), disclaimer_version = $2 WHERE id = $1",
    [userId, disclaimerVersion]
  );

  return NextResponse.json({ ok: true });
}
