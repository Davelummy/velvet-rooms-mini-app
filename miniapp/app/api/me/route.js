import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const userRes = await query(
    `SELECT id, telegram_id, public_id, username, role, status, email, created_at, wallet_balance, first_name, last_name
     FROM users WHERE telegram_id = $1`,
    [tgUser.id]
  );
  if (!userRes.rowCount) {
    return NextResponse.json({ ok: true, user: null });
  }
  const user = userRes.rows[0];

  const modelRes = await query(
    `SELECT display_name, verification_status, is_online, last_seen_at
     FROM model_profiles WHERE user_id = $1`,
    [user.id]
  );
  const model = modelRes.rowCount ? modelRes.rows[0] : null;
  const clientRes = await query(
    `SELECT access_fee_paid, access_granted_at
     FROM client_profiles WHERE user_id = $1`,
    [user.id]
  );
  const client = clientRes.rowCount ? clientRes.rows[0] : null;
  if (model?.verification_status === "approved" && user.role !== "model") {
    await query("UPDATE users SET role = 'model', status = 'active' WHERE id = $1", [
      user.id,
    ]);
    user.role = "model";
    user.status = "active";
  } else if (!model && user.role === "model") {
    await query("UPDATE users SET role = 'client', status = 'active' WHERE id = $1", [
      user.id,
    ]);
    user.role = "client";
    user.status = "active";
  }

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      telegram_id: user.telegram_id,
      public_id: user.public_id,
      username: user.username,
      email: user.email,
      created_at: user.created_at,
      wallet_balance: user.wallet_balance,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      status: user.status,
    },
    model,
    client,
  });
}
