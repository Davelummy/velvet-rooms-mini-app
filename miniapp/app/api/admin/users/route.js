import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { ensureFollowTable } from "../../_lib/follows";
import { ensureUserColumns } from "../../_lib/users";
import { ensureSessionColumns } from "../../_lib/sessions";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await ensureFollowTable();
  await ensureUserColumns();
  await ensureSessionColumns();

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const role = (url.searchParams.get("role") || "all").toLowerCase();
  const status = (url.searchParams.get("status") || "all").toLowerCase();

  const where = [];
  const params = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(COALESCE(cp.display_name, mp.display_name, u.username, u.public_id)) LIKE $${params.length}
        OR LOWER(u.public_id) LIKE $${params.length}
        OR LOWER(u.email) LIKE $${params.length})`
    );
  }
  if (role !== "all") {
    params.push(role);
    where.push(`u.role = $${params.length}`);
  }
  if (status !== "all") {
    params.push(status);
    where.push(`u.status = $${params.length}`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const res = await query(
    `SELECT u.id, u.public_id, u.username, u.role, u.status, u.email, u.created_at, u.avatar_path,
            u.last_seen_at,
            CASE
              WHEN u.last_seen_at IS NOT NULL
               AND u.last_seen_at >= NOW() - interval '5 minutes'
              THEN TRUE
              ELSE FALSE
            END AS is_online,
            COALESCE(cp.display_name, mp.display_name, u.username, u.public_id) AS display_name,
            (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
            (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following,
            (SELECT COUNT(*) FROM escrow_accounts e
              WHERE e.payer_id = u.id AND e.status = 'disputed'
                AND e.held_at >= NOW() - INTERVAL '30 days') AS disputes_30d,
            (SELECT COUNT(*) FROM escrow_accounts e
              WHERE e.payer_id = u.id AND e.status = 'refunded'
                AND e.released_at >= NOW() - INTERVAL '30 days') AS refunds_30d,
            (SELECT COUNT(*) FROM sessions s
              WHERE s.ended_at >= NOW() - INTERVAL '30 days'
                AND ((s.end_reason = 'client_no_show' AND s.client_id = u.id)
                  OR (s.end_reason = 'model_no_show' AND s.model_id = u.id))) AS no_shows_30d
     FROM users u
     LEFT JOIN client_profiles cp ON cp.user_id = u.id
     LEFT JOIN model_profiles mp ON mp.user_id = u.id
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );

  const items = (res.rows || []).map((row) => {
    const disputes = Number(row.disputes_30d || 0);
    const refunds = Number(row.refunds_30d || 0);
    const noShows = Number(row.no_shows_30d || 0);
    const riskScore = disputes * 2 + refunds + noShows;
    const flags = [];
    if (disputes >= 2) flags.push("repeat_disputes");
    if (refunds >= 2) flags.push("repeat_refunds");
    if (noShows >= 2) flags.push("repeat_no_show");
    return {
      ...row,
      risk_score: riskScore,
      risk_flags: flags,
    };
  });

  return NextResponse.json({ items });
}
