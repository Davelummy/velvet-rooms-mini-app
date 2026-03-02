import { NextResponse } from "next/server";
import { verifyInitData, extractUser } from "../../_lib/telegram";
import { query } from "../../_lib/db";
import { checkRateLimit } from "../../_lib/rate_limit";
import { createRequestContext } from "../../_lib/observability";

async function ensureEarningsMonthly() {
  await query(
    `CREATE TABLE IF NOT EXISTS earnings_monthly (
       id BIGSERIAL PRIMARY KEY,
       model_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
       month DATE NOT NULL,
       sessions_ngn INTEGER DEFAULT 0,
       content_ngn INTEGER DEFAULT 0,
       tips_ngn INTEGER DEFAULT 0,
       gifts_ngn INTEGER DEFAULT 0,
       total_ngn INTEGER DEFAULT 0,
       UNIQUE(model_id, month)
     )`
  );
  await query("CREATE INDEX IF NOT EXISTS idx_earnings_monthly_model ON earnings_monthly(model_id)");
}

export async function GET(req) {
  const ctx = createRequestContext("GET /api/earnings/v2");
  try {
    const initData = req.headers.get("x-telegram-init-data") || "";
    if (!verifyInitData(initData)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tgUser = extractUser(initData);
    if (!tgUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rl = await checkRateLimit(`earnings:${tgUser.id}`, 30, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

    const userRes = await query(
      "SELECT id FROM users WHERE telegram_id = $1 AND role = 'model'",
      [tgUser.id]
    );
    if (!userRes.rowCount) {
      return NextResponse.json({ error: "Model account required" }, { status: 403 });
    }
    const modelId = userRes.rows[0].id;

    await ensureEarningsMonthly();

    // Calculate summary from transactions
    const summaryRes = await query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.type IN ('session_payment', 'session') THEN t.net_amount ELSE 0 END), 0) as sessions_ngn,
         COALESCE(SUM(CASE WHEN t.type = 'content_purchase' THEN t.net_amount ELSE 0 END), 0) as content_ngn,
         COALESCE(SUM(t.net_amount), 0) as total_ngn,
         COALESCE(SUM(CASE WHEN DATE_TRUNC('month', t.created_at) = DATE_TRUNC('month', NOW()) THEN t.net_amount ELSE 0 END), 0) as this_month_ngn
       FROM transactions t
       WHERE t.recipient_id = $1 AND t.status = 'completed'`,
      [modelId]
    );

    // Tips and gifts summaries
    const tipsRes = await query(
      "SELECT COALESCE(SUM(net_amount), 0) as tips_ngn FROM tips WHERE recipient_id = $1",
      [modelId]
    ).catch(() => ({ rows: [{ tips_ngn: 0 }] }));

    const giftsRes = await query(
      "SELECT COALESCE(SUM(amount_ngn * 0.85), 0)::int as gifts_ngn FROM virtual_gifts_sent WHERE recipient_id = $1",
      [modelId]
    ).catch(() => ({ rows: [{ gifts_ngn: 0 }] }));

    // Monthly breakdown
    const monthlyRes = await query(
      `SELECT em.*
       FROM earnings_monthly em
       WHERE em.model_id = $1
       ORDER BY em.month DESC
       LIMIT 12`,
      [modelId]
    );

    // Recent transactions
    const txRes = await query(
      `SELECT t.id, t.type, t.net_amount, t.created_at,
              CASE
                WHEN t.type IN ('session_payment','session') THEN 'sessions'
                WHEN t.type = 'content_purchase' THEN 'content'
                ELSE 'other'
              END as category,
              'Session payment' as description
       FROM transactions t
       WHERE t.recipient_id = $1 AND t.status = 'completed'
       ORDER BY t.created_at DESC
       LIMIT 20`,
      [modelId]
    );

    const summary = summaryRes.rows[0] || {};
    summary.tips_ngn = parseInt(tipsRes.rows[0]?.tips_ngn || 0);
    summary.gifts_ngn = parseInt(giftsRes.rows[0]?.gifts_ngn || 0);

    return NextResponse.json({
      summary,
      monthly: monthlyRes.rows,
      transactions: txRes.rows,
    });
  } catch (err) {
    ctx.error(err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
