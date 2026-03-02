import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../../_lib/telegram";
import { query } from "../../../_lib/db";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

export async function POST(req, { params }) {
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData, BOT_TOKEN)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ ok: true }); // non-blocking

    const storyId = params.id;
    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    const viewerId = userRes.rowCount ? userRes.rows[0].id : null;

    // Record unique view (silent fail is ok)
    await query(
      `INSERT INTO story_views (story_id, viewer_id) VALUES ($1, $2)
       ON CONFLICT (story_id, viewer_id) DO NOTHING`,
      [storyId, viewerId]
    ).catch(() => {});

    // Increment view count
    await query(
      "UPDATE stories SET view_count = view_count + 1 WHERE id = $1",
      [storyId]
    ).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // always succeed
  }
}
