import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { ensureDisputeSchema } from "../../_lib/disputes";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  await ensureDisputeSchema();

  const status = (url.searchParams.get("status") || "held").toLowerCase();
  const range = (url.searchParams.get("range") || "all").toLowerCase();
  const statusList =
    status === "released"
      ? ["released"]
      : status === "refunded"
      ? ["refunded"]
      : status === "resolved"
      ? ["released", "refunded"]
      : status === "disputed"
      ? ["disputed"]
      : ["held"];
  const resolvedClause =
    status === "resolved"
      ? "AND e.dispute_opened_at IS NOT NULL AND e.dispute_resolved_at IS NOT NULL"
      : "";
  let rangeClause = "";
  if (range === "today") {
    rangeClause = "AND COALESCE(e.released_at, e.held_at) >= CURRENT_DATE";
  } else if (range === "7d") {
    rangeClause = "AND COALESCE(e.released_at, e.held_at) >= NOW() - INTERVAL '7 days'";
  }

  const res = await query(
    `SELECT e.escrow_ref, e.escrow_type, e.amount, e.status, e.related_id,
            e.dispute_reason, e.dispute_opened_at, e.dispute_resolved_at, e.dispute_resolution,
            d.opened_reason, d.opened_note, d.opened_at AS dispute_entry_opened_at,
            d.resolved_note, d.resolved_at AS dispute_entry_resolved_at,
            COALESCE(open_cp.display_name, open_mp.display_name, open_u.username, open_u.public_id) AS dispute_opened_by,
            COALESCE(win_cp.display_name, win_mp.display_name, win_u.username, win_u.public_id) AS dispute_winner,
            COALESCE(res_cp.display_name, res_mp.display_name, res_u.username, res_u.public_id) AS dispute_resolved_by,
            u.public_id AS payer_public_id,
            u.username AS payer_username,
            COALESCE(cp.display_name, mp.display_name, u.username, u.public_id) AS payer_display_name,
            r.public_id AS receiver_public_id,
            r.username AS receiver_username,
            COALESCE(cp2.display_name, mp2.display_name, r.username, r.public_id) AS receiver_display_name
     FROM escrow_accounts e
     LEFT JOIN LATERAL (
       SELECT ed.*
       FROM escrow_disputes ed
       WHERE ed.escrow_id = e.id
       ORDER BY ed.opened_at DESC
       LIMIT 1
     ) d ON TRUE
     LEFT JOIN users u ON u.id = e.payer_id
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     LEFT JOIN users r ON r.id = e.receiver_id
     LEFT JOIN client_profiles cp2 ON cp2.user_id = r.id
     LEFT JOIN model_profiles mp2 ON mp2.user_id = r.id
     LEFT JOIN users open_u ON open_u.id = d.opened_by_user_id
     LEFT JOIN client_profiles open_cp ON open_cp.user_id = open_u.id
     LEFT JOIN model_profiles open_mp ON open_mp.user_id = open_u.id
     LEFT JOIN users win_u ON win_u.id = d.winner_user_id
     LEFT JOIN client_profiles win_cp ON win_cp.user_id = win_u.id
     LEFT JOIN model_profiles win_mp ON win_mp.user_id = win_u.id
     LEFT JOIN users res_u ON res_u.id = d.resolved_by_admin_id
     LEFT JOIN client_profiles res_cp ON res_cp.user_id = res_u.id
     LEFT JOIN model_profiles res_mp ON res_mp.user_id = res_u.id
     WHERE e.status = ANY($1)
       ${resolvedClause}
       ${rangeClause}
     ORDER BY e.held_at DESC`,
    [statusList]
  );

  return NextResponse.json({ items: res.rows });
}
