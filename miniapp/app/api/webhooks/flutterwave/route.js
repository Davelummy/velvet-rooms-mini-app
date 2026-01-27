import { NextResponse } from "next/server";
import { query } from "../../_lib/db";

export const runtime = "nodejs";

export async function POST(request) {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_HASH || "";
  const signature = request.headers.get("verif-hash") || "";
  if (!secret || signature !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const event = payload?.event || "";
  const data = payload?.data || {};
  const txRef = data?.tx_ref;
  if (!txRef) {
    return NextResponse.json({ ok: true });
  }

  const txRes = await query(
    `SELECT id, amount, status FROM transactions WHERE transaction_ref = $1`,
    [txRef]
  );
  if (!txRes.rowCount) {
    return NextResponse.json({ ok: true });
  }
  const transaction = txRes.rows[0];

  if (event !== "charge.completed") {
    return NextResponse.json({ ok: true });
  }

  if (data?.status !== "successful") {
    await query(
      `UPDATE transactions SET status = 'failed', metadata_json = $1 WHERE id = $2`,
      [
        JSON.stringify({
          flutterwave_status: data?.status || "failed",
          flutterwave_tx_id: data?.id || null,
          flutterwave_ref: data?.flw_ref || null,
        }),
        transaction.id,
      ]
    );
    return NextResponse.json({ ok: true });
  }

  if (data?.amount && Number(data.amount) !== Number(transaction.amount)) {
    return NextResponse.json({ error: "amount_mismatch" }, { status: 400 });
  }

  await query(
    `UPDATE transactions
     SET status = 'submitted', metadata_json = $1
     WHERE id = $2`,
    [
      JSON.stringify({
        flutterwave_tx_id: data?.id || null,
        flutterwave_ref: data?.flw_ref || null,
        flutterwave_status: data?.status || null,
        flutterwave_currency: data?.currency || null,
      }),
      transaction.id,
    ]
  );

  return NextResponse.json({ ok: true });
}
