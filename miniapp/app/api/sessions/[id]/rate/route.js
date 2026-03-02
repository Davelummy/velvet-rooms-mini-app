import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../../_lib/telegram";
import { query, withTransaction } from "../../../_lib/db";
import { createRequestContext } from "../../../_lib/observability";

export async function POST(req, { params }) {
  const ctx = createRequestContext(`POST /api/sessions/${params.id}/rate`);
  try {
    const initData = req.headers.get("x-telegram-init") || "";
    if (!verifyInitData(initData)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { score } = await req.json();
    if (!score || score < 1 || score > 5) {
      return NextResponse.json({ error: "Score must be 1-5" }, { status: 400 });
    }

    const userRes = await query("SELECT id FROM users WHERE telegram_id = $1", [tgUser.id]);
    if (!userRes.rowCount) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const raterId = userRes.rows[0].id;

    // Verify session exists and is completed, and rater participated
    const sessionRes = await query(
      `SELECT id, model_id, client_id, status FROM sessions WHERE id = $1`,
      [params.id]
    );
    if (!sessionRes.rowCount) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const session = sessionRes.rows[0];
    if (session.status !== "completed") {
      return NextResponse.json({ error: "Session not completed" }, { status: 400 });
    }
    if (session.client_id !== raterId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const rateeId = session.model_id;

    await withTransaction(async (client) => {
      // Ensure session_ratings table exists
      await client.query(
        `CREATE TABLE IF NOT EXISTS session_ratings (
           id BIGSERIAL PRIMARY KEY,
           session_id BIGINT REFERENCES sessions(id) ON DELETE CASCADE,
           rater_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
           ratee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
           score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
           created_at TIMESTAMPTZ DEFAULT NOW(),
           UNIQUE(session_id, rater_id)
         )`
      );

      await client.query(
        `INSERT INTO session_ratings (session_id, rater_id, ratee_id, score)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (session_id, rater_id) DO UPDATE SET score = $4`,
        [session.id, raterId, rateeId, score]
      );

      // Update avg_rating on model_profiles
      await client.query(
        `UPDATE model_profiles
         SET avg_rating = (
           SELECT AVG(score)::numeric(3,2) FROM session_ratings WHERE ratee_id = $1
         ),
         total_ratings = (
           SELECT COUNT(*) FROM session_ratings WHERE ratee_id = $1
         )
         WHERE user_id = $1`,
        [rateeId]
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
