import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { ensureFollowTable } from "../../_lib/follows";
import { ensureUserColumns } from "../../_lib/users";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await ensureFollowTable();
  await ensureUserColumns();

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim();
  const role = (url.searchParams.get("role") || "all").toLowerCase();
  const status = (url.searchParams.get("status") || "all").toLowerCase();

  const where = [];
  const params = [];

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    where.push(
      `(LOWER(u.username) LIKE $${params.length} OR LOWER(u.public_id) LIKE $${params.length} OR LOWER(u.email) LIKE $${params.length})`
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
            (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id) AS followers,
            (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id) AS following
     FROM users u
     ${whereClause}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    params
  );

  return NextResponse.json({ items: res.rows || [] });
}
