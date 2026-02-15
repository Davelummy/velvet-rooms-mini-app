import { NextResponse } from "next/server";
import { query } from "../../_lib/db";
import { requireAdmin } from "../../_lib/admin_auth";
import { getSupabase } from "../../_lib/supabase";
import { ensureUserColumns } from "../../_lib/users";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  await ensureUserColumns();

  const url = new URL(request.url);
  const status = (url.searchParams.get("status") || "submitted").toLowerCase();
  const targetStatus = status === "approved" ? "approved" : "submitted";

  const res = await query(
    `SELECT mp.user_id, mp.display_name, mp.verification_status, mp.verification_submitted_at,
            mp.approved_at, mp.verification_video_url, mp.verification_video_path,
            u.telegram_id, u.public_id, u.last_seen_at,
            CASE
              WHEN u.last_seen_at IS NOT NULL
                AND u.last_seen_at >= NOW() - interval '5 minutes'
              THEN TRUE
              ELSE FALSE
            END AS is_online
     FROM model_profiles mp
     JOIN users u ON u.id = mp.user_id
     WHERE mp.verification_status = $1
     ORDER BY COALESCE(mp.approved_at, mp.verification_submitted_at) DESC`,
    [targetStatus]
  );

  const items = [];
  const supabase = getSupabase();
  const bucket = process.env.SUPABASE_VERIFICATION_BUCKET || "velvetrooms-verification";
  for (const row of res.rows) {
    let signedUrl = row.verification_video_url;
    if (targetStatus === "submitted" && !signedUrl && row.verification_video_path) {
      const { data } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.verification_video_path, 60 * 60);
      signedUrl = data?.signedUrl || null;
    }
    items.push({
      ...row,
      verification_video_url: signedUrl,
    });
  }

  return NextResponse.json({ items });
}
