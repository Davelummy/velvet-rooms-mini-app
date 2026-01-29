import { NextResponse } from "next/server";
import { query } from "../_lib/db";
import { extractUser, verifyInitData } from "../_lib/telegram";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

const toNumber = (value) => {
  if (value === null || value === undefined) {
    return 0;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  if (!verifyInitData(initData, BOT_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const tgUser = extractUser(initData);
  if (!tgUser || !tgUser.id) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }

  const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [
    tgUser.id,
  ]);
  if (!userRes.rowCount) {
    return NextResponse.json({ error: "user_missing" }, { status: 400 });
  }
  if (userRes.rows[0].role !== "model") {
    return NextResponse.json({ error: "model_only" }, { status: 403 });
  }
  const userId = userRes.rows[0].id;

  const payoutsRes = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN status = 'released' THEN receiver_payout ELSE 0 END), 0) AS total_released,
       COALESCE(SUM(CASE WHEN status = 'held' THEN receiver_payout ELSE 0 END), 0) AS pending_payout,
       COALESCE(
         SUM(
           CASE
             WHEN status = 'released' AND released_at >= NOW() - INTERVAL '7 days'
             THEN receiver_payout
             ELSE 0
           END
         ),
         0
       ) AS released_7d
     FROM escrow_accounts
     WHERE receiver_id = $1`,
    [userId]
  );

  const sessionsRes = await query(
    `SELECT
       COUNT(*)::int AS total_sessions,
       COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_sessions,
       COUNT(*) FILTER (WHERE status = 'active')::int AS active_sessions
     FROM sessions
     WHERE model_id = $1`,
    [userId]
  );

  const contentRes = await query(
    `SELECT
       COUNT(*)::int AS total_content,
       COUNT(*) FILTER (WHERE is_active = TRUE)::int AS approved_content,
       COUNT(*) FILTER (WHERE is_active = FALSE)::int AS pending_content
     FROM digital_content
     WHERE model_id = $1`,
    [userId]
  );

  const payoutsRow = payoutsRes.rows[0] || {};
  const sessionsRow = sessionsRes.rows[0] || {};
  const contentRow = contentRes.rows[0] || {};

  return NextResponse.json({
    payouts: {
      total_released: toNumber(payoutsRow.total_released),
      pending_payout: toNumber(payoutsRow.pending_payout),
      released_7d: toNumber(payoutsRow.released_7d),
    },
    sessions: {
      total: toNumber(sessionsRow.total_sessions),
      completed: toNumber(sessionsRow.completed_sessions),
      active: toNumber(sessionsRow.active_sessions),
    },
    content: {
      total: toNumber(contentRow.total_content),
      approved: toNumber(contentRow.approved_content),
      pending: toNumber(contentRow.pending_content),
    },
  });
}
