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
  const status = (url.searchParams.get("status") || "pending").toLowerCase();
  const provider = (url.searchParams.get("provider") || "all").toLowerCase();
  const statusList =
    status === "approved"
      ? ["completed"]
      : status === "rejected"
      ? ["rejected"]
      : ["pending", "submitted"];

  const providerClause =
    provider === "all" ? "" : "AND t.payment_provider = $2";

  const res = await query(
    `SELECT t.transaction_ref, t.amount, t.status, t.metadata_json, t.created_at,
            u.public_id, u.telegram_id, t.payment_provider
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = ANY($1)
       ${providerClause}
     ORDER BY t.created_at DESC`,
    provider === "all" ? [statusList] : [statusList, provider]
  );

  const items = res.rows.map((row) => {
    let metadata = row.metadata_json;
    if (typeof metadata === "string") {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = {};
      }
    }
    return { ...row, metadata_json: metadata };
  });

  return NextResponse.json({ items });
}
