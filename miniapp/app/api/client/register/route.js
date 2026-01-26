import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureUser } from "../../_lib/users";

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

export async function POST(request) {
  const body = await request.json();
  const initData = body?.initData || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const displayName = (body?.display_name || "").toString().trim();
  const email = (body?.email || "").toString().trim();
  const location = (body?.location || "").toString().trim();
  const birthMonth = (body?.birth_month || "").toString().trim();
  const birthYear = (body?.birth_year || "").toString().trim();

  if (!email) {
    return NextResponse.json({ error: "missing_email" }, { status: 400 });
  }
  const ageCheck = isAdult(birthYear, birthMonth);
  if (!ageCheck.ok) {
    return NextResponse.json({ error: "age_restricted" }, { status: 400 });
  }

  const existingUser = await query("SELECT role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (existingUser.rowCount) {
    const role = existingUser.rows[0].role;
    if (role && role !== "client") {
      return NextResponse.json({ error: "role_locked" }, { status: 403 });
    }
  }

  const userId = await ensureUser({
    telegramId: tgUser.id,
    username: tgUser.username || null,
    firstName: tgUser.first_name || displayName || null,
    lastName: tgUser.last_name || null,
    role: "client",
    status: "active",
    email,
  });

  const existing = await query("SELECT id FROM client_profiles WHERE user_id = $1", [
    userId,
  ]);
  if (!existing.rowCount) {
    await query(
      `INSERT INTO client_profiles (user_id, total_spent, access_fee_paid)
       VALUES ($1, 0, FALSE)`,
      [userId]
    );
  }

  await query("UPDATE users SET status = 'active' WHERE id = $1", [userId]);

  return NextResponse.json({ ok: true });
}
