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
  const range = (url.searchParams.get("range") || "all").toLowerCase();
  const statusList =
    status === "approved"
      ? ["completed"]
      : status === "rejected"
      ? ["rejected"]
      : ["pending", "submitted"];

  const params = [statusList];
  let providerClause = "";
  if (provider !== "all") {
    providerClause = "AND t.payment_provider = $2";
    params.push(provider);
  }
  let rangeClause = "";
  if (range === "today") {
    rangeClause = "AND t.created_at >= CURRENT_DATE";
  } else if (range === "7d") {
    rangeClause = "AND t.created_at >= NOW() - INTERVAL '7 days'";
  }

  const res = await query(
    `SELECT t.transaction_ref, t.amount, t.status, t.metadata_json, t.created_at,
            u.public_id, u.username, u.telegram_id, t.payment_provider
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = ANY($1)
       ${providerClause}
       ${rangeClause}
     ORDER BY t.created_at DESC`,
    params
  );

  const filtered = res.rows.filter((row) => {
    if (row.payment_provider === "crypto" && status === "pending") {
      return row.status === "submitted";
    }
    return true;
  });

  const items = filtered.map((row) => {
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
