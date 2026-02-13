import { NextResponse } from "next/server";
import { requireAdmin } from "../../../_lib/admin_auth";
import { ensureUser } from "../../../_lib/users";
import { markNotificationsRead } from "../../../_lib/notifications";

export const runtime = "nodejs";

export async function POST(request) {
  const body = await request.json();
  const initData = body?.initData || "";
  const auth = requireAdmin(initData);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }
  const adminUserId = await ensureUser({
    telegramId: auth.user.id,
    username: auth.user.username || null,
    firstName: auth.user.first_name || null,
    lastName: auth.user.last_name || null,
    role: "admin",
    status: "active",
  });
  const ids = Array.isArray(body?.ids) ? body.ids.map((val) => Number(val)).filter(Boolean) : [];
  await markNotificationsRead({
    recipientId: adminUserId,
    recipientRole: "admin",
    ids,
  });
  return NextResponse.json({ ok: true });
}
