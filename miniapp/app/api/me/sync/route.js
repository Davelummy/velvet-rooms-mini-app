import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { extractUser, verifyInitData } from "../../_lib/telegram";
import { ensureUserColumns } from "../../_lib/users";
import { ensureClientProfileColumns } from "../../_lib/clients";
import { checkRateLimit } from "../../_lib/rate_limit";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const initData = body?.initData || request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser?.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  const allowed = await checkRateLimit({
    key: `me_sync:${tgUser.id}`,
    limit: 15,
    windowSeconds: 60,
  });
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  await ensureUserColumns();
  await ensureClientProfileColumns();

  const userRes = await query(
    `SELECT id, role, status, username
     FROM users
     WHERE telegram_id = $1`,
    [tgUser.id]
  );
  if (!userRes.rowCount) {
    return NextResponse.json({ ok: true });
  }
  const user = userRes.rows[0];

  const modelRes = await query(
    `SELECT verification_status
     FROM model_profiles
     WHERE user_id = $1`,
    [user.id]
  );
  const model = modelRes.rowCount ? modelRes.rows[0] : null;

  const clientRes = await query(
    `SELECT access_fee_paid, access_granted_at, access_fee_escrow_id, display_name
     FROM client_profiles
     WHERE user_id = $1`,
    [user.id]
  );
  const client = clientRes.rowCount ? clientRes.rows[0] : null;

  const accessEscrowRes = await query(
    `SELECT id, status
     FROM escrow_accounts
     WHERE payer_id = $1
       AND escrow_type IN ('access_fee', 'access')
     ORDER BY released_at DESC NULLS LAST, held_at DESC NULLS LAST
     LIMIT 1`,
    [user.id]
  );
  const accessEscrow = accessEscrowRes.rowCount ? accessEscrowRes.rows[0] : null;
  const accessTxRes = await query(
    `SELECT id, status
     FROM transactions
     WHERE user_id = $1
       AND status IN ('pending','submitted','completed')
       AND metadata_json->>'escrow_type' IN ('access_fee','access')
     ORDER BY (status = 'completed') DESC,
              completed_at DESC NULLS LAST,
              created_at DESC
     LIMIT 1`,
    [user.id]
  );
  const accessTx = accessTxRes.rowCount ? accessTxRes.rows[0] : null;
  const shouldGrantAccess =
    accessTx?.status === "completed" || accessEscrow?.status === "released";

  if (!client && (accessTx || accessEscrow)) {
    if (shouldGrantAccess) {
      await query(
        `INSERT INTO client_profiles (user_id, access_fee_paid, access_granted_at, access_fee_escrow_id)
         SELECT $1, TRUE, NOW(), $2
         WHERE NOT EXISTS (
           SELECT 1 FROM client_profiles WHERE user_id = $1
         )`,
        [user.id, accessEscrow?.id || null]
      );
      await query(
        `UPDATE client_profiles
         SET access_fee_paid = TRUE,
             access_granted_at = COALESCE(access_granted_at, NOW()),
             access_fee_escrow_id = COALESCE(access_fee_escrow_id, $1)
         WHERE user_id = $2`,
        [accessEscrow?.id || null, user.id]
      );
    } else {
      await query(
        `INSERT INTO client_profiles (user_id, access_fee_paid, access_fee_escrow_id)
         SELECT $1, FALSE, $2
         WHERE NOT EXISTS (
           SELECT 1 FROM client_profiles WHERE user_id = $1
         )`,
        [user.id, accessEscrow?.id || null]
      );
      await query(
        `UPDATE client_profiles
         SET access_fee_escrow_id = COALESCE(access_fee_escrow_id, $1)
         WHERE user_id = $2`,
        [accessEscrow?.id || null, user.id]
      );
    }
  } else if (client && !client.access_fee_paid && shouldGrantAccess) {
    await query(
      `UPDATE client_profiles
       SET access_fee_paid = TRUE,
           access_granted_at = COALESCE(access_granted_at, NOW()),
           access_fee_escrow_id = COALESCE(access_fee_escrow_id, $1)
       WHERE user_id = $2`,
      [accessEscrow?.id || null, user.id]
    );
  }

  if (user.username && (!client?.display_name || !client.display_name.trim())) {
    await query(
      `UPDATE client_profiles
       SET display_name = $1
       WHERE user_id = $2`,
      [user.username, user.id]
    );
  }

  if (model?.verification_status === "approved" && user.role !== "model") {
    await query(
      `UPDATE users
       SET role = 'model', status = 'active'
       WHERE id = $1`,
      [user.id]
    );
  } else if (!model && user.role === "model") {
    await query(
      `UPDATE users
       SET role = 'client', status = 'active'
       WHERE id = $1`,
      [user.id]
    );
  } else if (!["model", "admin", "client"].includes(user.role || "") && (client || accessTx || accessEscrow)) {
    await query(
      `UPDATE users
       SET role = 'client', status = 'active'
       WHERE id = $1`,
      [user.id]
    );
  }

  return NextResponse.json({ ok: true });
}
