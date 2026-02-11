import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { ensureClientProfileColumns } from "../../_lib/clients";
import { ensureUserColumns } from "../../_lib/users";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await ensureClientProfileColumns();
  await ensureUserColumns();

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "").toLowerCase();
  const params = [];
  let where = "";
  if (status === "approved") {
    where = "WHERE COALESCE(cp.access_fee_paid, FALSE) = TRUE";
  } else if (status === "pending") {
    where = "WHERE COALESCE(cp.access_fee_paid, FALSE) = FALSE";
  }

  const res = await query(
    `SELECT cp.user_id, cp.display_name, cp.location, cp.birth_month, cp.birth_year,
            cp.access_fee_paid, cp.access_granted_at,
            u.public_id, u.username, u.email, u.created_at, u.status
     FROM client_profiles cp
     JOIN users u ON u.id = cp.user_id
     ${where}
     ORDER BY cp.access_fee_paid DESC, u.created_at DESC
     LIMIT 250`,
    params
  );

  return NextResponse.json({ items: res.rows || [] });
}
