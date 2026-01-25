import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";

export const runtime = "nodejs";

async function notifyModel(telegramId, text) {
  const token = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";
  if (!token) {
    return;
  }
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text }),
  });
}

export async function POST(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const body = await request.json();
  const userId = Number(body?.user_id);
  if (!userId) {
    return NextResponse.json({ error: "missing_user" }, { status: 400 });
  }

  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });

  const profileRes = await query(
    "SELECT id FROM model_profiles WHERE user_id = $1",
    [userId]
  );
  if (!profileRes.rowCount) {
    return NextResponse.json({ error: "profile_missing" }, { status: 404 });
  }
  const profileId = profileRes.rows[0].id;

  await query(
    `UPDATE model_profiles
     SET verification_status = 'approved', approved_at = NOW(), approved_by = $1
     WHERE user_id = $2`,
    [adminUserId, userId]
  );
  await query(
    `UPDATE users SET role = 'model', status = 'active' WHERE id = $1`,
    [userId]
  );
  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_user_id, target_type, target_id, details, created_at)
     VALUES ($1, 'approve_model', $2, 'model_profile', $3, $4, NOW())`,
    [adminUserId, userId, profileId, JSON.stringify({ status: "approved" })]
  );

  const userRes = await query("SELECT telegram_id FROM users WHERE id = $1", [userId]);
  const telegramId = userRes.rows[0]?.telegram_id;
  if (telegramId) {
    await notifyModel(telegramId, "Your model verification has been approved ✅");
  }

  return NextResponse.json({ ok: true });
}
