import { NextResponse } from "next/server";
import { query } from "../../_lib/db";

export const runtime = "nodejs";

async function ensureHeartbeatTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS worker_heartbeats (
       id INTEGER PRIMARY KEY,
       last_run_at TIMESTAMPTZ NOT NULL
     )`
  );
}

export async function GET(request) {
  const secret = request.headers.get("x-worker-secret") || "";
  const expected = process.env.WORKER_CRON_SECRET || "";
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await ensureHeartbeatTable();
  const res = await query(
    "SELECT last_run_at FROM worker_heartbeats WHERE id = 1"
  );
  const lastRunAt = res.rowCount ? res.rows[0].last_run_at : null;
  return NextResponse.json({ ok: true, last_run_at: lastRunAt });
}
