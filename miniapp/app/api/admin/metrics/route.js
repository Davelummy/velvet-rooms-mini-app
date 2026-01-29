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

  const adminIds = (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((val) => Number(val.trim()))
    .filter((val) => Number.isFinite(val));
  const adminFilterClause = adminIds.length ? "WHERE telegram_id <> ALL($1::bigint[])" : "";
  const adminFilterParams = adminIds.length ? [adminIds] : [];
  const adminClientClause = adminIds.length
    ? "WHERE role = 'client' AND telegram_id <> ALL($1::bigint[])"
    : "WHERE role = 'client'";

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
      "SELECT COUNT(*)::int AS count FROM transactions WHERE status IN ('pending','submitted')"
    ),
    query(
      "SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'completed'"
    ),
    query("SELECT COUNT(*)::int AS count FROM transactions"),
    query("SELECT COUNT(*)::int AS count FROM transactions WHERE status = 'failed'"),
    query(
      `SELECT COUNT(*)::int AS count FROM users ${adminFilterClause}`,
      adminFilterParams
    ),
    query(
      `SELECT COUNT(*)::int AS count FROM users ${adminClientClause}`,
      adminFilterParams
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
  });
}
