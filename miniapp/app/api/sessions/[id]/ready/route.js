import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../../_lib/telegram";
import { query } from "../../../_lib/db";
import { createRequestContext } from "../../../_lib/observability";

export async function POST(req, { params }) {
  const ctx = createRequestContext(`POST /api/sessions/${params.id}/ready`);
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userRes = await query("SELECT id, role FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const user = userRes.rows[0];

    const sessionRes = await query(
      "SELECT id, client_id, model_id, status FROM sessions WHERE id = $1",
      [params.id]
    );
    if (!sessionRes.rowCount) return NextResponse.json({ error: "Session not found" }, { status: 404 });
    const session = sessionRes.rows[0];

    if (session.client_id !== user.id && session.model_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const isModel = session.model_id === user.id;
    const column = isModel ? "model_ready_at" : "client_ready_at";

    // Add column if not exists (migration guard)
    await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ${column} TIMESTAMPTZ`).catch(() => {});

    await query(`UPDATE sessions SET ${column} = NOW() WHERE id = $1`, [session.id]);

    return NextResponse.json({ ok: true, ready: true });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
