import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";
import { getSupabase } from "../../../_lib/supabase";

export const runtime = "nodejs";

export async function POST(request) {
  const initData = request.headers.get("x-telegram-init") || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const body = await request.json();
  const contentId = Number(body?.content_id);
  if (!contentId) {
    return NextResponse.json({ error: "missing_content" }, { status: 400 });
  }

  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });

  const contentRes = await query(
    "SELECT preview_file_id FROM digital_content WHERE id = $1",
    [contentId]
  );
  await query("UPDATE digital_content SET is_active = FALSE WHERE id = $1", [contentId]);
  await query(
    `INSERT INTO admin_actions (admin_id, action_type, target_type, target_id, details, created_at)
     VALUES ($1, 'reject_content', 'digital_content', $2, $3, NOW())`,
    [adminUserId, contentId, JSON.stringify({ status: "rejected" })]
  );

  const previewPath = contentRes.rows[0]?.preview_file_id;
  if (previewPath) {
    const bucket =
      process.env.SUPABASE_CONTENT_BUCKET ||
      process.env.SUPABASE_BUCKET ||
      "teaser content bucket";
    const supabase = getSupabase();
    await supabase.storage.from(bucket).remove([previewPath]);
  }

  return NextResponse.json({ ok: true });
}
