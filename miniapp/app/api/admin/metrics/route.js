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
    pendingContent,
    approvedContent,
    heldEscrows,
    releasedEscrows,
    disputedEscrows,
    pendingPayments,
    approvedPayments,
  ] = await Promise.all([
    query("SELECT COUNT(*)::int AS count FROM model_profiles WHERE verification_status = 'submitted'"),
    query("SELECT COUNT(*)::int AS count FROM model_profiles WHERE verification_status = 'approved'"),
    query("SELECT COUNT(*)::int AS count FROM digital_content WHERE is_active = FALSE"),
    query("SELECT COUNT(*)::int AS count FROM digital_content WHERE is_active = TRUE"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts WHERE status = 'held'"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts WHERE status = 'released'"),
    query("SELECT COUNT(*)::int AS count FROM escrow_accounts WHERE status = 'disputed'"),
    query(
      "SELECT COUNT(*)::int AS count FROM transactions WHERE payment_provider = 'crypto' AND status IN ('pending','submitted')"
    ),
    query(
      "SELECT COUNT(*)::int AS count FROM transactions WHERE payment_provider = 'crypto' AND status = 'completed'"
    ),
  ]);

  return NextResponse.json({
    ok: true,
    pending_models: pendingModels.rows[0]?.count || 0,
    approved_models: approvedModels.rows[0]?.count || 0,
    pending_content: pendingContent.rows[0]?.count || 0,
    approved_content: approvedContent.rows[0]?.count || 0,
    held_escrows: heldEscrows.rows[0]?.count || 0,
    released_escrows: releasedEscrows.rows[0]?.count || 0,
    disputed_escrows: disputedEscrows.rows[0]?.count || 0,
    pending_payments: pendingPayments.rows[0]?.count || 0,
    approved_payments: approvedPayments.rows[0]?.count || 0,
  });
}
