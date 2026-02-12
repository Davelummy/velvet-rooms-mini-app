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
  const range = (url.searchParams.get("range") || "all").toLowerCase();
  const statusList =
    status === "released"
      ? ["released", "refunded"]
      : status === "disputed"
      ? ["disputed"]
      : ["held"];
  let rangeClause = "";
  if (range === "today") {
    rangeClause = "AND COALESCE(e.released_at, e.held_at) >= CURRENT_DATE";
  } else if (range === "7d") {
    rangeClause = "AND COALESCE(e.released_at, e.held_at) >= NOW() - INTERVAL '7 days'";
  }

  const res = await query(
    `SELECT e.escrow_ref, e.escrow_type, e.amount, e.status,
            u.public_id AS payer_public_id,
            u.username AS payer_username,
            COALESCE(cp.display_name, mp.display_name, u.username, u.public_id) AS payer_display_name,
            r.public_id AS receiver_public_id,
            r.username AS receiver_username,
            COALESCE(cp2.display_name, mp2.display_name, r.username, r.public_id) AS receiver_display_name
     FROM escrow_accounts e
     LEFT JOIN users u ON u.id = e.payer_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     LEFT JOIN users r ON r.id = e.receiver_id
     LEFT JOIN client_profiles cp2 ON cp2.user_id = r.id
     LEFT JOIN model_profiles mp2 ON mp2.user_id = r.id
     WHERE e.status = ANY($1)
       ${rangeClause}
     ORDER BY e.held_at DESC`,
    [statusList]
  );

  return NextResponse.json({ items: res.rows });
}
