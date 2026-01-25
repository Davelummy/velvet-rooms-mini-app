import { NextResponse } from "next/server";
import { query } from "../../../_lib/db";
import { requireAdmin } from "../../../_lib/admin_auth";
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

  const res = await query(
    `SELECT preview_file_id FROM digital_content WHERE id = $1`,
    [contentId]
  );
  if (!res.rowCount) {
    return NextResponse.json({ error: "content_missing" }, { status: 404 });
  }
  const previewPath = res.rows[0].preview_file_id;

  await query("DELETE FROM digital_content WHERE id = $1", [contentId]);

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
