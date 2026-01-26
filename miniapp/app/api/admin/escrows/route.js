import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "held").toLowerCase();
  const statusList =
    status === "released"
      ? ["released", "refunded"]
      : status === "disputed"
      ? ["disputed"]
      : ["held"];

  const res = await query(
    `SELECT e.escrow_ref, e.escrow_type, e.amount, e.status,
            u.public_id AS payer_public_id,
            r.public_id AS receiver_public_id
     FROM escrow_accounts e
     LEFT JOIN users u ON u.id = e.payer_id
     LEFT JOIN users r ON r.id = e.receiver_id
     WHERE e.status = ANY($1)
     ORDER BY e.held_at DESC`,
    [statusList]
  );

  return NextResponse.json({ items: res.rows });
}
