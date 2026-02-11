import { NextResponse } from "next/server";
import { query } from "../../_lib/db";

export const runtime = "nodejs";

const BOT_TOKEN = process.env.USER_BOT_TOKEN || process.env.BOT_TOKEN || "";

function isManualReleaseOnly() {
  return (process.env.MANUAL_RELEASE_ONLY || "false").toLowerCase() === "true";
}


async function ensureHeartbeatTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS worker_heartbeats (
       id INTEGER PRIMARY KEY,
       last_run_at TIMESTAMPTZ NOT NULL
     )`
  );
}

async function recordHeartbeat() {
  await query(
    `INSERT INTO worker_heartbeats (id, last_run_at)
     VALUES (1, NOW())
     ON CONFLICT (id) DO UPDATE SET last_run_at = EXCLUDED.last_run_at`
  );
}

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN || !chatId) {
    return;
  }
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

export async function POST(request) {
  const secret = request.headers.get("x-worker-secret") || "";
  const expected = process.env.WORKER_CRON_SECRET || "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureHeartbeatTable();
  await recordHeartbeat();

  const stats = { sessionsMarked: 0, escrowsReleased: 0 };

  const now = new Date();

  const sessionRes = await query(
    `SELECT id, session_ref, client_id, model_id, actual_start, duration_minutes, scheduled_end
     FROM sessions
     WHERE status = 'active'
       AND actual_start IS NOT NULL
       AND duration_minutes IS NOT NULL`
  );

  for (const session of sessionRes.rows) {
    const startedAt = session.actual_start ? new Date(session.actual_start) : null;
    const scheduledEnd = session.scheduled_end ? new Date(session.scheduled_end) : null;
    const cutoff = scheduledEnd
      ? scheduledEnd
      : startedAt
      ? new Date(startedAt.getTime() + Number(session.duration_minutes || 0) * 60 * 1000)
      : null;
    if (!cutoff) {
      continue;
    }
    if (cutoff > now) {
      continue;
    }

    await query(
      `UPDATE sessions
       SET status = 'awaiting_confirmation', ended_at = NOW()
       WHERE id = $1`,
      [session.id]
    );
    stats.sessionsMarked += 1;

    const clientRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      session.client_id,
    ]);
    const modelRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
      session.model_id,
    ]);

    const message = `Session ${session.session_ref} ended. Confirm completion in the mini app.`;
    if (clientRes.rowCount) {
      await sendMessage(clientRes.rows[0].telegram_id, message);
    }
    if (modelRes.rowCount) {
      await sendMessage(modelRes.rows[0].telegram_id, message);
    }
  }

  if (!isManualReleaseOnly()) {
    const escrowRes = await query(
      `SELECT id, escrow_ref, escrow_type, payer_id, receiver_id, receiver_payout, related_id
       FROM escrow_accounts
       WHERE status = 'held'
         AND auto_release_at IS NOT NULL
         AND auto_release_at <= NOW()`
    );

    for (const escrow of escrowRes.rows) {
      if (escrow.escrow_type === "access_fee") {
        await query(
          `UPDATE client_profiles
           SET access_fee_paid = TRUE, access_granted_at = NOW()
           WHERE access_fee_escrow_id = $1`,
          [escrow.id]
        );
      }

      if (escrow.escrow_type === "content") {
        await query(
          `UPDATE content_purchases
           SET status = 'delivered'
           WHERE escrow_id = $1`,
          [escrow.id]
        );
      }

      await query(
        `UPDATE escrow_accounts
         SET status = 'released', released_at = NOW(), release_condition_met = TRUE
         WHERE id = $1`,
        [escrow.id]
      );

      if (escrow.receiver_id && escrow.receiver_payout) {
        await query(
          `UPDATE users
           SET wallet_balance = COALESCE(wallet_balance, 0) + $1
           WHERE id = $2`,
          [escrow.receiver_payout, escrow.receiver_id]
        );
      }

      stats.escrowsReleased += 1;

      const payerRes = await query("SELECT telegram_id FROM users WHERE id = $1", [
        escrow.payer_id,
      ]);
      if (payerRes.rowCount) {
        await sendMessage(
          payerRes.rows[0].telegram_id,
          `Escrow ${escrow.escrow_ref} auto-released.`
        );
      }
    }
  }

  return NextResponse.json({ ok: true, stats });
}
