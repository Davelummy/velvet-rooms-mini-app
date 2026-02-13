import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";
import { getSupabase } from "../../../_lib/supabase";
import { createNotification } from "../../../_lib/notifications";

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
    "SELECT preview_file_id, model_id, title FROM digital_content WHERE id = $1",
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
      process.env.SUPABASE_TEASER_BUCKET ||
      process.env.SUPABASE_CONTENT_BUCKET ||
      process.env.SUPABASE_BUCKET ||
      "teaser content bucket";
    const supabase = getSupabase();
    await supabase.storage.from(bucket).remove([previewPath]);
  }

  if (contentRes.rowCount) {
    const content = contentRes.rows[0];
    await createNotification({
      recipientId: content.model_id,
      recipientRole: "model",
      title: "Teaser rejected",
      body: `Your teaser "${content.title || "Untitled"}" was rejected.`,
      type: "content_rejected",
      metadata: { content_id: contentId },
    });
  }

  return NextResponse.json({ ok: true });
}
