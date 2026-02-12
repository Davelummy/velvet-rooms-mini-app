import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { ensureUserActionsTable } from "../../_lib/user_actions";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await ensureUserActionsTable();

  const url = new URL(request.url);
  const type = (url.searchParams.get("type") || "").trim();
  const limit = Math.min(Number(url.searchParams.get("limit") || 100), 300);
  const params = [];
  let where = "";
  if (type) {
    params.push(type);
    where = `WHERE ua.action_type = $${params.length}`;
  }
  params.push(limit);

  const res = await query(
    `SELECT ua.id, ua.action_type, ua.details, ua.created_at,
            actor.public_id AS actor_public_id,
            actor.username AS actor_username,
            COALESCE(acp.display_name, amp.display_name, actor.username, actor.public_id) AS actor_display_name,
            target.public_id AS target_public_id,
            target.username AS target_username,
            COALESCE(tcp.display_name, tmp.display_name, target.username, target.public_id) AS target_display_name
     FROM user_actions ua
     LEFT JOIN users actor ON actor.id = ua.actor_id
     LEFT JOIN client_profiles acp ON acp.user_id = actor.id
     LEFT JOIN model_profiles amp ON amp.user_id = actor.id
     LEFT JOIN users target ON target.id = ua.target_id
     LEFT JOIN client_profiles tcp ON tcp.user_id = target.id
     LEFT JOIN model_profiles tmp ON tmp.user_id = target.id
     ${where}
     ORDER BY ua.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return NextResponse.json({ items: res.rows || [] });
}
