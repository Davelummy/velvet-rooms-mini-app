import { NextResponse } from "next/server";
import { requireAdmin } from "../../_lib/admin_auth";
import { ensureUser } from "../../_lib/users";
import { listNotifications } from "../../_lib/notifications";

export const runtime = "nodejs";

export async function GET(request) {
  const initData = request.headers.get("x-telegram-init") || "";
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
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 30), 50);
  const data = await listNotifications({
    recipientId: adminUserId,
    recipientRole: "admin",
    limit,
  });
  return NextResponse.json({ items: data.items || [], unread: data.unreadCount || 0 });
}
