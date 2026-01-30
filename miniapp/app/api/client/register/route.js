import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureUser } from "../../_lib/users";
import { ensureClientProfileColumns } from "../../_lib/clients";

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

  if (!displayName) {
    return NextResponse.json({ error: "missing_display_name" }, { status: 400 });
  }
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

  const normalizedUsername = displayName.replace(/^@/, "");
  const usernameCheck = await query(
    "SELECT id FROM users WHERE LOWER(username) = LOWER($1) AND telegram_id <> $2",
    [normalizedUsername, tgUser.id]
  );
  if (usernameCheck.rowCount) {
    return NextResponse.json({ error: "username_taken" }, { status: 409 });
  }

  const userId = await ensureUser({
    telegramId: tgUser.id,
    username: normalizedUsername,
    firstName: tgUser.first_name || displayName || null,
    lastName: tgUser.last_name || null,
    role: "client",
    status: "active",
    email,
  });

  const existing = await query("SELECT id FROM client_profiles WHERE user_id = $1", [
    userId,
  ]);
  await ensureClientProfileColumns();
  if (!existing.rowCount) {
    await query(
      `INSERT INTO client_profiles (user_id, total_spent, access_fee_paid, display_name, location, birth_month, birth_year)
       VALUES ($1, 0, FALSE, $2, $3, $4, $5)`,
      [userId, displayName, location || null, Number(birthMonth) || null, Number(birthYear) || null]
    );
  } else {
    await query(
      `UPDATE client_profiles
       SET display_name = $2,
           location = $3,
           birth_month = $4,
           birth_year = $5
       WHERE user_id = $1`,
      [userId, displayName, location || null, Number(birthMonth) || null, Number(birthYear) || null]
    );
  }
  await query(
    "UPDATE users SET privacy_hide_email = TRUE, privacy_hide_location = TRUE WHERE id = $1",
    [userId]
  );

  await query("UPDATE users SET status = 'active' WHERE id = $1", [userId]);

  return NextResponse.json({ ok: true });
}
