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

  const [
    pendingModels,
    approvedModels,
    totalModels,
    onlineModels,
    pendingContent,
    approvedContent,
    totalContent,
    heldEscrows,
    releasedEscrows,
    disputedEscrows,
    totalEscrows,
    pendingPayments,
    approvedPayments,
    totalPayments,
    failedPayments,
    failedPayments24h,
    totalUsers,
    totalClients,
    approvedClients,
    pendingClients,
    pendingSessions,
    activeSessions,
    completedSessions,
    totalSessions,
    purchasesTotal,
    purchases24h,
    bookings24h,
    paymentsVolume7d,
    escrowReleased7d,
    approvalsToday,
    medianReviewSeconds,
    disputes24h,
    inflowSeries,
    approvalsSeries,
  ] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM model_profiles WHERE verification_status = 'submitted'"),
    query("SELECT COUNT(*)::int AS count FROM model_profiles WHERE verification_status = 'approved'"),
    query("SELECT COUNT(*)::int AS count FROM model_profiles"),
    query("SELECT COUNT(*)::int AS count FROM model_profiles WHERE is_online = TRUE"),
    query("SELECT COUNT(*)::int AS count FROM digital_content WHERE is_active = FALSE"),
    query("SELECT COUNT(*)::int AS count FROM digital_content WHERE is_active = TRUE"),
    query("SELECT COUNT(*)::int AS count FROM digital_content"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts WHERE status = 'held'"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts WHERE status = 'released'"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts WHERE status = 'disputed'"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts"),
    query(
      `SELECT COUNT(*)::int AS count
       FROM transactions
       WHERE (payment_provider = 'crypto' AND status = 'submitted')
          OR (payment_provider <> 'crypto' AND status IN ('pending','submitted'))`
    ),
    query(
      "SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'completed'"
    ),
    query("SELECT COUNT(*)::int AS count FROM transactions"),
    query("SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'failed'"),
    query("SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours'"),
    query(
      "SELECT COUNT(*)::int AS count FROM users"
    ),
    query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'client'"
    ),
    query("SELECT COUNT(*)::int AS count FROM client_profiles WHERE access_fee_paid = TRUE"),
    query("SELECT COUNT(*)::int AS count FROM client_profiles WHERE access_fee_paid = FALSE"),
    query("SELECT COUNT(*)::int AS count FROM sessions WHERE status IN ('pending','pending_payment')"),
    query("SELECT COUNT(*)::int AS count FROM sessions WHERE status = 'active'"),
    query("SELECT COUNT(*)::int AS count FROM sessions WHERE status = 'completed'"),
    query("SELECT COUNT(*)::int AS count FROM sessions"),
    query("SELECT COUNT(*)::int AS count FROM content_purchases"),
    query("SELECT COUNT(*)::int AS count FROM content_purchases WHERE purchased_at >= NOW() - INTERVAL '24 hours'"),
    query("SELECT COUNT(*)::int AS count FROM sessions WHERE created_at >= NOW() - INTERVAL '24 hours'"),
    query("SELECT COALESCE(SUM(amount),0)::numeric AS amount FROM transactions WHERE status = 'completed' AND created_at >= NOW() - INTERVAL '7 days'"),
    query("SELECT COALESCE(SUM(amount),0)::numeric AS amount FROM escrow_accounts WHERE status = 'released' AND released_at >= NOW() - INTERVAL '7 days'"),
    query(
      `SELECT COUNT(*)::int AS count
       FROM admin_actions
       WHERE (action_type ILIKE 'approve%' OR action_type = 'release_escrow')
         AND created_at::date = CURRENT_DATE`
    ),
    query(
      `SELECT COALESCE(EXTRACT(EPOCH FROM percentile_cont(0.5)
       WITHIN GROUP (ORDER BY (approved_at - verification_submitted_at))),0)::numeric AS seconds
       FROM model_profiles
       WHERE approved_at IS NOT NULL AND verification_submitted_at IS NOT NULL
         AND approved_at >= NOW() - INTERVAL '30 days'`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM escrow_accounts
       WHERE status = 'disputed' AND held_at >= NOW() - INTERVAL '24 hours'`
    ),
    query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS day
       )
       SELECT to_char(day, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(e.amount),0)::numeric AS amount
       FROM days
       LEFT JOIN escrow_accounts e
         ON e.status = 'released' AND DATE(e.released_at) = DATE(day)
       GROUP BY day
       ORDER BY day`
    ),
    query(
      `WITH days AS (
         SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') AS day
       )
       SELECT to_char(day, 'YYYY-MM-DD') AS day,
              COALESCE(COUNT(a.id),0)::int AS count
       FROM days
       LEFT JOIN admin_actions a
         ON (a.action_type ILIKE 'approve%' OR a.action_type = 'release_escrow')
         AND DATE(a.created_at) = DATE(day)
       GROUP BY day
       ORDER BY day`
    ),
  ]);

  return NextResponse.json({
    ok: true,
    pending_models: pendingModels.rows[0]?.count || 0,
    approved_models: approvedModels.rows[0]?.count || 0,
    total_models: totalModels.rows[0]?.count || 0,
    online_models: onlineModels.rows[0]?.count || 0,
    pending_content: pendingContent.rows[0]?.count || 0,
    approved_content: approvedContent.rows[0]?.count || 0,
    total_content: totalContent.rows[0]?.count || 0,
    held_escrows: heldEscrows.rows[0]?.count || 0,
    released_escrows: releasedEscrows.rows[0]?.count || 0,
    disputed_escrows: disputedEscrows.rows[0]?.count || 0,
    total_escrows: totalEscrows.rows[0]?.count || 0,
    pending_payments: pendingPayments.rows[0]?.count || 0,
    approved_payments: approvedPayments.rows[0]?.count || 0,
    total_payments: totalPayments.rows[0]?.count || 0,
    failed_payments: failedPayments.rows[0]?.count || 0,
    failed_payments_24h: failedPayments24h.rows[0]?.count || 0,
    total_users: totalUsers.rows[0]?.count || 0,
    total_clients: totalClients.rows[0]?.count || 0,
    approved_clients: approvedClients.rows[0]?.count || 0,
    pending_clients: pendingClients.rows[0]?.count || 0,
    pending_sessions: pendingSessions.rows[0]?.count || 0,
    active_sessions: activeSessions.rows[0]?.count || 0,
    completed_sessions: completedSessions.rows[0]?.count || 0,
    total_sessions: totalSessions.rows[0]?.count || 0,
    total_purchases: purchasesTotal.rows[0]?.count || 0,
    purchases_24h: purchases24h.rows[0]?.count || 0,
    bookings_24h: bookings24h.rows[0]?.count || 0,
    payments_volume_7d: paymentsVolume7d.rows[0]?.amount || 0,
    escrow_released_7d: escrowReleased7d.rows[0]?.amount || 0,
    approvals_today: approvalsToday.rows[0]?.count || 0,
    median_review_seconds: medianReviewSeconds.rows[0]?.seconds || 0,
    disputes_24h: disputes24h.rows[0]?.count || 0,
    escrow_inflow_7d: inflowSeries.rows || [],
    approvals_7d: approvalsSeries.rows || [],
  });
}
