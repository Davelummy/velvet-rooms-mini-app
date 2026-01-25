import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";

export const runtime = "nodejs";

export async function POST(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const body = await request.json();
  const transactionRef = body?.transaction_ref;
  if (!transactionRef) {
    return NextResponse.json({ error: "missing_transaction" }, { status: 400 });
  }

  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });

  const txRes = await query(
    `SELECT id FROM transactions WHERE transaction_ref = $1`,
    [transactionRef]
  );
  if (!txRes.rowCount) {
    return NextResponse.json({ error: "transaction_missing" }, { status: 404 });
  }

  await query(
    `UPDATE transactions SET status = 'rejected' WHERE transaction_ref = $1`,
    [transactionRef]
  );
  await query(
    `UPDATE content_purchases
     SET status = 'rejected'
     WHERE transaction_id = $1`,
    [txRes.rows[0].id]
  );

  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'reject_crypto', 'transaction', $2, $3, NOW())`,
    [adminUserId, txRes.rows[0].id, JSON.stringify({ transaction_ref: transactionRef })]
  );

  return NextResponse.json({ ok: true });
}
