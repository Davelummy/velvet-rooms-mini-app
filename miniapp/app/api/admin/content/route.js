import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { getSupabase } from "../../_lib/supabase";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "pending").toLowerCase();
  const isActive = status === "approved";
  const whereClause = isActive
    ? "dc.is_active = TRUE"
    : `dc.is_active = FALSE
       AND NOT EXISTS (
         SELECT 1 FROM admin_actions aa
         WHERE aa.target_type = 'digital_content'
           AND aa.target_id = dc.id
           AND aa.action_type = 'reject_content'
       )`;

  const res = await query(
    `SELECT dc.id, dc.title, dc.description, dc.price, dc.content_type,
            dc.telegram_file_id, dc.preview_file_id, dc.created_at,
            u.public_id, u.telegram_id, mp.display_name, mp.verification_status,
            dc.is_active
     FROM digital_content dc
     JOIN users u ON u.id = dc.model_id
     LEFT JOIN model_profiles mp ON mp.user_id = dc.model_id
     WHERE ${whereClause}
     ORDER BY dc.created_at DESC`,
    []
  );

  const bucket =
    process.env.SUPABASE_TEASER_BUCKET ||
    process.env.SUPABASE_CONTENT_BUCKET ||
    process.env.SUPABASE_BUCKET ||
    "teaser content bucket";
  const supabase = getSupabase();
  const items = [];
  for (const row of res.rows) {
    let previewUrl = null;
    if (row.preview_file_id) {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.preview_file_id, 60 * 60);
      previewUrl = data?.signedUrl || null;
    }
    items.push({ ...row, preview_url: previewUrl });
  }

  return NextResponse.json({ items });
}
