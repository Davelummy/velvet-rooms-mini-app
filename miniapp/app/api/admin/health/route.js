import { NextResponse } from "next/server";
import { requireAdmin } from "../../../_lib/admin_auth";
import { query } from "../../../_lib/db";
import { ensureAppEventsTable } from "../../../_lib/metrics";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  await ensureAppEventsTable();

  const [
    sessionTotalRes,
    sessionFailedRes,
    disputesRes,
    callFailRes,
    turnErrorRes,
    callConnectedRes,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count
       FROM sessions
       WHERE created_at >= NOW() - INTERVAL '7 days'`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM sessions
       WHERE created_at >= NOW() - INTERVAL '7 days'
         AND status IN ('cancelled_by_client','cancelled_by_model','disputed','rejected')`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM sessions
       WHERE status = 'disputed' AND ended_at >= NOW() - INTERVAL '7 days'`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM app_events
       WHERE event_type = 'call_setup_failed'
         AND created_at >= NOW() - INTERVAL '24 hours'`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM app_events
       WHERE event_type = 'turn_token_error'
         AND created_at >= NOW() - INTERVAL '24 hours'`
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM app_events
       WHERE event_type = 'call_connected'
         AND created_at >= NOW() - INTERVAL '24 hours'`
    ),
  ]);

  const totalSessions = sessionTotalRes.rows[0]?.count || 0;
  const failedSessions = sessionFailedRes.rows[0]?.count || 0;
  const sessionFailureRate =
    totalSessions > 0 ? Number((failedSessions / totalSessions).toFixed(3)) : 0;
  const callFails = callFailRes.rows[0]?.count || 0;
  const callConnected = callConnectedRes.rows[0]?.count || 0;
  const callSetupFailureRate =
    callFails + callConnected > 0
      ? Number((callFails / (callFails + callConnected)).toFixed(3))
      : 0;

  return NextResponse.json({
    ok: true,
    total_sessions_7d: totalSessions,
    failed_sessions_7d: failedSessions,
    session_failure_rate_7d: sessionFailureRate,
    disputes_7d: disputesRes.rows[0]?.count || 0,
    call_setup_failures_24h: callFails,
    call_setup_failure_rate_24h: callSetupFailureRate,
    turn_token_errors_24h: turnErrorRes.rows[0]?.count || 0,
  });
}
