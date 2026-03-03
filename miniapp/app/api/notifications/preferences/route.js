import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { createRequestContext } from "../../_lib/observability";
const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

async function ensurePreferencesTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS notification_preferences (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
       sound_enabled BOOLEAN DEFAULT TRUE,
       bookings BOOLEAN DEFAULT TRUE,
       payments BOOLEAN DEFAULT TRUE,
       activity BOOLEAN DEFAULT TRUE,
       stories BOOLEAN DEFAULT TRUE,
       live BOOLEAN DEFAULT TRUE,
       updated_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
}

export async function GET(req) {
  const ctx = createRequestContext(req, "GET /api/notifications/preferences");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await ensurePreferencesTable();

    const res = await query(
      "SELECT sound_enabled, bookings, payments, activity, stories, live FROM notification_preferences WHERE user_id = $1",
      [userRes.rows[0].id]
    );

    if (!res.rowCount) {
      return NextResponse.json({ sound_enabled: true, bookings: true, payments: true, activity: true, stories: true, live: true });
    }

    return NextResponse.json(res.rows[0]);
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req) {
  const ctx = createRequestContext(req, "POST /api/notifications/preferences");
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const userId = userRes.rows[0].id;

    await ensurePreferencesTable();

    const { sound_enabled, bookings, payments, activity, stories, live } = await req.json();

    await query(
      `INSERT INTO notification_preferences (user_id, sound_enabled, bookings, payments, activity, stories, live, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
         sound_enabled = COALESCE($2, notification_preferences.sound_enabled),
         bookings = COALESCE($3, notification_preferences.bookings),
         payments = COALESCE($4, notification_preferences.payments),
         activity = COALESCE($5, notification_preferences.activity),
         stories = COALESCE($6, notification_preferences.stories),
         live = COALESCE($7, notification_preferences.live),
         updated_at = NOW()`,
      [userId, sound_enabled, bookings, payments, activity, stories, live]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
